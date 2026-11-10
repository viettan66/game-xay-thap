import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameCore } from '../server/core.js';
import { StateBroadcaster } from '../server/overlay/broadcaster.js';
import { buildOverlayState } from '../server/overlay/state.js';
import type { OverlayState, ServerMessage } from '../shared/protocol.js';
import { vnTs } from '../shared/time.js';
import { disableEvents, FakeClock, makeTempRoot, openTestCore, removeTempRoot, viewer } from './helpers.js';

let root: string;
let clock: FakeClock;
let core: GameCore;

beforeEach(() => {
  root = makeTempRoot();
  clock = new FakeClock(vnTs(2026, 3, 10, 12)); // thứ Ba, ngày thường
});
afterEach(async () => {
  await core.close();
  removeTempRoot(root);
});

describe('trạng thái gửi xuống overlay', () => {
  it('có tiến độ tháp, 3 bảng theo thứ tự, nhãn và bố cục lấy từ config', () => {
    disableEvents(root);
    core = openTestCore(root, clock);
    const s = buildOverlayState(core, 'CHẾ ĐỘ THỬ');
    expect(s.badge).toBe('CHẾ ĐỘ THỬ');
    expect(s.tower).toMatchObject({ floor: 0, floorName: 'Nền móng', stageName: 'Dọn mặt bằng' });
    expect(s.boards.map((b) => b.key)).toEqual(['session', 'total', 'floor']);
    expect(s.boards.map((b) => b.title)).toEqual(['Top phiên này', 'Bảng góp công', 'Bia ghi danh – Nền móng']);
    expect(s.labels).toEqual({ pointUnit: 'công', disclaimer: 'Trò chơi mô phỏng xây tháp – không phải quyên góp tôn giáo' });
    expect(s.layout).toEqual({
      safeArea: { top: 180, bottom: 600, right: 150 },
      floor1WidthPx: 520,
      towerTaper: 0.995,
      towerCenterX: 510,
      towerBaseY: 1215,
      boardRotateSec: 15,
    });
    expect(s.multiplier).toBeNull();
  });

  it('bảng xếp hạng là dữ liệu thật từ DB; top phiên chỉ có khi đang có phiên', () => {
    disableEvents(root);
    core = openTestCore(root, clock);
    core.processEvent({ type: 'like', user: viewer(1, 'Lan'), count: 100, ts: clock.t });
    let s = buildOverlayState(core, null);
    expect(s.boards[0]!.rows).toEqual([]);
    expect(s.boards[1]!.rows).toEqual([{ rank: 1, platformId: 'p1', nickname: 'Lan', avatarUrl: null, points: 100 }]);
    core.sessions.startManual();
    core.processEvent({ type: 'like', user: viewer(2, 'Minh'), count: 50, ts: clock.t });
    s = buildOverlayState(core, null);
    expect(s.boards[0]!.rows.map((r) => r.nickname)).toEqual(['Minh']);
    expect(s.boards[2]!.rows.map((r) => r.nickname)).toEqual(['Lan', 'Minh']);
  });

  it('đổi nhãn trong config thì overlay đổi theo', () => {
    disableEvents(root);
    core = openTestCore(root, clock);
    const next = structuredClone(core.config);
    next.labels.pointUnitLabel = 'công đức';
    next.labels.boards.totalTop = 'Bảng vàng';
    core.saveConfig(next, { source: 'test' });
    const s = buildOverlayState(core, null);
    expect(s.labels.pointUnit).toBe('công đức');
    expect(s.boards[1]!.title).toBe('Bảng vàng');
  });

  it('hiện hệ số đang áp dụng: giờ vàng, sự kiện', () => {
    core = openTestCore(root, clock);
    expect(buildOverlayState(core, null).multiplier).toBeNull();
    core.engine.setGoldenManualUntil(clock.t + 60_000);
    expect(buildOverlayState(core, null).multiplier).toEqual({ total: 2, labels: ['Giờ vàng'] });
    clock.t = vnTs(2026, 4, 2, 12); // Rằm tháng 2 âm
    expect(buildOverlayState(core, null).multiplier).toEqual({ total: 2, labels: ['Ngày Rằm'] });
  });
});

describe('gộp tin gửi xuống overlay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    disableEvents(root);
    core = openTestCore(root, clock);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('nhiều sự kiện dồn dập chỉ gửi tối đa 1 lần mỗi 250 ms', () => {
    const sent: ServerMessage[] = [];
    let builds = 0;
    const b = new StateBroadcaster(
      () => {
        builds++;
        return buildOverlayState(core, null);
      },
      (m) => sent.push(m),
    );
    for (let i = 0; i < 200; i++) b.markDirty();
    vi.advanceTimersByTime(0);
    expect(sent).toHaveLength(1);
    for (let i = 0; i < 200; i++) b.markDirty();
    vi.advanceTimersByTime(100);
    expect(sent).toHaveLength(1);
    vi.advanceTimersByTime(200);
    expect(sent).toHaveLength(2);
    expect(builds).toBe(2);
    vi.advanceTimersByTime(5000);
    expect(sent).toHaveLength(2); // không có thay đổi thì không gửi
    b.close();
  });

  it('báo tầng/giai đoạn vừa xong thì gửi ngay', () => {
    const sent: ServerMessage[] = [];
    const b = new StateBroadcaster(() => ({}) as OverlayState, (m) => sent.push(m));
    b.tower([]);
    b.tower([{ type: 'floor_complete', floor: 0 }]);
    expect(sent).toEqual([{ type: 'tower', transitions: [{ type: 'floor_complete', floor: 0 }] }]);
  });
});
