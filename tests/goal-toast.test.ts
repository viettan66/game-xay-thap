// Mục tiêu tim của phiên (bảng 9A) và thông báo quà (mục 8, bảng 9A).

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GameConfig } from '../server/config/schema.js';
import type { GameCore } from '../server/core.js';
import { HeartGoal, type GoalTargets } from '../server/game/heartGoal.js';
import { GiftToasts, topThreshold, type ToastMessage } from '../server/overlay/toasts.js';
import type { CrowdTier } from '../shared/protocol.js';
import { vnTs } from '../shared/time.js';
import { FakeClock, makeTempRoot, openTestCore, REPO_ROOT, removeTempRoot } from './helpers.js';

const config = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'config', 'defaults', 'config.json'), 'utf8')) as GameConfig;
const targets: GoalTargets = { vang: [500], vua: [5000], dong: [10000], ratdong: [50000, 100000, 200000] };

describe('mục tiêu tim (logic)', () => {
  it('bắt đầu phiên lấy nấc đầu của chế độ lúc đó; đạt thì báo một lần', () => {
    const g = new HeartGoal(() => targets);
    g.start(1, 'vua');
    expect(g.state!.target).toBe(5000);
    expect(g.check(4999, 'vua')).toBeNull();
    expect(g.check(5000, 'vua')).toBe(5000);
    expect(g.check(6000, 'vua')).toBeNull();
    expect(g.state!.target).toBeNull(); // vừa chỉ có một nấc
  });

  it('rất đông nhiều nấc: đạt nấc này mở nấc sau', () => {
    const g = new HeartGoal(() => targets);
    g.start(1, 'ratdong');
    expect(g.check(60_000, 'ratdong')).toBe(50_000);
    expect(g.state!.target).toBe(100_000);
  });

  it('chế độ tăng mà mục tiêu đã đạt: mở nấc của chế độ mới; chưa đạt thì giữ nguyên', () => {
    const g = new HeartGoal(() => targets);
    g.start(1, 'vang');
    g.onTier('vua');
    expect(g.state!.target).toBe(500); // chưa đạt: giữ
    g.check(600, 'vua');
    expect(g.state!.target).toBe(5000); // đạt 500, chế độ hiện tại "vừa" có nấc 5.000
    g.check(5000, 'vua');
    expect(g.state!.target).toBeNull();
    g.onTier('dong');
    expect(g.state!.target).toBe(10_000);
    g.onTier('vang'); // giảm thì không đổi
    expect(g.state!.target).toBe(10_000);
  });

  it('mục tiêu đặt tay luôn được ưu tiên; bỏ đặt tay thì về nấc tự động', () => {
    const g = new HeartGoal(() => targets);
    g.start(1, 'vua');
    g.setManual(800, 'vua');
    expect(g.state!.target).toBe(800);
    expect(g.check(900, 'vua')).toBe(800);
    expect(g.state!.target).toBeNull();
    g.setManual(null, 'vua');
    expect(g.state!.target).toBe(5000);
  });
});

describe('mục tiêu tim trong lõi game', () => {
  let root: string;
  let core: GameCore;
  const clock = new FakeClock(vnTs(2026, 3, 10, 20));
  const user = (n: number) => ({ platformId: `u${n}`, uniqueId: `u${n}`, nickname: `U${n}` });
  beforeEach(() => {
    root = makeTempRoot();
    core = openTestCore(root, clock);
  });
  afterEach(async () => {
    await core.close();
    removeTempRoot(root);
  });

  it('đếm tim của phiên (kể cả khi tim không còn được tính công), đạt mục tiêu thì phát sự kiện', async () => {
    const hits: number[] = [];
    core.bus.on('goal', (t: number) => hits.push(t));
    core.sessions.startManual();
    expect(core.goals.info()).toMatchObject({ count: 0, target: 500 }); // phòng vắng
    core.processEvent({ type: 'like', user: user(1), count: 300, ts: clock.now() });
    core.processEvent({ type: 'like', user: user(2), count: 250, ts: clock.now() });
    expect(core.goals.info()).toMatchObject({ count: 550, target: null, reached: [500] });
    expect(hits).toEqual([500]);
    // Khởi động lại giữa phiên: vẫn đúng số tim và nấc đã đạt.
    await core.close();
    core = openTestCore(root, clock);
    expect(core.goals.info()).toMatchObject({ count: 550, reached: [500] });
  });

  it('admin đặt mục tiêu; đã đủ tim thì đạt ngay', () => {
    const hits: number[] = [];
    core.bus.on('goal', (t: number) => hits.push(t));
    core.sessions.startManual();
    core.processEvent({ type: 'like', user: user(1), count: 120, ts: clock.now() });
    core.setHeartGoal(100);
    expect(hits).toEqual([100]);
    core.setHeartGoal(200);
    expect(core.goals.info()).toMatchObject({ target: 200, manual: 200 });
  });
});

describe('thông báo quà', () => {
  function setup(tier: CrowdTier) {
    let now = 1_000_000;
    let t = tier;
    const sent: ToastMessage[] = [];
    const toasts = new GiftToasts({
      config: () => config,
      tier: () => t,
      selector: { pick: (group, ctx) => ({ group, text: `${ctx.vars.name} vừa góp ${ctx.vars.gift}`, verified: true }) },
      verifiedOnly: () => true,
      send: (m) => sent.push(m),
      now: () => now,
    });
    return { toasts, sent, advance: (s: number) => (now += s * 1000), setTier: (x: CrowdTier) => (t = x) };
  }

  it('phòng vắng, vừa: mọi quà; ảnh vật phẩm theo mức', () => {
    const s = setup('vua');
    s.toasts.onGift('a', 'An', 1, 100, 'g');
    s.toasts.onGift('b', 'Bình', 1500, 150_000, 'g');
    expect(s.sent.map((m) => [m.kind, m.icon, m.text])).toEqual([
      ['big', 'items/brick', 'An vừa góp một viên gạch'],
      ['big', 'items/bell', 'Bình vừa góp một quả đại hồng chung'],
    ]);
  });

  it('quà nhỏ liên tiếp của cùng một người được gộp (cùng id, cộng dồn)', () => {
    const s = setup('vua');
    s.toasts.onGift('a', 'An', 5, 500, 'g');
    s.advance(2);
    s.toasts.onGift('a', 'An', 8, 800, 'g');
    s.advance(10);
    s.toasts.onGift('a', 'An', 5, 500, 'g');
    expect(s.sent[1]!.id).toBe(s.sent[0]!.id);
    expect(s.sent[1]!.coins).toBe(13);
    expect(s.sent[1]!.text).toContain('một bó gỗ');
    expect(s.sent[2]!.id).not.toBe(s.sent[0]!.id); // quá 5 giây: thông báo mới
  });

  it('phòng đông: quà từ 100 xu; quà nhỏ chỉ "+công" kèm tên', () => {
    const s = setup('dong');
    s.toasts.onGift('a', 'An', 10, 1000, 'g');
    s.toasts.onGift('b', 'Bình', 100, 10_000, 'g');
    expect(s.sent.map((m) => m.kind)).toEqual(['plus', 'big']);
    expect(s.sent[0]!.text).toBe('+1.000 công · An');
  });

  it('phòng rất đông: chỉ quà thuộc top 10% trong 5 phút và từ 500 xu', () => {
    const s = setup('ratdong');
    for (let i = 0; i < 18; i++) s.toasts.onGift(`p${i}`, 'X', 100, 1, 'g');
    s.toasts.onGift('a', 'An', 600, 1, 'g');
    s.toasts.onGift('b', 'Bình', 400, 1, 'g'); // dưới 500 xu
    s.toasts.onGift('c', 'Cúc', 600, 1, 'g'); // bằng quà lớn nhất: vẫn top
    expect(s.sent.filter((m) => m.kind === 'big').map((m) => m.name)).toEqual(['An', 'Cúc']);
    expect(topThreshold([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 10)).toBe(10);
    expect(topThreshold([5], 10)).toBe(5);
  });
});
