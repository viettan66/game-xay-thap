import { describe, expect, it } from 'vitest';
import { roundHalfUp, scoreEvent, type PointRules, type UserPointState } from '../shared/points.js';
import type { LiveEvent } from '../shared/types.js';

const rules: PointRules = {
  giftPointsPerCoin: 100,
  likePoints: 1,
  commentPoints: 5,
  commentCooldownSec: 30,
  dailyLikeCommentCap: 2000,
};
const fresh: UserPointState = { capUsedToday: 0, lastCommentCountedAt: null };
const user = { platformId: 'p1', uniqueId: 'u1', nickname: 'A' };
const gift = (coin: number, count: number): LiveEvent => ({
  type: 'gift', user, giftId: 'g', giftName: 'G', coinValueEach: coin, count, ts: 0,
});
const like = (count: number): LiveEvent => ({ type: 'like', user, count, ts: 0 });
const comment = (ts: number): LiveEvent => ({ type: 'comment', user, text: 'hi', ts });

describe('tính điểm (mục 4)', () => {
  it('quà = xu mỗi món × số lượng × 100', () => {
    expect(scoreEvent(gift(1, 5), fresh, rules, 1).points).toBe(500);
    expect(scoreEvent(gift(100, 3), fresh, rules, 1).points).toBe(30_000);
  });

  it('1 tim = 1 công, cộng theo số lượng thực của lô', () => {
    const r = scoreEvent(like(37), fresh, rules, 1);
    expect(r.points).toBe(37);
    expect(r.capUsedDelta).toBe(37);
  });

  it('1 comment = 5 công', () => {
    const r = scoreEvent(comment(0), fresh, rules, 1);
    expect(r.points).toBe(5);
    expect(r.commentCounted).toBe(true);
  });

  it('vào phòng không có công', () => {
    expect(scoreEvent({ type: 'join', user, ts: 0 }, fresh, rules, 1).points).toBe(0);
  });

  it('giá trị bất thường (âm, lẻ) không gây cộng sai', () => {
    expect(scoreEvent(gift(-5, 3), fresh, rules, 1).points).toBe(0);
    expect(scoreEvent(like(2.7), fresh, rules, 1).points).toBe(2);
  });
});

describe('hệ số nhân và làm tròn', () => {
  it('hệ số áp dụng cho quà, tim và comment', () => {
    expect(scoreEvent(gift(1, 1), fresh, rules, 2).points).toBe(200);
    expect(scoreEvent(like(10), fresh, rules, 2).points).toBe(20);
    expect(scoreEvent(comment(0), fresh, rules, 2).points).toBe(10);
  });

  it('làm tròn từ 0,5 trở lên: 1 tim × 1,5 = 2; 3 tim × 1,5 = 5', () => {
    expect(scoreEvent(like(1), fresh, rules, 1.5).points).toBe(2);
    expect(scoreEvent(like(3), fresh, rules, 1.5).points).toBe(5);
    expect(roundHalfUp(0.49)).toBe(0);
    expect(roundHalfUp(2.5)).toBe(3);
    expect(roundHalfUp(16.500000000000004)).toBe(17);
  });
});

describe('trần tim + comment mỗi ngày', () => {
  it('chỉ tính phần còn lại khi chạm trần', () => {
    const r = scoreEvent(like(500), { capUsedToday: 1800, lastCommentCountedAt: null }, rules, 1);
    expect(r.basePoints).toBe(200);
    expect(r.points).toBe(200);
    expect(r.capUsedDelta).toBe(200);
  });

  it('đã đủ trần thì không tính nữa', () => {
    const r = scoreEvent(like(10), { capUsedToday: 2000, lastCommentCountedAt: null }, rules, 1);
    expect(r.points).toBe(0);
    expect(r.skipped).toBe('daily_cap');
  });

  it('trần tính trên điểm gốc, hệ số nhân sau: giờ vàng ×2 cho tối đa 4.000', () => {
    const r = scoreEvent(like(3000), fresh, rules, 2);
    expect(r.basePoints).toBe(2000);
    expect(r.capUsedDelta).toBe(2000);
    expect(r.points).toBe(4000);
  });

  it('comment cũng tính vào trần chung', () => {
    const r = scoreEvent(comment(0), { capUsedToday: 1998, lastCommentCountedAt: null }, rules, 1);
    expect(r.points).toBe(2);
    expect(r.commentCounted).toBe(true);
    const full = scoreEvent(comment(0), { capUsedToday: 2000, lastCommentCountedAt: null }, rules, 1);
    expect(full.points).toBe(0);
    expect(full.commentCounted).toBe(false);
  });

  it('quà không bị trần', () => {
    expect(scoreEvent(gift(10, 10), { capUsedToday: 2000, lastCommentCountedAt: null }, rules, 1).points).toBe(10_000);
  });
});

describe('cooldown comment 30 giây', () => {
  it('comment trong vòng 30 giây kể từ comment được tính trước đó thì không tính', () => {
    const st = { capUsedToday: 0, lastCommentCountedAt: 1_000 };
    const r = scoreEvent(comment(1_000 + 29_999), st, rules, 1);
    expect(r.points).toBe(0);
    expect(r.skipped).toBe('cooldown');
    expect(r.commentCounted).toBe(false);
  });

  it('đủ 30 giây thì tính', () => {
    const st = { capUsedToday: 0, lastCommentCountedAt: 1_000 };
    expect(scoreEvent(comment(31_000), st, rules, 1).points).toBe(5);
  });
});
