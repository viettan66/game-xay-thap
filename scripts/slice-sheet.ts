// Cắt một sprite sheet NỀN TRONG SUỐT thành các ảnh riêng, dựa trên khoảng trống trong suốt giữa các hình
// (mục 7 SPEC). Có tùy chọn đệm (--equal) để mọi khung cùng nhóm có cùng kích thước ô và chân thẳng hàng.
//
// Dùng trực tiếp:
//   node --import tsx scripts/slice-sheet.ts <sheet.png> <thư_mục_ra> --names a,b,c [--equal] [--pad 4]
//        [--min-gap 8] [--core-alpha 128] [--halo 0]
// Không có --names thì đặt tên sprite_1, sprite_2… theo thứ tự đọc (trên → dưới, trái → phải).

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { blank, blit, loadImg, saveImg, type Img } from './assets/image.js';

export interface SliceOptions {
  /** Điểm có alpha ≥ ngưỡng này là "thân" hình (mặc định 128). */
  coreAlpha?: number;
  /** Hai mảng cách nhau dưới số điểm ảnh này được coi là cùng một hình (mặc định 8). */
  minGap?: number;
  /** Gom thêm phần mờ (hào quang, bóng) cách thân tối đa số điểm ảnh này (mặc định 0). */
  haloRadius?: number;
  /** Hình có số điểm thân nhỏ hơn bị bỏ (đốm lẻ). Mặc định 50. */
  minArea?: number;
}

export interface Sprite {
  label: number;
  x: number;
  y: number;
  w: number;
  h: number;
  area: number;
}

export interface SliceResult {
  sprites: Sprite[];
  labels: Int32Array;
}

function dilate(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return mask.slice();
  // Giãn theo hàng rồi theo cột (lọc max hình hộp), dùng tổng dồn để chạy nhanh.
  const tmp = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let count = 0;
    const row = y * w;
    for (let x = 0; x < Math.min(w, r); x++) count += mask[row + x]!;
    for (let x = 0; x < w; x++) {
      if (x + r < w) count += mask[row + x + r]!;
      if (x - r - 1 >= 0) count -= mask[row + x - r - 1]!;
      tmp[row + x] = count > 0 ? 1 : 0;
    }
  }
  const out = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    let count = 0;
    for (let y = 0; y < Math.min(h, r); y++) count += tmp[y * w + x]!;
    for (let y = 0; y < h; y++) {
      if (y + r < h) count += tmp[(y + r) * w + x]!;
      if (y - r - 1 >= 0) count -= tmp[(y - r - 1) * w + x]!;
      out[y * w + x] = count > 0 ? 1 : 0;
    }
  }
  return out;
}

export function findSprites(img: Img, opts: SliceOptions = {}): SliceResult {
  const { width: w, height: h, data } = img;
  const coreAlpha = opts.coreAlpha ?? 128;
  const minArea = opts.minArea ?? 50;
  const halo = opts.haloRadius ?? 0;
  const n = w * h;
  const core = new Uint8Array(n);
  for (let i = 0; i < n; i++) core[i] = data[i * 4 + 3]! >= coreAlpha ? 1 : 0;
  const near = dilate(core, w, h, Math.ceil((opts.minGap ?? 8) / 2));

  // Đánh số các vùng đã giãn (BFS 4 hướng).
  const region = new Int32Array(n);
  const queue = new Int32Array(n);
  let next = 0;
  for (let i = 0; i < n; i++) {
    if (!near[i] || region[i]) continue;
    next++;
    let head = 0;
    let tail = 0;
    queue[tail++] = i;
    region[i] = next;
    while (head < tail) {
      const p = queue[head++]!;
      const x = p % w;
      for (const q of [p - w, p + w, x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1]) {
        if (q < 0 || q >= n || !near[q] || region[q]) continue;
        region[q] = next;
        queue[tail++] = q;
      }
    }
  }

  // Điểm có alpha > 0 nằm trong vùng giãn thuộc về hình đó (gồm cả viền mờ).
  const labels = new Int32Array(n);
  let tail = 0;
  for (let i = 0; i < n; i++) {
    if (data[i * 4 + 3]! > 0 && region[i]) {
      labels[i] = region[i]!;
      queue[tail++] = i;
    }
  }
  // Phần mờ xa hơn (hào quang): lan dần từ hình ra tối đa `halo` điểm ảnh.
  if (halo > 0) {
    const dist = new Int32Array(n);
    let head = 0;
    while (head < tail) {
      const p = queue[head++]!;
      if (dist[p]! >= halo) continue;
      const x = p % w;
      for (const q of [p - w, p + w, x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1]) {
        if (q < 0 || q >= n || labels[q] || data[q * 4 + 3] === 0) continue;
        labels[q] = labels[p]!;
        dist[q] = dist[p]! + 1;
        queue[tail++] = q;
      }
    }
  }

  const boxes = new Map<number, Sprite>();
  for (let i = 0; i < n; i++) {
    const l = labels[i]!;
    if (!l) continue;
    const x = i % w;
    const y = (i - x) / w;
    const b = boxes.get(l);
    if (!b) {
      boxes.set(l, { label: l, x, y, w: 1, h: 1, area: core[i]! });
      continue;
    }
    const x1 = Math.max(b.x + b.w, x + 1);
    const y1 = Math.max(b.y + b.h, y + 1);
    b.x = Math.min(b.x, x);
    b.y = Math.min(b.y, y);
    b.w = x1 - b.x;
    b.h = y1 - b.y;
    b.area += core[i]!;
  }
  const sprites = readingOrder([...boxes.values()].filter((s) => s.area >= minArea));
  return { sprites, labels };
}

/** Thứ tự đọc: gom hàng (chồng nhau theo chiều dọc ≥ 30%), trong hàng xếp trái → phải. */
export function readingOrder<T extends { x: number; y: number; w: number; h: number }>(items: T[]): T[] {
  const rows: { y0: number; y1: number; items: T[] }[] = [];
  for (const it of [...items].sort((a, b) => a.y - b.y)) {
    const row = rows.find((r) => Math.min(it.y + it.h, r.y1) - Math.max(it.y, r.y0) >= 0.3 * Math.min(it.h, r.y1 - r.y0));
    if (row) {
      row.items.push(it);
      row.y0 = Math.min(row.y0, it.y);
      row.y1 = Math.max(row.y1, it.y + it.h);
    } else rows.push({ y0: it.y, y1: it.y + it.h, items: [it] });
  }
  return rows.sort((a, b) => a.y0 - b.y0).flatMap((r) => r.items.sort((a, b) => a.x - b.x));
}

/** Lấy riêng một hình (chỉ điểm ảnh thuộc hình đó, hình bên cạnh không lẫn vào). */
export function extractSprite(img: Img, labels: Int32Array, s: Sprite): Img {
  const out = blank(s.w, s.h);
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      const i = (s.y + y) * img.width + (s.x + x);
      if (labels[i] !== s.label) continue;
      out.data.set(img.data.subarray(i * 4, i * 4 + 4), (y * s.w + x) * 4);
    }
  }
  return out;
}

export interface Frame {
  name: string;
  img: Img;
  /** Điểm neo trong ảnh (ví dụ giữa đầu theo chiều ngang, bàn chân theo chiều dọc). */
  ax: number;
  ay: number;
}

export interface PackedGroup {
  cellW: number;
  cellH: number;
  /** Điểm neo chung trong ô, giống nhau cho mọi khung. */
  ax: number;
  ay: number;
  frames: { name: string; img: Img; dx: number; dy: number }[];
}

/** Đặt mọi khung vào ô cùng kích thước sao cho điểm neo trùng nhau (chân thẳng hàng). */
export function packGroup(frames: Frame[], pad = 4): PackedGroup {
  const left = Math.max(...frames.map((f) => f.ax));
  const right = Math.max(...frames.map((f) => f.img.width - f.ax));
  const up = Math.max(...frames.map((f) => f.ay));
  const down = Math.max(...frames.map((f) => f.img.height - f.ay));
  const ax = Math.round(pad + left);
  const ay = Math.round(pad + up);
  const cellW = Math.ceil(ax + right + pad);
  const cellH = Math.ceil(ay + down + pad);
  return {
    cellW,
    cellH,
    ax,
    ay,
    frames: frames.map((f) => {
      const dx = Math.round(ax - f.ax);
      const dy = Math.round(ay - f.ay);
      const img = blank(cellW, cellH);
      blit(img, f.img, dx, dy);
      return { name: f.name, img, dx, dy };
    }),
  };
}

/** Khung bao các điểm có alpha ≥ ngưỡng. */
export function opaqueBounds(img: Img, alphaMin = 16): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = img.width;
  let y0 = img.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.data[(y * img.width + x) * 4 + 3]! < alphaMin) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

// ---- Chạy từ dòng lệnh ----
async function cli(argv: string[]): Promise<void> {
  const [input, outDir] = argv.filter((a) => !a.startsWith('--'));
  if (!input || !outDir) {
    console.log('Cách dùng: node --import tsx scripts/slice-sheet.ts <sheet.png> <thư_mục_ra> [--names a,b] [--equal] [--pad 4]');
    process.exit(1);
  }
  const opt = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const img = await loadImg(input);
  const { sprites, labels } = findSprites(img, {
    coreAlpha: Number(opt('core-alpha') ?? 128),
    minGap: Number(opt('min-gap') ?? 8),
    haloRadius: Number(opt('halo') ?? 0),
  });
  const names = opt('names')?.split(',') ?? sprites.map((_, i) => `sprite_${i + 1}`);
  const imgs = sprites.map((s) => extractSprite(img, labels, s));
  const pad = Number(opt('pad') ?? 4);
  const out = argv.includes('--equal')
    ? packGroup(imgs.map((im, i) => ({ name: names[i] ?? `sprite_${i + 1}`, img: im, ax: im.width / 2, ay: im.height })), pad).frames
    : imgs.map((im, i) => ({ name: names[i] ?? `sprite_${i + 1}`, img: im }));
  for (const f of out) await saveImg(f.img, path.join(outDir, `${f.name}.png`));
  console.log(`Đã cắt ${out.length} hình vào ${outDir}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await cli(process.argv.slice(2));
}
