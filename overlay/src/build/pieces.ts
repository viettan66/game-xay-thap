// Xây từng mảnh (mục 7 SPEC): cắt vùng của công trình thành mảnh và chia mảnh cho các giai đoạn. Hàm thuần, có test.
// Thứ tự mảnh cố định theo mã hạng mục (seed), nên chỉ cần tiến độ giai đoạn là dựng lại đúng hình; không lưu mảnh vào DB.
//
// - Mỗi cặp (vùng, cách hiện) là một "lượt": lượt "full" (màu thật) luôn có cho mọi vùng; lượt "wood" (gỗ thô) chỉ có
//   khi giai đoạn nào đó xây vùng đó bằng gỗ. Giai đoạn sau xây lại cùng vùng bằng "full" thì vẽ đè lên mảnh gỗ.
// - Chia mảnh: mảnh thuộc giai đoạn đầu tiên (xét giai đoạn dải hẹp trước, giai đoạn ghi đủ mọi vùng xét sau cùng)
//   có dải chiều cao chứa tâm mảnh. Mảnh "full" còn thừa dồn vào giai đoạn xây cuối cùng, để xong hạng mục là đủ hình.

import { PART_KEYS, type PartKey } from '../../../shared/parts.js';
import type { BuildLook, GroundLook, PieceLook, StageBuild } from '../../../shared/project.js';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Piece extends Rect {
  part: PartKey;
  look: PieceLook;
}

export interface GroundPiece {
  kind: GroundLook;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type PropKind = 'gach' | 'go' | 'ngoi' | 'da' | 'cat';

export interface StagePlan {
  /** pieces: xây lên công trình; ground: hiệu ứng mặt đất (cọc, đào, đống vật liệu). */
  kind: 'pieces' | 'ground';
  pieces: Piece[];
  ground: GroundPiece[];
  /** Số mảnh của giai đoạn (công mỗi mảnh = giá giai đoạn ÷ số mảnh). */
  count: number;
  /** Khóa tên vật liệu trong config pieces.materials (vùng hoặc hiệu ứng mặt đất). */
  material: string;
  /** Ảnh đống vật liệu / mảnh bay. */
  prop: PropKind;
}

export interface PlanInput {
  /** Nhãn vùng (1..7 theo PART_KEYS, 0 = không có) của khung đang xây, cỡ w×h. */
  labels: Uint8Array;
  w: number;
  h: number;
  builds: StageBuild[];
  sizes: Record<PartKey, [number, number]>;
  seed: string;
  /** Công trình phẳng (sân, hồ, tường bao): vùng đất của hiệu ứng mặt đất là cả hình. */
  flat: boolean;
}

/** Số mảnh tối đa của một lượt; nhiều hơn thì phóng to mảnh cho vừa (giữ 60fps, mục 7.6). */
export const MAX_PIECES_PER_PASS = 2000;
const PART_PROP: Record<PartKey, PropKind> = { nen: 'da', cot: 'go', khung: 'go', mai: 'ngoi', tuong: 'gach', trangtri: 'gach', nuoc: 'cat' };

// ---------- Số ngẫu nhiên có seed ----------

export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], r: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

// ---------- Cắt một vùng thành mảnh ----------

interface Cell extends Rect {
  /** Tâm mảnh tính theo % chiều cao vùng từ dưới lên (để chia dải). */
  rel: number;
}

interface PartInfoBox {
  mask: Uint8Array;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  area: number;
}

function partMask(labels: Uint8Array, w: number, h: number, idx: number): PartInfoBox | null {
  const mask = new Uint8Array(w * h);
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  let area = 0;
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] !== idx) continue;
    mask[i] = 1;
    area++;
    const x = i % w;
    const y = (i / w) | 0;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return area ? { mask, x0, y0, x1: x1 + 1, y1: y1 + 1, area } : null;
}

function hasPixel(m: PartInfoBox, w: number, x: number, y: number, cw: number, ch: number): boolean {
  const xa = Math.max(m.x0, x);
  const xb = Math.min(m.x1, x + cw);
  const ya = Math.max(m.y0, y);
  const yb = Math.min(m.y1, y + ch);
  for (let yy = ya; yy < yb; yy++) for (let xx = xa; xx < xb; xx++) if (m.mask[yy * w + xx]) return true;
  return false;
}

const relOf = (m: PartInfoBox, cy: number) => (m.y1 - m.y0 <= 1 ? 50 : (100 * (m.y1 - cy)) / (m.y1 - m.y0));

/** Lưới hàng từ dưới lên (đá, gạch, ngói), so le nửa ô ở hàng lẻ; trong hàng trái sang phải, xáo nhẹ. */
function rowCells(m: PartInfoBox, w: number, cw: number, ch: number, stagger: boolean, r: () => number): Cell[] {
  const out: Cell[] = [];
  let row = 0;
  for (let yb = m.y1; yb > m.y0; yb -= ch, row++) {
    const y = Math.max(m.y0, yb - ch);
    const off = stagger && row % 2 ? Math.round(cw / 2) : 0;
    const rowOut: Cell[] = [];
    for (let x = m.x0 - off; x < m.x1; x += cw) {
      const xa = Math.max(m.x0, x);
      const xb = Math.min(m.x1, x + cw);
      if (xb <= xa) continue;
      if (!hasPixel(m, w, xa, y, xb - xa, yb - y)) continue;
      rowOut.push({ x: xa, y, w: xb - xa, h: yb - y, rel: relOf(m, (y + yb) / 2) });
    }
    // Xen chút ngẫu nhiên: đổi chỗ vài cặp liền nhau.
    for (let i = 0; i + 1 < rowOut.length; i++) if (r() < 0.3) [rowOut[i], rowOut[i + 1]] = [rowOut[i + 1]!, rowOut[i]!];
    out.push(...rowOut);
  }
  return out;
}

/** Các mảng liền nhau của mặt nạ, kèm khung bao. */
function blobs(m: PartInfoBox, w: number, h: number): { x0: number; y0: number; x1: number; y1: number }[] {
  const seen = new Uint8Array(w * h);
  const out: { x0: number; y0: number; x1: number; y1: number }[] = [];
  const stack: number[] = [];
  for (let s = 0; s < m.mask.length; s++) {
    if (!m.mask[s] || seen[s]) continue;
    let x0 = w;
    let y0 = h;
    let x1 = 0;
    let y1 = 0;
    seen[s] = 1;
    stack.push(s);
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w;
      const y = (i / w) | 0;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i < (h - 1) * w ? i + w : -1]) {
        if (j >= 0 && m.mask[j] && !seen[j]) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    out.push({ x0, y0, x1: x1 + 1, y1: y1 + 1 });
  }
  return out;
}

/** Cột: từng cột (trái sang phải), mỗi cột cắt đoạn từ chân lên đỉnh. Mảng quá nhỏ gộp vào lưới thường. */
function columnCells(m: PartInfoBox, w: number, h: number, segH: number): Cell[] {
  const out: Cell[] = [];
  for (const b of blobs(m, w, h).sort((a, c) => a.x0 - c.x0)) {
    for (let yb = b.y1; yb > b.y0; yb -= segH) {
      const y = Math.max(b.y0, yb - segH);
      out.push({ x: b.x0, y, w: b.x1 - b.x0, h: yb - y, rel: relOf(m, (y + yb) / 2) });
    }
  }
  return out;
}

/** Khung: từng thanh. Mảng nằm ngang cắt dọc theo chiều dài, mảng đứng cắt theo chiều cao; dưới lên trên. */
function beamCells(m: PartInfoBox, w: number, h: number, len: number): Cell[] {
  const out: Cell[] = [];
  for (const b of blobs(m, w, h).sort((a, c) => c.y1 - a.y1 || a.x0 - c.x0)) {
    const bw = b.x1 - b.x0;
    const bh = b.y1 - b.y0;
    if (bw >= bh) {
      for (let x = b.x0; x < b.x1; x += len) out.push({ x, y: b.y0, w: Math.min(len, b.x1 - x), h: bh, rel: relOf(m, (b.y0 + b.y1) / 2) });
    } else {
      for (let yb = b.y1; yb > b.y0; yb -= len) {
        const y = Math.max(b.y0, yb - len);
        out.push({ x: b.x0, y, w: bw, h: yb - y, rel: relOf(m, (y + yb) / 2) });
      }
    }
  }
  return out;
}

/** Ô lưới thường (trang trí, nước). */
function gridCells(m: PartInfoBox, w: number, cw: number, ch: number): Cell[] {
  const out: Cell[] = [];
  for (let y = m.y0; y < m.y1; y += ch) {
    for (let x = m.x0; x < m.x1; x += cw) {
      const ww = Math.min(cw, m.x1 - x);
      const hh = Math.min(ch, m.y1 - y);
      if (hasPixel(m, w, x, y, ww, hh)) out.push({ x, y, w: ww, h: hh, rel: relOf(m, y + hh / 2) });
    }
  }
  return out;
}

/** Khoảng cách (bước 4 hướng) từ mỗi điểm của mặt nạ tới chỗ không thuộc mặt nạ: nước lan từ mép vào giữa. */
function edgeDistance(m: PartInfoBox, w: number, h: number): Uint16Array {
  const dist = new Uint16Array(w * h).fill(65535);
  let frontier: number[] = [];
  for (let i = 0; i < m.mask.length; i++) {
    if (!m.mask[i]) continue;
    const x = i % w;
    const edge = x === 0 || x === w - 1 || i < w || i >= (h - 1) * w || !m.mask[i - 1] || !m.mask[i + 1] || !m.mask[i - w] || !m.mask[i + w];
    if (edge) {
      dist[i] = 0;
      frontier.push(i);
    }
  }
  for (let d = 1; frontier.length; d++) {
    const next: number[] = [];
    for (const i of frontier) {
      const x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i < (h - 1) * w ? i + w : -1]) {
        if (j >= 0 && m.mask[j] && dist[j]! > d) {
          dist[j] = d;
          next.push(j);
        }
      }
    }
    frontier = next;
  }
  return dist;
}

/** Cắt một vùng thành mảnh theo vật liệu, đúng thứ tự đặt (mục 7, bảng "Mảnh"). */
export function cutPart(part: PartKey, labels: Uint8Array, w: number, h: number, size: [number, number], seed: string): Cell[] {
  const m = partMask(labels, w, h, PART_KEYS.indexOf(part) + 1);
  if (!m) return [];
  const r = rng(hashSeed(`${seed}:${part}`));
  let [cw, ch] = size;
  // Quá nhiều mảnh thì phóng to mảnh (giữ tỉ lệ) cho vừa giới hạn.
  const cellArea = Math.max(1, (cw || 16) * ch);
  if (m.area / cellArea > MAX_PIECES_PER_PASS) {
    const k = Math.sqrt(m.area / (cellArea * MAX_PIECES_PER_PASS));
    cw = Math.ceil(cw * k);
    ch = Math.ceil(ch * k);
  }
  switch (part) {
    case 'nen':
    case 'tuong':
      return rowCells(m, w, cw, ch, true, r);
    case 'mai':
      return rowCells(m, w, cw, ch, false, r);
    case 'cot':
      return columnCells(m, w, h, ch);
    case 'khung':
      return beamCells(m, w, h, cw);
    case 'trangtri':
      return shuffle(gridCells(m, w, cw, ch), r);
    case 'nuoc': {
      const dist = edgeDistance(m, w, h);
      const cells = gridCells(m, w, cw, ch);
      const key = (c: Cell) => dist[Math.min(h - 1, Math.round(c.y + c.h / 2)) * w + Math.min(w - 1, Math.round(c.x + c.w / 2))] ?? 0;
      return cells.map((c) => ({ c, k: key(c) + r() })).sort((a, b) => a.k - b.k).map((x) => x.c);
    }
  }
}

// ---------- Hiệu ứng mặt đất ----------

/** Vùng đất dưới chân công trình: phần thấp của hình (công trình phẳng thì cả hình). */
export function footprint(labels: Uint8Array, w: number, h: number, flat: boolean): Rect {
  let y0 = h;
  let y1 = 0;
  for (let i = 0; i < labels.length; i++) {
    if (!labels[i]) continue;
    const y = (i / w) | 0;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  if (y1 < y0) return { x: 0, y: Math.round(h * 0.7), w, h: Math.round(h * 0.3) };
  const top = flat ? y0 : Math.round(y1 - (y1 - y0) * 0.3);
  let x0 = w;
  let x1 = 0;
  for (let y = top; y <= y1; y++) for (let x = 0; x < w; x++) if (labels[y * w + x]) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
  }
  return { x: x0, y: top, w: x1 - x0 + 1, h: y1 - top + 1 };
}

/** Mảnh hiệu ứng mặt đất: cọc quanh vùng đất, mảng đất đào, hoặc từng gánh vật liệu đổ vào đống. */
export function groundPieces(kind: GroundLook, fp: Rect, seed: string): GroundPiece[] {
  const r = rng(hashSeed(`${seed}:${kind}`));
  if (kind === 'coc') {
    const per = 2 * (fp.w + fp.h);
    const n = Math.max(8, Math.min(40, Math.round(per / 36)));
    const out: GroundPiece[] = [];
    for (let k = 0; k < n; k++) {
      // Đi vòng quanh: cạnh dưới (trái → phải), cạnh phải (lên), cạnh trên (phải → trái), cạnh trái (xuống).
      let d = (k / n) * per;
      let x: number;
      let y: number;
      if (d < fp.w) [x, y] = [fp.x + d, fp.y + fp.h];
      else if ((d -= fp.w) < fp.h) [x, y] = [fp.x + fp.w, fp.y + fp.h - d];
      else if ((d -= fp.h) < fp.w) [x, y] = [fp.x + fp.w - d, fp.y];
      else [x, y] = [fp.x, fp.y + (d - fp.w)];
      out.push({ kind, x: Math.round(x), y: Math.round(y), w: 4, h: 14 });
    }
    return out;
  }
  if (kind === 'dao') {
    const cw = Math.max(18, Math.round(fp.w / 8));
    const ch = Math.max(12, Math.round(fp.h / 5));
    const out: GroundPiece[] = [];
    for (let y = fp.y; y < fp.y + fp.h; y += ch) {
      for (let x = fp.x; x < fp.x + fp.w; x += cw) out.push({ kind, x, y, w: Math.min(cw, fp.x + fp.w - x), h: Math.min(ch, fp.y + fp.h - y) });
    }
    return shuffle(out, r).slice(0, 60);
  }
  // dong: 24 gánh vật liệu đổ vào đống (vị trí đống do phần vẽ chọn).
  return Array.from({ length: 24 }, () => ({ kind, x: 0, y: 0, w: 0, h: 0 }));
}

// ---------- Chia mảnh cho các giai đoạn ----------

const isCatchAll = (b: StageBuild) => b.parts.length === PART_KEYS.length;

/** Kế hoạch xây của một hạng mục: mảnh của từng giai đoạn theo đúng thứ tự đặt. */
export function planStages(input: PlanInput): StagePlan[] {
  const { labels, w, h, builds, sizes, seed, flat } = input;
  const present = PART_KEYS.filter((k) => labels.includes(PART_KEYS.indexOf(k) + 1));
  // Các lượt cần cắt: "full" cho mọi vùng có mặt, "wood" cho vùng nào được xây bằng gỗ.
  const passes = new Map<string, (Cell & { taken: boolean })[]>();
  const passKey = (p: PartKey, look: PieceLook) => `${p}:${look}`;
  const cellsOf = (p: PartKey, look: PieceLook) => {
    const key = passKey(p, look);
    if (!passes.has(key)) passes.set(key, cutPart(p, labels, w, h, sizes[p], `${seed}:${look}`).map((c) => ({ ...c, taken: false })));
    return passes.get(key)!;
  };
  for (const p of present) cellsOf(p, 'full');

  const assigned: Piece[][] = builds.map(() => []);
  // Thứ tự xét: giai đoạn dải hẹp trước, giai đoạn ghi đủ mọi vùng sau cùng; cùng mức thì theo thứ tự giai đoạn.
  const order = builds
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => b.parts.length > 0)
    .sort((a, c) => Number(isCatchAll(a.b)) - Number(isCatchAll(c.b)) || a.b.band[1] - a.b.band[0] - (c.b.band[1] - c.b.band[0]) || a.i - c.i);
  for (const { b, i } of order) {
    const look = b.look as PieceLook;
    for (const p of b.parts) {
      if (!present.includes(p)) continue;
      for (const c of cellsOf(p, look)) {
        if (c.taken) continue;
        const inBand = c.rel >= b.band[0] - 1e-6 && (c.rel < b.band[1] || (b.band[1] >= 100 && c.rel <= 100.0001));
        if (!inBand) continue;
        c.taken = true;
        assigned[i]!.push({ part: p, look, x: c.x, y: c.y, w: c.w, h: c.h });
      }
    }
  }
  // Mảnh màu thật chưa có giai đoạn nào nhận: dồn vào giai đoạn xây cuối cùng, để xong hạng mục là đủ hình.
  const lastBuild = builds.map((b, i) => ({ b, i })).filter(({ b }) => b.parts.length > 0).at(-1)?.i ?? builds.length - 1;
  for (const p of present) for (const c of cellsOf(p, 'full')) if (!c.taken) {
    c.taken = true;
    assigned[lastBuild]!.push({ part: p, look: 'full', x: c.x, y: c.y, w: c.w, h: c.h });
  }

  const fp = footprint(labels, w, h, flat);
  const nextProp = (i: number): PropKind => {
    for (let k = i + 1; k < builds.length; k++) if (builds[k]!.parts.length) return builds[k]!.look === 'wood' ? 'go' : PART_PROP[builds[k]!.parts[0]!];
    return 'gach';
  };
  return builds.map((b, i): StagePlan => {
    const pieces = assigned[i]!;
    if (b.parts.length > 0 && pieces.length > 0) {
      const main = pieces[0]!.part;
      return { kind: 'pieces', pieces, ground: [], count: pieces.length, material: main, prop: b.look === 'wood' ? 'go' : PART_PROP[main] };
    }
    // Giai đoạn mặt đất, hoặc giai đoạn xây vùng không có trên hình: dùng hiệu ứng mặt đất (vẫn có phản hồi nhìn thấy).
    const kind: GroundLook = b.parts.length === 0 ? (b.look as GroundLook) : 'dong';
    const ground = groundPieces(kind, fp, `${seed}:${i}`);
    const prop: PropKind = kind === 'coc' ? 'go' : kind === 'dao' ? 'cat' : nextProp(i);
    return { kind: 'ground', pieces: [], ground, count: ground.length, material: kind, prop };
  });
}

/** Mảnh [đầu, cuối) được đặt khi giai đoạn nhận thêm `points` công từ mức `from` (giá `cost`, tổng `count` mảnh). */
export function pieceRange(count: number, from: number, points: number, cost: number): [number, number] {
  if (cost <= 0 || count <= 0) return [0, 0];
  const at = (p: number) => (p >= cost ? count : Math.floor((count * p) / cost));
  return [at(from), at(from + points)];
}

/** Số mảnh mỗi lượt bay (mục 7.5, 14.4). Giai đoạn đã bị vượt qua: cụm lớn để mỗi giai đoạn chỉ mất khoảng 1 giây. */
export function clusterSize(pending: number, rate: number, passedStageCount: number | null): number {
  if (passedStageCount !== null) return Math.max(1, Math.ceil(passedStageCount / Math.max(1, rate)));
  if (pending > rate * 2) return Math.max(4, Math.min(9, Math.ceil(pending / (rate * 2))));
  return 1;
}

/** Giàn giáo tre: cột tre và thanh ngang trong khung bao vùng đang xây, cao tới đỉnh phần đã xây (+ chừa 16),
 * thấp dần khi tháo (removeFrac 0 → 1). */
export function scaffold(box: Rect, builtTop: number, removeFrac: number): { poles: [number, number, number][]; ledgers: [number, number, number][] } {
  const bottom = box.y + box.h;
  const fullTop = Math.max(box.y - 10, Math.min(bottom - 20, builtTop - 16));
  const top = fullTop + (bottom - fullTop) * Math.max(0, Math.min(1, removeFrac));
  if (bottom - top < 8) return { poles: [], ledgers: [] };
  const left = box.x - 6;
  const right = box.x + box.w + 6;
  const n = Math.max(2, Math.round((right - left) / 42) + 1);
  const poles: [number, number, number][] = [];
  for (let k = 0; k < n; k++) poles.push([Math.round(left + ((right - left) * k) / (n - 1)), Math.round(top), bottom]);
  const ledgers: [number, number, number][] = [];
  for (let y = bottom - 18; y > top + 4; y -= 22) ledgers.push([left, right, Math.round(y)]);
  return { poles, ledgers };
}

export type { BuildLook };
