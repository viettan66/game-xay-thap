// Dựng bản đồ quần thể chùa (mục 7, giai đoạn R2). Dùng chung cho `npm run assets:map` và trang /tools/assets.
//
// 1. Nền: map_empty + mặt đất nối dài (map_ground_ext chồng lên đáy 308px gốc, mờ dần phần chồng), phóng bằng AI
//    (Real-ESRGAN ×4, nếu có) rồi thu về hệ tọa độ bản đồ rộng mapWidth (1080 × maxZoom = 1728). Cắt thành dải ngang .jpg.
// 2. Công trình: theo khung trong assets/map-cuts.json (tọa độ ảnh gốc 941×1672).
//    - object: mặt nạ rembg (scripts/assets/map_segment.py) trừ đi chỗ giống hệt ảnh đồi trống (cây có sẵn đứng trước
//      công trình). Phần bị trừ đó thành lớp tiền cảnh fg/<id>.png (vẽ đè lên công trình).
//    - ground: phần khác biệt giữa map_built và map_empty trong vùng khoanh, trừ mọi công trình object và các ground
//      đứng trước trong danh sách.
//    Ảnh lấy từ map_built đã phóng, ghi ra buildings/<id>/final.png + vị trí, baseY trong manifest (tọa độ bản đồ).
// Ảnh gốc KHÔNG bị sửa.

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { z } from 'zod';
import { defaultTierLines, type MapBuilding, type MapManifest, type MapTile } from '../../shared/map.js';
import type { Manifest } from '../../shared/manifest.js';
import { formatZodError } from '../config/schema.js';
import { gameAssetsDir, loadManifest, saveManifest } from './manifest.js';
import { bbox, boxBlur, components, dilate, erode, fillHoles, open, polygonMask, smoothstep } from './mask.js';
import { KIND_APRON, KIND_CORE, KIND_GROUND, KIND_HOLE } from './kinds.js';
import { ensureParts } from './parts.js';
import { rawPath, upscaledPath } from './rawFiles.js';

/** Độ khác màu (khoảng cách RGB sau khi làm mờ nhẹ) dưới mức này coi là "giống hệt ảnh đồi trống". */
export const UNCHANGED_BELOW = 14;
/** Vùng ground: khác biệt từ GROUND_LO bắt đầu lấy, từ GROUND_HI lấy hoàn toàn. */
export const GROUND_LO = 10;
export const GROUND_HI = 28;
/** Alpha nhỏ hơn mức này ở vùng nền thì bỏ hẳn. */
const GROUND_MIN_ALPHA = 24;
/** Cụm "cây đứng trước" nhỏ hơn số điểm ảnh gốc này thì bỏ qua (nhiễu). */
const MIN_OCCLUDER = 60;
/** Viền chân công trình (điểm ảnh gốc) và độ khác biệt tối thiểu để gộp vào công trình. */
export const APRON = 10;
const APRON_DIFF = 30;
const TILE_H = 2048;

// ---------- Khung cắt (assets/map-cuts.json) ----------

const int = z.number().int();
const box = z.tuple([int, int, int, int]);
const slug = z.string().regex(/^[a-z0-9_]+$/, 'mã chỉ gồm chữ thường không dấu, số và dấu _');

export const cutsSchema = z
  .strictObject({
    _ghi_chu: z.string().optional(),
    rawWidth: int.positive(),
    rawHeight: int.positive(),
    overlap: int.min(0),
    mapWidth: int.positive(),
    buildings: z
      .array(
        z.strictObject({
          id: slug,
          items: z.array(slug).min(1).optional(),
          parts: z
            .array(
              z.strictObject({
                mode: z.enum(['object', 'ground']),
                box,
                polygon: z.array(z.tuple([z.number(), z.number()])).min(3).optional(),
              }),
            )
            .min(1),
          /** Chỉnh tay đường chân (tọa độ ảnh gốc). */
          baseY: z.number().optional(),
          /** Chỉnh tay mép trên từng tầng bảo tháp (tọa độ ảnh gốc). */
          tierLinesY: z.array(z.number()).optional(),
        }),
      )
      .min(1),
  })
  .superRefine((c, ctx) => {
    const ids = new Set<string>();
    c.buildings.forEach((b, i) => {
      if (ids.has(b.id)) ctx.addIssue({ code: 'custom', message: `Trùng mã công trình "${b.id}"`, path: ['buildings', i, 'id'] });
      ids.add(b.id);
      b.parts.forEach((p, k) => {
        const [x0, y0, x1, y1] = p.box;
        if (!(x0 >= 0 && y0 >= 0 && x1 <= c.rawWidth && y1 <= c.rawHeight && x0 < x1 && y0 < y1)) {
          ctx.addIssue({ code: 'custom', message: `Khung [${p.box.join(', ')}] nằm ngoài ảnh gốc hoặc bị ngược`, path: ['buildings', i, 'parts', k, 'box'] });
        }
      });
      if (b.tierLinesY && b.tierLinesY.length !== (b.items?.length ?? 1)) {
        ctx.addIssue({ code: 'custom', message: `Cần đúng ${b.items?.length ?? 1} mép tầng`, path: ['buildings', i, 'tierLinesY'] });
      }
    });
  });

export type MapCuts = z.infer<typeof cutsSchema>;
export type CutBuilding = MapCuts['buildings'][number];
export type CutPart = CutBuilding['parts'][number];

export class MapCutError extends Error {
  constructor(readonly problems: string[]) {
    super(`Không cắt được bản đồ:\n- ${problems.join('\n- ')}`);
  }
}

export function cutsPath(root: string): string {
  return path.join(root, 'assets', 'map-cuts.json');
}

export function validateCuts(raw: unknown): MapCuts {
  const r = cutsSchema.safeParse(raw);
  if (!r.success) throw new MapCutError(formatZodError(r.error));
  return r.data;
}

export function loadCuts(root: string): MapCuts {
  return validateCuts(JSON.parse(fs.readFileSync(cutsPath(root), 'utf8').replace(/^﻿/, '')));
}

/** JSON dễ đọc: khung, điểm, danh sách mã, và mỗi phần cắt đơn giản viết trên một dòng. */
export function formatCuts(c: MapCuts): string {
  const inline = (inner: string) => inner.split(/,\s*\n\s*/).join(', ');
  const prim = String.raw`(?:"(?:[^"\\]|\\.)*"|-?[\d.]+|true|false|null|\[[^\[\]\n]*\])`;
  return (
    JSON.stringify(c, null, 2)
      // [1, 2, 3] và ["a", "b"]
      .replace(/\[\s*\n\s*((?:-?[\d.]+|"(?:[^"\\]|\\.)*")(?:,\s*\n\s*(?:-?[\d.]+|"(?:[^"\\]|\\.)*"))*)\s*\n\s*\]/g, (_m, s: string) => `[${inline(s)}]`)
      // [[x, y], [x, y]]
      .replace(/\[\s*\n\s*(\[[^\[\]\n]*\](?:,\s*\n\s*\[[^\[\]\n]*\])*)\s*\n\s*\]/g, (_m, s: string) => `[${inline(s)}]`)
      // { "mode": "object", "box": [..] }
      .replace(new RegExp(String.raw`\{\s*\n\s*("[^"]+": ${prim}(?:,\s*\n\s*"[^"]+": ${prim})*)\s*\n\s*\}`, 'g'), (_m, s: string) => `{ ${inline(s)} }`) +
    '\n'
  );
}

export function saveCuts(root: string, c: MapCuts): void {
  const valid = validateCuts(c);
  const file = cutsPath(root);
  fs.writeFileSync(`${file}.tmp`, formatCuts(valid), 'utf8');
  fs.renameSync(`${file}.tmp`, file);
}

/** Khung vùng cắt rembg đã tạo cho từng phần object (assets/work/map/rembg/index.json). */
export function rembgDir(root: string): string {
  return path.join(root, 'assets', 'work', 'map', 'rembg');
}

function readRembgIndex(root: string): Record<string, { crop: [number, number, number, number] }> {
  const f = path.join(rembgDir(root), 'index.json');
  return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, 'utf8')) as Record<string, { crop: [number, number, number, number] }>) : {};
}

/** Các phần object chưa có mặt nạ rembg phủ hết khung (cần chạy map_segment.py). */
export function missingSegments(root: string, cuts: MapCuts): string[] {
  const index = readRembgIndex(root);
  const out: string[] = [];
  for (const b of cuts.buildings) {
    b.parts.forEach((p, k) => {
      if (p.mode !== 'object') return;
      const key = `${b.id}_${k}`;
      const crop = index[key]?.crop;
      const [x0, y0, x1, y1] = p.box;
      const covered = crop && crop[0] <= x0 && crop[1] <= y0 && crop[2] >= x1 && crop[3] >= y1;
      if (!covered || !fs.existsSync(path.join(rembgDir(root), `${key}.png`))) out.push(b.id);
    });
  }
  return [...new Set(out)];
}

// ---------- Ảnh nguồn ----------

interface RawRGB {
  width: number;
  height: number;
  data: Buffer;
}

interface Sources {
  W: number;
  H: number;
  /** Khác biệt map_built so với map_empty ở từng điểm ảnh gốc (0–255). */
  diff: Uint8Array;
  /** map_built ở hệ tọa độ bản đồ (RGB). */
  builtMap: RawRGB;
  scale: number;
  source: 'esrgan' | 'lanczos';
}

async function rawRGB(input: string | Buffer, opts?: { blur?: number; width?: number }): Promise<RawRGB> {
  let img = sharp(input).removeAlpha();
  if (opts?.width) img = img.resize({ width: opts.width, kernel: 'lanczos3' });
  if (opts?.blur) img = img.blur(opts.blur);
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data };
}

/** Ảnh nguồn ở hệ tọa độ bản đồ: ưu tiên bản phóng AI, chưa có thì phóng thường từ ảnh gốc. Có lưu đệm. */
async function mapScaled(root: string, name: string, mapWidth: number): Promise<{ img: RawRGB; source: 'esrgan' | 'lanczos' }> {
  const x4 = upscaledPath(root, name);
  const source = fs.existsSync(x4) ? 'esrgan' : 'lanczos';
  const from = source === 'esrgan' ? x4 : rawPath(root, name);
  const cache = path.join(root, 'assets', 'work', 'map', `${name}_${source}_${mapWidth}.png`);
  if (!fs.existsSync(cache) || fs.statSync(cache).mtimeMs < fs.statSync(from).mtimeMs) {
    fs.mkdirSync(path.dirname(cache), { recursive: true });
    await sharp(from).removeAlpha().resize({ width: mapWidth, kernel: 'lanczos3' }).png({ compressionLevel: 3 }).toFile(cache);
  }
  return { img: await rawRGB(cache), source };
}

async function loadSources(root: string, cuts: MapCuts): Promise<Sources> {
  const builtFile = rawPath(root, 'map_built');
  const emptyFile = rawPath(root, 'map_empty');
  const [b, e] = await Promise.all([rawRGB(builtFile, { blur: 1.2 }), rawRGB(emptyFile, { blur: 1.2 })]);
  if (b.width !== cuts.rawWidth || b.height !== cuts.rawHeight || e.width !== b.width || e.height !== b.height) {
    throw new MapCutError([`Ảnh map_built / map_empty phải cùng kích thước ${cuts.rawWidth}×${cuts.rawHeight}`]);
  }
  const n = b.width * b.height;
  const diff = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const dr = b.data[i * 3]! - e.data[i * 3]!;
    const dg = b.data[i * 3 + 1]! - e.data[i * 3 + 1]!;
    const db = b.data[i * 3 + 2]! - e.data[i * 3 + 2]!;
    diff[i] = Math.min(255, Math.round(Math.sqrt(dr * dr + dg * dg + db * db)));
  }
  const built = await mapScaled(root, 'map_built', cuts.mapWidth);
  return { W: b.width, H: b.height, diff, builtMap: built.img, scale: cuts.mapWidth / cuts.rawWidth, source: built.source };
}

// ---------- Mặt nạ ----------

export interface BuildingMask {
  alpha: Uint8Array;
  fg: Uint8Array | null;
  layer: 'ground' | 'object';
  /** Loại từng điểm ảnh (KIND_*), dùng để gợi ý chia vùng xây từng mảnh (R3). */
  kinds: Uint8Array;
}


/** Đọc mặt nạ rembg của một phần object, đặt vào khung (tọa độ trong khung). */
async function rembgInBox(root: string, key: string, b: [number, number, number, number]): Promise<Uint8Array> {
  const crop = readRembgIndex(root)[key]?.crop;
  const file = path.join(rembgDir(root), `${key}.png`);
  if (!crop || !fs.existsSync(file)) throw new MapCutError([`Chưa tách nền phần "${key}": chạy npm run assets:segment`]);
  // extractChannel: ảnh xám vẫn có thể được đọc ra 3 kênh giống nhau; chỉ lấy một kênh.
  const { data, info } = await sharp(file).extractChannel(0).raw().toBuffer({ resolveWithObject: true });
  const [x0, y0, x1, y1] = b;
  const bw = x1 - x0;
  const out = new Uint8Array(bw * (y1 - y0));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const cx = x - crop[0];
      const cy = y - crop[1];
      if (cx >= 0 && cy >= 0 && cx < info.width && cy < info.height) out[(y - y0) * bw + (x - x0)] = data[cy * info.width + cx]!;
    }
  }
  return out;
}

/**
 * Một phần object: mặt nạ rembg, bỏ các cụm "giống hệt ảnh đồi trống" chạm mép hình (cây có sẵn đứng trước),
 * lấp lỗ kín bên trong. Trả về alpha công trình và alpha tiền cảnh, cùng kích thước khung.
 */
export function objectMask(
  rem: Uint8Array,
  diffInBox: Uint8Array,
  bw: number,
  bh: number,
): { alpha: Uint8Array; fg: Uint8Array; core: Uint8Array; holes: Uint8Array } {
  const n = bw * bh;
  const R = new Uint8Array(n);
  for (let i = 0; i < n; i++) R[i] = rem[i]! > 128 ? 1 : 0;
  let U: Uint8Array = new Uint8Array(n);
  for (let i = 0; i < n; i++) U[i] = R[i] && diffInBox[i]! < UNCHANGED_BELOW ? 1 : 0;
  U = open(U, bw, bh, 1);
  // Dải sát mép hình (trong vòng 3 điểm ảnh tính từ chỗ không thuộc công trình hoặc mép khung).
  const notR = new Uint8Array(n);
  for (let i = 0; i < n; i++) notR[i] = R[i] ? 0 : 1;
  const nearOut = dilate(notR, bw, bh, 3);
  const { labels, sizes } = components(U, bw, bh);
  const touches = new Uint8Array(sizes.length);
  for (let i = 0; i < n; i++) {
    const l = labels[i]!;
    if (!l) continue;
    const x = i % bw;
    const y = (i / bw) | 0;
    if (nearOut[i] || x < 3 || y < 3 || x >= bw - 3 || y >= bh - 3) touches[l] = 1;
  }
  const occ = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const l = labels[i]!;
    occ[i] = l && touches[l] && sizes[l]! >= MIN_OCCLUDER ? 255 : 0;
  }
  const occSoft = boxBlur(occ, bw, bh, 1);
  const alpha = new Uint8Array(n);
  for (let i = 0; i < n; i++) alpha[i] = Math.round((rem[i]! * (255 - occSoft[i]!)) / 255);
  // Lỗ kín bên trong công trình (màu tường trùng màu đất…) thì lấp lại.
  const B = new Uint8Array(n);
  for (let i = 0; i < n; i++) B[i] = alpha[i]! > 128 ? 1 : 0;
  const filled = fillHoles(B, bw, bh);
  const holes = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (filled[i] && !B[i] && !occ[i]) {
      alpha[i] = 255;
      holes[i] = 1;
    }
  }
  const fg = new Uint8Array(n);
  for (let i = 0; i < n; i++) fg[i] = Math.round((occSoft[i]! * rem[i]!) / 255);
  return { alpha, fg, core: B, holes };
}

/** Tính mặt nạ mọi công trình trên ảnh gốc (mỗi mặt nạ cùng kích thước ảnh gốc). */
export async function computeMasks(root: string, cuts: MapCuts, src: Pick<Sources, 'W' | 'H' | 'diff'>): Promise<Map<string, BuildingMask>> {
  const { W, H, diff } = src;
  const masks = new Map<string, BuildingMask>();
  const put = (target: Uint8Array, part: Uint8Array, b: number[]) => {
    const [x0, y0, x1, y1] = b as [number, number, number, number];
    const bw = x1 - x0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const v = part[(y - y0) * bw + (x - x0)]!;
      if (v > target[y * W + x]!) target[y * W + x] = v;
    }
  };
  const diffBox = (b: number[]) => {
    const [x0, y0, x1, y1] = b as [number, number, number, number];
    const bw = x1 - x0;
    const out = new Uint8Array(bw * (y1 - y0));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) out[(y - y0) * bw + (x - x0)] = diff[y * W + x]!;
    return out;
  };

  // 1. Công trình (object).
  const occupied = new Uint8Array(W * H);
  for (const b of cuts.buildings) {
    const objParts = b.parts.map((p, k) => ({ p, k })).filter(({ p }) => p.mode === 'object');
    if (objParts.length === 0) continue;
    const alpha = new Uint8Array(W * H);
    const fg = new Uint8Array(W * H);
    const kinds = new Uint8Array(W * H);
    for (const { p, k } of objParts) {
      const [x0, y0, x1, y1] = p.box;
      const rem = await rembgInBox(root, `${b.id}_${k}`, p.box);
      const m = objectMask(rem, diffBox(p.box), x1 - x0, y1 - y0);
      put(alpha, m.alpha, p.box);
      put(fg, m.fg, p.box);
      put(kinds, m.core.map((v, i) => (v ? KIND_CORE : m.holes[i] ? KIND_HOLE : 0)), p.box);
    }
    for (let i = 0; i < W * H; i++) if (alpha[i]! > 128) occupied[i] = 1;
    masks.set(b.id, { alpha, fg, layer: 'object', kinds });
  }
  // Viền chân công trình: rembg hay bỏ sót phần trông giống mặt đất (sàn hành lang, bậc, hoa văn đỉnh mái).
  // Chỗ khác hẳn ảnh đồi trống, chưa thuộc công trình nào, nằm trong vòng APRON điểm ảnh quanh công trình
  // (và trong khung của nó) thì gộp vào công trình đó. Mép viền làm mềm để không lộ đường cắt.
  for (const b of cuts.buildings) {
    const m = masks.get(b.id);
    if (!m) continue;
    for (const p of b.parts) {
      if (p.mode !== 'object') continue;
      const [x0, y0, x1, y1] = p.box;
      const bw = x1 - x0;
      const bh = y1 - y0;
      const own = new Uint8Array(bw * bh);
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) own[y * bw + x] = m.alpha[(y0 + y) * W + x0 + x]! > 128 ? 1 : 0;
      const near = dilate(own, bw, bh, APRON);
      const add = new Uint8Array(bw * bh);
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
        const i = y * bw + x;
        const gi = (y0 + y) * W + x0 + x;
        if (near[i] && !occupied[gi] && !m.fg![gi] && diff[gi]! >= APRON_DIFF) add[i] = 255;
      }
      const soft = boxBlur(add, bw, bh, 1);
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
        const gi = (y0 + y) * W + x0 + x;
        const v = soft[y * bw + x]!;
        if (v > m.alpha[gi]!) m.alpha[gi] = v;
        if (v > 128) {
          occupied[gi] = 1;
          if (!m.kinds[gi]) m.kinds[gi] = KIND_APRON;
        }
      }
    }
  }
  // Lỗ trên nền nhỏ hơn công trình 1 điểm ảnh, để công trình phủ kín mép lỗ.
  const occ = erode(occupied, W, H, 1);

  // 2. Nền (ground), theo thứ tự danh sách; cái đứng trước được ưu tiên.
  const taken = new Uint8Array(W * H);
  for (const b of cuts.buildings) {
    const groundParts = b.parts.filter((p) => p.mode === 'ground');
    if (groundParts.length === 0) continue;
    const g = new Uint8Array(W * H);
    for (const p of groundParts) {
      const [x0, y0, x1, y1] = p.box;
      const bw = x1 - x0;
      const bh = y1 - y0;
      const region = p.polygon ? polygonMask(p.polygon as [number, number][], x0, y0, bw, bh) : new Uint8Array(bw * bh).fill(1);
      const soft = boxBlur(region.map((v) => v * 255), bw, bh, 2);
      // Mép khung không bị làm mờ vào trong khi vùng là cả khung.
      const part = new Uint8Array(bw * bh);
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
        const i = y * bw + x;
        const gi = (y0 + y) * W + x0 + x;
        const r = p.polygon ? soft[i]! : 255;
        const v = Math.round(r * smoothstep(GROUND_LO, GROUND_HI, diff[gi]!) * (occ[gi] ? 0 : 1) * (1 - taken[gi]! / 255));
        // Gần như trong suốt thì cho trong suốt hẳn: ở đó hai ảnh vốn gần giống nhau, và file ảnh nhẹ đi nhiều.
        part[i] = v < GROUND_MIN_ALPHA ? 0 : v;
      }
      put(g, part, p.box);
    }
    for (let i = 0; i < W * H; i++) if (g[i]! > taken[i]!) taken[i] = g[i]!;
    const prev = masks.get(b.id);
    if (prev) {
      for (let i = 0; i < W * H; i++) {
        if (g[i]! > prev.alpha[i]!) prev.alpha[i] = g[i]!;
        if (g[i]! > 128 && !prev.kinds[i]) prev.kinds[i] = KIND_GROUND;
      }
    } else {
      masks.set(b.id, { alpha: g, fg: null, layer: 'ground', kinds: g.map((v) => (v > 128 ? KIND_GROUND : 0)) });
    }
  }
  return masks;
}

// ---------- Ghi ảnh ----------

async function writeCut(
  file: string,
  alpha: Uint8Array,
  src: Sources,
  threshold: number,
): Promise<{ x: number; y: number; w: number; h: number; rawBox: { x0: number; y0: number; x1: number; y1: number } } | null> {
  const { W, H, builtMap, scale } = src;
  const bb = bbox(alpha, W, H, threshold);
  if (!bb) return null;
  const rw = bb.x1 - bb.x0;
  const rh = bb.y1 - bb.y0;
  const crop = new Uint8Array(rw * rh);
  for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) crop[y * rw + x] = alpha[(bb.y0 + y) * W + bb.x0 + x]!;
  const X = Math.floor(bb.x0 * scale);
  const Y = Math.floor(bb.y0 * scale);
  const w = Math.min(builtMap.width, Math.ceil(bb.x1 * scale)) - X;
  const h = Math.min(builtMap.height, Math.ceil(bb.y1 * scale)) - Y;
  const a = await sharp(Buffer.from(crop), { raw: { width: rw, height: rh, channels: 1 } })
    .resize({ width: w, height: h, fit: 'fill', kernel: 'cubic' })
    .extractChannel(0)
    .raw()
    .toBuffer();
  const rgba = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = ((Y + y) * builtMap.width + X + x) * 3;
      const d = (y * w + x) * 4;
      const al = a[y * w + x]!;
      if (al === 0) continue; // điểm trong suốt để màu 0: nén PNG tốt hơn nhiều
      rgba[d] = builtMap.data[s]!;
      rgba[d + 1] = builtMap.data[s + 1]!;
      rgba[d + 2] = builtMap.data[s + 2]!;
      rgba[d + 3] = al;
    }
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(file);
  return { x: X, y: Y, w, h, rawBox: bb };
}

/** Ảnh loại điểm ảnh, cùng khung với final.png (phóng kiểu "gần nhất" để giữ đúng giá trị loại). */
async function writeKinds(
  file: string,
  kinds: Uint8Array,
  W: number,
  placed: { w: number; h: number; rawBox: { x0: number; y0: number; x1: number; y1: number } },
): Promise<void> {
  const { x0, y0, x1, y1 } = placed.rawBox;
  const rw = x1 - x0;
  const rh = y1 - y0;
  const crop = new Uint8Array(rw * rh);
  for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) crop[y * rw + x] = kinds[(y0 + y) * W + x0 + x]!;
  await sharp(Buffer.from(crop), { raw: { width: rw, height: rh, channels: 1 } })
    .resize({ width: placed.w, height: placed.h, fit: 'fill', kernel: 'nearest' })
    .extractChannel(0)
    .png()
    .toFile(file);
}

/** Đáy phần đặc (alpha > 128) của công trình, tọa độ ảnh gốc. */
function solidBottom(alpha: Uint8Array, W: number, H: number): number | null {
  for (let y = H - 1; y >= 0; y--) for (let x = 0; x < W; x++) if (alpha[y * W + x]! > 128) return y + 1;
  return null;
}

/** Ảnh nền ghép + dải ngang + ảnh tham chiếu map_built. Chỉ làm lại khi chưa có hoặc force. */
async function writeBackground(root: string, cuts: MapCuts, src: Sources, force: boolean, log: (s: string) => void): Promise<{ tiles: MapTile[]; height: number; reference: string }> {
  const dir = path.join(gameAssetsDir(root), 'map');
  const scale = src.scale;
  const height = Math.round((2 * cuts.rawHeight - cuts.overlap) * scale);
  const tiles: MapTile[] = [];
  for (let y = 0, k = 0; y < height; y += TILE_H, k++) tiles.push({ file: `map/bg_${k}.jpg`, y, h: Math.min(TILE_H, height - y) });
  const reference = 'map/reference_built.jpg';
  const stampFile = path.join(dir, 'source.txt');
  const stamp = `${src.source}:${cuts.mapWidth}:${cuts.overlap}:${height}`;
  const have = tiles.every((t) => fs.existsSync(path.join(gameAssetsDir(root), t.file))) && fs.existsSync(path.join(gameAssetsDir(root), reference));
  if (!force && have && fs.existsSync(stampFile) && fs.readFileSync(stampFile, 'utf8') === stamp) return { tiles, height, reference };

  log(`- Ghép ảnh nền ${cuts.mapWidth}×${height} (${src.source === 'esrgan' ? 'phóng bằng AI' : 'phóng thường, chưa có Real-ESRGAN'})`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const empty = await mapScaled(root, 'map_empty', cuts.mapWidth);
  const ext = await mapScaled(root, 'map_ground_ext', cuts.mapWidth);
  const top = empty.img;
  const extY = Math.round((cuts.rawHeight - cuts.overlap) * scale);
  const fade = Math.round(cuts.overlap * scale);
  // Mặt đất nối dài: alpha tăng mượt từ 0 ở mép trên phần chồng lên 255 ở đáy phần chồng.
  const extRgba = Buffer.alloc(ext.img.width * ext.img.height * 4);
  for (let y = 0; y < ext.img.height; y++) {
    const a = Math.round(255 * smoothstep(0, fade, y));
    for (let x = 0; x < ext.img.width; x++) {
      const s = (y * ext.img.width + x) * 3;
      const d = (y * ext.img.width + x) * 4;
      extRgba[d] = ext.img.data[s]!;
      extRgba[d + 1] = ext.img.data[s + 1]!;
      extRgba[d + 2] = ext.img.data[s + 2]!;
      extRgba[d + 3] = a;
    }
  }
  const full = await sharp({ create: { width: cuts.mapWidth, height, channels: 3, background: '#000' } })
    .composite([
      { input: top.data, raw: { width: top.width, height: top.height, channels: 3 }, left: 0, top: 0 },
      { input: extRgba, raw: { width: ext.img.width, height: ext.img.height, channels: 4 }, left: 0, top: extY },
    ])
    .removeAlpha() // ghép lớp có alpha xong ảnh thành 4 kênh: bỏ kênh alpha để còn đúng RGB
    .raw()
    .toBuffer();
  for (const t of tiles) {
    await sharp(full, { raw: { width: cuts.mapWidth, height, channels: 3 } })
      .extract({ left: 0, top: t.y, width: cuts.mapWidth, height: t.h })
      .jpeg({ quality: 88, mozjpeg: true })
      .toFile(path.join(gameAssetsDir(root), t.file));
  }
  await sharp(src.builtMap.data, { raw: { width: src.builtMap.width, height: src.builtMap.height, channels: 3 } })
    .jpeg({ quality: 85, mozjpeg: true })
    .toFile(path.join(gameAssetsDir(root), reference));
  fs.writeFileSync(stampFile, stamp);
  return { tiles, height, reference };
}

/** Manifest tối thiểu khi chưa có. */
function emptyManifest(): Manifest {
  return {
    version: 1,
    images: {},
  };
}

export interface BuildMapOptions {
  log?: (s: string) => void;
  /** Ghép lại ảnh nền dù đã có. */
  forceBackground?: boolean;
}

/** Dựng toàn bộ bản đồ: nền, công trình, tiền cảnh, ghi manifest.map. */
export async function buildMap(root: string, opts: BuildMapOptions = {}): Promise<MapManifest> {
  const log = opts.log ?? (() => {});
  const cuts = loadCuts(root);
  const missing = missingSegments(root, cuts);
  if (missing.length > 0) {
    throw new MapCutError([`Chưa tách nền (rembg) cho: ${missing.join(', ')}. Chạy: npm run assets:segment ${missing.join(' ')}`]);
  }
  const src = await loadSources(root, cuts);
  const bg = await writeBackground(root, cuts, src, opts.forceBackground ?? false, log);

  log('- Cắt công trình');
  const masks = await computeMasks(root, cuts, src);
  const gameDir = gameAssetsDir(root);
  fs.rmSync(path.join(gameDir, 'fg'), { recursive: true, force: true });
  // Xóa ảnh công trình cũ nhưng GIỮ thư mục parts/ (vùng chủ dự án đã tô tay trên /tools/parts).
  const bDir = path.join(gameDir, 'buildings');
  if (fs.existsSync(bDir)) {
    for (const d of fs.readdirSync(bDir)) {
      const dir = path.join(bDir, d);
      fs.rmSync(path.join(dir, 'final.png'), { force: true });
      if (!fs.existsSync(path.join(dir, 'parts'))) fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  const kindsDir = path.join(root, 'assets', 'work', 'map', 'kinds');
  fs.rmSync(kindsDir, { recursive: true, force: true });
  fs.mkdirSync(kindsDir, { recursive: true });
  const buildings: MapBuilding[] = [];
  for (const c of cuts.buildings) {
    const m = masks.get(c.id);
    if (!m) continue;
    const file = `buildings/${c.id}/final.png`;
    const placed = await writeCut(path.join(gameDir, file), m.alpha, src, 8);
    if (!placed) {
      log(`  ! ${c.id}: không có điểm ảnh nào (khung trống?)`);
      continue;
    }
    await writeKinds(path.join(kindsDir, `${c.id}.png`), m.kinds, src.W, placed);
    const bottomRaw = c.baseY ?? solidBottom(m.alpha, src.W, src.H) ?? placed.rawBox.y1;
    let fg: MapBuilding['fg'] = null;
    if (m.fg && m.fg.some((v) => v > 128)) {
      const fgFile = `fg/${c.id}.png`;
      const f = await writeCut(path.join(gameDir, fgFile), m.fg, src, 8);
      if (f) fg = { file: fgFile, x: f.x, y: f.y, w: f.w, h: f.h };
    }
    const items = c.items ?? [c.id];
    const b: MapBuilding = {
      id: c.id,
      items,
      layer: m.layer,
      file,
      x: placed.x,
      y: placed.y,
      w: placed.w,
      h: placed.h,
      baseY: Math.round(bottomRaw * src.scale),
      fg,
    };
    if (items.length > 1) {
      b.tierLinesY = c.tierLinesY ? c.tierLinesY.map((v) => Math.round(v * src.scale)) : defaultTierLines(placed.y, placed.y + placed.h, items.length);
    }
    // Vùng xây từng mảnh: chưa có hoặc là bản máy đề xuất thì đề xuất lại theo ảnh mới; bản chỉnh tay thì giữ.
    b.parts = await ensureParts(root, b);
    buildings.push(b);
    log(`  ${c.id}: ${placed.w}×${placed.h} tại (${placed.x}, ${placed.y})${fg ? ', có tiền cảnh' : ''}`);
  }

  const map: MapManifest = {
    width: cuts.mapWidth,
    height: bg.height,
    scale: Math.round(src.scale * 1e6) / 1e6,
    rawWidth: cuts.rawWidth,
    rawHeight: cuts.rawHeight,
    overlap: cuts.overlap,
    source: src.source,
    tiles: bg.tiles,
    reference: bg.reference,
    buildings,
  };
  const manifest = loadManifest(root) ?? emptyManifest();
  saveManifest(root, { ...manifest, map });
  return map;
}
