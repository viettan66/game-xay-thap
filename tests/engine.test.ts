import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GameCore } from '../server/core.js';
import { floorContributorCount, topFloor, topSession, topTotal } from '../server/game/queries.js';
import { vnTs } from '../shared/time.js';
import type { LiveEvent } from '../shared/types.js';
import { disableEvents, FakeClock, makeTempRoot, openTestCore, removeTempRoot, viewer } from './helpers.js';

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
  it('DB mới bắt đầu ở nền móng, giai đoạn 1, 0%', () => {
    expect(core.engine.status()).toMatchObject({
      floor: 0, floorName: 'Nền móng', stage: 1, stageName: 'Dọn mặt bằng', floorPoints: 0, floorCost: 10_000, percent: 0,
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

describe('vượt nhiều tầng một lúc (14.4)', () => {
  it('ghi nhận người tặng vào TỪNG tầng theo phần điểm rơi vào tầng đó', () => {
    core.processEvent(gift(1, 50)); // 5.000 vào nền móng
    core.processEvent(gift(2, 700)); // 70.000: 5.000 nền móng + 20.000 × 3 tầng + 5.000 tầng 4
    const s = core.engine.status();
    expect(s).toMatchObject({ floor: 4, floorPoints: 5000, floorCost: 20_000, stage: 2 });

    const contrib = core.db
      .prepare("SELECT floor, points FROM floor_contributions WHERE platform_id = 'p2' ORDER BY floor")
      .all();
    expect(contrib).toEqual([
      { floor: 0, points: 5000 },
      { floor: 1, points: 20_000 },
      { floor: 2, points: 20_000 },
      { floor: 3, points: 20_000 },
      { floor: 4, points: 5000 },
    ]);
    expect(topFloor(core.db, 0, 10).map((r) => [r.platformId, r.points])).toEqual([
      ['p1', 5000],
      ['p2', 5000],
    ]);
    expect(floorContributorCount(core.db, 0)).toBe(2);
  });

  it('ghi thời điểm bắt đầu và xong của từng tầng, kèm giá đã chốt', () => {
    core.processEvent(gift(1, 300)); // 30.000: xong nền móng + tầng 1
    const floors = core.db.prepare('SELECT floor, cost, completed_at FROM floors ORDER BY floor').all();
    expect(floors).toEqual([
      { floor: 0, cost: 10_000, completed_at: T0 },
      { floor: 1, cost: 20_000, completed_at: T0 },
      { floor: 2, cost: 20_000, completed_at: null },
    ]);
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

  it('áp dụng cả cho bia tầng và top phiên', () => {
    const s = core.sessions.startManual();
    core.processEvent(like(1, 30));
    core.processEvent(like(2, 50));
    core.processEvent(like(1, 20));
    expect(topFloor(core.db, 0, 10).map((r) => r.platformId)).toEqual(['p2', 'p1']);
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
  it('tiếp tục đúng tầng, đúng giai đoạn, đúng phần trăm, đúng trần ngày', async () => {
    core.processEvent(gift(1, 230)); // 23.000: xong nền móng, tầng 1 có 13.000 (giai đoạn 4)
    core.processEvent(like(2, 1990));
    const before = core.engine.status();
    await core.close();

    core = openTestCore(root, clock);
    expect(core.engine.status()).toEqual(before);
    expect(before).toMatchObject({ floor: 1, floorPoints: 14_990, stage: 4, percent: 74 });
    expect(core.processEvent(like(2, 50)).score?.points).toBe(10); // trần ngày vẫn nhớ
  });
});

describe('đổi giá tầng giữa chừng (14.10)', () => {
  const withBase = (base: number) => ({ ...core.config, tower: { ...core.config.tower, baseFloorCost: base } });

  beforeEach(() => {
    core.processEvent(gift(1, 190)); // xong nền móng, tầng 1 có 9.000/20.000 (giai đoạn 3)
  });

  it('chưa xác nhận thì không lưu gì, chỉ báo cần xác nhận', () => {
    const r = core.saveConfig(withBase(30_000), { source: 'test' });
    expect(r).toEqual({ status: 'needs_confirmation', reprice: { floor: 1, oldCost: 20_000, newCost: 30_000 } });
    expect(core.config.tower.baseFloorCost).toBe(20_000);
  });

  it('không đồng ý đổi tầng đang xây: tầng này giữ giá cũ, tầng sau dùng giá mới', () => {
    const r = core.saveConfig(withBase(30_000), { source: 'test', confirmReprice: false });
    expect(r.status).toBe('saved');
    expect(core.engine.status()).toMatchObject({ floor: 1, floorCost: 20_000, floorPoints: 9000 });
    core.processEvent(gift(1, 110)); // 11.000: xong tầng 1, sang tầng 2
    expect(core.engine.status()).toMatchObject({ floor: 2, floorCost: 30_000, floorPoints: 0 });
  });

  it('giá cao hơn: phần trăm tính lại, giai đoạn lùi', () => {
    core.saveConfig(withBase(40_000), { source: 'test', confirmReprice: true });
    expect(core.engine.status()).toMatchObject({ floor: 1, floorCost: 40_000, floorPoints: 9000, stage: 2, percent: 22 });
    const f = core.db.prepare('SELECT cost FROM floors WHERE floor = 1').get() as { cost: number };
    expect(f.cost).toBe(40_000);
  });

  it('giá thấp hơn số điểm đã góp: tầng xong ngay, điểm dư sang tầng sau', () => {
    core.saveConfig(withBase(6000), { source: 'test', confirmReprice: true });
    // tầng 1 giá mới 6.000 → xong, dư 3.000 sang tầng 2 (giá 6.000)
    expect(core.engine.status()).toMatchObject({ floor: 2, floorCost: 6000, floorPoints: 3000 });
    const ev = core.db.prepare("SELECT note FROM events WHERE type = 'reprice'").get() as { note: string };
    expect(ev.note).toBe('Đổi giá tầng đang xây');
  });

  it('đổi tỉ lệ quy đổi không tính lại điểm đã có', () => {
    core.saveConfig({ ...core.config, points: { ...core.config.points, giftPointsPerCoin: 200 } }, { source: 'test' });
    expect(topTotal(core.db, 1)[0]!.points).toBe(19_000);
    core.processEvent(gift(1, 1));
    expect(topTotal(core.db, 1)[0]!.points).toBe(19_200);
  });
});

describe('sau khi xong tháp (14.12)', () => {
  it('sự kiện vẫn được ghi, kèm nhãn "sau khánh thành"', async () => {
    await core.close();
    core = openTestCore(root, clock, (c) => {
      c.tower.totalFloors = 1;
    });
    core.processEvent(gift(1, 300)); // 30.000 = nền móng + tầng 1
    expect(core.engine.status()).toMatchObject({ completed: true, percent: 100 });
    const r = core.processEvent(gift(2, 10));
    expect(r.score?.points).toBe(1000);
    const last = core.db.prepare('SELECT note FROM events ORDER BY id DESC LIMIT 1').get() as { note: string };
    expect(last.note).toBe('sau khánh thành');
    expect(topTotal(core.db, 5).map((x) => x.platformId)).toEqual(['p1', 'p2']);
  });
});
