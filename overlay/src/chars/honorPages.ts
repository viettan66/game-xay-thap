// Lượt hiển thị tượng võ tướng đá ở ô ghi danh (mục 9). Hàm thuần, có test.
// Tượng thứ seq (đếm từ 0) đứng ở ô seq % số ô; nhiều tượng hơn số ô thì chia lượt, xoay vòng hiển thị.

import type { HonorInfo } from '../../../shared/protocol.js';

export const STATUE_STYLES = 3;

/** Lượt hiển thị chứa tượng thứ `seq`. */
export function pageOf(seq: number, slots: number): number {
  return slots > 0 ? Math.floor(seq / slots) : 0;
}

/** Các lượt có tượng (theo thứ tự). */
export function pagesOf(honors: HonorInfo[], slots: number): number[] {
  return [...new Set(honors.map((h) => pageOf(h.seq, slots)))].sort((a, b) => a - b);
}

/** Tượng của một lượt, kèm ô đứng. */
export function pageStatues(honors: HonorInfo[], slots: number, page: number): { honor: HonorInfo; slot: number }[] {
  return honors.filter((h) => pageOf(h.seq, slots) === page).map((h) => ({ honor: h, slot: h.seq % slots }));
}

/** Kiểu tượng (1..3) theo thứ tự tượng: các ô liền nhau khác kiểu. */
export function statueStyle(seq: number): number {
  return (seq % STATUE_STYLES) + 1;
}
