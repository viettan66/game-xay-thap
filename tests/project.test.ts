import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyPoints,
  extendIfNeeded,
  fillTemplate,
  initialProgress,
  progressNumbers,
  projectProblems,
  repriceCurrentStage,
  resolveProject,
  splitCost,
  startedItemProblems,
  type ProjectFile,
} from '../shared/project.js';
import { REPO_ROOT } from './helpers.js';

// Công trình nhỏ để dễ tính tay: Cổng 300 công (3 giai đoạn × 100), Gác 200 công (150 + 50 theo tỉ trọng 3:1).
const SMALL: ProjectFile = {
  name: 'Chùa thử',
  baseUnit: 100,
  costRoundTo: 1,
  stageTemplates: { ba: [{ name: 'A' }, { name: 'B', ritual: 'Lễ B' }, { name: 'C' }] },
  items: [
    { id: 'cong', name: 'Cổng', cost: 300, size: 'nho', area: 'a', template: 'ba' },
    { id: 'gac', name: 'Gác', cost: 200, size: 'vua', area: 'b', stages: [{ name: 'X', weight: 3 }, { name: 'Y', weight: 1 }] },
  ],
};
const small = resolveProject(SMALL);
const start = initialProgress(small);

const defaults = (): ProjectFile =>
  JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'config', 'defaults', 'project.json'), 'utf8')) as ProjectFile;

describe('danh sách hạng mục mặc định (mục 5)', () => {
  const p = resolveProject(defaults());

  it('23 hạng mục theo đúng thứ tự xây, giá theo bội số 20.000', () => {
    expect(projectProblems(defaults())).toEqual([]);
    expect(p.items).toHaveLength(23);
    expect(p.items.map((i) => i.name).slice(0, 4)).toEqual(['San nền công trường', 'Bệ cây bồ đề', 'Sân gạch', 'Cổng tam quan']);
    expect(p.items.slice(14).map((i) => i.name)).toEqual(Array.from({ length: 9 }, (_, k) => `Bảo tháp – Tầng ${k + 1}`));
    expect(p.totalCost).toBe(2_660_000);
    for (const item of p.items) expect(item.cost % 20_000).toBe(0);
  });

  it('số giai đoạn theo mẫu: lớn 16, vừa 10, nhỏ 5, tầng tháp 6 (tầng 1 thêm 2, tầng 9 thêm chóp)', () => {
    const count = (id: string) => p.items.find((i) => i.id === id)!.stages.length;
    expect(count('chinh_dien')).toBe(16);
    expect(count('gac_chuong')).toBe(10);
    expect(count('ho_sen')).toBe(5);
    expect(count('thap_tang_1')).toBe(8);
    expect(count('thap_tang_5')).toBe(6);
    expect(count('thap_tang_9')).toBe(7);
    const t1 = p.items.find((i) => i.id === 'thap_tang_1')!;
    expect(t1.stages.slice(0, 3).map((s) => s.name)).toEqual(['Đắp nền tháp', 'Xây bậc đá', 'Tập kết gạch']);
    expect(p.items.find((i) => i.id === 'thap_tang_9')!.stages.at(-1)).toMatchObject({ name: 'Đặt chóp tháp', ritual: 'Lễ đặt chóp tháp' });
    expect(p.items.reduce((a, i) => a + i.stages.length, 0)).toBe(168);
  });

  it('các giai đoạn có lễ: khởi công, dựng cột, thượng lương', () => {
    const rituals = (id: string) => p.items.find((i) => i.id === id)!.stages.flatMap((s, k) => (s.ritual ? [[k + 1, s.ritual]] : []));
    expect(rituals('chinh_dien')).toEqual([[1, 'Lễ khởi công'], [6, 'Lễ dựng cột'], [8, 'Lễ thượng lương']]);
    expect(rituals('tam_quan')).toEqual([[5, 'Lễ dựng cột'], [6, 'Lễ thượng lương']]);
    expect(rituals('san_nen')).toEqual([[1, 'Lễ khởi công']]);
  });

  it('tổng giá các giai đoạn đúng bằng giá hạng mục, làm tròn tới hàng trăm', () => {
    for (const item of p.items) {
      expect(item.stages.reduce((a, s) => a + s.cost, 0)).toBe(item.cost);
      for (const s of item.stages) expect(s.cost % 100).toBe(0);
    }
    expect(p.items.find((i) => i.id === 'thap_tang_2')!.stages.map((s) => s.cost)).toEqual([13300, 13400, 13300, 13300, 13400, 13300]);
  });
});

describe('chia giá cho các giai đoạn', () => {
  it('chia theo tỉ trọng, tổng luôn đúng', () => {
    expect(splitCost(200, [3, 1], 1)).toEqual([150, 50]);
    expect(splitCost(100, [1, 1, 1], 1)).toEqual([33, 34, 33]);
    expect(splitCost(100, [1, 1, 1], 10)).toEqual([30, 40, 30]);
  });

  it('giá quá nhỏ so với bước làm tròn thì bỏ làm tròn', () => {
    expect(splitCost(5, [1, 1, 1], 100)).toEqual([2, 1, 2]);
  });
});

describe('kiểm tra project.json', () => {
  const withItems = (items: ProjectFile['items']): ProjectFile => ({ ...SMALL, items });

  it('báo lỗi rõ ràng bằng tiếng Việt', () => {
    expect(projectProblems(withItems([SMALL.items[0]!, SMALL.items[0]!]))).toEqual(['Có hai hạng mục trùng id "cong"']);
    expect(projectProblems(withItems([{ ...SMALL.items[0]!, stages: [{ name: 'Z' }] }]))[0]).toMatch(/đúng MỘT trong hai/);
    expect(projectProblems(withItems([{ ...SMALL.items[0]!, template: undefined }]))[0]).toMatch(/đúng MỘT trong hai/);
    expect(projectProblems(withItems([{ ...SMALL.items[0]!, template: 'khong_co' }]))).toEqual([
      'Hạng mục "cong": không có mẫu giai đoạn "khong_co"',
    ]);
    expect(projectProblems(withItems([{ ...SMALL.items[0]!, cost: 2 }]))).toEqual(['Hạng mục "cong": giá 2 quá nhỏ cho 3 giai đoạn']);
    expect(projectProblems(withItems([]))).toEqual(['Danh sách hạng mục (items) đang trống']);
  });
});

describe('cộng điểm (mục 5, 14.4)', () => {
  it('bắt đầu ở hạng mục đầu tiên, giai đoạn đầu tiên', () => {
    expect(start).toEqual({ itemId: 'cong', stageIndex: 0, stagePoints: 0, stageCost: 100, completed: false });
  });

  it('cộng trong một giai đoạn', () => {
    const r = applyPoints(start, 40, small);
    expect(r.state).toMatchObject({ itemId: 'cong', stageIndex: 0, stagePoints: 40 });
    expect(r.allocations).toEqual([{ itemId: 'cong', stageIndex: 0, points: 40 }]);
    expect(r.transitions).toEqual([]);
  });

  it('vượt nhiều giai đoạn và sang hạng mục mới: chia điểm cho TỪNG giai đoạn', () => {
    const r = applyPoints({ ...start, stagePoints: 60 }, 300, small);
    // Cổng: 40 vào A, 100 vào B, 100 vào C → xong; Gác: 60 vào X (giá 150)
    expect(r.state).toEqual({ itemId: 'gac', stageIndex: 0, stagePoints: 60, stageCost: 150, completed: false });
    expect(r.allocations).toEqual([
      { itemId: 'cong', stageIndex: 0, points: 40 },
      { itemId: 'cong', stageIndex: 1, points: 100 },
      { itemId: 'cong', stageIndex: 2, points: 100 },
      { itemId: 'gac', stageIndex: 0, points: 60 },
    ]);
    expect(r.transitions).toEqual([
      { type: 'stage_complete', itemId: 'cong', stageIndex: 0, ritual: null },
      { type: 'stage_start', itemId: 'cong', stageIndex: 1, cost: 100 },
      { type: 'stage_complete', itemId: 'cong', stageIndex: 1, ritual: 'Lễ B' },
      { type: 'stage_start', itemId: 'cong', stageIndex: 2, cost: 100 },
      { type: 'stage_complete', itemId: 'cong', stageIndex: 2, ritual: null },
      { type: 'item_complete', itemId: 'cong', size: 'nho' },
      { type: 'item_start', itemId: 'gac' },
      { type: 'stage_start', itemId: 'gac', stageIndex: 0, cost: 150 },
    ]);
    expect(r.leftover).toBe(0);
  });

  it('đủ điểm đúng bằng giá thì sang ngay giai đoạn sau với 0%', () => {
    expect(applyPoints(start, 100, small).state).toMatchObject({ stageIndex: 1, stagePoints: 0 });
  });

  it('xong hạng mục cuối: hoàn thành công trình, điểm thừa không rơi vào đâu', () => {
    const r = applyPoints(start, 1000, small);
    expect(r.state).toMatchObject({ itemId: 'gac', stageIndex: 1, stagePoints: 50, stageCost: 50, completed: true });
    expect(r.transitions.at(-1)).toEqual({ type: 'project_complete' });
    expect(r.leftover).toBe(500);
    expect(applyPoints(r.state, 10, small)).toMatchObject({ allocations: [], transitions: [], leftover: 10 });
  });

  it('bỏ qua điểm âm hoặc số lẻ', () => {
    expect(applyPoints(start, -5, small).state).toEqual(start);
    expect(applyPoints(start, 10.9, small).state.stagePoints).toBe(10);
  });
});

describe('phần trăm', () => {
  it('giai đoạn, hạng mục, toàn công trình', () => {
    const s = applyPoints(start, 150, small).state; // Cổng: A xong, B 50/100
    expect(progressNumbers(s, small)).toEqual({
      itemNumber: 1,
      itemCount: 2,
      stageCount: 3,
      percent: 50,
      itemPercent: 50,
      projectPercent: 30,
      donePoints: 150,
      projectCost: 500,
    });
  });

  it('xong công trình thì tất cả 100%', () => {
    const s = applyPoints(start, 500, small).state;
    expect(progressNumbers(s, small)).toMatchObject({ itemNumber: 2, percent: 100, itemPercent: 100, projectPercent: 100 });
  });
});

describe('đổi giá giai đoạn đang xây (14.10)', () => {
  const at60 = { ...start, stagePoints: 60 };

  it('giá cao hơn: giữ điểm, phần trăm tụt', () => {
    const r = repriceCurrentStage(at60, 240, small);
    expect(r.state).toMatchObject({ stageIndex: 0, stagePoints: 60, stageCost: 240 });
    expect(progressNumbers(r.state, small).percent).toBe(25);
    expect(r.transitions).toEqual([]);
  });

  it('giá thấp hơn số điểm đã có: xong ngay, điểm dư sang giai đoạn sau', () => {
    const r = repriceCurrentStage(at60, 40, small);
    expect(r.state).toMatchObject({ itemId: 'cong', stageIndex: 1, stagePoints: 20, stageCost: 100 });
    expect(r.transitions[0]).toEqual({ type: 'stage_complete', itemId: 'cong', stageIndex: 0, ritual: null });
    expect(r.allocations).toEqual([{ itemId: 'cong', stageIndex: 1, points: 20 }]);
  });

  it('công trình đã xong thì không đổi gì', () => {
    const done = applyPoints(start, 500, small).state;
    expect(repriceCurrentStage(done, 10, small).state).toEqual(done);
  });
});

describe('nối thêm hạng mục sau khánh thành (14.12)', () => {
  it('mở hạng mục mới nối vào cuối; chưa xong hoặc không có gì mới thì không đổi', () => {
    const done = applyPoints(start, 500, small).state;
    expect(extendIfNeeded(done, small)).toBeNull();
    expect(extendIfNeeded(start, small)).toBeNull();
    const bigger = resolveProject({
      ...SMALL,
      items: [...SMALL.items, { id: 'thap', name: 'Tháp', cost: 90, size: 'lon', area: 'c', template: 'ba' }],
    });
    const r = extendIfNeeded(done, bigger)!;
    expect(r.state).toEqual({ itemId: 'thap', stageIndex: 0, stagePoints: 0, stageCost: 30, completed: false });
    expect(r.transitions).toEqual([
      { type: 'item_start', itemId: 'thap' },
      { type: 'stage_start', itemId: 'thap', stageIndex: 0, cost: 30 },
    ]);
    expect(progressNumbers(r.state, bigger)).toMatchObject({ itemNumber: 3, projectPercent: 84 });
  });
});

describe('sửa danh sách khi đã xây (14.10)', () => {
  const counts = new Map([['cong', 3], ['gac', 2]]);
  const reorder = (ids: string[]) =>
    resolveProject({ ...SMALL, items: ids.map((id) => [...SMALL.items, { id: 'moi', name: 'Mới', cost: 30, size: 'nho' as const, area: 'z', template: 'ba' }].find((i) => i.id === id)!) });

  it('được đổi thứ tự, chèn hạng mục CHƯA bắt đầu', () => {
    expect(startedItemProblems(['cong'], counts, reorder(['cong', 'moi', 'gac']))).toEqual([]);
    expect(startedItemProblems(['cong'], counts, reorder(['cong', 'gac', 'moi']))).toEqual([]);
  });

  it('không được xóa, đổi thứ tự, đổi số giai đoạn của hạng mục đã bắt đầu', () => {
    expect(startedItemProblems(['cong', 'gac'], counts, reorder(['gac', 'cong']))).toEqual([
      'Không được đổi thứ tự hạng mục đã bắt đầu xây: "cong" phải ở vị trí 1',
      'Không được đổi thứ tự hạng mục đã bắt đầu xây: "gac" phải ở vị trí 2',
    ]);
    expect(startedItemProblems(['cong', 'gac'], counts, reorder(['cong']))).toEqual(['Không được xóa hạng mục đã bắt đầu xây: "gac"']);
    expect(startedItemProblems(['cong'], counts, reorder(['moi', 'cong']))[0]).toMatch(/"cong" phải ở vị trí 1/);
    const fewer = resolveProject({ ...SMALL, stageTemplates: { ba: [{ name: 'A' }, { name: 'B' }] } });
    expect(startedItemProblems(['cong'], counts, fewer)).toEqual([
      'Không được đổi số giai đoạn của hạng mục đã bắt đầu xây: "cong" đang có 3 giai đoạn',
    ]);
  });
});

describe('mẫu chữ', () => {
  it('điền biến, biến lạ thì giữ nguyên', () => {
    expect(fillTemplate('Hạng mục {number}/{count} · {item}', { number: 7, count: 23, item: 'Gác chuông' })).toBe(
      'Hạng mục 7/23 · Gác chuông',
    );
    expect(fillTemplate('{a} {b}', { a: 1 })).toBe('1 {b}');
  });
});
