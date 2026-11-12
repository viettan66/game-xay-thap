// Đi theo đường gấp khúc trên bản đồ (mục 9). Hàm thuần, có test.
// Nhân vật, xe trâu, voi đi từ mép màn hình vào: đường đi tính từ mép bản đồ theo mạng lối đi (shared/paths.ts),
// rồi bỏ đoạn đầu nằm ngoài màn hình để không phải đi hàng phút ngoài khung hình.

import type { MapRect } from '../../../shared/map.js';
import type { PathPoint } from '../../../shared/paths.js';

export interface RoutePos {
  x: number;
  y: number;
  /** Hướng của đoạn đang đi (vector đơn vị). */
  dx: number;
  dy: number;
}

export class Polyline {
  readonly pts: PathPoint[];
  private readonly cum: number[];

  constructor(pts: PathPoint[]) {
    this.pts = pts.length ? pts : [[0, 0]];
    this.cum = [0];
    for (let i = 1; i < this.pts.length; i++) {
      const a = this.pts[i - 1]!;
      const b = this.pts[i]!;
      this.cum.push(this.cum[i - 1]! + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
  }

  get length(): number {
    return this.cum[this.cum.length - 1]!;
  }

  /** Vị trí ở quãng đường s (kẹp trong [0, length]). */
  at(s: number): RoutePos {
    const p = this.pts;
    if (p.length === 1) return { x: p[0]![0], y: p[0]![1], dx: 0, dy: 1 };
    const d = Math.max(0, Math.min(this.length, s));
    let i = 1;
    while (i < p.length - 1 && this.cum[i]! < d) i++;
    const a = p[i - 1]!;
    const b = p[i]!;
    const seg = this.cum[i]! - this.cum[i - 1]!;
    const k = seg > 0 ? (d - this.cum[i - 1]!) / seg : 0;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return { x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k, dx: (b[0] - a[0]) / len, dy: (b[1] - a[1]) / len };
  }
}

/** Hướng ảnh theo hướng đi: dọc rõ thì lên / xuống, còn lại đi ngang (sang trái thì lật ảnh). */
export function facing(dx: number, dy: number): { dir: 'down' | 'up' | 'right'; flip: boolean } {
  if (Math.abs(dy) > Math.abs(dx) * 0.8) return { dir: dy < 0 ? 'up' : 'down', flip: dx < -0.15 };
  return { dir: 'right', flip: dx < 0 };
}

const inside = (r: MapRect, x: number, y: number, m: number) => x >= r.x - m && x <= r.x + r.w + m && y >= r.y - m && y <= r.y + r.h + m;

/** Điểm bắt đầu đi (quãng đường) để vừa xuất hiện ở mép khung nhìn: ngay trước chỗ đường đi vào khung (lùi `margin`). */
export function enterStart(line: Polyline, view: MapRect, margin = 40, step = 8): number {
  for (let s = 0; s <= line.length; s += step) {
    const p = line.at(s);
    if (inside(view, p.x, p.y, margin)) return Math.max(0, s - step);
  }
  return Math.max(0, line.length - step);
}

/** Điểm kết thúc khi đi ra: ngay sau chỗ đường đi rời khung nhìn lần cuối (đi quá `margin`), không có thì cuối đường. */
export function exitEnd(line: Polyline, view: MapRect, margin = 40, step = 8): number {
  for (let s = line.length; s >= 0; s -= step) {
    const p = line.at(s);
    if (inside(view, p.x, p.y, margin)) return Math.min(line.length, s + step);
  }
  return 0;
}

/**
 * Cắt đường đi để không vòng ra sau công trình đang xây (xe trâu, voi dừng trước công trình, mục 9):
 * gặp điểm nằm trong bề ngang `rect` mà ở phía sau đường chân `baseY` thì dừng ngay trước đường chân (cách `gap`).
 */
export function stopBefore(pts: PathPoint[], rect: MapRect, baseY: number, gap = 14): PathPoint[] {
  const behind = (p: PathPoint) => p[0] >= rect.x && p[0] <= rect.x + rect.w && p[1] < baseY;
  for (let i = 1; i < pts.length; i++) {
    const b = pts[i]!;
    if (!behind(b)) continue;
    const a = pts[i - 1]!;
    const stopY = baseY + gap;
    if (a[1] > stopY && b[1] < stopY) {
      const k = (a[1] - stopY) / (a[1] - b[1]);
      return [...pts.slice(0, i), [a[0] + (b[0] - a[0]) * k, stopY]];
    }
    return pts.slice(0, i);
  }
  return pts;
}
