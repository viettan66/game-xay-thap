// Chế độ theo độ đông của phòng (mục 9A): hai chỉ số, độ trễ chuyển, đổi ngay khi dồn dập, ép tay.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GameCore } from '../server/core.js';
import { CrowdTracker, tierOf, type CrowdRules } from '../server/game/crowd.js';
import type { LiveEvent } from '../shared/types.js';
import { vnTs } from '../shared/time.js';
import { FakeClock, makeTempRoot, openTestCore, removeTempRoot } from './helpers.js';

const rules: CrowdRules = { viewers: [5, 50, 300], interactors: [3, 30, 150], windowSec: 300, hysteresisSec: 120, burstEvents: 100, burstWindowSec: 10 };
const user = (n: number) => ({ platformId: `u${n}`, uniqueId: `u${n}`, nickname: `U${n}` });
const like = (n: number, ts: number): LiveEvent => ({ type: 'like', user: user(n), count: 1, ts });
const viewers = (count: number, ts: number): LiveEvent => ({ type: 'viewers', count, ts });

describe('mức theo ngưỡng', () => {
  it('ngưỡng mặc định của SPEC', () => {
    expect([0, 5, 6, 50, 51, 300, 301].map((n) => tierOf(n, rules.viewers))).toEqual(['vang', 'vang', 'vua', 'vua', 'dong', 'dong', 'ratdong']);
    expect([3, 4, 30, 31, 150, 151].map((n) => tierOf(n, rules.interactors))).toEqual(['vang', 'vua', 'vua', 'dong', 'dong', 'ratdong']);
  });
});

describe('theo dõi độ đông', () => {
  let t: number;
  let c: CrowdTracker;
  beforeEach(() => {
    t = 1_000_000;
    c = new CrowdTracker(() => rules);
  });
  const step = (sec: number) => {
    t += sec * 1000;
    c.update(t);
  };

  it('lần đầu lấy ngay mức tính được; lấy mức cao hơn trong hai chỉ số', () => {
    c.observe(viewers(20, t), t);
    c.observe(like(1, t), t);
    c.update(t);
    expect(c.info(t)).toMatchObject({ tier: 'vua', viewers: 20, interactors: 1 });
  });

  it('không có số người xem thì chỉ dùng số người tương tác', () => {
    for (let i = 0; i < 40; i++) c.observe(like(i, t), t);
    c.update(t);
    expect(c.tier).toBe('dong');
    expect(c.info(t).viewers).toBeNull();
  });

  it('phải ở mức mới liên tục 120 giây mới đổi', () => {
    c.observe(viewers(2, t), t);
    c.update(t);
    expect(c.tier).toBe('vang');
    c.observe(viewers(80, t), t);
    c.update(t);
    step(60);
    expect(c.tier).toBe('vang');
    c.observe(viewers(80, t), t);
    step(61);
    expect(c.tier).toBe('dong');
  });

  it('dao động qua lại thì không đổi', () => {
    c.observe(viewers(2, t), t);
    c.update(t);
    for (let k = 0; k < 10; k++) {
      c.observe(viewers(k % 2 ? 2 : 80, t), t);
      step(50);
    }
    expect(c.tier).toBe('vang');
  });

  it('đợt dồn dập (quá 100 sự kiện/10 giây) thì lên mức ngay', () => {
    c.observe(viewers(2, t), t);
    c.update(t);
    for (let i = 0; i < 160; i++) c.observe(like(i, t), t);
    c.update(t);
    expect(c.tier).toBe('ratdong');
  });

  it('người tương tác quá 5 phút thì không tính nữa', () => {
    for (let i = 0; i < 40; i++) c.observe(like(i, t), t);
    c.update(t);
    expect(c.tier).toBe('dong');
    step(301);
    expect(c.info(t).interactors).toBe(0);
    step(121);
    expect(c.tier).toBe('vang');
  });

  it('ép tay thì dùng mức ép, bỏ ép thì về mức tự tính', () => {
    c.update(t);
    c.forced = 'ratdong';
    expect(c.tier).toBe('ratdong');
    c.forced = null;
    expect(c.tier).toBe('vang');
  });
});

describe('độ đông trong lõi game', () => {
  let root: string;
  let core: GameCore;
  const clock = new FakeClock(vnTs(2026, 3, 10, 20));
  beforeEach(() => {
    root = makeTempRoot();
    core = openTestCore(root, clock);
  });
  afterEach(async () => {
    await core.close();
    removeTempRoot(root);
  });

  it('sự kiện đi qua lõi được tính; ép tay lưu vào DB, mở lại vẫn giữ', async () => {
    for (let i = 0; i < 40; i++) core.processEvent({ type: 'comment', user: user(i), text: 'hi', ts: clock.now() });
    // 40 người tương tác (không dồn dập): chờ đủ 120 giây mới lên "đông".
    expect(core.crowd.tier).toBe('vang');
    clock.advance(121_000);
    core.tick();
    expect(core.crowd.tier).toBe('dong');
    const seen: string[] = [];
    core.bus.on('crowd', (tier: string) => seen.push(tier));
    core.setCrowdForced('vang');
    expect(core.crowd.tier).toBe('vang');
    expect(seen).toEqual(['vang']);
    await core.close();
    core = openTestCore(root, clock);
    expect(core.crowd.forced).toBe('vang');
  });
});
