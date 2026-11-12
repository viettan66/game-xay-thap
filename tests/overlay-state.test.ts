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
  it('có tiến độ công trình, 3 bảng theo thứ tự, nhãn và bố cục lấy từ config', () => {
    disableEvents(root);
    core = openTestCore(root, clock);
    const s = buildOverlayState(core, 'CHẾ ĐỘ THỬ');
    expect(s.badge).toBe('CHẾ ĐỘ THỬ');
    expect(s.progress).toMatchObject({
      item: { id: 'san_nen', number: 1, count: 23 },
      stage: { number: 1, count: 5, name: 'Phát quang, cắm mốc' },
      lines: { item: 'Hạng mục 1/23 · San nền công trường', stage: 'Giai đoạn 1/5: Phát quang, cắm mốc', project: 'Toàn công trình 0%' },
    });
    expect(s.progress.items).toHaveLength(23);
    expect(s.boards.map((b) => b.key)).toEqual(['session', 'total', 'item']);
    expect(s.boards.map((b) => b.title)).toEqual(['Top phiên này', 'Bảng góp công', 'Bia ghi danh – San nền công trường']);
    expect(s.labels).toEqual({ pointUnit: 'công', disclaimer: 'Trò chơi mô phỏng xây chùa – không phải quyên góp tôn giáo', enableSound: '🔊 Bật âm thanh' });
    expect(s.layout).toEqual({
      safeArea: { top: 180, bottom: 600, right: 150 },
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
    next.labels.progress.item = '{item} ({number}/{count})';
    core.saveConfig(next, { source: 'test' });
    const s = buildOverlayState(core, null);
    expect(s.labels.pointUnit).toBe('công đức');
    expect(s.boards[1]!.title).toBe('Bảng vàng');
    expect(s.progress.lines.item).toBe('San nền công trường (1/23)');
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

  it('báo giai đoạn / hạng mục vừa xong thì gửi ngay', () => {
    const sent: ServerMessage[] = [];
    const b = new StateBroadcaster(() => ({}) as OverlayState, (m) => sent.push(m));
    b.progress([]);
    b.progress([{ type: 'item_complete', itemId: 'san_nen', size: 'nho' }]);
    expect(sent).toEqual([{ type: 'progress', transitions: [{ type: 'item_complete', itemId: 'san_nen', size: 'nho' }] }]);
  });
});
