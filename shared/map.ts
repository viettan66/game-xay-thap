// Bản đồ quần thể chùa trong assets/manifest.json (mục 7): ảnh nền ghép, các công trình cắt từ map_built, lớp tiền cảnh.
// Mọi tọa độ ở đây theo HỆ TỌA ĐỘ BẢN ĐỒ (chiều rộng = 1080 × maxZoom, mặc định 1728), trục y hướng xuống.
// Hàm thuần, có test.

import type { PartKey } from './parts.js';
import type { HonorSlot, MapPath } from './paths.js';

export interface MapTile {
  /** Đường dẫn trong assets/game, ví dụ "map/bg_0.jpg". */
  file: string;
  y: number;
  h: number;
}

export interface MapRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MapFg extends MapRect {
  file: string;
}

/** Vùng xây từng mảnh của công trình (mục 7): mặt nạ buildings/<id>/parts/<vùng>.png, vị trí mặt nạ trên bản đồ. */
export interface MapParts extends MapRect {
  keys: PartKey[];
  source: 'auto' | 'edited';
}

export interface MapBuilding extends MapRect {
  /** Mã công trình (thường trùng mã hạng mục; bảo tháp dùng chung một ảnh cho 9 tầng). */
  id: string;
  /** Các hạng mục hiển thị bằng ảnh này. Bảo tháp: 9 hạng mục, mỗi tầng một dải. */
  items: string[];
  /** ground: nền (sân, hồ, tường) vẽ trước mọi công trình; object: công trình, sắp theo baseY. */
  layer: 'ground' | 'object';
  /** Ảnh công trình hoàn chỉnh: buildings/<id>/final.png. */
  file: string;
  /** Đường chân công trình, dùng sắp lớp trước sau (chân xa vẽ trước). */
  baseY: number;
  /** Cây, cành đứng trước công trình, vẽ đè lên trên. */
  fg: MapFg | null;
  /** Chỉ bảo tháp: mép trên của từng tầng 1..9 (giảm dần). Tầng 1 kéo xuống tới đáy ảnh. */
  tierLinesY?: number[];
  /** Vùng xây từng mảnh; chưa có thì overlay coi cả công trình là nền. */
  parts?: MapParts | null;
}

export interface MapManifest {
  width: number;
  height: number;
  /** Hệ số từ ảnh gốc sang bản đồ (1728 / 941). */
  scale: number;
  rawWidth: number;
  rawHeight: number;
  /** Ảnh mặt đất nối dài chồng lên đáy ảnh trên bao nhiêu điểm ảnh gốc (mục 7: 308). */
  overlap: number;
  /** Ảnh nền được phóng bằng AI (esrgan) hay phóng thường (lanczos, khi chưa có Real-ESRGAN). */
  source: 'esrgan' | 'lanczos';
  /** Ảnh nền ghép (map_empty + mặt đất nối dài), cắt thành các dải ngang. */
  tiles: MapTile[];
  /** Ảnh map_built cùng hệ tọa độ, chỉ để so khớp trên trang /tools/assets. */
  reference: string | null;
  buildings: MapBuilding[];
  /** Lối đi (assets/map-paths.json, giai đoạn 4c). Chưa có thì nhân vật đi thẳng. */
  paths?: MapPath[];
  /** Ô ghi danh dọc đường vào chùa (tượng võ tướng đá). */
  honorSlots?: HonorSlot[];
}

/** Khóa ảnh dùng khi nạp texture: bỏ phần đuôi file. */
export function textureKey(file: string): string {
  return file.replace(/\.(png|jpe?g)$/, '');
}

/** Thứ tự vẽ: nền trước (theo thứ tự trong danh sách), rồi công trình theo baseY (xa trước, gần sau). */
export function drawOrder(buildings: MapBuilding[]): MapBuilding[] {
  const ground = buildings.filter((b) => b.layer === 'ground');
  const objects = buildings
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => b.layer === 'object')
    .sort((a, b) => a.b.baseY - b.b.baseY || a.i - b.i)
    .map(({ b }) => b);
  return [...ground, ...objects];
}

/** Mép trên các tầng chia đều từ đáy lên đỉnh (dùng tạm khi chưa có ảnh bảo tháp 9 tầng vẽ riêng). */
export function defaultTierLines(top: number, bottom: number, n: number): number[] {
  return Array.from({ length: n }, (_, k) => Math.round(bottom - ((k + 1) * (bottom - top)) / n));
}

/** Dải dọc [top, bottom) của tầng thứ k (đếm từ 0) trong ảnh bảo tháp. */
export function floorBand(b: MapBuilding, k: number): { top: number; bottom: number } {
  const lines = b.tierLinesY ?? defaultTierLines(b.y, b.y + b.h, b.items.length);
  const bottom = k === 0 ? b.y + b.h : lines[k - 1]!;
  const top = k === lines.length - 1 ? b.y : lines[k]!;
  return { top, bottom };
}

/** Công trình chứa hạng mục, kèm số thứ tự dải (bảo tháp) hoặc null. */
export function buildingOf(map: MapManifest, itemId: string): { building: MapBuilding; band: number | null } | null {
  for (const b of map.buildings) {
    const k = b.items.indexOf(itemId);
    if (k >= 0) return { building: b, band: b.items.length > 1 ? k : null };
  }
  return null;
}

/** Khung hình của hạng mục trên bản đồ (bảo tháp: chỉ dải của tầng đó). */
export function itemRect(map: MapManifest, itemId: string): MapRect | null {
  const found = buildingOf(map, itemId);
  if (!found) return null;
  const { building: b, band } = found;
  if (band === null) return { x: b.x, y: b.y, w: b.w, h: b.h };
  const { top, bottom } = floorBand(b, band);
  return { x: b.x, y: top, w: b.w, h: bottom - top };
}
