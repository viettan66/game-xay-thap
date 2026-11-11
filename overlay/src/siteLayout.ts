// Bố cục TẠM (giai đoạn R1) cho cảnh hình khối: mỗi hạng mục là một khối, gom theo khu vực (area).
// - Khu có nhiều hạng mục (từ TALL_MIN trở lên, ví dụ bảo tháp 9 tầng) được một cột riêng cao hết vùng vẽ,
//   các hạng mục xếp chồng từ dưới lên, khối trên hẹp dần.
// - Các khu còn lại xếp thành lưới, khu đầu tiên ở góc dưới bên trái rồi lên dần (như đi từ chân đồi lên);
//   trong mỗi ô, hạng mục cũng xếp chồng từ dưới lên.
// Hàm thuần, có test. R2–R4 sẽ thay bằng bản đồ thật và camera.

import type { Rect } from './layout.js';

export interface SiteBlock {
  id: string;
  /** Thứ tự khu (0 = khu xuất hiện đầu tiên trong danh sách). */
  group: number;
  rect: Rect;
}

const GAP = 6;
const PAD = 10;
const TALL_MIN = 4;

interface Group {
  index: number;
  ids: string[];
}

function stack(g: Group, cell: Rect, out: SiteBlock[]): void {
  const n = g.ids.length;
  const maxW = cell.w - 2 * PAD;
  // Một hạng mục: khối thấp, rộng. Nhiều hạng mục: chồng kín chiều cao ô.
  const stackH = n === 1 ? Math.min(cell.h - 2 * PAD, maxW * 0.6) : cell.h - 2 * PAD;
  const h = (stackH - GAP * (n - 1)) / n;
  const cx = cell.x + cell.w / 2;
  const bottom = cell.y + cell.h - PAD;
  g.ids.forEach((id, k) => {
    const w = n === 1 ? maxW : maxW * (1 - (0.45 * k) / (n - 1));
    out.push({ id, group: g.index, rect: { x: cx - w / 2, y: bottom - (k + 1) * h - k * GAP, w, h } });
  });
}

export function siteBlocks(items: { id: string; area: string }[], area: Rect): SiteBlock[] {
  const groups: (Group & { area: string })[] = [];
  for (const it of items) {
    const g = groups.find((x) => x.area === it.area);
    if (g) g.ids.push(it.id);
    else groups.push({ area: it.area, index: groups.length, ids: [it.id] });
  }
  const tall = groups.filter((g) => g.ids.length >= TALL_MIN);
  const rest = groups.filter((g) => g.ids.length < TALL_MIN);
  const out: SiteBlock[] = [];

  // Cột riêng cho khu cao, đặt bên trái.
  const tallW = rest.length === 0 ? area.w / Math.max(1, tall.length) : Math.min(area.w * 0.32, 190);
  tall.forEach((g, i) => stack(g, { x: area.x + i * tallW, y: area.y, w: tallW, h: area.h }, out));

  if (rest.length > 0) {
    const gx = area.x + tall.length * tallW;
    const gw = area.w - tall.length * tallW;
    const cols = Math.min(rest.length, gw < 450 ? 2 : 3);
    const rows = Math.ceil(rest.length / cols);
    const cellW = gw / cols;
    const cellH = area.h / rows;
    rest.forEach((g, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols); // 0 = hàng dưới cùng
      stack(g, { x: gx + col * cellW, y: area.y + area.h - (row + 1) * cellH, w: cellW, h: cellH }, out);
    });
  }
  // Giữ đúng thứ tự hạng mục như danh sách gốc.
  const order = new Map(items.map((it, i) => [it.id, i]));
  return out.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
}
