import { describe, expect, it } from 'vitest';
import {
  applyPoints,
  floorCost,
  initialTowerState,
  percentOf,
  repriceCurrentFloor,
  stageOf,
  stageThresholds,
  totalTowerCost,
  type TowerRules,
} from '../shared/tower.js';

const rules: TowerRules = {
  totalFloors: 100,
  foundationCost: 10_000,
  baseFloorCost: 20_000,
  tierSize: 10,
  tierIncreasePct: 25,
  costRoundTo: 100,
  stageRatios: [20, 20, 20, 20, 20],
  floorCostOverrides: {},
};

describe('giá tầng (mục 5)', () => {
  it('tầng 0 là nền móng, tầng 1–10 giá gốc, mỗi nhóm 10 tầng tăng 25%', () => {
    expect(floorCost(0, rules)).toBe(10_000);
    expect(floorCost(1, rules)).toBe(20_000);
    expect(floorCost(10, rules)).toBe(20_000);
    expect(floorCost(11, rules)).toBe(25_000);
    expect(floorCost(21, rules)).toBe(31_300); // 31.250 làm tròn hàng trăm
    expect(floorCost(31, rules)).toBe(39_100); // 39.062,5
    expect(floorCost(100, rules)).toBe(149_000);
  });

  it('ghi đè giá từng tầng', () => {
    expect(floorCost(15, { ...rules, floorCostOverrides: { '15': 12_345 } })).toBe(12_345);
  });

  it('tổng cả tháp khoảng 6,66 triệu công', () => {
    expect(totalTowerCost(rules)).toBe(6_661_000);
  });
});

describe('chuyển giai đoạn', () => {
  it('5 giai đoạn đều 20%', () => {
    expect(stageThresholds(20_000, rules.stageRatios)).toEqual([4000, 8000, 12000, 16000, 20000]);
    expect(stageOf(0, 20_000, rules.stageRatios)).toBe(1);
    expect(stageOf(3999, 20_000, rules.stageRatios)).toBe(1);
    expect(stageOf(4000, 20_000, rules.stageRatios)).toBe(2);
    expect(stageOf(19_999, 20_000, rules.stageRatios)).toBe(5);
  });

  it('tỉ lệ không đều', () => {
    expect(stageThresholds(1000, [10, 20, 30, 20, 20])).toEqual([100, 300, 600, 800, 1000]);
  });

  it('báo từng giai đoạn vừa xong', () => {
    const r = applyPoints({ floor: 1, floorPoints: 3000, floorCost: 20_000, completed: false }, 6000, rules);
    expect(r.state.floorPoints).toBe(9000);
    expect(r.transitions).toEqual([
      { type: 'stage_complete', floor: 1, stage: 1 },
      { type: 'stage_complete', floor: 1, stage: 2 },
    ]);
  });

  it('phần trăm làm tròn xuống', () => {
    expect(percentOf(1999, 20_000)).toBe(9);
    expect(percentOf(20_000, 20_000)).toBe(100);
  });
});

describe('chuyển tầng và điểm dư', () => {
  it('xong nền móng thì sang tầng 1, điểm dư chuyển tiếp', () => {
    const r = applyPoints(initialTowerState(rules), 12_500, rules);
    expect(r.state).toEqual({ floor: 1, floorPoints: 2500, floorCost: 20_000, completed: false });
    expect(r.allocations).toEqual([
      { floor: 0, points: 10_000 },
      { floor: 1, points: 2500 },
    ]);
    expect(r.transitions).toContainEqual({ type: 'floor_complete', floor: 0 });
    expect(r.transitions).toContainEqual({ type: 'floor_start', floor: 1, cost: 20_000 });
  });

  it('vừa đủ giá tầng thì sang tầng mới với 0 điểm', () => {
    const r = applyPoints({ floor: 1, floorPoints: 15_000, floorCost: 20_000, completed: false }, 5000, rules);
    expect(r.state).toEqual({ floor: 2, floorPoints: 0, floorCost: 20_000, completed: false });
  });

  it('vượt nhiều tầng một lúc, chia điểm đúng từng tầng (14.4)', () => {
    const r = applyPoints({ floor: 9, floorPoints: 19_000, floorCost: 20_000, completed: false }, 60_000, rules);
    // tầng 9 cần 1.000, tầng 10 cần 20.000, tầng 11 cần 25.000, còn 14.000 vào tầng 12
    expect(r.allocations).toEqual([
      { floor: 9, points: 1000 },
      { floor: 10, points: 20_000 },
      { floor: 11, points: 25_000 },
      { floor: 12, points: 14_000 },
    ]);
    expect(r.state).toEqual({ floor: 12, floorPoints: 14_000, floorCost: 25_000, completed: false });
    const completed = r.transitions.filter((t) => t.type === 'floor_complete').map((t) => t.floor);
    expect(completed).toEqual([9, 10, 11]);
    const sum = r.allocations.reduce((a, b) => a + b.points, 0);
    expect(sum).toBe(60_000);
  });

  it('xong tầng cuối thì tháp hoàn thành, điểm thừa không vào tầng nào', () => {
    const small: TowerRules = { ...rules, totalFloors: 2 };
    const r = applyPoints({ floor: 2, floorPoints: 19_000, floorCost: 20_000, completed: false }, 5000, small);
    expect(r.state.completed).toBe(true);
    expect(r.leftover).toBe(4000);
    expect(r.transitions.at(-1)).toEqual({ type: 'tower_complete' });
    const again = applyPoints(r.state, 1000, small);
    expect(again.allocations).toEqual([]);
    expect(again.leftover).toBe(1000);
  });

  it('tầng mới dùng giá theo config hiện tại; tầng đang xây giữ giá đã chốt', () => {
    const state = { floor: 1, floorPoints: 0, floorCost: 20_000, completed: false };
    const pricier = { ...rules, baseFloorCost: 30_000 };
    const r = applyPoints(state, 25_000, pricier);
    expect(r.allocations[0]).toEqual({ floor: 1, points: 20_000 });
    expect(r.state.floorCost).toBe(30_000);
  });
});

describe('đổi giá tầng đang xây (14.10)', () => {
  it('giá mới cao hơn: phần trăm tụt, giai đoạn lùi', () => {
    const r = repriceCurrentFloor({ floor: 1, floorPoints: 9000, floorCost: 20_000, completed: false }, 40_000, rules);
    expect(stageOf(9000, 20_000, rules.stageRatios)).toBe(3);
    expect(r.state).toEqual({ floor: 1, floorPoints: 9000, floorCost: 40_000, completed: false });
    expect(stageOf(r.state.floorPoints, r.state.floorCost, rules.stageRatios)).toBe(2);
    expect(r.transitions).toEqual([]);
  });

  it('giá mới thấp hơn nhưng chưa đủ: giai đoạn tiến lên', () => {
    const r = repriceCurrentFloor({ floor: 1, floorPoints: 9000, floorCost: 20_000, completed: false }, 10_000, rules);
    expect(r.state.floorCost).toBe(10_000);
    expect(r.transitions).toEqual([
      { type: 'stage_complete', floor: 1, stage: 3 },
      { type: 'stage_complete', floor: 1, stage: 4 },
    ]);
  });

  it('giá mới thấp hơn số điểm đã góp: tầng xong ngay, điểm dư sang tầng sau', () => {
    const r = repriceCurrentFloor({ floor: 1, floorPoints: 15_000, floorCost: 20_000, completed: false }, 12_000, rules);
    expect(r.transitions).toContainEqual({ type: 'floor_complete', floor: 1 });
    expect(r.state).toEqual({ floor: 2, floorPoints: 3000, floorCost: 20_000, completed: false });
    expect(r.allocations).toEqual([{ floor: 2, points: 3000 }]);
  });
});
