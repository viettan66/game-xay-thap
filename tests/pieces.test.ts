import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { clusterSize, cutPart, footprint, groundPieces, pieceRange, planStages, scaffold } from '../overlay/src/build/pieces.js';
import { PART_KEYS, partIndex, type PartKey } from '../shared/parts.js';
import { normalizeBuild, resolveProject, type ProjectFile, type StageBuild } from '../shared/project.js';
import { REPO_ROOT } from './helpers.js';

const SIZES: Record<PartKey, [number, number]> = { nen: [22, 12], cot: [0, 14], khung: [24, 8], mai: [12, 8], tuong: [12, 6], trangtri: [10, 10], nuoc: [16, 16] };
const b = (part: PartKey | PartKey[] | 'matdat', look: StageBuild['look'], band?: [number, number]): StageBuild =>
  normalizeBuild({ part: part as never, look, ...(band ? { band } : {}) }) as StageBuild;

/** Công trình vẽ tay 100×100: nền dưới cùng, 2 cột, xà, mái trên cùng. */
function sample(): { labels: Uint8Array; w: number; h: number } {
  const w = 100;
  const h = 100;
  const labels = new Uint8Array(w * h);
  const fill = (x0: number, y0: number, x1: number, y1: number, part: PartKey) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) labels[y * w + x] = partIndex(part);
  };
  fill(0, 80, 100, 100, 'nen');
  fill(15, 40, 25, 80, 'cot');
  fill(75, 40, 85, 80, 'cot');
  fill(10, 34, 90, 40, 'khung');
  fill(5, 5, 95, 34, 'mai');
  return { labels, w, h };
}

describe('cắt vùng thành mảnh', () => {
  const { labels, w, h } = sample();

  it('nền: khối đá so le, từng hàng từ dưới lên', () => {
    const cells = cutPart('nen', labels, w, h, [22, 12], 'x');
    expect(cells[0]!.y + cells[0]!.h).toBe(100); // hàng đầu tiên là hàng dưới cùng
    for (let k = 1; k < cells.length; k++) expect(cells[k]!.y).toBeLessThanOrEqual(cells[k - 1]!.y);
    const area = cells.reduce((a, c) => a + c.w * c.h, 0);
    expect(area).toBe(100 * 20); // phủ kín vùng, không chồng lên nhau
  });

  it('cột: từng cột một (trái sang phải), mỗi cột từ chân lên đỉnh', () => {
    const cells = cutPart('cot', labels, w, h, [0, 14], 'x');
    const left = cells.filter((c) => c.x === 15);
    const right = cells.filter((c) => c.x === 75);
    expect(left.length + right.length).toBe(cells.length);
    expect(cells.indexOf(left.at(-1)!)).toBeLessThan(cells.indexOf(right[0]!)); // xong cột trái rồi mới tới cột phải
    expect(left[0]!.y + left[0]!.h).toBe(80);
    expect(left.every((c) => c.w === 10)).toBe(true); // cả bề ngang cột
  });

  it('khung: thanh ngang cắt theo chiều dài', () => {
    const cells = cutPart('khung', labels, w, h, [24, 8], 'x');
    expect(cells.map((c) => c.w)).toEqual([24, 24, 24, 8]);
    expect(cells.every((c) => c.h === 6)).toBe(true);
  });

  it('cùng seed thì cùng thứ tự; khác seed thì trang trí rải khác', () => {
    const t = new Uint8Array(w * h).fill(partIndex('trangtri'));
    const a = cutPart('trangtri', t, w, h, [10, 10], 'gac');
    expect(cutPart('trangtri', t, w, h, [10, 10], 'gac')).toEqual(a);
    expect(cutPart('trangtri', t, w, h, [10, 10], 'thap')).not.toEqual(a);
  });

  it('nước lan từ mép bờ vào giữa', () => {
    const water = new Uint8Array(w * h).fill(partIndex('nuoc'));
    const cells = cutPart('nuoc', water, w, h, [10, 10], 'ho');
    const d = (c: { x: number; y: number }) => Math.min(c.x, c.y, 90 - c.x, 90 - c.y);
    expect(d(cells[0]!)).toBe(0);
    expect(d(cells.at(-1)!)).toBe(40);
  });

  it('quá nhiều mảnh thì phóng to mảnh cho vừa giới hạn', () => {
    const big = new Uint8Array(1000 * 1000).fill(partIndex('tuong'));
    expect(cutPart('tuong', big, 1000, 1000, [4, 4], 'x').length).toBeLessThanOrEqual(2100);
  });
});

describe('chia mảnh cho giai đoạn', () => {
  const { labels, w, h } = sample();
  const builds = [b('matdat', 'coc'), b('nen', 'full', [0, 50]), b('nen', 'full', [50, 100]), b('cot', 'wood'), b('mai', 'full'), b([...PART_KEYS], 'full')];
  const plans = planStages({ labels, w, h, builds, sizes: SIZES, seed: 'gac', flat: false });

  it('mỗi giai đoạn đúng vùng; giai đoạn mặt đất dùng cọc', () => {
    expect(plans[0]).toMatchObject({ kind: 'ground', material: 'coc', prop: 'go' });
    expect(plans[0]!.count).toBeGreaterThanOrEqual(8);
    expect(plans[1]!.pieces.every((p) => p.part === 'nen' && p.y + p.h === 100)).toBe(true); // hàng đá dưới (tâm ở nửa dưới)
    expect(plans[2]!.pieces.every((p) => p.part === 'nen' && p.y === 80)).toBe(true);
    expect(plans[3]).toMatchObject({ kind: 'pieces', material: 'cot', prop: 'go' });
    expect(plans[3]!.pieces.every((p) => p.look === 'wood')).toBe(true);
    expect(plans[4]!.pieces.every((p) => p.part === 'mai')).toBe(true);
  });

  it('giai đoạn cuối nhận phần còn lại: cột màu thật (thay gỗ) và xà', () => {
    const last = plans[5]!.pieces;
    expect(new Set(last.map((p) => `${p.part}:${p.look}`))).toEqual(new Set(['cot:full', 'khung:full']));
  });

  it('xong hạng mục là đủ hình: mỗi điểm của mọi vùng đều được vẽ màu thật đúng một lần', () => {
    const cover = new Uint8Array(w * h);
    for (const pl of plans) for (const p of pl.pieces) if (p.look === 'full') {
      for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) if (labels[y * w + x] === partIndex(p.part)) cover[y * w + x] = (cover[y * w + x] ?? 0) + 1;
    }
    for (let i = 0; i < labels.length; i++) expect(cover[i]).toBe(labels[i] ? 1 : 0);
  });

  it('dải hẹp được ưu tiên: chóp tháp (dải trên 40%) không bị giai đoạn trang trí chung lấy mất', () => {
    const t = new Uint8Array(w * h).fill(partIndex('trangtri'));
    const p2 = planStages({ labels: t, w, h, builds: [b('trangtri', 'full'), b([...PART_KEYS], 'full'), b('trangtri', 'full', [60, 100])], sizes: SIZES, seed: 's', flat: false });
    expect(p2[2]!.count).toBeGreaterThan(0);
    expect(p2[2]!.pieces.every((p) => p.y + p.h <= 41)).toBe(true);
    // Giai đoạn "phần còn lại" không còn gì để xây: vẫn có phản hồi nhìn thấy bằng đống vật liệu cao dần.
    expect(p2[1]).toMatchObject({ kind: 'ground', material: 'dong', count: 24 });
  });
});

describe('quy đổi công → mảnh, cụm mảnh, giàn giáo', () => {
  it('công lẻ cộng dồn: đủ công mới đặt mảnh', () => {
    // 100 mảnh, giá 1000 công → 10 công / mảnh.
    expect(pieceRange(100, 0, 9, 1000)).toEqual([0, 0]);
    expect(pieceRange(100, 9, 1, 1000)).toEqual([0, 1]);
    expect(pieceRange(100, 10, 250, 1000)).toEqual([1, 26]);
    expect(pieceRange(100, 990, 10, 1000)).toEqual([99, 100]); // đủ giá là đủ mảnh
  });

  it('hàng đợi dài thì đặt theo cụm 4–9 mảnh; giai đoạn bị vượt qua thì cụm lớn khoảng 1 giây', () => {
    expect(clusterSize(10, 20, null)).toBe(1);
    expect(clusterSize(100, 20, null)).toBe(4);
    expect(clusterSize(1000, 20, null)).toBe(9);
    expect(clusterSize(1000, 20, 300)).toBe(15);
  });

  it('giàn giáo cao tới phần đã xây và thấp dần khi tháo', () => {
    const box = { x: 0, y: 0, w: 100, h: 200 };
    const s = scaffold(box, 120, 0);
    expect(s.poles[0]![1]).toBe(104);
    expect(s.poles.length).toBeGreaterThanOrEqual(3);
    expect(scaffold(box, 120, 0.5).poles[0]![1]).toBeGreaterThan(104);
    expect(scaffold(box, 120, 1).poles).toEqual([]);
  });

  it('vùng đất dưới chân và cọc quanh vùng đất', () => {
    const { labels, w, h } = sample();
    const fp = footprint(labels, w, h, false);
    expect(fp.y + fp.h).toBe(100);
    const stakes = groundPieces('coc', fp, 'x');
    expect(stakes.every((s) => s.x >= fp.x && s.x <= fp.x + fp.w && s.y >= fp.y && s.y <= fp.y + fp.h)).toBe(true);
  });
});

describe('dữ liệu thật', () => {
  it('Gác chuông với mẫu "vừa": giai đoạn nào cũng có mảnh, số mảnh vừa phải', async () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'assets', 'manifest.json'), 'utf8'));
    const g = manifest.map.buildings.find((x: { id: string }) => x.id === 'gac_chuong');
    const labels = new Uint8Array(g.w * g.h);
    for (const key of g.parts.keys as PartKey[]) {
      const { data } = await sharp(path.join(REPO_ROOT, 'assets', 'game', 'buildings', 'gac_chuong', 'parts', `${key}.png`)).extractChannel(0).raw().toBuffer({ resolveWithObject: true });
      for (let i = 0; i < data.length; i++) if (data[i]! > 127) labels[i] = partIndex(key);
    }
    const project = resolveProject(JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'config', 'defaults', 'project.json'), 'utf8')) as ProjectFile);
    const item = project.items.find((i) => i.id === 'gac_chuong')!;
    const plans = planStages({ labels, w: g.w, h: g.h, builds: item.stages.map((s) => s.build), sizes: SIZES, seed: 'gac_chuong', flat: false });
    const counts = plans.map((p) => p.count);
    expect(counts.every((n) => n > 0)).toBe(true);
    expect(counts.reduce((a, n) => a + n, 0)).toBeLessThan(3000);
  });
});
