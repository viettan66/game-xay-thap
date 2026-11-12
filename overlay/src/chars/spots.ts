// Chỗ đứng làm việc quanh hạng mục đang xây (mục 9). Hàm thuần, có test.
// - Công trình đứng (gác chuông, chính điện…): một hàng dọc chân công trình (shared/paths.ts workSpots) và các sàn giàn giáo
//   (thanh ngang của giàn giáo đang dựng, cách nhau ít nhất một người cao). Bảo tháp: giàn giáo ở dải tầng đang xây.
// - Công trình phẳng (sân, hồ, tường bao, san nền): điểm rải trên chính phần đất của hạng mục.
// - Hết chỗ: đứng chờ dọc lối đi gần công trường (nhiều người dùng chung).

import type { MapRect } from '../../../shared/map.js';
import { workSpots } from '../../../shared/paths.js';

export interface Pt {
  x: number;
  y: number;
}

export type SpotKind = 'ground' | 'scaffold' | 'loiter';

export interface Spot extends Pt {
  kind: SpotKind;
  /** Giàn giáo: chỗ dưới đất để trèo lên (cùng x). */
  climbY?: number;
}

export interface SiteGeom {
  /** Mã hạng mục đang xây. */
  key: string;
  rect: MapRect;
  /** Đường chân (đứng dưới đất). */
  baseY: number;
  flat: boolean;
  /** Công trình phẳng: điểm nằm trên phần đất của hạng mục. */
  floor: Pt[];
  /** Thanh ngang giàn giáo hiện có [x0, x1, y] (tọa độ bản đồ). */
  ledgers: [number, number, number][];
  /** Chân đống vật liệu. */
  pile: Pt;
  /** Điểm trên lối đi gần công trường (đứng chờ khi hết chỗ). */
  loiter: Pt[];
}

/** Khoảng cách tối thiểu giữa hai người đứng cạnh nhau, và giữa hai sàn giàn giáo (đơn vị bản đồ). */
export const SPOT_GAP = 40;

export function buildSpots(g: SiteGeom, gap = SPOT_GAP): Spot[] {
  const out: Spot[] = [];
  if (g.flat) {
    for (const p of g.floor) out.push({ x: Math.round(p.x), y: Math.round(p.y), kind: 'ground' });
  } else {
    for (const s of workSpots(g.rect, g.baseY, { spacing: gap })) {
      // Chừa chỗ cho đống vật liệu.
      if (Math.abs(s.x - g.pile.x) < gap * 0.8 && Math.abs(s.y - g.pile.y) < gap) continue;
      out.push({ x: s.x, y: s.y, kind: 'ground' });
    }
    // Sàn giàn giáo: bỏ thanh sát mặt đất, các sàn cách nhau ít nhất một khoảng gap.
    const levels = [...g.ledgers].sort((a, b) => b[2] - a[2]).filter((l) => l[2] < g.baseY - gap * 0.75);
    let last = Infinity;
    for (const [x0, x1, y] of levels) {
      if (last - y < gap) continue;
      last = y;
      const a = x0 + gap * 0.5;
      const b = x1 - gap * 0.5;
      const n = Math.max(1, Math.floor((b - a) / (gap * 1.2)) + 1);
      for (let i = 0; i < n; i++) {
        const x = n === 1 ? (a + b) / 2 : a + ((b - a) * i) / (n - 1);
        out.push({ x: Math.round(x), y: Math.round(y), kind: 'scaffold', climbY: Math.round(g.baseY + 8) });
      }
    }
  }
  return out;
}

const same = (a: Spot, b: Spot) => a.kind === b.kind && Math.abs(a.x - b.x) < 3 && Math.abs(a.y - b.y) < 3;

/** Chia chỗ đứng: mỗi chỗ ground / scaffold một người; chỗ chờ (loiter) dùng chung. */
export class SpotPool {
  private spots: Spot[] = [];
  private loiter: Pt[] = [];
  private readonly claims = new Map<string, Spot>();
  key = '';

  /** Cập nhật theo công trường hiện tại. Chỗ đã nhận mà không còn (giàn giáo thấp xuống, đổi hạng mục) thì bị trả lại. */
  update(g: SiteGeom | null, gap = SPOT_GAP): void {
    this.key = g?.key ?? '';
    this.spots = g ? buildSpots(g, gap) : [];
    this.loiter = g?.loiter ?? [];
    for (const [id, s] of this.claims) {
      if (s.kind === 'loiter') {
        if (!g) this.claims.delete(id);
        continue;
      }
      const now = this.spots.find((x) => same(x, s));
      if (now) this.claims.set(id, now);
      else this.claims.delete(id);
    }
  }

  spotOf(id: string): Spot | null {
    return this.claims.get(id) ?? null;
  }

  release(id: string): void {
    this.claims.delete(id);
  }

  free(kind: 'ground' | 'scaffold'): Spot[] {
    const used = new Set(this.claims.values());
    return this.spots.filter((s) => s.kind === kind && !used.has(s));
  }

  get total(): number {
    return this.spots.length;
  }

  /** Nhận một chỗ: ưu tiên giàn giáo nếu `scaffold`, không còn thì loại kia, hết thì đứng chờ dọc lối đi. */
  claim(id: string, scaffold: boolean, rand: () => number): Spot | null {
    this.release(id);
    const order: ('ground' | 'scaffold')[] = scaffold ? ['scaffold', 'ground'] : ['ground', 'scaffold'];
    for (const kind of order) {
      const list = this.free(kind);
      if (list.length) {
        const s = list[Math.floor(rand() * list.length)]!;
        this.claims.set(id, s);
        return s;
      }
    }
    if (this.loiter.length) {
      const p = this.loiter[Math.floor(rand() * this.loiter.length)]!;
      const s: Spot = { x: Math.round(p.x + (rand() - 0.5) * 24), y: Math.round(p.y + (rand() - 0.5) * 10), kind: 'loiter' };
      this.claims.set(id, s);
      return s;
    }
    return null;
  }
}

/** Điểm chờ: rải dọc các lối đi trong vùng quanh công trường (cách nhau `step`). */
export function loiterPoints(paths: { points: [number, number][] }[], area: MapRect, step = 26): Pt[] {
  const out: Pt[] = [];
  const inArea = (x: number, y: number) => x >= area.x && x <= area.x + area.w && y >= area.y && y <= area.y + area.h;
  for (const p of paths) {
    for (let i = 1; i < p.points.length; i++) {
      const [ax, ay] = p.points[i - 1]!;
      const [bx, by] = p.points[i]!;
      const len = Math.hypot(bx - ax, by - ay);
      for (let d = 0; d <= len; d += step) {
        const k = len ? d / len : 0;
        const x = ax + (bx - ax) * k;
        const y = ay + (by - ay) * k;
        if (inArea(x, y) && !out.some((q) => Math.hypot(q.x - x, q.y - y) < step * 0.6)) out.push({ x: Math.round(x), y: Math.round(y) });
      }
    }
  }
  return out;
}
