// Máy trạng thái tiến độ tháp (mục 5, 14.4, 14.10 SPEC). Hàm thuần.
//
// Tầng 0 = nền móng; tầng 1..totalFloors. Mỗi tầng có 5 giai đoạn chia theo stageRatios.
// Giá của tầng đang xây được "chốt" lúc tầng bắt đầu (state.floorCost), nên đổi config
// chỉ ảnh hưởng tầng chưa bắt đầu, trừ khi gọi repriceCurrentFloor (admin đã xác nhận).

export interface TowerRules {
  totalFloors: number;
  foundationCost: number;
  baseFloorCost: number;
  tierSize: number;
  tierIncreasePct: number;
  costRoundTo: number;
  stageRatios: number[];
  /** Ghi đè giá từng tầng, ví dụ { "15": 30000 }. */
  floorCostOverrides: Record<string, number>;
}

export interface TowerState {
  floor: number;
  floorPoints: number;
  floorCost: number;
  completed: boolean;
}

export type TowerTransition =
  | { type: 'stage_complete'; floor: number; stage: number }
  | { type: 'floor_complete'; floor: number }
  | { type: 'floor_start'; floor: number; cost: number }
  | { type: 'tower_complete' };

export interface Allocation {
  floor: number;
  points: number;
}

export interface ApplyResult {
  state: TowerState;
  allocations: Allocation[];
  transitions: TowerTransition[];
  /** Điểm không rơi vào tầng nào (tháp đã xong). */
  leftover: number;
}

export function floorCost(floor: number, rules: TowerRules): number {
  const override = rules.floorCostOverrides[String(floor)];
  if (override !== undefined) return override;
  if (floor === 0) return rules.foundationCost;
  const tier = Math.floor((floor - 1) / rules.tierSize);
  const raw = rules.baseFloorCost * Math.pow(1 + rules.tierIncreasePct / 100, tier);
  const step = rules.costRoundTo > 0 ? rules.costRoundTo : 1;
  return Math.max(1, Math.round(raw / step) * step);
}

/** Tổng công cần cho cả tháp (nền móng + mọi tầng). */
export function totalTowerCost(rules: TowerRules): number {
  let sum = 0;
  for (let f = 0; f <= rules.totalFloors; f++) sum += floorCost(f, rules);
  return sum;
}

/** Mốc điểm cộng dồn kết thúc từng giai đoạn. Mốc cuối luôn đúng bằng giá tầng. */
export function stageThresholds(cost: number, ratios: number[]): number[] {
  const sum = ratios.reduce((a, b) => a + b, 0);
  let acc = 0;
  const out = ratios.map((r) => {
    acc += r;
    return Math.round((cost * acc) / sum);
  });
  out[out.length - 1] = cost;
  return out;
}

/** Giai đoạn đang xây (1..số giai đoạn) với số điểm hiện có của tầng. */
export function stageOf(floorPoints: number, cost: number, ratios: number[]): number {
  const th = stageThresholds(cost, ratios);
  for (let i = 0; i < th.length; i++) {
    if (floorPoints < th[i]!) return i + 1;
  }
  return ratios.length;
}

export function percentOf(floorPoints: number, cost: number): number {
  if (cost <= 0) return 0;
  return Math.min(100, Math.floor((floorPoints * 100) / cost));
}

export function initialTowerState(rules: TowerRules): TowerState {
  return { floor: 0, floorPoints: 0, floorCost: floorCost(0, rules), completed: false };
}

/** Cộng điểm vào tháp; điểm dư chuyển sang tầng sau, có thể vượt nhiều tầng một lúc. */
export function applyPoints(state: TowerState, points: number, rules: TowerRules): ApplyResult {
  const s: TowerState = { ...state };
  const allocations: Allocation[] = [];
  const transitions: TowerTransition[] = [];
  let remaining = Math.max(0, Math.floor(points));
  const stages = rules.stageRatios.length;

  while (remaining > 0 && !s.completed) {
    const need = s.floorCost - s.floorPoints;
    const take = Math.min(remaining, need);
    const before = stageOf(s.floorPoints, s.floorCost, rules.stageRatios);
    s.floorPoints += take;
    remaining -= take;
    allocations.push({ floor: s.floor, points: take });

    const done = s.floorPoints >= s.floorCost;
    const after = done ? stages + 1 : stageOf(s.floorPoints, s.floorCost, rules.stageRatios);
    for (let st = before; st < after; st++) {
      transitions.push({ type: 'stage_complete', floor: s.floor, stage: st });
    }
    if (done) advanceFloor(s, rules, transitions);
  }
  return { state: s, allocations, transitions, leftover: remaining };
}

function advanceFloor(s: TowerState, rules: TowerRules, transitions: TowerTransition[]): void {
  transitions.push({ type: 'floor_complete', floor: s.floor });
  if (s.floor >= rules.totalFloors) {
    s.completed = true;
    s.floorPoints = s.floorCost;
    transitions.push({ type: 'tower_complete' });
    return;
  }
  s.floor += 1;
  s.floorPoints = 0;
  s.floorCost = floorCost(s.floor, rules);
  transitions.push({ type: 'floor_start', floor: s.floor, cost: s.floorCost });
}

/**
 * Đổi giá tầng ĐANG xây (14.10, admin đã xác nhận). Tính lại đúng theo điểm:
 * - Giá mới ≤ điểm đã góp: tầng xong ngay, phần dư chuyển sang tầng sau.
 * - Giá mới cao hơn: phần trăm tụt, giai đoạn có thể lùi.
 * Phần dư chuyển tiếp không gắn với người góp nào (allocations vẫn được trả về để ghi nhận tầng).
 */
export function repriceCurrentFloor(state: TowerState, newCost: number, rules: TowerRules): ApplyResult {
  const s: TowerState = { ...state };
  const transitions: TowerTransition[] = [];
  if (s.completed) return { state: s, allocations: [], transitions, leftover: 0 };

  const stages = rules.stageRatios.length;
  const cost = Math.max(1, Math.floor(newCost));
  const before = stageOf(s.floorPoints, s.floorCost, rules.stageRatios);
  s.floorCost = cost;

  if (s.floorPoints >= cost) {
    const overflow = s.floorPoints - cost;
    s.floorPoints = cost;
    for (let st = before; st <= stages; st++) {
      transitions.push({ type: 'stage_complete', floor: s.floor, stage: st });
    }
    advanceFloor(s, rules, transitions);
    const rest = applyPoints(s, overflow, rules);
    return {
      state: rest.state,
      allocations: rest.allocations,
      transitions: [...transitions, ...rest.transitions],
      leftover: rest.leftover,
    };
  }

  const after = stageOf(s.floorPoints, cost, rules.stageRatios);
  for (let st = before; st < after; st++) {
    transitions.push({ type: 'stage_complete', floor: s.floor, stage: st });
  }
  return { state: s, allocations: [], transitions, leftover: 0 };
}
