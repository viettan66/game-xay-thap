// Hàm bố cục và định dạng dùng chung cho overlay (thuần, không đụng trình duyệt) để test được.
// Toạ độ theo khung 1080×1920, trục y hướng xuống. Vị trí từng khung giao diện: hudLayout.ts; camera: camera.ts.

import type { Board } from '../../shared/protocol.js';

export const STAGE_W = 1080;
export const STAGE_H = 1920;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
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

export function formatPoints(n: number): string {
  return numberFmt.format(n);
}
