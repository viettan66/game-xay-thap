// Vùng của công trình cho "xây từng mảnh" (mục 7 SPEC, giai đoạn R3a).
// - proposeParts: tự đề xuất vùng theo màu và vị trí (cột đỏ đứng, xà đỏ ngang, mái ngói cam, viền mái kem, chóp vàng,
//   bệ đá phía dưới…). Chủ dự án sửa lại bằng cọ trên trang /tools/parts.
// - Lưu: assets/game/buildings/<mã>/parts/<vùng>.png (mặt nạ trắng/đen cùng cỡ final.png) + parts.json (vị trí trên bản đồ,
//   nguồn auto/edited). Khung cắt đổi sau đó thì mặt nạ được dời theo tọa độ bản đồ, không mất phần đã tô.

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import type { MapBuilding } from '../../shared/map.js';
import { PART_KEYS, partIndex, partKeyOf, type PartKey } from '../../shared/parts.js';
import { boxBlur, close, components, dilate, fillHoles, open } from './mask.js';
import { KIND_APRON, KIND_GROUND, KIND_HOLE } from './mapCut.js';
import { gameAssetsDir } from './manifest.js';

const NEN = partIndex('nen');
const COT = partIndex('cot');
const KHUNG = partIndex('khung');
const MAI = partIndex('mai');
const TUONG = partIndex('tuong');
const TRANGTRI = partIndex('trangtri');
const NUOC = partIndex('nuoc');
/** Ngưỡng độ gồ ghề (×4 mức sáng / điểm ảnh, lấy chiều nhỏ hơn) để coi là mặt ngói có rãnh. */
export const TILE_TEXTURE = 16;
/** Nhãn tạm cho màu đỏ son (cột hoặc xà, tách sau theo hướng). */
const RED = 99;

/** Đặc điểm riêng của các hạng mục "nền" (không phải nhà): màu kem là tường hay là sân, có mặt nước không. */
const GROUND_PROFILES: Record<string, { cream: number; water: boolean }> = {
  tuong_bao: { cream: TUONG, water: false },
  ho_sen: { cream: NEN, water: true },
};

function hsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : d / max, max / 255];
}

export interface ProposeInput {
  id: string;
  layer: 'ground' | 'object';
  w: number;
  h: number;
  /** RGBA của final.png. */
  rgba: Uint8Array;
  /** Loại điểm ảnh (KIND_*) cùng cỡ, nếu có. */
  kinds: Uint8Array | null;
}

/** Tự đề xuất vùng. Mọi điểm ảnh đặc (alpha > 16) đều được gán một vùng; điểm trong suốt = 0. */
export function proposeParts(input: ProposeInput): Uint8Array {
  const { w, h, rgba, kinds } = input;
  const n = w * h;
  const opaque = new Uint8Array(n);
  const H = new Float32Array(n);
  const S = new Float32Array(n);
  const V = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (rgba[i * 4 + 3]! <= 16) continue;
    opaque[i] = 1;
    const [hh, ss, vv] = hsv(rgba[i * 4]!, rgba[i * 4 + 1]!, rgba[i * 4 + 2]!);
    H[i] = hh;
    S[i] = ss;
    V[i] = vv;
  }
  const isTile = (i: number) => H[i]! >= 6 && H[i]! <= 32 && S[i]! >= 0.38 && V[i]! >= 0.35;
  const isRed = (i: number) => (H[i]! <= 14 || H[i]! >= 340) && S[i]! >= 0.45 && V[i]! >= 0.2;
  const isGold = (i: number) => H[i]! >= 36 && H[i]! <= 66 && S[i]! >= 0.3 && V[i]! >= 0.25;
  const isCream = (i: number) => S[i]! < 0.32 && V[i]! >= 0.6;
  const isStone = (i: number) => S[i]! < 0.25 && V[i]! >= 0.3 && V[i]! < 0.6;
  const isWater = (i: number) => H[i]! >= 150 && H[i]! <= 215 && S[i]! >= 0.12 && V[i]! >= 0.3;
  const isPlant = (i: number) => H[i]! >= 60 && H[i]! < 150 && S[i]! >= 0.25;

  // Khung bao phần thân (không tính sân lát quanh chân), để biết điểm ảnh nằm cao hay thấp trong công trình.
  const isBody = (i: number) => opaque[i] === 1 && (!kinds || kinds[i] === 0 || kinds[i]! < KIND_HOLE);
  let top = h;
  let bottom = 0;
  let left = w;
  let right = 0;
  for (let i = 0; i < n; i++) {
    if (!isBody(i)) continue;
    const x = i % w;
    const y = (i / w) | 0;
    if (y < top) top = y;
    if (y > bottom) bottom = y;
    if (x < left) left = x;
    if (x > right) right = x;
  }
  const relY = (i: number) => (bottom > top ? (((i / w) | 0) - top) / (bottom - top) : 0);

  // Vùng mái: ngói có rãnh theo CẢ HAI chiều (gồ ghề ngang và dọc), còn cột sơn trơn theo chiều dọc, xà và sàn trơn
  // theo chiều ngang, dù cùng màu đỏ cam. Đo độ gồ ghề trung bình trong cửa sổ 11×11, rồi gom thành mảng mái.
  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) lum[i] = 0.3 * rgba[i * 4]! + 0.59 * rgba[i * 4 + 1]! + 0.11 * rgba[i * 4 + 2]!;
  const gx = new Uint8Array(n);
  const gy = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x < w - 1) gx[i] = Math.min(255, Math.round(4 * Math.abs(lum[i + 1]! - lum[i]!)));
      if (y < h - 1) gy[i] = Math.min(255, Math.round(4 * Math.abs(lum[i + w]! - lum[i]!)));
    }
  }
  const gxAvg = boxBlur(gx, w, h, 5);
  const gyAvg = boxBlur(gy, w, h, 5);
  const textured = (i: number) => Math.min(gxAvg[i]!, gyAvg[i]!) >= TILE_TEXTURE;
  const tileMask = new Uint8Array(n);
  for (let i = 0; i < n; i++) tileMask[i] = isBody(i) && isTile(i) && textured(i) ? 1 : 0;
  const rawCore = open(close(tileMask, w, h, 3), w, h, 4);
  // Chỉ giữ mảng mái đủ lớn (≥ 5% mảng lớn nhất) và bắt đầu ở nửa trên công trình; mảng lẻ dưới bệ không phải mái.
  const comp = components(rawCore, w, h);
  const compTop = new Int32Array(comp.sizes.length).fill(h);
  for (let i = 0; i < n; i++) {
    const l = comp.labels[i]!;
    if (l) compTop[l] = Math.min(compTop[l]!, (i / w) | 0);
  }
  const biggest = Math.max(0, ...comp.sizes.slice(1));
  const keep = comp.sizes.map((sz, l) => l > 0 && sz >= biggest * 0.05 && (bottom > top ? (compTop[l]! - top) / (bottom - top) : 0) < 0.6);
  const roofCore = new Uint8Array(n);
  for (let i = 0; i < n; i++) roofCore[i] = keep[comp.labels[i]!] ? 1 : 0;
  // Lấp lỗ kín trong mái (chỗ ngói bị ánh sáng làm trơn, không có rãnh).
  const roofZone = fillHoles(dilate(roofCore, w, h, 4), w, h);
  const roofNear = dilate(roofCore, w, h, 16);
  const inRoof = (i: number) => roofZone[i] === 1;
  // Đỏ son đậm (cột, khung sơn) ở phần thấp: đậm màu hơn hẳn đá bệ (độ đậm đá khoảng 0,4).
  const strongRed = (i: number) => (H[i]! <= 28 || H[i]! >= 340) && S[i]! >= 0.55 && V[i]! >= 0.2;

  const profile = GROUND_PROFILES[input.id];
  const labels = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!opaque[i]) continue;
    const k = kinds?.[i] ?? 0;
    if (k === KIND_APRON || k === KIND_HOLE) {
      labels[i] = NEN; // sân lát quanh chân, hoặc nền nhìn xuyên qua giữa các cột
      continue;
    }
    if (input.layer === 'ground' || k === KIND_GROUND) {
      if (isTile(i) && inRoof(i)) labels[i] = MAI;
      else if (profile?.water && isWater(i)) labels[i] = NUOC;
      else if (profile?.water && (isPlant(i) || (H[i]! >= 320 || H[i]! <= 5) && S[i]! > 0.25)) labels[i] = TRANGTRI; // lá sen, hoa sen
      else if (isCream(i)) labels[i] = profile?.cream ?? NEN;
      else labels[i] = NEN;
      continue;
    }
    if (inRoof(i) && (isTile(i) || isRed(i))) labels[i] = MAI;
    else if (roofNear[i] && (isGold(i) || isCream(i)) && relY(i) < 0.68) labels[i] = TRANGTRI; // bờ nóc, viền mái, đầu đao, chóp
    else if (inRoof(i)) {
      // bóng tối trong mái: gán theo vùng xung quanh ở bước sau
    } else if (isGold(i)) labels[i] = TRANGTRI; // chuông, đèn, hoành phi
    else if (relY(i) >= 0.68) {
      // Phần thấp: bệ, bậc, lan can đá. Chỉ đỏ son đậm mới là cột / khung.
      labels[i] = strongRed(i) ? RED : NEN;
    } else if (isRed(i) || isTile(i)) labels[i] = RED;
    else if (isWater(i)) labels[i] = NUOC;
    else if (isCream(i) || isStone(i)) labels[i] = TUONG;
    // còn lại (bóng tối, màu lạ): gán theo vùng xung quanh ở bước sau
  }

  // Đỏ son: đứng là cột, nằm ngang là xà/khung.
  const vRun = new Uint16Array(n);
  const hRun = new Uint16Array(n);
  for (let x = 0; x < w; x++) {
    let y = 0;
    while (y < h) {
      if (labels[y * w + x] !== RED) {
        y++;
        continue;
      }
      const start = y;
      while (y < h && labels[y * w + x] === RED) y++;
      for (let k = start; k < y; k++) vRun[k * w + x] = y - start;
    }
  }
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      if (labels[y * w + x] !== RED) {
        x++;
        continue;
      }
      const start = x;
      while (x < w && labels[y * w + x] === RED) x++;
      for (let k = start; k < x; k++) hRun[y * w + k] = x - start;
    }
  }
  for (let i = 0; i < n; i++) if (labels[i] === RED) labels[i] = vRun[i]! >= 1.6 * hRun[i]! ? COT : KHUNG;

  smoothLabels(labels, opaque, w, h);
  fillUnassigned(labels, opaque, w, h);
  return labels;
}

/** Lọc đa số 5×5 hai lượt: bỏ các chấm lẻ, đường viền vùng gọn hơn. Không đổi điểm trong suốt. */
function smoothLabels(labels: Uint8Array, opaque: Uint8Array, w: number, h: number): void {
  for (let pass = 0; pass < 2; pass++) {
    const src = labels.slice();
    const count = new Uint16Array(8);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!opaque[i]) continue;
        count.fill(0);
        let total = 0;
        for (let dy = -2; dy <= 2; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -2; dx <= 2; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= w) continue;
            const l = src[yy * w + xx]!;
            if (l > 0 && l < 8) {
              count[l]!++;
              total++;
            }
          }
        }
        let best = src[i]!;
        let bestCount = best > 0 ? count[best]! : 0;
        for (let l = 1; l < 8; l++) {
          if (count[l]! > bestCount) {
            best = l;
            bestCount = count[l]!;
          }
        }
        // Chỉ đổi khi vùng kia chiếm hơn nửa cửa sổ, để giữ được cột, xà mảnh.
        if (best !== src[i] && bestCount * 2 > total) labels[i] = best;
      }
    }
  }
}

/** Điểm đặc chưa có vùng thì lấy vùng của điểm gần nhất (loang đều từ các điểm đã có vùng). */
export function fillUnassigned(labels: Uint8Array, opaque: Uint8Array, w: number, h: number): void {
  let frontier: number[] = [];
  for (let i = 0; i < w * h; i++) if (opaque[i] && labels[i]) frontier.push(i);
  while (frontier.length) {
    const next: number[] = [];
    for (const i of frontier) {
      const x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i < (h - 1) * w ? i + w : -1]) {
        if (j >= 0 && opaque[j] && !labels[j]) {
          labels[j] = labels[i]!;
          next.push(j);
        }
      }
    }
    frontier = next;
  }
  // Điểm đặc nằm riêng không chạm vùng nào: cho vào nền.
  for (let i = 0; i < w * h; i++) if (opaque[i] && !labels[i]) labels[i] = NEN;
}

// ---------- Lưu, đọc ----------

export interface PartsMeta {
  /** Vị trí, cỡ mặt nạ trên bản đồ lúc lưu (để dời theo khi khung cắt đổi). */
  x: number;
  y: number;
  w: number;
  h: number;
  source: 'auto' | 'edited';
  updatedAt: string;
}

export function partsDir(root: string, id: string): string {
  return path.join(gameAssetsDir(root), 'buildings', id, 'parts');
}

export function readPartsMeta(root: string, id: string): PartsMeta | null {
  const f = path.join(partsDir(root, id), 'parts.json');
  return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, 'utf8')) as PartsMeta) : null;
}

/** Ghi mặt nạ từng vùng (chỉ vùng có điểm ảnh) và parts.json. */
export async function saveParts(root: string, b: Pick<MapBuilding, 'id' | 'x' | 'y' | 'w' | 'h'>, labels: Uint8Array, source: 'auto' | 'edited'): Promise<void> {
  if (labels.length !== b.w * b.h) throw new Error(`Mảng vùng sai cỡ (cần ${b.w}×${b.h})`);
  const dir = partsDir(root, b.id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (const key of PART_KEYS) {
    const idx = partIndex(key);
    const mask = Buffer.alloc(labels.length);
    let any = false;
    for (let i = 0; i < labels.length; i++) {
      if (labels[i] === idx) {
        mask[i] = 255;
        any = true;
      }
    }
    if (any) await sharp(mask, { raw: { width: b.w, height: b.h, channels: 1 } }).png({ compressionLevel: 9 }).toFile(path.join(dir, `${key}.png`));
  }
  const meta: PartsMeta = { x: b.x, y: b.y, w: b.w, h: b.h, source, updatedAt: new Date().toISOString() };
  fs.writeFileSync(path.join(dir, 'parts.json'), JSON.stringify(meta, null, 2) + '\n');
}

/** Đọc vùng đã lưu, dời về khung hiện tại của công trình. Chưa có thì null. */
export async function loadParts(root: string, b: Pick<MapBuilding, 'id' | 'x' | 'y' | 'w' | 'h'>): Promise<{ labels: Uint8Array; meta: PartsMeta } | null> {
  const meta = readPartsMeta(root, b.id);
  if (!meta) return null;
  const labels = new Uint8Array(b.w * b.h);
  const dx = meta.x - b.x;
  const dy = meta.y - b.y;
  for (const key of PART_KEYS) {
    const f = path.join(partsDir(root, b.id), `${key}.png`);
    if (!fs.existsSync(f)) continue;
    const { data, info } = await sharp(f).extractChannel(0).raw().toBuffer({ resolveWithObject: true });
    const idx = partIndex(key);
    for (let y = 0; y < info.height; y++) {
      const ty = y + dy;
      if (ty < 0 || ty >= b.h) continue;
      for (let x = 0; x < info.width; x++) {
        const tx = x + dx;
        if (tx < 0 || tx >= b.w) continue;
        if (data[y * info.width + x]! > 127) labels[ty * b.w + tx] = idx;
      }
    }
  }
  return { labels, meta };
}

/** RGBA của final.png và loại điểm ảnh (nếu có) của một công trình. */
export async function readBuildingPixels(root: string, b: MapBuilding): Promise<{ rgba: Uint8Array; kinds: Uint8Array | null }> {
  const file = path.join(gameAssetsDir(root), b.file);
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== b.w || info.height !== b.h) throw new Error(`${b.file} không đúng cỡ trong manifest`);
  const kf = path.join(root, 'assets', 'work', 'map', 'kinds', `${b.id}.png`);
  let kinds: Uint8Array | null = null;
  if (fs.existsSync(kf)) {
    const k = await sharp(kf).extractChannel(0).raw().toBuffer({ resolveWithObject: true });
    if (k.info.width === b.w && k.info.height === b.h) kinds = new Uint8Array(k.data);
  }
  return { rgba: new Uint8Array(data.buffer, data.byteOffset, data.length), kinds };
}

/** Kiểm tra mảng vùng gửi từ trang công cụ: đúng cỡ, nhãn hợp lệ. */
export function validateLabels(labels: Uint8Array, w: number, h: number): string | null {
  if (labels.length !== w * h) return `Mảng vùng sai cỡ: cần ${w * h} điểm, nhận ${labels.length}`;
  for (let i = 0; i < labels.length; i++) if (labels[i]! > PART_KEYS.length) return `Nhãn vùng không hợp lệ: ${labels[i]}`;
  return null;
}

export { partKeyOf, type PartKey };

// ---------- Dùng cho trang /tools/parts ----------

export type PartsStatus = 'none' | 'auto' | 'edited';

export function partsStatus(root: string, id: string): { status: PartsStatus; updatedAt: string | null } {
  const meta = readPartsMeta(root, id);
  return { status: meta ? meta.source : 'none', updatedAt: meta?.updatedAt ?? null };
}

/** Vùng của một công trình để chỉnh: đã lưu thì đọc ra, chưa có thì tự đề xuất (chưa lưu). */
export async function partsForEditing(root: string, b: MapBuilding): Promise<{ labels: Uint8Array; source: PartsStatus | 'unsaved' }> {
  const saved = await loadParts(root, b);
  if (saved) return { labels: saved.labels, source: saved.meta.source };
  return { labels: await proposeForBuilding(root, b), source: 'unsaved' };
}

export async function proposeForBuilding(root: string, b: MapBuilding): Promise<Uint8Array> {
  const { rgba, kinds } = await readBuildingPixels(root, b);
  return proposeParts({ id: b.id, layer: b.layer, w: b.w, h: b.h, rgba, kinds });
}
