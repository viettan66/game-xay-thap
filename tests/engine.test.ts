import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigError } from '../server/config/store.js';
import type { GameCore } from '../server/core.js';
import { itemContributorCount, topItem, topSession, topStage, topTotal } from '../server/game/queries.js';
import type { ProjectFile } from '../shared/project.js';
import { vnTs } from '../shared/time.js';
import type { LiveEvent } from '../shared/types.js';
import { disableEvents, FakeClock, makeTempRoot, openTestCore, removeTempRoot, viewer, writeProject } from './helpers.js';

let root: string;
let clock: FakeClock;
let core: GameCore;

const T0 = vnTs(2026, 3, 10, 9, 0); // thứ Ba, ngày thường

const gift = (n: number, coins: number, ts = clock.t, eventId?: string): LiveEvent => ({
  type: 'gift', user: viewer(n), giftId: 'g', giftName: 'G', coinValueEach: coins, count: 1, ts,
  ...(eventId ? { eventId } : {}),
});
const like = (n: number, count: number, ts = clock.t): LiveEvent => ({ type: 'like', user: viewer(n), count, ts });
const comment = (n: number, ts = clock.t): LiveEvent => ({ type: 'comment', user: viewer(n), text: 'xin chào', ts });

function count(sql: string, ...args: unknown[]): number {
  return (core.db.prepare(sql).get(...args) as { n: number }).n;
}

beforeEach(() => {
  root = makeTempRoot();
  disableEvents(root);
  clock = new FakeClock(T0);
  core = openTestCore(root, clock);
});
afterEach(async () => {
  await core.close();
  removeTempRoot(root);
});

describe('bắt đầu', () => {
  it('DB mới bắt đầu ở hạng mục đầu tiên, giai đoạn 1, 0%', () => {
    expect(core.engine.status()).toMatchObject({
      projectName: 'Đại Danh Lam Thiên Phúc',
      item: { id: 'san_nen', name: 'San nền công trường', number: 1, count: 23, size: 'nho' },
      stage: { number: 1, count: 5, name: 'Phát quang, cắm mốc', ritual: 'Lễ khởi công', build: { parts: [], look: 'coc', band: [0, 100] } },
      stagePoints: 0,
      stageCost: 8000,
      percent: 0,
      projectPercent: 0,
      projectCost: 2_660_000,
      completed: false,
      lines: {
        item: 'Hạng mục 1/23 · San nền công trường',
        stage: 'Giai đoạn 1/5: Phát quang, cắm mốc',
        project: 'Toàn công trình 0%',
      },
    });
    expect(core.engine.status().items.slice(0, 2)).toMatchObject([
      { id: 'san_nen', name: 'San nền công trường', area: 'toan_khu', status: 'building' },
      { id: 'be_bo_de', name: 'Bệ cây bồ đề', area: 'san_giua', status: 'todo' },
    ]);
    // Mỗi hạng mục kèm danh sách giai đoạn và cách xây từng mảnh (mục 7).
    expect(core.engine.status().items[0]!.stages[2]).toEqual({
      name: 'Đầm nền',
      cost: 8000,
      build: { parts: ['nen'], look: 'full', band: [0, 50] },
    });
  });
});

describe('ghi nhận sự kiện', () => {
  it('cộng điểm cho người xem theo từng nguồn và ghi nhật ký events', () => {
    core.processEvent(gift(1, 10));
    core.processEvent(like(1, 50));
    core.processEvent(comment(1));
    const u = core.db.prepare('SELECT * FROM users WHERE platform_id = ?').get('p1') as Record<string, number>;
    expect(u.total_points).toBe(1055);
    expect(u.gift_points).toBe(1000);
    expect(u.like_points).toBe(50);
    expect(u.comment_points).toBe(5);
    expect(count('SELECT COUNT(*) AS n FROM events')).toBe(3);
    expect(core.engine.status().totalPoints).toBe(1055);
  });

  it('cập nhật nickname mới nhất nhưng giữ nguyên định danh platformId', () => {
    core.processEvent(like(1, 1));
    core.processEvent({ type: 'like', user: { ...viewer(1), nickname: 'Tên mới' }, count: 1, ts: clock.t });
    expect(count('SELECT COUNT(*) AS n FROM users')).toBe(1);
    expect(topTotal(core.db, 1)[0]).toMatchObject({ platformId: 'p1', nickname: 'Tên mới', points: 2 });
  });

  it('chống trùng: cùng mã sự kiện đến hai lần chỉ tính một lần', () => {
    expect(core.processEvent(gift(1, 10, clock.t, 'tt-123')).status).toBe('counted');
    expect(core.processEvent(gift(1, 10, clock.t, 'tt-123')).status).toBe('duplicate');
    expect(core.engine.status().totalPoints).toBe(1000);
    expect(count('SELECT COUNT(*) AS n FROM events')).toBe(1);
  });

  it('số người xem (viewers) không được ghi thành sự kiện', () => {
    expect(core.processEvent({ type: 'viewers', count: 120, ts: clock.t }).status).toBe('ignored');
    expect(count('SELECT COUNT(*) AS n FROM events')).toBe(0);
  });

  it('lưu hệ số đã áp dụng cho từng sự kiện (14.11)', () => {
    core.engine.setGoldenManualUntil(clock.t + 60_000);
    core.processEvent(like(1, 10));
    const ev = core.db.prepare('SELECT multiplier, base_points, points FROM events').get() as Record<string, number>;
    expect(ev).toEqual({ multiplier: 2, base_points: 10, points: 20 });
  });

  it('nhật ký events ghi hạng mục và giai đoạn đang xây lúc sự kiện đến', () => {
    core.processEvent(gift(1, 100)); // 10.000: xong giai đoạn 1, sang giai đoạn 2
    core.processEvent(like(1, 10));
    expect(core.db.prepare('SELECT item_id, stage_index FROM events ORDER BY id').all()).toEqual([
      { item_id: 'san_nen', stage_index: 0 },
      { item_id: 'san_nen', stage_index: 1 },
    ]);
  });
});

describe('trần ngày và cooldown comment (qua DB)', () => {
  it('trần 2.000/ngày, sang ngày mới (theo giờ Việt Nam) thì tính lại', () => {
    core.processEvent(like(1, 1500));
    core.processEvent(like(1, 1500));
    expect(topTotal(core.db, 1)[0]!.points).toBe(2000);

    clock.t = vnTs(2026, 3, 10, 23, 59);
    expect(core.processEvent(like(1, 10)).score?.points).toBe(0);
    clock.t = vnTs(2026, 3, 11, 0, 0); // nửa đêm giờ Việt Nam = 17:00 UTC
    expect(core.processEvent(like(1, 10)).score?.points).toBe(10);
  });

  it('comment: mỗi người tối đa 1 comment được tính trong 30 giây', () => {
    expect(core.processEvent(comment(1, T0)).score?.points).toBe(5);
    expect(core.processEvent(comment(1, T0 + 10_000)).score?.points).toBe(0);
    expect(core.processEvent(comment(2, T0 + 10_000)).score?.points).toBe(5); // người khác không bị ảnh hưởng
    expect(core.processEvent(comment(1, T0 + 29_999)).score?.points).toBe(0);
    expect(core.processEvent(comment(1, T0 + 30_000)).score?.points).toBe(5);
    expect(count("SELECT COUNT(*) AS n FROM events WHERE type = 'comment'")).toBe(5); // vẫn ghi đủ nhật ký
  });
});

describe('vượt nhiều giai đoạn và hạng mục một lúc (14.4)', () => {
  it('ghi nhận người tặng vào TỪNG giai đoạn và hạng mục theo phần điểm rơi vào đó', () => {
    core.processEvent(gift(1, 50)); // 5.000 vào giai đoạn 1 của San nền (giá 8.000)
    const r = core.processEvent(gift(2, 1000)); // 100.000
    // San nền còn 35.000 → xong; Bệ bồ đề 40.000 → xong; Sân gạch (12.000/giai đoạn): 12.000 + 12.000 + 1.000
    expect(core.engine.status()).toMatchObject({
      item: { id: 'san_gach', number: 3 },
      stage: { number: 3, name: 'Rải cát lót' },
      stagePoints: 1000,
      stageCost: 12_000,
    });
    const done = r.progress!.transitions.flatMap((t) => (t.type === 'item_complete' ? [t.itemId] : []));
    expect(done).toEqual(['san_nen', 'be_bo_de']);

    const stages = core.db
      .prepare("SELECT item_id, stage_index, points FROM stage_contributions WHERE platform_id = 'p2' ORDER BY rowid")
      .all();
    expect(stages).toEqual([
      { item_id: 'san_nen', stage_index: 0, points: 3000 },
      ...[1, 2, 3, 4].map((k) => ({ item_id: 'san_nen', stage_index: k, points: 8000 })),
      ...[0, 1, 2, 3, 4].map((k) => ({ item_id: 'be_bo_de', stage_index: k, points: 8000 })),
      { item_id: 'san_gach', stage_index: 0, points: 12_000 },
      { item_id: 'san_gach', stage_index: 1, points: 12_000 },
      { item_id: 'san_gach', stage_index: 2, points: 1000 },
    ]);
    const items = core.db.prepare("SELECT item_id, points FROM item_contributions WHERE platform_id = 'p2' ORDER BY rowid").all();
    expect(items).toEqual([
      { item_id: 'san_nen', points: 35_000 },
      { item_id: 'be_bo_de', points: 40_000 },
      { item_id: 'san_gach', points: 25_000 },
    ]);
    expect(topItem(core.db, 'san_nen', 10).map((x) => [x.platformId, x.points])).toEqual([
      ['p2', 35_000],
      ['p1', 5000],
    ]);
    expect(itemContributorCount(core.db, 'san_nen')).toBe(2);
  });

  it('bia giai đoạn có lễ: top người góp vào đúng giai đoạn đó', () => {
    core.processEvent(gift(1, 50)); // 5.000 vào "Phát quang, cắm mốc" (Lễ khởi công)
    const r = core.processEvent(gift(2, 40)); // 4.000: 3.000 xong giai đoạn 1, 1.000 sang giai đoạn 2
    expect(r.progress!.transitions[0]).toEqual({ type: 'stage_complete', itemId: 'san_nen', stageIndex: 0, ritual: 'Lễ khởi công' });
    expect(topStage(core.db, 'san_nen', 0, 10).map((x) => [x.platformId, x.points])).toEqual([
      ['p1', 5000],
      ['p2', 3000],
    ]);
    expect(topStage(core.db, 'san_nen', 1, 10).map((x) => [x.platformId, x.points])).toEqual([['p2', 1000]]);
  });

  it('ghi thời điểm bắt đầu và xong của từng hạng mục, từng giai đoạn, kèm giá đã chốt', () => {
    clock.advance(1000);
    core.processEvent(gift(1, 450)); // 45.000: xong San nền, Bệ bồ đề có 5.000
    expect(core.db.prepare('SELECT item_id, stage_count, started_at, completed_at FROM items ORDER BY rowid').all()).toEqual([
      { item_id: 'san_nen', stage_count: 5, started_at: T0, completed_at: T0 + 1000 },
      { item_id: 'be_bo_de', stage_count: 5, started_at: T0 + 1000, completed_at: null },
    ]);
    const st = core.db.prepare('SELECT item_id, stage_index, cost, completed_at FROM stages ORDER BY rowid').all();
    expect(st).toHaveLength(6);
    expect(st[0]).toEqual({ item_id: 'san_nen', stage_index: 0, cost: 8000, completed_at: T0 + 1000 });
    expect(st.at(-1)).toEqual({ item_id: 'be_bo_de', stage_index: 0, cost: 8000, completed_at: null });
  });
});

describe('hòa điểm (14.5)', () => {
  it('bằng điểm thì ai đạt mức điểm đó trước được xếp trên', () => {
    core.processEvent(like(1, 100)); // A đạt 100 trước
    clock.advance(1000);
    core.processEvent(like(2, 60));
    clock.advance(1000);
    core.processEvent(like(2, 40)); // B cũng đạt 100 nhưng sau
    clock.advance(1000);
    core.processEvent(like(3, 150));
    expect(topTotal(core.db, 10).map((r) => r.platformId)).toEqual(['p3', 'p1', 'p2']);
  });

  it('người đạt sau mà vượt lên thì xếp trên', () => {
    core.processEvent(like(1, 100));
    core.processEvent(like(2, 100));
    core.processEvent(like(2, 1));
    expect(topTotal(core.db, 10).map((r) => r.platformId)).toEqual(['p2', 'p1']);
  });

  it('áp dụng cả cho bia hạng mục, bia giai đoạn và top phiên', () => {
    const s = core.sessions.startManual();
    core.processEvent(like(1, 30));
    core.processEvent(like(2, 50));
    core.processEvent(like(1, 20));
    expect(topItem(core.db, 'san_nen', 10).map((r) => r.platformId)).toEqual(['p2', 'p1']);
    expect(topStage(core.db, 'san_nen', 0, 10).map((r) => r.platformId)).toEqual(['p2', 'p1']);
    expect(topSession(core.db, s.id, 10).map((r) => r.platformId)).toEqual(['p2', 'p1']);
  });
});

describe('top phiên', () => {
  it('chỉ tính điểm trong phiên hiện tại', () => {
    const s1 = core.sessions.startManual();
    core.processEvent(like(1, 100));
    core.sessions.endManual();
    const s2 = core.sessions.startManual();
    core.processEvent(like(2, 10));
    expect(topSession(core.db, s1.id, 5).map((r) => r.platformId)).toEqual(['p1']);
    expect(topSession(core.db, s2.id, 5).map((r) => r.platformId)).toEqual(['p2']);
    expect(topTotal(core.db, 5).map((r) => r.platformId)).toEqual(['p1', 'p2']);
  });
});

describe('tắt máy rồi bật lại', () => {
  it('tiếp tục đúng hạng mục, đúng giai đoạn, đúng phần trăm, đúng trần ngày', async () => {
    core.processEvent(gift(1, 450)); // 45.000: xong San nền, Bệ bồ đề có 5.000 ở giai đoạn 1
    core.processEvent(like(2, 1990));
    const before = core.engine.status();
    await core.close();

    core = openTestCore(root, clock);
    expect(core.engine.status()).toEqual(before);
    expect(before).toMatchObject({ item: { id: 'be_bo_de' }, stage: { number: 1 }, stagePoints: 6990, percent: 87 });
    expect(core.processEvent(like(2, 50)).score?.points).toBe(10); // trần ngày vẫn nhớ
  });
});

describe('đổi giá giai đoạn giữa chừng (14.10)', () => {
  const withCost = (id: string, cost: number): ProjectFile => {
    const p = structuredClone(core.configStore.getProject());
    p.items.find((i) => i.id === id)!.cost = cost;
    return p;
  };

  beforeEach(() => {
    core.processEvent(gift(1, 50)); // San nền, giai đoạn 1: 5.000/8.000
  });

  it('chưa xác nhận thì không lưu gì, chỉ báo cần xác nhận', () => {
    const r = core.saveProject(withCost('san_nen', 80_000), { source: 'test' });
    expect(r).toEqual({
      status: 'needs_confirmation',
      reprice: { itemId: 'san_nen', itemName: 'San nền công trường', stageIndex: 0, oldCost: 8000, newCost: 16_000 },
    });
    expect(core.project.items[0]!.cost).toBe(40_000);
  });

  it('không đồng ý đổi giai đoạn đang xây: giai đoạn này giữ giá cũ, giai đoạn sau dùng giá mới', () => {
    const r = core.saveProject(withCost('san_nen', 80_000), { source: 'test', confirmReprice: false });
    expect(r.status).toBe('saved');
    expect(core.engine.status()).toMatchObject({ stageCost: 8000, stagePoints: 5000 });
    core.processEvent(gift(1, 30)); // 3.000: xong giai đoạn 1
    expect(core.engine.status()).toMatchObject({ stage: { number: 2 }, stageCost: 16_000, stagePoints: 0 });
  });

  it('giá cao hơn: phần trăm tính lại theo giá mới', () => {
    core.saveProject(withCost('san_nen', 80_000), { source: 'test', confirmReprice: true });
    expect(core.engine.status()).toMatchObject({ stage: { number: 1 }, stageCost: 16_000, stagePoints: 5000, percent: 31 });
    const st = core.db.prepare("SELECT cost FROM stages WHERE item_id = 'san_nen' AND stage_index = 0").get() as { cost: number };
    expect(st.cost).toBe(16_000);
  });

  it('giá thấp hơn số điểm đã góp: giai đoạn xong ngay, điểm dư sang giai đoạn sau', () => {
    const r = core.saveProject(withCost('san_nen', 20_000), { source: 'test', confirmReprice: true });
    // giá mới mỗi giai đoạn 4.000 → giai đoạn 1 xong, dư 1.000 sang giai đoạn 2
    expect(core.engine.status()).toMatchObject({ stage: { number: 2 }, stageCost: 4000, stagePoints: 1000 });
    expect(r.status === 'saved' && r.progress[0]!.transitions[0]).toMatchObject({ type: 'stage_complete', stageIndex: 0 });
    const ev = core.db.prepare("SELECT note FROM events WHERE type = 'reprice'").get() as { note: string };
    expect(ev.note).toBe('Đổi giá giai đoạn đang xây');
  });

  it('đổi giá hạng mục chưa bắt đầu thì không cần xác nhận; có ghi nhật ký thay đổi', () => {
    const r = core.saveProject(withCost('tam_quan', 200_000), { source: 'admin' });
    expect(r.status).toBe('saved');
    expect(core.project.items[3]!.cost).toBe(200_000);
    const log = core.db.prepare("SELECT file, path, source FROM config_changes WHERE file = 'project.json'").all();
    expect(log).toEqual([{ file: 'project.json', path: 'items', source: 'admin' }]);
  });

  it('đổi tỉ lệ quy đổi không tính lại điểm đã có', () => {
    core.saveConfig({ ...core.config, points: { ...core.config.points, giftPointsPerCoin: 200 } }, { source: 'test' });
    expect(topTotal(core.db, 1)[0]!.points).toBe(5000);
    core.processEvent(gift(1, 1));
    expect(topTotal(core.db, 1)[0]!.points).toBe(5200);
  });
});

describe('sửa danh sách hạng mục khi đã xây (14.10)', () => {
  const edit = (fn: (p: ProjectFile) => void): ProjectFile => {
    const p = structuredClone(core.configStore.getProject());
    fn(p);
    return p;
  };
  const ids = () => core.project.items.map((i) => i.id);

  beforeEach(() => {
    core.processEvent(gift(1, 450)); // xong San nền, đang xây Bệ bồ đề
  });

  it('không được xóa, đổi thứ tự hay đổi số giai đoạn của hạng mục đã bắt đầu', () => {
    const swap = edit((p) => p.items.splice(1, 2, p.items[2]!, p.items[1]!)); // Sân gạch lên trước Bệ bồ đề
    expect(() => core.saveProject(swap, { source: 'test' })).toThrow(/đổi thứ tự hạng mục đã bắt đầu xây: "be_bo_de"/);
    const drop = edit((p) => p.items.shift());
    expect(() => core.saveProject(drop, { source: 'test' })).toThrow(/xóa hạng mục đã bắt đầu xây: "san_nen"/);
    const more = edit((p) => p.items[1]!.stages!.push({ name: 'Thêm', build: { part: 'trangtri', look: 'full' } }));
    expect(() => core.saveProject(more, { source: 'test' })).toThrow(ConfigError);
    expect(ids().slice(0, 3)).toEqual(['san_nen', 'be_bo_de', 'san_gach']);
  });

  it('được đổi thứ tự và chèn hạng mục chưa bắt đầu', () => {
    const next = edit((p) => {
      p.items.splice(3, 2, p.items[4]!, p.items[3]!); // Hồ sen lên trước Tam quan
      p.items.splice(2, 0, { id: 'gieng_nuoc', name: 'Giếng nước', cost: 40_000, size: 'nho', area: 'san_giua', template: 'nho' });
    });
    expect(core.saveProject(next, { source: 'test' }).status).toBe('saved');
    expect(ids().slice(0, 5)).toEqual(['san_nen', 'be_bo_de', 'gieng_nuoc', 'san_gach', 'ho_sen']);
    core.processEvent(gift(1, 350)); // 35.000 = phần còn lại của Bệ bồ đề → sang Giếng nước
    expect(core.engine.status()).toMatchObject({ item: { id: 'gieng_nuoc', number: 3, count: 24 }, stagePoints: 0 });
  });
});

describe('sau khi xong công trình (14.12)', () => {
  const one = { id: 'cong', name: 'Cổng', cost: 10_000, size: 'nho' as const, area: 'cong', template: 'nho' };
  const tiny = (items: ProjectFile['items']): ProjectFile => {
    const p = JSON.parse(fs.readFileSync(path.join(root, 'config', 'defaults', 'project.json'), 'utf8')) as ProjectFile;
    return { ...p, items };
  };

  beforeEach(async () => {
    await core.close();
    fs.rmSync(path.join(root, 'data'), { recursive: true, force: true }); // bắt đầu lại với danh sách 1 hạng mục
    writeProject(root, tiny([one]));
    core = openTestCore(root, clock);
    core.processEvent(gift(1, 300)); // 30.000 > 10.000
  });

  it('sự kiện vẫn được ghi, kèm nhãn "sau khánh thành"', () => {
    expect(core.engine.status()).toMatchObject({
      completed: true,
      percent: 100,
      projectPercent: 100,
      lines: { item: 'Đại Danh Lam Thiên Phúc đã hoàn thành', stage: '', project: 'Toàn công trình 100%' },
    });
    const r = core.processEvent(gift(2, 10));
    expect(r.score?.points).toBe(1000);
    const last = core.db.prepare('SELECT note FROM events ORDER BY id DESC LIMIT 1').get() as { note: string };
    expect(last.note).toBe('sau khánh thành');
    expect(topTotal(core.db, 5).map((x) => x.platformId)).toEqual(['p1', 'p2']);
    expect(topItem(core.db, 'cong', 5).map((x) => [x.platformId, x.points])).toEqual([['p1', 10_000]]);
  });

  it('nối thêm hạng mục (mở rộng chùa): xây tiếp hạng mục mới, dữ liệu cũ giữ nguyên', () => {
    const r = core.saveProject(tiny([one, { ...one, id: 'gac', name: 'Gác' }]), { source: 'admin' });
    expect(r.status === 'saved' && r.progress[0]!.transitions[0]).toEqual({ type: 'item_start', itemId: 'gac' });
    expect(core.engine.status()).toMatchObject({
      completed: false,
      item: { id: 'gac', number: 2, count: 2 },
      stagePoints: 0,
      projectPercent: 50,
    });
    core.processEvent(gift(2, 20)); // 2.000 = đúng giá giai đoạn 1
    expect(core.engine.status()).toMatchObject({ stage: { number: 2 }, stagePoints: 0 });
    expect(topItem(core.db, 'cong', 5).map((x) => x.platformId)).toEqual(['p1']);
  });

  it('sửa tay project.json lúc tắt máy thì bật lại cũng mở hạng mục nối thêm', async () => {
    await core.close();
    writeProject(root, tiny([one, { ...one, id: 'gac', name: 'Gác' }]));
    core = openTestCore(root, clock);
    expect(core.engine.status()).toMatchObject({ completed: false, item: { id: 'gac' } });
  });
});

describe('project.json không khớp với những gì đã xây', () => {
  it('sửa tay xóa mất hạng mục đang xây thì báo lỗi rõ ràng, không tự đoán', async () => {
    core.processEvent(gift(1, 450)); // đang xây Bệ bồ đề
    await core.close();
    const p = JSON.parse(fs.readFileSync(path.join(root, 'config', 'project.json'), 'utf8')) as ProjectFile;
    p.items.splice(1, 1);
    writeProject(root, p);
    expect(() => openTestCore(root, clock)).toThrow(/xóa hạng mục đã bắt đầu xây: "be_bo_de"/);
  });
});

describe('dữ liệu của bản tháp cũ', () => {
  it('DB tháp cũ được đổi tên giữ lại, game bắt đầu dữ liệu mới', async () => {
    await core.close();
    const dataDir = path.join(root, 'data', 'test');
    for (const f of fs.readdirSync(dataDir).filter((f) => f.startsWith('game.db'))) fs.rmSync(path.join(dataDir, f));
    const old = new Database(path.join(dataDir, 'game.db'));
    old.exec('CREATE TABLE floors (floor INTEGER PRIMARY KEY); INSERT INTO floors VALUES (7);');
    old.close();

    core = openTestCore(root, clock);
    expect(core.engine.status()).toMatchObject({ item: { id: 'san_nen' }, totalPoints: 0 });
    const kept = new Database(path.join(dataDir, 'game.thap-cu.db'), { readonly: true });
    expect(kept.prepare('SELECT floor FROM floors').get()).toEqual({ floor: 7 });
    kept.close();
  });
});
