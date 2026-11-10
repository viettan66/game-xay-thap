import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type DB } from '../server/db/database.js';
import { SessionManager, type SessionRow } from '../server/session.js';
import { FakeClock } from './helpers.js';

const MIN = 60_000;
let db: DB;
let clock: FakeClock;
let ended: SessionRow[];

const manager = () =>
  new SessionManager(db, {
    now: clock.now,
    autoEndOfflineMin: () => 15,
    onEnd: (s) => ended.push(s),
  });

beforeEach(() => {
  db = openDatabase(':memory:');
  clock = new FakeClock(1_000_000);
  ended = [];
});
afterEach(() => {
  db.close();
});

describe('phiên live (14.3)', () => {
  it('tự bắt đầu khi kênh live', () => {
    const m = manager();
    expect(m.current()).toBeNull();
    m.handleStatus('live');
    expect(m.current()).toMatchObject({ start_reason: 'auto', ended_at: null });
  });

  it('tắt live dưới 15 phút rồi live lại thì vẫn là phiên cũ', () => {
    const m = manager();
    m.handleStatus('live');
    const id = m.currentId();
    m.handleStatus('offline');
    clock.advance(14 * MIN);
    m.tick();
    m.handleStatus('live');
    clock.advance(30 * MIN);
    m.tick();
    expect(m.currentId()).toBe(id);
    expect(ended).toEqual([]);
  });

  it('tắt live quá 15 phút thì tự kết thúc; thời điểm kết thúc là lúc tắt live', () => {
    const m = manager();
    m.handleStatus('live');
    clock.advance(60 * MIN);
    const offAt = clock.t;
    m.handleStatus('disconnected');
    clock.advance(15 * MIN);
    m.tick();
    expect(m.current()).toBeNull();
    expect(ended).toHaveLength(1);
    expect(ended[0]).toMatchObject({ ended_at: offAt, end_reason: 'auto_offline' });
  });

  it('live lại sau khi phiên đã kết thúc thì mở phiên mới', () => {
    const m = manager();
    m.handleStatus('live');
    const first = m.currentId();
    m.handleStatus('offline');
    clock.advance(20 * MIN);
    m.tick();
    m.handleStatus('live');
    expect(m.currentId()).not.toBe(first);
  });

  it('admin bắt đầu và kết thúc tay; kết thúc tay thì không tự mở lại khi kênh vẫn đang live', () => {
    const m = manager();
    const s = m.startManual();
    expect(s.start_reason).toBe('manual');
    expect(m.startManual().id).toBe(s.id); // đang có phiên thì không mở thêm
    m.handleStatus('live');
    m.endManual();
    expect(ended[0]).toMatchObject({ end_reason: 'manual' });
    m.handleStatus('live');
    expect(m.current()).toBeNull();
    m.handleStatus('offline');
    m.handleStatus('live');
    expect(m.current()).not.toBeNull();
  });

  it('khởi động lại máy: phiên cũ im lặng quá lâu thì được đóng lại', () => {
    const m1 = manager();
    m1.startManual();
    clock.advance(16 * MIN);
    const m2 = manager();
    m2.recoverOnBoot();
    expect(m2.current()).toBeNull();
    expect(ended[0]).toMatchObject({ end_reason: 'recovered_after_restart' });
  });

  it('khởi động lại nhanh (dưới 15 phút) thì giữ phiên, tự kết thúc nếu không live lại', () => {
    const m1 = manager();
    const s = m1.startManual();
    clock.advance(2 * MIN);
    const m2 = manager();
    m2.recoverOnBoot();
    expect(m2.currentId()).toBe(s.id);
    m2.handleStatus('live');
    clock.advance(20 * MIN);
    m2.tick();
    expect(m2.currentId()).toBe(s.id);
    m2.handleStatus('offline');
    clock.advance(15 * MIN);
    m2.tick();
    expect(m2.current()).toBeNull();
  });
});
