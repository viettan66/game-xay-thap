// Tiến độ xây quần thể chùa (mục 5, 6, 14.4, 14.10, 14.12 SPEC). Hàm thuần, không đụng DB.
//
// Công trình = danh sách hạng mục theo thứ tự xây (config/project.json). Mỗi hạng mục có nhiều giai đoạn;
// giá hạng mục chia cho các giai đoạn theo `weight` (mặc định chia đều). Hạng mục nhận diện bằng `id`.
// Giá giai đoạn đang xây được "chốt" lúc giai đoạn bắt đầu (state.stageCost), nên đổi giá chỉ ảnh hưởng
// giai đoạn chưa bắt đầu, trừ khi gọi repriceCurrentStage (admin đã xác nhận).
// Chỉ số giai đoạn (stageIndex) đếm từ 0; khi hiển thị thì +1.

import { PART_KEYS, type PartKey } from './parts.js';

export const ITEM_SIZES = ['nho', 'vua', 'lon'] as const;
export type ItemSize = (typeof ITEM_SIZES)[number];

/** Cách hiện mảnh: màu thật, gỗ thô; và 3 hiệu ứng mặt đất cho giai đoạn `matdat` (mục 5, 7). */
export const PIECE_LOOKS = ['full', 'wood'] as const;
export const GROUND_LOOKS = ['coc', 'dao', 'dong'] as const;
export type PieceLook = (typeof PIECE_LOOKS)[number];
export type GroundLook = (typeof GROUND_LOOKS)[number];
export type BuildLook = PieceLook | GroundLook;

/** `build` của giai đoạn trong project.json (mục 5): vùng nào được xây, hiện ra sao, dải chiều cao nào. */
export interface StageBuildDef {
  part: PartKey | 'matdat' | PartKey[];
  look: BuildLook;
  /** [từ, đến] phần trăm chiều cao của vùng, tính từ dưới lên. Mặc định [0, 100]. */
  band?: [number, number] | undefined;
}

/** `build` đã chuẩn hóa: parts rỗng = giai đoạn chỉ tác động mặt đất. */
export interface StageBuild {
  parts: PartKey[];
  look: BuildLook;
  band: [number, number];
}

export interface StageDef {
  name: string;
  /** Tỉ trọng công trong hạng mục (mặc định 1 = chia đều). */
  weight?: number | undefined;
  /** Tên lễ nếu là giai đoạn đặc biệt, ví dụ "Lễ dựng cột". */
  ritual?: string | undefined;
  build?: StageBuildDef | undefined;
}

export interface ItemDef {
  id: string;
  name: string;
  /** Tổng công của hạng mục. */
  cost: number;
  size: ItemSize;
  /** Khu vực trên bản đồ (camera dùng để lấy khung hình). */
  area: string;
  /** Tên mẫu giai đoạn trong stageTemplates; hoặc dùng `stages` riêng. */
  template?: string | undefined;
  stages?: StageDef[] | undefined;
  /** Giai đoạn thêm vào trước / sau mẫu (ví dụ tầng 1 bảo tháp thêm "Đắp nền tháp"). */
  stagesBefore?: StageDef[] | undefined;
  stagesAfter?: StageDef[] | undefined;
}

export interface ProjectFile {
  name: string;
  /** Đơn vị giá gợi ý cho admin (mục 5): giá hạng mục nên là bội số của baseUnit. */
  baseUnit: number;
  /** Giá từng giai đoạn làm tròn tới bội số này (giai đoạn cuối nhận phần lẻ). */
  costRoundTo: number;
  stageTemplates: Record<string, StageDef[]>;
  items: ItemDef[];
}

export interface ResolvedStage {
  name: string;
  weight: number;
  ritual: string | null;
  build: StageBuild;
  cost: number;
}

export interface ResolvedItem {
  id: string;
  name: string;
  size: ItemSize;
  area: string;
  template: string | null;
  cost: number;
  stages: ResolvedStage[];
}

export interface ResolvedProject {
  name: string;
  items: ResolvedItem[];
  totalCost: number;
}

export interface ProgressState {
  itemId: string;
  stageIndex: number;
  stagePoints: number;
  /** Giá đã chốt của giai đoạn đang xây. */
  stageCost: number;
  completed: boolean;
}

export type ProgressTransition =
  | { type: 'stage_complete'; itemId: string; stageIndex: number; ritual: string | null }
  | { type: 'stage_start'; itemId: string; stageIndex: number; cost: number }
  | { type: 'item_complete'; itemId: string; size: ItemSize }
  | { type: 'item_start'; itemId: string }
  | { type: 'project_complete' };

/** Phần điểm rơi vào một giai đoạn của một hạng mục. */
export interface Allocation {
  itemId: string;
  stageIndex: number;
  points: number;
  /** Số điểm giai đoạn đã có trước phần này, và giá giai đoạn (để overlay tính ra số mảnh, mục 7). */
  from: number;
  cost: number;
}

export interface ApplyResult {
  state: ProgressState;
  allocations: Allocation[];
  transitions: ProgressTransition[];
  /** Điểm không rơi vào đâu (công trình đã xong). */
  leftover: number;
}

/** Giai đoạn không khai báo build: xây mọi phần còn lại, màu thật. */
const DEFAULT_BUILD: StageBuild = { parts: [...PART_KEYS], look: 'full', band: [0, 100] };

/** Chuẩn hóa build; sai thì trả về chuỗi lỗi. */
export function normalizeBuild(b: StageBuildDef | undefined): StageBuild | string {
  if (!b) return { ...DEFAULT_BUILD, parts: [...DEFAULT_BUILD.parts] };
  const band: [number, number] = b.band ?? [0, 100];
  if (!(band[0] >= 0 && band[1] <= 100 && band[0] < band[1])) return `band [${band.join(', ')}] phải là [từ, đến] trong 0–100, từ < đến`;
  if (b.part === 'matdat') {
    if (!(GROUND_LOOKS as readonly string[]).includes(b.look)) return `giai đoạn mặt đất (matdat) cần look là ${GROUND_LOOKS.join(' / ')}`;
    return { parts: [], look: b.look, band };
  }
  if (!(PIECE_LOOKS as readonly string[]).includes(b.look)) return `vùng ${String(b.part)} cần look là full hoặc wood`;
  const parts = Array.isArray(b.part) ? b.part : [b.part];
  if (parts.length === 0) return 'part không được là danh sách rỗng';
  return { parts: [...new Set(parts)], look: b.look, band };
}

/** Chia giá cho các giai đoạn theo tỉ trọng; làm tròn mốc cộng dồn tới bội số roundTo. Tổng luôn đúng bằng cost. */
export function splitCost(cost: number, weights: number[], roundTo: number): number[] {
  const attempt = (step: number) => {
    const sum = weights.reduce((a, b) => a + b, 0);
    let acc = 0;
    let prev = 0;
    return weights.map((w, i) => {
      acc += w;
      const mark = i === weights.length - 1 ? cost : Math.round((cost * acc) / sum / step) * step;
      const part = mark - prev;
      prev = mark;
      return part;
    });
  };
  const rounded = attempt(roundTo > 0 ? roundTo : 1);
  // Giá quá nhỏ so với bước làm tròn thì bỏ làm tròn, để giai đoạn nào cũng có giá.
  return rounded.every((c) => c >= 1) ? rounded : attempt(1);
}

function stageDefsOf(item: ItemDef, templates: Record<string, StageDef[]>): StageDef[] | null {
  const main = item.stages ?? (item.template !== undefined ? templates[item.template] : undefined);
  if (!main) return null;
  return [...(item.stagesBefore ?? []), ...main, ...(item.stagesAfter ?? [])];
}

/** Lỗi về ý nghĩa trong project.json (cấu trúc đã được zod kiểm tra). Rỗng = hợp lệ. */
export function projectProblems(p: ProjectFile): string[] {
  const out: string[] = [];
  if (p.items.length === 0) out.push('Danh sách hạng mục (items) đang trống');
  const seen = new Set<string>();
  for (const item of p.items) {
    const label = `Hạng mục "${item.id}"`;
    if (seen.has(item.id)) out.push(`Có hai hạng mục trùng id "${item.id}"`);
    seen.add(item.id);
    const hasTemplate = item.template !== undefined;
    const hasStages = item.stages !== undefined;
    if (hasTemplate === hasStages) {
      out.push(`${label}: cần đúng MỘT trong hai: "template" (dùng mẫu) hoặc "stages" (giai đoạn riêng)`);
      continue;
    }
    if (hasTemplate && !p.stageTemplates[item.template!]) {
      out.push(`${label}: không có mẫu giai đoạn "${item.template}"`);
      continue;
    }
    const defs = stageDefsOf(item, p.stageTemplates)!;
    const costs = splitCost(item.cost, defs.map((d) => d.weight ?? 1), p.costRoundTo);
    if (costs.some((c) => c < 1)) out.push(`${label}: giá ${item.cost} quá nhỏ cho ${defs.length} giai đoạn`);
    defs.forEach((d, k) => {
      const b = normalizeBuild(d.build);
      if (typeof b === 'string') out.push(`${label}, giai đoạn ${k + 1} "${d.name}": ${b}`);
    });
  }
  return out;
}

/** Ghép mẫu giai đoạn vào từng hạng mục, tính giá từng giai đoạn. Gọi sau khi projectProblems() rỗng. */
export function resolveProject(p: ProjectFile): ResolvedProject {
  const problems = projectProblems(p);
  if (problems.length > 0) throw new Error(`project.json chưa hợp lệ: ${problems.join('; ')}`);
  const items = p.items.map((item): ResolvedItem => {
    const defs = stageDefsOf(item, p.stageTemplates)!;
    const weights = defs.map((d) => d.weight ?? 1);
    const costs = splitCost(item.cost, weights, p.costRoundTo);
    return {
      id: item.id,
      name: item.name,
      size: item.size,
      area: item.area,
      template: item.template ?? null,
      cost: item.cost,
      stages: defs.map((d, i) => ({
        name: d.name,
        weight: weights[i]!,
        ritual: d.ritual ?? null,
        build: normalizeBuild(d.build) as StageBuild,
        cost: costs[i]!,
      })),
    };
  });
  return { name: p.name, items, totalCost: items.reduce((a, i) => a + i.cost, 0) };
}

export function itemIndexOf(p: ResolvedProject, itemId: string): number {
  return p.items.findIndex((i) => i.id === itemId);
}

function itemOf(p: ResolvedProject, itemId: string): ResolvedItem {
  const item = p.items.find((i) => i.id === itemId);
  if (!item) throw new Error(`Không có hạng mục "${itemId}" trong project.json`);
  return item;
}

export function initialProgress(p: ResolvedProject): ProgressState {
  const first = p.items[0]!;
  return { itemId: first.id, stageIndex: 0, stagePoints: 0, stageCost: first.stages[0]!.cost, completed: false };
}

/** Sang giai đoạn kế (hoặc hạng mục kế, hoặc xong công trình). Sửa trực tiếp s. */
function advanceStage(s: ProgressState, p: ResolvedProject, transitions: ProgressTransition[]): void {
  const item = itemOf(p, s.itemId);
  transitions.push({ type: 'stage_complete', itemId: s.itemId, stageIndex: s.stageIndex, ritual: item.stages[s.stageIndex]?.ritual ?? null });
  if (s.stageIndex + 1 < item.stages.length) {
    s.stageIndex += 1;
    s.stagePoints = 0;
    s.stageCost = item.stages[s.stageIndex]!.cost;
    transitions.push({ type: 'stage_start', itemId: s.itemId, stageIndex: s.stageIndex, cost: s.stageCost });
    return;
  }
  transitions.push({ type: 'item_complete', itemId: s.itemId, size: item.size });
  const next = p.items[itemIndexOf(p, s.itemId) + 1];
  if (!next) {
    s.completed = true;
    s.stagePoints = s.stageCost;
    transitions.push({ type: 'project_complete' });
    return;
  }
  startItem(s, next, transitions);
}

function startItem(s: ProgressState, item: ResolvedItem, transitions: ProgressTransition[]): void {
  s.itemId = item.id;
  s.stageIndex = 0;
  s.stagePoints = 0;
  s.stageCost = item.stages[0]!.cost;
  s.completed = false;
  transitions.push({ type: 'item_start', itemId: item.id });
  transitions.push({ type: 'stage_start', itemId: item.id, stageIndex: 0, cost: s.stageCost });
}

/** Cộng điểm vào công trình; điểm dư chuyển sang giai đoạn / hạng mục sau, có thể vượt nhiều cấp một lúc. */
export function applyPoints(state: ProgressState, points: number, p: ResolvedProject): ApplyResult {
  const s: ProgressState = { ...state };
  const allocations: Allocation[] = [];
  const transitions: ProgressTransition[] = [];
  let remaining = Math.max(0, Math.floor(points));

  while (remaining > 0 && !s.completed) {
    const take = Math.min(remaining, Math.max(0, s.stageCost - s.stagePoints));
    if (take > 0) {
      s.stagePoints += take;
      remaining -= take;
      allocations.push({ itemId: s.itemId, stageIndex: s.stageIndex, points: take, from: s.stagePoints - take, cost: s.stageCost });
    }
    if (s.stagePoints >= s.stageCost) advanceStage(s, p, transitions);
  }
  return { state: s, allocations, transitions, leftover: remaining };
}

/**
 * Đổi giá giai đoạn ĐANG xây (14.10, admin đã xác nhận). Điểm đã góp giữ nguyên:
 * - Giá mới ≤ điểm đã có: giai đoạn xong ngay, phần dư chuyển sang giai đoạn sau.
 * - Giá mới cao hơn: phần trăm tụt xuống.
 * Phần dư chuyển tiếp không gắn với người góp nào.
 */
export function repriceCurrentStage(state: ProgressState, newCost: number, p: ResolvedProject): ApplyResult {
  const s: ProgressState = { ...state };
  if (s.completed) return { state: s, allocations: [], transitions: [], leftover: 0 };
  s.stageCost = Math.max(1, Math.floor(newCost));
  if (s.stagePoints < s.stageCost) return { state: s, allocations: [], transitions: [], leftover: 0 };

  const overflow = s.stagePoints - s.stageCost;
  s.stagePoints = s.stageCost;
  const transitions: ProgressTransition[] = [];
  advanceStage(s, p, transitions);
  const rest = applyPoints(s, overflow, p);
  return {
    state: rest.state,
    allocations: rest.allocations,
    transitions: [...transitions, ...rest.transitions],
    leftover: rest.leftover,
  };
}

/** Công trình đã xong mà danh sách vừa được nối thêm hạng mục (14.12): mở hạng mục mới. */
export function extendIfNeeded(state: ProgressState, p: ResolvedProject): ApplyResult | null {
  if (!state.completed) return null;
  const next = p.items[itemIndexOf(p, state.itemId) + 1];
  if (!next) return null;
  const s: ProgressState = { ...state };
  const transitions: ProgressTransition[] = [];
  startItem(s, next, transitions);
  return { state: s, allocations: [], transitions, leftover: 0 };
}

export interface ProgressNumbers {
  /** Vị trí hạng mục đang xây, đếm từ 1. */
  itemNumber: number;
  itemCount: number;
  stageCount: number;
  /** Phần trăm của giai đoạn, hạng mục, toàn công trình (làm tròn xuống, 0–100). */
  percent: number;
  itemPercent: number;
  projectPercent: number;
  /** Số công đã xây vào công trình và tổng công cần (giai đoạn đang xây tính theo giá đã chốt). */
  donePoints: number;
  projectCost: number;
}

const pct = (a: number, b: number) => (b <= 0 ? 0 : Math.max(0, Math.min(100, Math.floor((a * 100) / b))));

export function progressNumbers(s: ProgressState, p: ResolvedProject): ProgressNumbers {
  const idx = itemIndexOf(p, s.itemId);
  const item = itemOf(p, s.itemId);
  const before = p.items.slice(0, idx).reduce((a, i) => a + i.cost, 0);
  const after = p.items.slice(idx + 1).reduce((a, i) => a + i.cost, 0);
  const stagesDone = item.stages.slice(0, s.stageIndex).reduce((a, st) => a + st.cost, 0);
  const stagesLeft = item.stages.slice(s.stageIndex + 1).reduce((a, st) => a + st.cost, 0);
  const itemTotal = stagesDone + s.stageCost + stagesLeft;
  const itemDone = s.completed ? itemTotal : stagesDone + s.stagePoints;
  const projectCost = before + itemTotal + after;
  const donePoints = before + itemDone;
  return {
    itemNumber: idx + 1,
    itemCount: p.items.length,
    stageCount: item.stages.length,
    percent: s.completed ? 100 : pct(s.stagePoints, s.stageCost),
    itemPercent: s.completed ? 100 : pct(itemDone, itemTotal),
    projectPercent: s.completed ? 100 : pct(donePoints, projectCost),
    donePoints,
    projectCost,
  };
}

/**
 * Kiểm tra danh sách hạng mục mới với những gì đã xây (14.10):
 * hạng mục đã bắt đầu không được đổi thứ tự, xóa, hay đổi số giai đoạn.
 * `startedIds`: các hạng mục đã bắt đầu, theo thứ tự xây. `oldStageCounts`: số giai đoạn lúc bắt đầu.
 */
export function startedItemProblems(startedIds: string[], oldStageCounts: Map<string, number>, next: ResolvedProject): string[] {
  const out: string[] = [];
  const nextIds = next.items.map((i) => i.id);
  startedIds.forEach((id, k) => {
    const pos = nextIds.indexOf(id);
    if (pos < 0) out.push(`Không được xóa hạng mục đã bắt đầu xây: "${id}"`);
    else if (pos !== k) out.push(`Không được đổi thứ tự hạng mục đã bắt đầu xây: "${id}" phải ở vị trí ${k + 1}`);
    const old = oldStageCounts.get(id);
    const now = next.items[pos]?.stages.length;
    if (pos >= 0 && old !== undefined && now !== old) {
      out.push(`Không được đổi số giai đoạn của hạng mục đã bắt đầu xây: "${id}" đang có ${old} giai đoạn`);
    }
  });
  return out;
}

/** Điền biến {tên} vào mẫu chữ trong config. Biến không có thì giữ nguyên. */
export function fillTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}
