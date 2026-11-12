// Bố cục bia trên màn hình (mục 10) và các dòng credit cuối công trình (14.12). Thuần, có test.
// Bia đứng giữa vùng khung hình, chân bia ngay trên dải miễn trừ (trồi lên từ đó), cao gần hết vùng khung hình để
// 10 dòng tên với cỡ chữ không nhỏ hơn 32px vừa mặt bia. Lúc dựng bia, các khung giao diện mờ xuống.

import type { CreditsInfo } from '../../../shared/protocol.js';

/** Ảnh stele/stele.png (822×1419) và mặt bia phẳng để khắc chữ (tọa độ trong ảnh). */
export const STELE_IMG = { w: 822, h: 1419, inner: { x0: 150, x1: 672, y0: 318, y1: 1122 } } as const;

/** Cỡ chữ nhỏ nhất trên bia (mục 10). */
export const STELE_MIN_FONT = 32;

export interface SteleBox {
  cx: number;
  /** Đường chân bia (bia trồi lên từ đây). */
  base: number;
  scale: number;
  w: number;
  h: number;
  /** Mặt bia để khắc chữ. */
  inner: { x: number; y: number; w: number; h: number };
}

/** Bia trong vùng [left, right] × [top, bottom] của màn hình: cao tối đa maxH, giữa theo chiều ngang. */
export function steleBox(area: { left: number; right: number; top: number; bottom: number }, maxH = 1080): SteleBox {
  const h = Math.max(200, Math.min(maxH, area.bottom - area.top));
  const scale = h / STELE_IMG.h;
  const w = STELE_IMG.w * scale;
  const cx = (area.left + area.right) / 2;
  const base = area.bottom;
  const i = STELE_IMG.inner;
  return {
    cx,
    base,
    scale,
    w,
    h,
    inner: { x: cx - w / 2 + i.x0 * scale, y: base - h + i.y0 * scale, w: (i.x1 - i.x0) * scale, h: (i.y1 - i.y0) * scale },
  };
}

/** Số công trên bia: viết đủ, có dấu chấm ngăn nghìn (tên dài thì cắt bớt cho vừa, không viết tắt số). */
export function compactPoints(n: number): string {
  return Math.round(n).toLocaleString('vi-VN');
}

/** Bia hiện ra: trồi lên (0 → 1) trong riseSec, đứng yên, rồi thu lại trong sinkSec cuối. */
export function steleProgress(t: number, dur: number, riseSec = 1.2, sinkSec = 1.0): number {
  if (t <= 0 || t >= dur) return 0;
  if (t < riseSec) return t / riseSec;
  if (t > dur - sinkSec) return Math.max(0, (dur - t) / sinkSec);
  return 1;
}

// ---------- Credit ----------

export type CreditKind = 'project' | 'title' | 'gap' | 'name' | 'end';

export interface CreditLine {
  kind: CreditKind;
  text: string;
  /** Vị trí dòng (từ đầu danh sách) và chiều cao. */
  y: number;
  h: number;
}

const HEIGHT: Record<CreditKind, number> = { project: 72, title: 50, gap: 40, name: 46, end: 64 };

/** Các dòng của credit theo thứ tự, kèm vị trí. Hàm thuần, có test. */
export function creditLines(c: CreditsInfo): CreditLine[] {
  const raw: [CreditKind, string][] = [['project', c.project]];
  if (c.title) raw.push(['title', c.title]);
  raw.push(['gap', '']);
  for (const n of c.names) raw.push(['name', n]);
  raw.push(['gap', '']);
  if (c.end) raw.push(['end', c.end]);
  let y = 0;
  return raw.map(([kind, text]) => {
    const l = { kind, text, y, h: HEIGHT[kind] };
    y += l.h;
    return l;
  });
}

export function creditsHeight(lines: CreditLine[]): number {
  const last = lines[lines.length - 1];
  return last ? last.y + last.h : 0;
}
