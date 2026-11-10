import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GameCore } from '../server/core.js';
import { topTotal } from '../server/game/queries.js';
import { silentLogger } from '../server/logger.js';
import { LiveService, SimulatorNotAllowed, toSessionStatus } from '../server/live/service.js';
import { GameCore as Core } from '../server/core.js';
import { vnTs } from '../shared/time.js';
import { disableEvents, FakeClock, makeTempRoot, openTestCore, removeTempRoot } from './helpers.js';

let root: string;
let clock: FakeClock;
let core: GameCore;

const service = (c: GameCore = core) => new LiveService(c, { logger: silentLogger, simulatorTimer: false, seed: 7 });

beforeEach(() => {
  root = makeTempRoot();
  disableEvents(root);
  clock = new FakeClock(vnTs(2026, 3, 10, 20));
  core = openTestCore(root, clock);
});
afterEach(async () => {
  await core.close();
  removeTempRoot(root);
});

describe('chọn nguồn sự kiện', () => {
  it('hồ sơ test mặc định dùng giả lập, overlay hiện "CHẾ ĐỘ THỬ"', () => {
    const live = service();
    live.start();
    expect(live.mode()).toBe('simulator');
    expect(live.badge()).toBe('CHẾ ĐỘ THỬ');
    expect(live.simulator()).not.toBeNull();
  });

  it('hồ sơ test chuyển sang live thật: nhãn "DIỄN TẬP", không bắn giả lập được', () => {
    const live = service();
    live.start();
    live.setMode('live');
    expect(live.badge()).toBe('DIỄN TẬP');
    expect(live.simulator()).toBeNull();
    expect(live.status().status).toEqual({ state: 'error', message: 'Kết nối TikTok sẽ được làm ở giai đoạn 6' });
    expect(() => live.simFire('gift_small')).toThrow(SimulatorNotAllowed);
    // Lựa chọn được nhớ sau khi khởi động lại.
    expect(service().mode()).toBe('live');
  });

  it('hồ sơ production không bao giờ chạy giả lập, không có nhãn', async () => {
    await core.close();
    core = Core.open({ rootDir: root, profile: 'production', now: clock.now });
    const live = service();
    live.start();
    expect(live.mode()).toBe('live');
    expect(live.badge()).toBeNull();
    expect(live.simulator()).toBeNull();
    expect(() => live.simStart()).toThrow(/chỉ chạy ở hồ sơ test/);
    expect(() => live.setMode('simulator')).toThrow(SimulatorNotAllowed);
  });

  it('production đặt liveSource = "simulator" thì báo lỗi rõ ràng', async () => {
    await core.close();
    core = openTestCore(root, clock, (c) => {
      c.liveSource = 'simulator';
    });
    await core.close();
    core = Core.open({ rootDir: root, profile: 'production', now: clock.now });
    const live = service();
    live.start();
    expect(live.status().text).toMatch(/Giả lập chỉ chạy ở hồ sơ test/);
  });
});

describe('giả lập nối vào lõi game', () => {
  it('chạy giả lập: phiên tự bắt đầu, sự kiện được tính công vào DB', () => {
    const live = service();
    live.start();
    expect(core.sessions.current()).toBeNull();
    live.simStart({ scenario: 'dong', speed: 2 });
    expect(core.sessions.current()).toMatchObject({ start_reason: 'auto' });
    const sim = live.simulator()!;
    clock.advance(60_000);
    sim.advance(60_000);
    expect(core.engine.status().totalPoints).toBeGreaterThan(0);
    expect(topTotal(core.db, 10).length).toBeGreaterThan(5);
    expect(live.status().viewers).toBeGreaterThan(50);
  });

  it('dừng giả lập: phiên tự kết thúc sau 15 phút như kênh tắt live', () => {
    const live = service();
    live.start();
    live.simStart();
    live.simStop();
    expect(core.sessions.current()).not.toBeNull();
    clock.advance(15 * 60_000);
    core.tick();
    expect(core.sessions.current()).toBeNull();
  });

  it('nhớ kịch bản, tốc độ và trạng thái đang chạy sau khi khởi động lại', () => {
    const live = service();
    live.start();
    live.simStart({ scenario: 'ratdong', speed: 5 });
    live.stop();
    const again = service();
    again.start();
    expect(again.simState()).toMatchObject({ scenario: 'ratdong', speed: 5, running: true });
  });

  it('nút bắn thử: quà lớn 1.000 xu = 100.000 công', () => {
    const live = service();
    live.start();
    live.simFire('gift_large');
    expect(core.engine.status().totalPoints).toBe(100_000);
  });
});

describe('trạng thái nguồn live → phiên', () => {
  it('đã kết nối = live; kênh chưa live = offline; còn lại = mất kết nối', () => {
    expect(toSessionStatus({ state: 'connected' })).toBe('live');
    expect(toSessionStatus({ state: 'offline' })).toBe('offline');
    expect(toSessionStatus({ state: 'retrying', attempt: 2 })).toBe('disconnected');
    expect(toSessionStatus({ state: 'error', message: 'x' })).toBe('disconnected');
  });
});
