import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { cutsSchema, formatCuts, loadCuts, objectMask, UNCHANGED_BELOW, validateCuts } from '../server/assets/mapCut.js';
import { bbox, boxBlur, close, components, dilate, erode, fillHoles, open, polygonMask, smoothstep } from '../server/assets/mask.js';
import { buildingOf, defaultTierLines, drawOrder, floorBand, itemRect, type MapBuilding, type MapManifest } from '../shared/map.js';
import type { ProjectFile } from '../shared/project.js';
import { REPO_ROOT } from './helpers.js';

/** Vẽ mặt nạ từ chuỗi: '#' = 1, '.' = 0. */
const grid = (rows: string[]) => ({
  w: rows[0]!.length,
  h: rows.length,
  m: Uint8Array.from(rows.join('').split(''), (c) => (c === '#' ? 1 : 0)),
});
const show = (m: Uint8Array, w: number) => Array.from({ length: m.length / w }, (_, y) => Array.from(m.slice(y * w, y * w + w), (v) => (v ? '#' : '.')).join(''));

describe('phép xử lý mặt nạ', () => {
  it('nở và co theo ô vuông; co không ăn vào mép ảnh', () => {
    const g = grid(['.....', '.....', '..#..', '.....', '.....']);
    expect(show(dilate(g.m, g.w, g.h, 1), g.w)).toEqual(['.....', '.###.', '.###.', '.###.', '.....']);
    expect(show(erode(dilate(g.m, g.w, g.h, 1), g.w, g.h, 1), g.w)).toEqual(['.....', '.....', '..#..', '.....', '.....']);
    const edge = grid(['##...', '##...', '.....']);
    expect(show(erode(edge.m, edge.w, edge.h, 1), edge.w)).toEqual(['#....', '.....', '.....']);
  });

  it('open bỏ đốm lẻ, close lấp khe hẹp', () => {
    const g = grid(['#.....', '...###', '...###', '...###']);
    expect(show(open(g.m, g.w, g.h, 1), g.w)).toEqual(['......', '...###', '...###', '...###']);
    const gap = grid(['.........', '..##.##..', '..##.##..', '.........']);
    expect(show(close(gap.m, gap.w, gap.h, 1), gap.w)[1]).toBe('..#####..');
  });

  it('lấp lỗ kín, không lấp chỗ hở ra mép', () => {
    const ring = grid(['.....', '.###.', '.#.#.', '.###.', '.....']);
    expect(show(fillHoles(ring.m, ring.w, ring.h), ring.w)[2]).toBe('.###.');
    const cup = grid(['.#.#.', '.#.#.', '.###.']);
    expect(show(fillHoles(cup.m, cup.w, cup.h), cup.w)).toEqual(['.#.#.', '.#.#.', '.###.']);
  });

  it('đánh nhãn vùng liền nhau', () => {
    const g = grid(['##..#', '##..#', '.....']);
    const c = components(g.m, g.w, g.h);
    expect(c.sizes.slice(1).sort()).toEqual([2, 4]);
    expect(c.labels[0]).toBe(c.labels[6]);
    expect(c.labels[0]).not.toBe(c.labels[4]);
  });

  it('mặt nạ đa giác', () => {
    expect(polygonMask([[0, 0], [4, 0], [4, 2], [0, 2]], 0, 0, 6, 3).reduce((a, b) => a + b, 0)).toBe(8);
    const tri = polygonMask([[0, 0], [10, 0], [0, 10]], 0, 0, 10, 10);
    expect(tri[0]).toBe(1);
    expect(tri[99]).toBe(0);
    expect(polygonMask([[2, 2], [6, 2], [6, 6], [2, 6]], 2, 2, 4, 4).every((v) => v === 1)).toBe(true);
  });

  it('làm mềm, chuyển mượt, khung bao', () => {
    expect(Array.from(boxBlur(new Uint8Array(9).fill(200), 3, 3, 1))).toEqual(Array(9).fill(200));
    const step = boxBlur(Uint8Array.from([0, 0, 255, 255]), 4, 1, 1);
    expect(step[1]).toBe(85);
    expect(step[2]).toBe(170);
    expect([smoothstep(10, 20, 5), smoothstep(10, 20, 15), smoothstep(10, 20, 25)]).toEqual([0, 0.5, 1]);
    expect(bbox(Uint8Array.from([0, 0, 0, 0, 9, 0, 0, 9, 0]), 3, 3)).toEqual({ x0: 1, y0: 1, x1: 2, y1: 3 });
    expect(bbox(new Uint8Array(4), 2, 2)).toBeNull();
  });
});

describe('tách công trình khỏi cây đứng trước (object)', () => {
  // Khung 30×30: rembg nhận cả công trình (khác hẳn ảnh đồi trống) lẫn một cái cây ở góc dưới trái
  // (giống hệt ảnh đồi trống), và một ô tường bên trong trùng màu đất.
  const W = 30;
  const rem = new Uint8Array(W * W);
  const diff = new Uint8Array(W * W);
  for (let y = 2; y < 28; y++) for (let x = 2; x < 28; x++) {
    rem[y * W + x] = 255;
    diff[y * W + x] = 80;
  }
  for (let y = 18; y < 28; y++) for (let x = 2; x < 12; x++) diff[y * W + x] = 3; // cây: chạm mép hình
  for (let y = 10; y < 16; y++) for (let x = 13; x < 19; x++) diff[y * W + x] = 2; // ô tường trùng màu đất: lỗ kín
  const { alpha, fg } = objectMask(rem, diff, W, W);

  it('cây có sẵn chạm mép hình thì bị bỏ khỏi công trình và chuyển sang lớp tiền cảnh', () => {
    expect(alpha[24 * W + 5]).toBe(0);
    expect(fg[24 * W + 5]).toBe(255);
    expect(alpha[5 * W + 20]).toBe(255);
    expect(fg[5 * W + 20]).toBe(0);
  });

  it('chỗ trùng màu nằm kín bên trong công trình thì vẫn giữ (lấp lỗ)', () => {
    expect(alpha[12 * W + 15]).toBe(255);
    expect(fg[12 * W + 15]).toBe(0);
  });

  it('ngưỡng "giống hệt" đủ nhỏ để không ăn vào công trình', () => {
    expect(UNCHANGED_BELOW).toBeLessThan(20);
  });
});

describe('file khung cắt assets/map-cuts.json', () => {
  const cuts = loadCuts(REPO_ROOT);
  const project = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'config', 'defaults', 'project.json'), 'utf8')) as ProjectFile;

  it('mỗi hạng mục (trừ San nền? không: kể cả San nền) có đúng một công trình trên bản đồ', () => {
    const covered = cuts.buildings.flatMap((b) => b.items ?? [b.id]);
    expect([...covered].sort()).toEqual(project.items.map((i) => i.id).sort());
    expect(new Set(covered).size).toBe(covered.length);
  });

  it('bảo tháp: một ảnh cho 9 tầng', () => {
    const tower = cuts.buildings.find((b) => b.id === 'bao_thap')!;
    expect(tower.items).toEqual(Array.from({ length: 9 }, (_, k) => `thap_tang_${k + 1}`));
  });

  it('báo lỗi khung nằm ngoài ảnh, trùng mã', () => {
    const bad = structuredClone(cuts);
    bad.buildings[0]!.parts[0]!.box = [10, 10, 5, 20];
    bad.buildings[1]!.id = bad.buildings[2]!.id;
    expect(cutsSchema.safeParse(bad).success).toBe(false);
    expect(() => validateCuts(bad)).toThrow(/nằm ngoài ảnh gốc hoặc bị ngược[\s\S]*Trùng mã công trình/);
  });

  it('ghi lại file giữ khung trên một dòng, đọc lại y hệt', () => {
    const text = formatCuts(cuts);
    expect(text).toContain('"box": [497, 316, 664, 413]');
    expect(validateCuts(JSON.parse(text))).toEqual(cuts);
  });
});

describe('bản đồ trong manifest', () => {
  const b = (id: string, layer: 'ground' | 'object', baseY: number, items = [id]): MapBuilding => ({
    id, items, layer, file: `buildings/${id}/final.png`, x: 0, y: baseY - 100, w: 50, h: 100, baseY, fg: null,
  });

  it('vẽ nền trước, rồi công trình xa trước gần sau', () => {
    const order = drawOrder([b('tam_quan', 'object', 2200), b('san_gach', 'ground', 2000), b('chinh_dien', 'object', 1290), b('ho_sen', 'ground', 2400)]);
    expect(order.map((x) => x.id)).toEqual(['san_gach', 'ho_sen', 'chinh_dien', 'tam_quan']);
  });

  it('bảo tháp chia 9 dải đều; tầng 1 kéo tới đáy, tầng 9 lên tới đỉnh', () => {
    const lines = defaultTierLines(100, 1000, 9);
    expect(lines).toEqual([900, 800, 700, 600, 500, 400, 300, 200, 100]);
    const tower: MapBuilding = { ...b('bao_thap', 'object', 1000, Array.from({ length: 9 }, (_, k) => `thap_tang_${k + 1}`)), y: 100, h: 900, tierLinesY: lines };
    expect(floorBand(tower, 0)).toEqual({ top: 900, bottom: 1000 });
    expect(floorBand(tower, 8)).toEqual({ top: 100, bottom: 200 });
    const map = { buildings: [tower, b('nha_to', 'object', 700)] } as MapManifest;
    expect(buildingOf(map, 'thap_tang_3')).toEqual({ building: tower, band: 2 });
    expect(buildingOf(map, 'nha_to')!.band).toBeNull();
    expect(itemRect(map, 'thap_tang_3')).toEqual({ x: 0, y: 700, w: 50, h: 100 });
    expect(itemRect(map, 'khong_co')).toBeNull();
  });
});
