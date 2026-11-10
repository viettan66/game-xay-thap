import { describe, expect, it } from 'vitest';
import { fakeName, fakeUser, SCENARIO_KEYS, SCENARIOS, SimulatorAdapter, type ScenarioKey } from '../server/live/simulator.js';
import type { LiveEvent } from '../shared/types.js';
import { FakeClock } from './helpers.js';

function runFor(scenario: ScenarioKey, minutes: number, speed = 1, seed = 42): LiveEvent[] {
  const clock = new FakeClock(1_000_000);
  const sim = new SimulatorAdapter({ scenario, speed, seed, now: clock.now, useTimer: false });
  const events: LiveEvent[] = [];
  sim.onEvent((e) => events.push(e));
  sim.start();
  for (let t = 0; t < minutes * 60_000; t += 250) {
    clock.advance(250);
    sim.advance(250);
  }
  sim.stop();
  return events;
}

// Ngưỡng mặc định của mục 9A.
const VIEWER_RANGE: Record<ScenarioKey, [number, number]> = {
  vang: [0, 5],
  vua: [6, 50],
  dong: [51, 300],
  ratdong: [301, Infinity],
};
const INTERACTOR_RANGE: Record<ScenarioKey, [number, number]> = {
  vang: [1, 3],
  vua: [4, 30],
  dong: [31, 150],
  ratdong: [151, Infinity],
};

describe('4 kịch bản giả lập khớp ngưỡng mục 9A', () => {
  it.each(SCENARIO_KEYS)('%s: số người xem và số người tương tác trong 5 phút nằm đúng khoảng', (key) => {
    const events = runFor(key, 5);
    const viewers = events.flatMap((e) => (e.type === 'viewers' ? [e.count] : []));
    expect(viewers.length).toBeGreaterThanOrEqual(30);
    for (const v of viewers) {
      expect(v).toBeGreaterThanOrEqual(VIEWER_RANGE[key][0]);
      expect(v).toBeLessThanOrEqual(VIEWER_RANGE[key][1]);
    }
    const interactors = new Set(
      events.flatMap((e) => (e.type === 'like' || e.type === 'comment' || e.type === 'gift' ? [e.user.platformId] : [])),
    );
    expect(interactors.size).toBeGreaterThanOrEqual(INTERACTOR_RANGE[key][0]);
    expect(interactors.size).toBeLessThanOrEqual(INTERACTOR_RANGE[key][1]);
  });

  it('phòng càng đông càng nhiều sự kiện', () => {
    const counts = SCENARIO_KEYS.map((k) => runFor(k, 5).filter((e) => e.type !== 'viewers').length);
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
    expect(counts[3]!).toBeGreaterThan(counts[0]! * 50);
  });
});

describe('giả lập: tốc độ và sự kiện', () => {
  it('tốc độ ×2 sinh khoảng gấp đôi sự kiện', () => {
    const one = runFor('vua', 10, 1).filter((e) => e.type !== 'viewers').length;
    const two = runFor('vua', 10, 2).filter((e) => e.type !== 'viewers').length;
    expect(two / one).toBeGreaterThan(1.6);
    expect(two / one).toBeLessThan(2.4);
  });

  it('sự kiện đúng khuôn, có mã riêng để chống trùng, quà ngẫu nhiên tối đa 1.000 xu', () => {
    const events = runFor('ratdong', 3);
    const ids = events.map((e) => e.eventId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of events) {
      if (e.type === 'gift') {
        expect(e.coinValueEach).toBeGreaterThan(0);
        expect(e.coinValueEach).toBeLessThanOrEqual(1000);
        expect(e.count).toBeGreaterThanOrEqual(1);
      }
      if (e.type === 'like') expect(e.count).toBeGreaterThanOrEqual(SCENARIOS.ratdong.likeBatch[0]);
    }
    expect(events.some((e) => e.type === 'gift')).toBe(true);
    expect(events.some((e) => e.type === 'comment')).toBe(true);
    expect(events.some((e) => e.type === 'join')).toBe(true);
  });

  it('nút bắn thử từng loại', () => {
    const clock = new FakeClock(0);
    const sim = new SimulatorAdapter({ scenario: 'vua', speed: 1, seed: 1, now: clock.now, useTimer: false });
    const got: LiveEvent[] = [];
    sim.onEvent((e) => got.push(e));
    sim.fire('gift_medium');
    sim.fire('gift_large');
    sim.fire('like_1000');
    sim.fire('comment');
    sim.fire('join');
    sim.fire('gift_small');
    expect(got.map((e) => e.type)).toEqual(['gift', 'gift', 'like', 'comment', 'join', 'gift']);
    expect(got[0]).toMatchObject({ coinValueEach: 100, count: 1 });
    expect(got[1]).toMatchObject({ coinValueEach: 1000, count: 1 });
    expect(got[2]).toMatchObject({ count: 1000 });
    expect(got[5]).toMatchObject({ coinValueEach: 1 });
    got.length = 0;
    sim.fire('burst');
    expect(got).toHaveLength(150);
  });

  it('đang dừng thì không tự sinh sự kiện; trạng thái kết nối đúng', () => {
    const sim = new SimulatorAdapter({ scenario: 'dong', speed: 10, seed: 3, useTimer: false });
    const got: LiveEvent[] = [];
    sim.onEvent((e) => got.push(e));
    expect(sim.status()).toEqual({ state: 'offline' });
    sim.advance(60_000);
    expect(got).toEqual([]);
    sim.start();
    expect(sim.status()).toEqual({ state: 'connected' });
    sim.stop();
    expect(sim.status()).toEqual({ state: 'offline' });
  });

  it('tốc độ bị giới hạn trong khoảng ×0,25 – ×10', () => {
    const sim = new SimulatorAdapter({ scenario: 'vua', speed: 50, useTimer: false });
    expect(sim.speed).toBe(10);
    sim.setSpeed(0);
    expect(sim.speed).toBe(0.25);
  });
});

describe('tên người xem giả', () => {
  it('tên tiếng Việt, cố định theo người, có đủ kiểu (dài, không dấu, emoji)', () => {
    expect(fakeUser(7)).toEqual(fakeUser(7));
    expect(fakeName(7)).toBe(fakeName(7));
    const names = Array.from({ length: 300 }, (_, i) => fakeName(i));
    for (const n of names) expect(n.trim().length).toBeGreaterThan(1);
    expect(names.some((n) => /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i.test(n))).toBe(true);
    expect(names.some((n) => [...n].length > 14)).toBe(true);
    expect(names.some((n) => /^[a-z]+\d+$/.test(n))).toBe(true);
    expect(names.some((n) => /\p{Extended_Pictographic}/u.test(n))).toBe(true);
    expect(new Set(names).size).toBeGreaterThan(200);
  });
});
