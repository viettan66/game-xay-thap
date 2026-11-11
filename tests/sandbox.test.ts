// Lõi thuần của trang thử xây /tools/build (R3c): chỗ bắt đầu, quy nút bấm ra công, cộng điểm tràn, đo FPS.

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveProject, type ProjectFile } from '../shared/project.js';
import { progressView } from '../shared/progressView.js';
import { DEFAULT_COINS, FpsMeter, pickAuto, Sandbox, stateAt, trialPoints } from '../overlay/src/tools/sandbox.js';

const REPO = path.resolve(import.meta.dirname, '..');
const readJson = <T>(f: string) => JSON.parse(fs.readFileSync(path.join(REPO, 'config', 'defaults', f), 'utf8')) as T;
const project = resolveProject(readJson<ProjectFile>('project.json'));
const config = readJson<{ points: Parameters<typeof trialPoints>[2]; labels: { progress: Parameters<typeof progressView>[2] } }>('config.json');
const rules = config.points;
const labels = config.labels.progress;
const gac = project.items.find((i) => i.id === 'gac_chuong')!;

describe('chỗ bắt đầu', () => {
  it('đứng đầu giai đoạn đã chọn, giá đúng giai đoạn đó', () => {
    expect(stateAt(project, 'gac_chuong', 3)).toEqual({ itemId: 'gac_chuong', stageIndex: 3, stagePoints: 0, stageCost: gac.stages[3]!.cost, completed: false });
  });

  it('giai đoạn vượt quá thì lấy giai đoạn cuối; hạng mục lạ thì lấy hạng mục đầu', () => {
    expect(stateAt(project, 'gac_chuong', 99).stageIndex).toBe(gac.stages.length - 1);
    expect(stateAt(project, 'gac_chuong', -2).stageIndex).toBe(0);
    expect(stateAt(project, 'khong_co', 0).itemId).toBe(project.items[0]!.id);
  });

  it('các hạng mục trước coi như xong, hạng mục sau chưa xây', () => {
    const v = new Sandbox(project, labels, 'gac_chuong', 2).view();
    const idx = project.items.indexOf(gac);
    expect(v.items.slice(0, idx).every((i) => i.status === 'done')).toBe(true);
    expect(v.items[idx]!.status).toBe('building');
    expect(v.items.slice(idx + 1).every((i) => i.status === 'todo')).toBe(true);
    expect(v.stage.number).toBe(3);
    expect(v.stagePoints).toBe(0);
  });
});

describe('nút bấm ra công', () => {
  it('tính đúng như game: 10 tim, quà theo số xu', () => {
    expect(trialPoints('like10', 0, rules)).toEqual({ source: 'like', points: 10 * rules.likePoints });
    expect(trialPoints('small', DEFAULT_COINS.small, rules)).toEqual({ source: 'gift', points: DEFAULT_COINS.small * rules.giftPointsPerCoin });
    expect(trialPoints('huge', 5000, rules).points).toBe(5000 * rules.giftPointsPerCoin);
  });

  it('quà nhỏ < quà lớn < quà cực lớn', () => {
    const p = (a: 'small' | 'large' | 'huge') => trialPoints(a, DEFAULT_COINS[a], rules).points;
    expect(p('small')).toBeLessThan(p('large'));
    expect(p('large')).toBeLessThan(p('huge'));
  });

  it('bắn liên tục: phần lớn là tim, không có quà cực lớn', () => {
    expect(pickAuto(0)).toBe('like10');
    expect(pickAuto(0.7)).toBe('small');
    expect(pickAuto(0.99)).toBe('large');
  });
});

describe('xây thử', () => {
  it('góp công trả về tin "contribution" như server gửi, tiến độ tăng', () => {
    const sb = new Sandbox(project, labels, 'gac_chuong', 0);
    const c = sb.give('Khách thử', 'like', 10)!;
    expect(c).toEqual({
      type: 'contribution',
      name: 'Khách thử',
      source: 'like',
      points: 10,
      allocations: [{ itemId: 'gac_chuong', stageIndex: 0, points: 10, from: 0, cost: gac.stages[0]!.cost }],
    });
    expect(sb.view().stagePoints).toBe(10);
    expect(sb.view().totalPoints).toBe(10);
  });

  it('quà lớn vượt nhiều giai đoạn, sang hạng mục sau: chia công cho từng giai đoạn (14.4)', () => {
    const sb = new Sandbox(project, labels, 'gac_chuong', 0);
    const c = sb.give('Khách thử', 'gift', gac.cost + 5)!;
    expect(c.allocations.filter((a) => a.itemId === 'gac_chuong')).toHaveLength(gac.stages.length);
    expect(c.allocations.reduce((s, a) => s + a.points, 0)).toBe(gac.cost + 5);
    const next = project.items[project.items.indexOf(gac) + 1]!;
    expect(sb.progress).toMatchObject({ itemId: next.id, stageIndex: 0, stagePoints: 5 });
  });

  it('chọn lại chỗ bắt đầu thì xây lại từ đầu giai đoạn đó', () => {
    const sb = new Sandbox(project, labels, 'gac_chuong', 0);
    sb.give('Khách thử', 'gift', 50_000);
    sb.select('gac_chuong', 1);
    expect(sb.progress).toMatchObject({ itemId: 'gac_chuong', stageIndex: 1, stagePoints: 0 });
  });

  it('công trình đã xong hết thì không còn chỗ xây', () => {
    const last = project.items.at(-1)!;
    const sb = new Sandbox(project, labels, last.id, last.stages.length - 1);
    sb.give('Khách thử', 'gift', last.stages.at(-1)!.cost);
    expect(sb.view().completed).toBe(true);
    expect(sb.give('Khách thử', 'gift', 100)!.allocations).toEqual([]);
    expect(sb.give('Khách thử', 'gift', 0)).toBeNull();
  });
});

describe('đo FPS', () => {
  it('60 khung mỗi giây ra khoảng 60', () => {
    const m = new FpsMeter();
    for (let i = 0; i <= 180; i++) m.frame(i * (1000 / 60));
    expect(m.fps).toBeCloseTo(60, 0);
    expect(m.low).toBeCloseTo(60, 0);
  });

  it('một giây bị giật thì mức thấp nhất giữ lại 10 giây', () => {
    const m = new FpsMeter();
    let t = 0;
    for (let i = 0; i < 120; i++) m.frame((t += 1000 / 60));
    for (let i = 0; i < 40; i++) m.frame((t += 1000 / 20));
    for (let i = 0; i < 120; i++) m.frame((t += 1000 / 60));
    expect(m.fps).toBeCloseTo(60, 0);
    expect(m.low).toBeLessThan(30);
    for (let i = 0; i < 60 * 11; i++) m.frame((t += 1000 / 60));
    expect(m.low).toBeCloseTo(60, 0);
  });
});
