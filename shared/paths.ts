// Lối đi, vị trí làm việc, ô ghi danh trên bản đồ (mục 9 SPEC). Hàm thuần, có test. Tọa độ theo hệ bản đồ.
// - Lối đi khai báo trong assets/map-paths.json (đường nối các điểm), chỉnh trên trang /tools/paths.
//   "main" = đường chính từ mép dưới bản đồ vào (xe trâu, voi đi đường này); "walk" = lối đi bộ tới từng công trình.
//   Các đường có điểm trùng nhau (hoặc rất gần) được nối thành một mạng; nhân vật đi theo mạng này.
// - Vị trí làm việc sinh tự động quanh chân công trình và trên các sàn giàn giáo.
// - Ô ghi danh: chỗ đặt tượng võ tướng đá mang tên người tặng quà từ 5.000 xu, dọc đường vào chùa.

import type { MapRect } from './map.js';

export type PathPoint = [number, number];

export interface MapPath {
  id: string;
  kind: 'main' | 'walk';
  points: PathPoint[];
}

export interface HonorSlot {
  x: number;
  y: number;
}

export interface MapPaths {
  paths: MapPath[];
  honorSlots: HonorSlot[];
}

/** Một người đứng cao bao nhiêu điểm ảnh trong ảnh nhân vật đã cắt (dáng đứng nhìn thẳng). Mọi ảnh nhân vật, xe, tượng
 *  được thu về cùng tỉ lệ này, nên overlay chỉ cần một hệ số: đơn vị bản đồ / điểm ảnh = characters.heightMap / CHAR_REF_HEIGHT. */
export const CHAR_REF_HEIGHT = 120;

/** Hai điểm cách nhau dưới SNAP đơn vị bản đồ coi là một (để nối các đường thành mạng). */
export const SNAP = 12;

export interface PathGraph {
  nodes: PathPoint[];
  /** Danh sách kề: chỉ số nút → [nút kề, độ dài]. */
  adj: [number, number][][];
}

const dist = (a: PathPoint, b: PathPoint) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function buildGraph(paths: MapPath[]): PathGraph {
  const nodes: PathPoint[] = [];
  const adj: [number, number][][] = [];
  const nodeOf = (p: PathPoint): number => {
    const i = nodes.findIndex((n) => dist(n, p) <= SNAP);
    if (i >= 0) return i;
    nodes.push([p[0], p[1]]);
    adj.push([]);
    return nodes.length - 1;
  };
  const link = (a: number, b: number) => {
    if (a === b) return;
    const d = dist(nodes[a]!, nodes[b]!);
    if (!adj[a]!.some(([n]) => n === b)) adj[a]!.push([b, d]);
    if (!adj[b]!.some(([n]) => n === a)) adj[b]!.push([a, d]);
  };
  for (const p of paths) {
    let prev = -1;
    for (const pt of p.points) {
      const i = nodeOf(pt);
      if (prev >= 0) link(prev, i);
      prev = i;
    }
  }
  // Đầu mút của một đường nằm trên giữa một đoạn của đường khác (rẽ nhánh giữa đoạn): chèn điểm nối vào đoạn đó.
  const unlink = (a: number, b: number) => {
    adj[a] = adj[a]!.filter(([n]) => n !== b);
    adj[b] = adj[b]!.filter(([n]) => n !== a);
  };
  for (let i = 0; i < nodes.length; i++) {
    if (adj[i]!.length > 1) continue;
    const p = nodes[i]!;
    let joined = false;
    for (let a = 0; a < nodes.length && !joined; a++) {
      for (const [b] of [...adj[a]!]) {
        if (b <= a || a === i || b === i || adj[i]!.some(([n]) => n === a || n === b)) continue;
        const A = nodes[a]!;
        const B = nodes[b]!;
        const dx = B[0] - A[0];
        const dy = B[1] - A[1];
        const len2 = dx * dx + dy * dy;
        if (!len2) continue;
        const t = ((p[0] - A[0]) * dx + (p[1] - A[1]) * dy) / len2;
        if (t <= 0.01 || t >= 0.99) continue;
        if (Math.hypot(A[0] + t * dx - p[0], A[1] + t * dy - p[1]) > SNAP) continue;
        unlink(a, b);
        link(a, i);
        link(i, b);
        joined = true;
        break;
      }
    }
  }
  return { nodes, adj };
}

export function nearestNode(g: PathGraph, p: PathPoint): number {
  let best = -1;
  let bd = Infinity;
  g.nodes.forEach((n, i) => {
    const d = dist(n, p);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

/** Đường đi ngắn nhất theo mạng lối đi từ `from` tới `to` (đi tới nút gần nhất, theo mạng, rồi tới đích). */
export function route(g: PathGraph, from: PathPoint, to: PathPoint): PathPoint[] {
  if (!g.nodes.length) return [from, to];
  const s = nearestNode(g, from);
  const t = nearestNode(g, to);
  const d = new Array<number>(g.nodes.length).fill(Infinity);
  const prev = new Array<number>(g.nodes.length).fill(-1);
  const done = new Array<boolean>(g.nodes.length).fill(false);
  d[s] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < d.length; i++) if (!done[i] && d[i]! < Infinity && (u < 0 || d[i]! < d[u]!)) u = i;
    if (u < 0 || u === t) break;
    done[u] = true;
    for (const [v, w] of g.adj[u]!) {
      if (d[u]! + w < d[v]!) {
        d[v] = d[u]! + w;
        prev[v] = u;
      }
    }
  }
  const chain: PathPoint[] = [];
  if (d[t] === Infinity) return [from, to]; // không nối được: đi thẳng
  for (let v = t; v >= 0; v = prev[v]!) chain.unshift(g.nodes[v]!);
  const out: PathPoint[] = [from, ...chain, to];
  // Bỏ điểm trùng liền nhau.
  return out.filter((p, i) => i === 0 || dist(p, out[i - 1]!) > 0.5);
}

/** Độ dài đường gấp khúc. */
export function routeLength(pts: PathPoint[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += dist(pts[i - 1]!, pts[i]!);
  return s;
}

/** Điểm vào bản đồ của đường chính (đầu mút thấp nhất, gần mép dưới bản đồ). */
export function mainEntry(paths: MapPath[]): PathPoint | null {
  let best: PathPoint | null = null;
  for (const p of paths) {
    if (p.kind !== 'main') continue;
    for (const pt of [p.points[0], p.points[p.points.length - 1]]) if (pt && (!best || pt[1] > best[1])) best = pt;
  }
  return best;
}

/** Các đường có đi tới được nhau không (mạng liền một khối). Trả về số cụm rời nhau. */
export function components(g: PathGraph): number {
  const seen = new Array<boolean>(g.nodes.length).fill(false);
  let n = 0;
  for (let i = 0; i < g.nodes.length; i++) {
    if (seen[i]) continue;
    n++;
    const stack = [i];
    seen[i] = true;
    while (stack.length) {
      const u = stack.pop()!;
      for (const [v] of g.adj[u]!) if (!seen[v]) {
        seen[v] = true;
        stack.push(v);
      }
    }
  }
  return n;
}

export interface WorkSpot {
  x: number;
  y: number;
  /** ground: đứng dưới đất quanh chân công trình; scaffold: đứng trên sàn giàn giáo. */
  kind: 'ground' | 'scaffold';
}

/**
 * Vị trí làm việc quanh một hạng mục (mục 9): một hàng dọc theo chân công trình (cách nhau `spacing`),
 * thêm hai bên hông; mỗi sàn giàn giáo (`scaffoldLevels`, tọa độ y) một hàng ngắn hơn ở giữa thân.
 * Bảo tháp: truyền dải của tầng đang xây làm `rect` và sàn ở đáy dải tầng.
 */
export function workSpots(rect: MapRect, baseY: number, opts: { spacing?: number; scaffoldLevels?: number[]; ground?: boolean } = {}): WorkSpot[] {
  const spacing = Math.max(12, opts.spacing ?? 42);
  const out: WorkSpot[] = [];
  if (opts.ground !== false) {
    const x0 = rect.x + rect.w * 0.12;
    const x1 = rect.x + rect.w * 0.88;
    const n = Math.max(2, Math.floor((x1 - x0) / spacing) + 1);
    for (let i = 0; i < n; i++) out.push({ x: Math.round(x0 + ((x1 - x0) * i) / (n - 1)), y: Math.round(baseY + 8), kind: 'ground' });
    // Hai bên hông, lùi lên một chút.
    out.push({ x: Math.round(rect.x - 10), y: Math.round(baseY - 10), kind: 'ground' }, { x: Math.round(rect.x + rect.w + 10), y: Math.round(baseY - 10), kind: 'ground' });
  }
  for (const ly of opts.scaffoldLevels ?? []) {
    const x0 = rect.x + rect.w * 0.25;
    const x1 = rect.x + rect.w * 0.75;
    const n = Math.max(1, Math.floor((x1 - x0) / (spacing * 1.4)) + 1);
    for (let i = 0; i < n; i++) out.push({ x: Math.round(n === 1 ? (x0 + x1) / 2 : x0 + ((x1 - x0) * i) / (n - 1)), y: Math.round(ly), kind: 'scaffold' });
  }
  return out;
}

/** Ô ghi danh thứ k (hết ô thì xoay vòng, mục 9). */
export function honorSlotFor(slots: HonorSlot[], k: number): HonorSlot | null {
  if (!slots.length) return null;
  return slots[((k % slots.length) + slots.length) % slots.length]!;
}

/** Điểm trên lối đi gần `p` nhất (xét mọi đoạn của mọi đường); không có lối đi thì null. */
export function nearestOnPaths(paths: MapPath[], p: { x: number; y: number }): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bd = Infinity;
  for (const path of paths) {
    for (let i = 1; i < path.points.length; i++) {
      const [ax, ay] = path.points[i - 1]!;
      const [bx, by] = path.points[i]!;
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 ? Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / len2)) : 0;
      const q = { x: ax + t * dx, y: ay + t * dy };
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < bd) {
        bd = d;
        best = q;
      }
    }
  }
  return best;
}
