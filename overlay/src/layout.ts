// Tính toán bố cục overlay (thuần, không đụng trình duyệt) để test được.
// Toạ độ theo khung 1080×1920, trục y hướng xuống.

import type { Board, OverlayLayout, SafeArea } from '../../shared/protocol.js';

export const STAGE_W = 1080;
export const STAGE_H = 1920;

/** Tầng tạm (hình khối) cao bằng 0,75 lần bề rộng, gần với tỉ lệ ảnh tầng thật. */
export const FLOOR_HEIGHT_RATIO = 0.75;
export const FOUNDATION_WIDTH_RATIO = 1.3;
export const FOUNDATION_HEIGHT = 110;
export const SPIRE_HEIGHT_RATIO = 1.1;
/** Camera giữ tầng đang xây ở khoảng 45% chiều cao màn hình (mục 8). */
export const CAMERA_FOCUS_Y = 0.45 * STAGE_H;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TowerGeometry {
  /** Bề rộng từng tầng, chỉ số 0 = nền móng. */
  widths: number[];
  heights: number[];
  /** Toạ độ y mép dưới của từng tầng (trong "thế giới", trước khi dịch camera). */
  baseY: number[];
  centerX: number;
}

/** Tầng n thu nhỏ towerTaper^(n-1) so với tầng 1, căn giữa theo trục dọc (mục 8). */
export function floorWidth(floor: number, layout: OverlayLayout): number {
  if (floor === 0) return layout.floor1WidthPx * FOUNDATION_WIDTH_RATIO;
  return layout.floor1WidthPx * Math.pow(layout.towerTaper, floor - 1);
}

export function floorHeight(floor: number, layout: OverlayLayout): number {
  return floor === 0 ? FOUNDATION_HEIGHT : floorWidth(floor, layout) * FLOOR_HEIGHT_RATIO;
}

export function towerGeometry(layout: OverlayLayout, totalFloors: number): TowerGeometry {
  const widths: number[] = [];
  const heights: number[] = [];
  const baseY: number[] = [];
  let y = layout.towerBaseY;
  for (let f = 0; f <= totalFloors; f++) {
    widths.push(floorWidth(f, layout));
    heights.push(floorHeight(f, layout));
    baseY.push(y);
    y -= heights[f]!;
  }
  return { widths, heights, baseY, centerX: layout.towerCenterX };
}

/**
 * Độ dịch camera (dương = kéo cả cảnh xuống, tức là nhìn lên cao) để tầng đang xây nằm ở ~45% màn hình.
 * Khi tháp còn thấp thì camera đứng yên ở cảnh nền (độ dịch = 0).
 */
export function cameraTarget(geom: TowerGeometry, floor: number, completed: boolean): number {
  const f = Math.min(floor, geom.baseY.length - 1);
  let centerY = geom.baseY[f]! - geom.heights[f]! / 2;
  if (completed) {
    const top = geom.baseY[f]! - geom.heights[f]!;
    centerY = top - (geom.widths[f]! * SPIRE_HEIGHT_RATIO) / 2;
  }
  return Math.max(0, CAMERA_FOCUS_Y - centerY);
}

/** Camera đi mượt về đích (lerp theo thời gian, không phụ thuộc fps). */
export function lerpCamera(current: number, target: number, dtSec: number, speed = 3): number {
  return current + (target - current) * (1 - Math.exp(-dtSec * speed));
}

export interface UiRects {
  content: Rect;
  badge: Rect;
  banner: Rect;
  /** Khung 5 bước (ui/progress_frame.png) ngay dưới banner. */
  progress: Rect;
  chip: Rect;
  board: Rect;
  disclaimer: Rect;
}

/** Vị trí các khối giao diện, tránh các vùng an toàn mà nền tảng tự vẽ (mục 8). */
export function uiRects(safe: SafeArea): UiRects {
  const right = STAGE_W - safe.right;
  const top = safe.top;
  const bottom = STAGE_H - safe.bottom;
  const content = { x: 0, y: top, w: right, h: bottom - top };
  const mid = right / 2;
  // Kích thước theo tỉ lệ ảnh ui/banner.png (736×216) và ui/progress_frame.png (728×104).
  const banner = { x: mid - 280, y: top + 12, w: 560, h: 164 };
  const badge = { x: 16, y: top + 12, w: banner.x - 16 - 8, h: 48 };
  const progress = { x: mid - 260, y: banner.y + banner.h + 4, w: 520, h: 74 };
  const chip = { x: mid - 260, y: progress.y + progress.h + 6, w: 520, h: 44 };
  const disclaimer = { x: 0, y: bottom - 52, w: right, h: 52 };
  const boardTop = chip.y + chip.h + 20;
  const board = { x: right - 330 - 12, y: boardTop, w: 330, h: Math.min(740, disclaimer.y - 12 - boardTop) };
  return { content, badge, banner, progress, chip, board, disclaimer };
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function rectInside(inner: Rect, outer: Rect): boolean {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
}

/** Bảng kế tiếp khi luân phiên, bỏ qua bảng chưa có ai. Tất cả đều trống thì hiện bảng tổng. */
export function nextBoardIndex(boards: Board[], current: number): number {
  for (let i = 1; i <= boards.length; i++) {
    const idx = (current + i) % boards.length;
    if (boards[idx]!.rows.length > 0) return idx;
  }
  const total = boards.findIndex((b) => b.key === 'total');
  return total >= 0 ? total : 0;
}

const segmenter = new Intl.Segmenter('vi', { granularity: 'grapheme' });

/** Cắt chữ cho vừa bề rộng, thêm "…". Cắt theo ký tự hiển thị nên không làm vỡ emoji hay dấu tiếng Việt. */
export function truncateToWidth(text: string, maxWidth: number, measure: (s: string) => number): string {
  if (measure(text) <= maxWidth) return text;
  const parts = Array.from(segmenter.segment(text), (s) => s.segment);
  let lo = 0;
  let hi = parts.length;
  while (lo < hi) {
    const midIdx = Math.ceil((lo + hi) / 2);
    if (measure(parts.slice(0, midIdx).join('').trimEnd() + '…') <= maxWidth) lo = midIdx;
    else hi = midIdx - 1;
  }
  return parts.slice(0, lo).join('').trimEnd() + '…';
}

const numberFmt = new Intl.NumberFormat('vi-VN');
const multFmt = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });

export function formatPoints(n: number): string {
  return numberFmt.format(n);
}

export function formatMultiplier(x: number): string {
  return `×${multFmt.format(x)}`;
}

/** Dòng tiêu đề banner: "Nền móng" hoặc "Tầng 27/100". */
export function bannerTitle(floor: number, floorName: string, totalFloors: number): string {
  return floor === 0 ? floorName : `${floorName}/${totalFloors}`;
}

/** Màu ổn định cho avatar tạm theo mã người xem. */
export function avatarHue(platformId: string): number {
  let h = 0;
  for (const ch of platformId) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return h % 360;
}
