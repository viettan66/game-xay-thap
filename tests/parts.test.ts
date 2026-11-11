import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadParts, proposeParts, readPartsMeta, saveParts, validateLabels } from '../server/assets/parts.js';
import { silentLogger } from '../server/logger.js';
import { startServer, type RunningServer } from '../server/server.js';
import { partIndex, partStats, PART_KEYS } from '../shared/parts.js';
import { disableEvents, makeTempRoot, removeTempRoot } from './helpers.js';

/** Gác nhỏ vẽ tay: mái ngói có rãnh, xà ngang trơn, 2 cột trơn, chuông đồng, bệ đá. */
function pavilion(): { w: number; h: number; rgba: Uint8Array } {
  const w = 120;
  const h = 160;
  const rgba = new Uint8Array(w * h * 4);
  const put = (x: number, y: number, c: number[]) => rgba.set([c[0]!, c[1]!, c[2]!, 255], (y * w + x) * 4);
  for (let y = 10; y <= 50; y++) for (let x = 10; x <= 110; x++) {
    const groove = ((x >> 1) + (y >> 1)) & 1 ? 40 : 0; // rãnh ngói theo cả hai chiều
    put(x, y, [220 - groove, 120 - groove, 80 - groove]);
  }
  for (let y = 58; y <= 61; y++) for (let x = 20; x <= 100; x++) put(x, y, [150, 70, 50]);
  for (let y = 62; y <= 120; y++) for (const x0 of [25, 87]) for (let x = x0; x <= x0 + 8; x++) put(x, y, [200, 95, 60]);
  for (let y = 70; y <= 100; y++) for (let x = 50; x <= 70; x++) put(x, y, [183, 145, 83]);
  for (let y = 121; y <= 155; y++) for (let x = 5; x <= 115; x++) put(x, y, [174, 128, 100]);
  return { w, h, rgba };
}

describe('tự đề xuất vùng (R3a)', () => {
  const { w, h, rgba } = pavilion();
  const labels = proposeParts({ id: 'thu', layer: 'object', w, h, rgba, kinds: null });
  const at = (x: number, y: number) => labels[y * w + x];

  it('mái ngói có rãnh → mái; xà ngang → khung; cột đứng → cột; chuông → trang trí; bệ → nền', () => {
    expect(at(60, 30)).toBe(partIndex('mai'));
    expect(at(60, 59)).toBe(partIndex('khung'));
    expect(at(29, 90)).toBe(partIndex('cot'));
    expect(at(91, 115)).toBe(partIndex('cot')); // chân cột ở phần thấp vẫn là cột
    expect(at(60, 85)).toBe(partIndex('trangtri'));
    expect(at(60, 140)).toBe(partIndex('nen'));
  });

  it('mọi điểm có hình đều có vùng, chỗ trong suốt thì không', () => {
    const alpha = new Uint8Array(w * h).map((_, i) => rgba[i * 4 + 3]!);
    expect(partStats(labels, alpha).unassigned).toBe(0);
    expect(at(2, 2)).toBe(0);
  });

  it('ngói và cột cùng màu nhưng cột trơn nên không bị nhận là mái', () => {
    let colMai = 0;
    for (let y = 62; y <= 120; y++) for (let x = 25; x <= 33; x++) if (at(x, y) === partIndex('mai')) colMai++;
    expect(colMai).toBe(0);
  });
});

describe('lưu vùng', () => {
  let root: string;
  beforeEach(() => {
    root = makeTempRoot();
  });
  afterEach(() => removeTempRoot(root));

  it('lưu từng vùng thành ảnh, đọc lại đúng; khung cắt dời thì vùng dời theo tọa độ bản đồ', async () => {
    const labels = Uint8Array.from([1, 1, 2, 0, 4, 4, 2, 0, 7, 7, 7, 0]); // 4×3
    await saveParts(root, { id: 'gac', x: 100, y: 200, w: 4, h: 3 }, labels, 'edited');
    const dir = path.join(root, 'assets', 'game', 'buildings', 'gac', 'parts');
    expect(fs.readdirSync(dir).sort()).toEqual(['cot.png', 'mai.png', 'nen.png', 'nuoc.png', 'parts.json']);
    expect(readPartsMeta(root, 'gac')).toMatchObject({ x: 100, y: 200, w: 4, h: 3, source: 'edited' });
    expect(Array.from((await loadParts(root, { id: 'gac', x: 100, y: 200, w: 4, h: 3 }))!.labels)).toEqual(Array.from(labels));
    // Cắt lại rộng sang trái 1 điểm ảnh: vùng cũ nằm lệch sang phải 1 điểm trong ảnh mới.
    const moved = (await loadParts(root, { id: 'gac', x: 99, y: 200, w: 5, h: 3 }))!.labels;
    expect(Array.from(moved)).toEqual([0, 1, 1, 2, 0, 0, 4, 4, 2, 0, 0, 7, 7, 7, 0]);
    expect(await loadParts(root, { id: 'khac', x: 0, y: 0, w: 1, h: 1 })).toBeNull();
  });

  it('kiểm tra mảng vùng gửi lên', () => {
    expect(validateLabels(new Uint8Array(6), 3, 2)).toBeNull();
    expect(validateLabels(new Uint8Array(5), 3, 2)).toMatch(/sai cỡ/);
    expect(validateLabels(Uint8Array.from([0, 0, 0, 0, 0, PART_KEYS.length + 1]), 3, 2)).toMatch(/không hợp lệ/);
  });
});

describe('API trang /tools/parts', () => {
  let root: string;
  let srv: RunningServer | undefined;

  beforeEach(async () => {
    root = makeTempRoot();
    disableEvents(root);
    const { w, h, rgba } = pavilion();
    const file = path.join(root, 'assets', 'game', 'buildings', 'gac_chuong', 'final.png');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await sharp(Buffer.from(rgba), { raw: { width: w, height: h, channels: 4 } }).png().toFile(file);
    const manifest = {
      version: 1,
      images: {},
      background: { variant: 'A', variants: [], towerAnchor: { x: 540, y: 1215 }, skyOverlap: 150 },
      tower: { spireScale: 1 },
      map: {
        width: 1728, height: 5575, scale: 1.836, rawWidth: 941, rawHeight: 1672, overlap: 308, source: 'lanczos',
        tiles: [{ file: 'map/bg_0.jpg', y: 0, h: 2048 }], reference: null,
        buildings: [{ id: 'gac_chuong', items: ['gac_chuong'], layer: 'object', file: 'buildings/gac_chuong/final.png', x: 176, y: 1355, w, h, baseY: 1500, fg: null }],
      },
    };
    fs.writeFileSync(path.join(root, 'assets', 'manifest.json'), JSON.stringify(manifest));
    srv = await startServer({ rootDir: root, profile: 'test', logger: silentLogger, port: 0, simulatorTimer: false });
  });
  afterEach(async () => {
    await srv?.close();
    removeTempRoot(root);
  });

  const get = async (url: string) => (await fetch(`${srv!.url}${url}`)).json() as Promise<Record<string, unknown>>;
  const post = (url: string, body: unknown) =>
    fetch(`${srv!.url}${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  it('chưa chia thì máy đề xuất sẵn (chưa lưu); lưu xong thì đọc lại đúng bản đã lưu', async () => {
    const list = (await get('/api/tools/parts')) as { buildings: { id: string; name: string; status: string }[]; parts: unknown[] };
    expect(list.buildings).toEqual([expect.objectContaining({ id: 'gac_chuong', name: 'Gác chuông', status: 'none' })]);
    expect(list.parts).toHaveLength(7);

    const first = (await get('/api/tools/parts/gac_chuong')) as { labels: string; source: string };
    expect(first.source).toBe('unsaved');
    const labels = new Uint8Array(Buffer.from(first.labels, 'base64'));
    expect(labels.length).toBe(120 * 160);
    labels[0] = partIndex('tuong'); // chỉnh tay một điểm (điểm trong suốt vẫn lưu được, trang chỉ tô chỗ có hình)
    const r = await post('/api/tools/parts/gac_chuong', { labels: Buffer.from(labels).toString('base64') });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, status: 'edited' });

    const again = (await get('/api/tools/parts/gac_chuong')) as { labels: string; source: string };
    expect(again.source).toBe('edited');
    expect(new Uint8Array(Buffer.from(again.labels, 'base64'))[0]).toBe(partIndex('tuong'));
  });

  it('báo lỗi khi mảng vùng sai cỡ, công trình không có', async () => {
    expect((await post('/api/tools/parts/gac_chuong', { labels: Buffer.from(new Uint8Array(10)).toString('base64') })).status).toBe(400);
    expect((await post('/api/tools/parts/khong_co', { labels: '' })).status).toBe(400);
    const propose = (await (await post('/api/tools/parts/gac_chuong/propose', {})).json()) as { source: string };
    expect(propose.source).toBe('unsaved');
  });
});
