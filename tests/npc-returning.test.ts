// Dân phu NPC, người góp công cũ (mục 9B), đám đông vô danh (bảng 9A), công trường tự chạy (giai đoạn 4e).

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { crowdSpots } from '../overlay/src/chars/spots.js';
import { nextDelay, NpcCartTimer } from '../overlay/src/chars/schedule.js';
import { AbbotDirector, type SayMessage } from '../server/abbot/director.js';
import type { GameConfig } from '../server/config/schema.js';
import type { GameCore } from '../server/core.js';
import type { ProcessResult } from '../server/game/engine.js';
import { pickReturning, returningCandidates, type ReturningCandidate } from '../server/game/returning.js';
import { CharacterRoster, NPC_LOOKS, type ReturningPick } from '../server/game/roster.js';
import { actorList, buildOverlayState } from '../server/overlay/state.js';
import type { CrowdTier, ProgressView } from '../shared/protocol.js';
import type { UserLiveEvent } from '../shared/types.js';
import { disableEvents, FakeClock, makeTempRoot, openTestCore, REPO_ROOT, removeTempRoot, viewer } from './helpers.js';

const config = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'config', 'defaults', 'config.json'), 'utf8')) as GameConfig;
const MIN = 60_000;

function seq(...vals: number[]) {
  let i = 0;
  return () => vals[i++ % vals.length]!;
}

const ev = (type: UserLiveEvent['type'], id: string, extra: Record<string, unknown> = {}): UserLiveEvent =>
  ({ type, user: { platformId: id, uniqueId: id, nickname: id }, ts: 0, count: 1, text: 'x', giftId: 'g', giftName: 'G', coinValueEach: 1, ...extra }) as UserLiveEvent;

function roster(tier: CrowdTier, o: { max?: number; pool?: ReturningPick[]; rand?: () => number } = {}) {
  let t = tier;
  const backs: string[] = [];
  const pool = o.pool ?? [];
  const r = new CharacterRoster({
    config: () => ({ ...config.characters, maxCharacters: o.max ?? config.characters.maxCharacters }),
    tier: () => t,
    npc: () => config.npc,
    returning: () => config.returning,
    pickReturning: (skip) => pool.find((p) => !skip(p.id)) ?? null,
    onBack: (m) => backs.push(m.id),
    rand: o.rand ?? seq(0.99, 0.5, 0.2),
  });
  /** Chạy tick mỗi 500 ms trong `sec` giây, bắt đầu từ `from`. */
  const run = (from: number, sec: number) => {
    let now = from;
    for (let k = 0; k < sec * 2; k++) r.tick((now += 500));
    return now;
  };
  return { r, run, backs, setTier: (x: CrowdTier) => (t = x) };
}

const send = (r: CharacterRoster, type: UserLiveEvent['type'], id: string, now: number, coins = 0) =>
  r.onEvent({ ev: ev(type, id), name: `Tên ${id}`, title: null, coins }, now);

const people = (n: number): ReturningPick[] => Array.from({ length: n }, (_, i) => ({ id: `old${i}`, name: `Cũ ${i}`, itemId: 'tam_quan' }));

describe('dân phu NPC (mục 9B, bảng 9A)', () => {
  it('phòng vắng: 6–8 dân phu, thêm dần từng người (fillGapSec); có cả chú tiểu', () => {
    const { r, run } = roster('vang', { rand: seq(0.99) });
    run(0, 5);
    expect(r.npcList().length).toBe(1); // 6 giây mới thêm người thứ hai
    run(5000, 60);
    expect(r.npcList().length).toBe(8);
    expect(r.target.npc).toBe(8);
    expect(new Set(r.npcList().map((n) => n.id)).size).toBe(8);
    expect(NPC_LOOKS).toContain('tusi');
  });

  it('phòng đông, rất đông: không có dân phu; đổi chế độ thì dân phu đi ra dần (mỗi 2 giây một người)', () => {
    const { r, run, setTier } = roster('vua', { rand: seq(0.99) });
    let now = run(0, 40);
    expect(r.npcList().length).toBe(4);
    setTier('dong');
    now = run(now, 2.5);
    expect(r.npcList().length).toBeGreaterThanOrEqual(2);
    expect(r.npcList().length).toBeLessThanOrEqual(3);
    run(now, 10);
    expect(r.npcList().length).toBe(0);
  });

  it('đầy chỗ: dân phu nhường chỗ trước, rồi người góp công cũ, rồi mới tới người xem thật', () => {
    const { r, run } = roster('vang', { max: 10, pool: people(10), rand: seq(0.99) });
    let now = run(0, 120);
    expect(r.total).toBe(10);
    const npc0 = r.npcList().length;
    const ret0 = r.returningList().length;
    expect(npc0).toBeGreaterThan(0);
    expect(ret0).toBeGreaterThan(0);
    for (let i = 0; i < npc0; i++) send(r, 'like', `v${i}`, (now += 10));
    expect(r.npcList().length).toBe(0);
    expect(r.returningList().length).toBe(ret0);
    send(r, 'like', 'vx', (now += 10));
    expect(r.returningList().length).toBe(ret0 - 1);
    expect(r.total).toBe(10);
    // Toàn người xem thật: người ưu tiên thấp nhất nhường chỗ như cũ.
    for (let i = 0; i < 20; i++) send(r, 'like', `w${i}`, (now += 10));
    expect(r.size).toBe(10);
    expect(r.total).toBe(10);
  });
});

describe('người góp công cũ (mục 9B)', () => {
  it('phòng vắng 5–10 người, phòng vừa 2–3, đông thì không; không chọn người đang có nhân vật', () => {
    const pool = people(12);
    const { r, run } = roster('vua', { pool, rand: seq(0.99) });
    send(r, 'like', 'old0', 0); // old0 đang là người xem thật
    run(0, 60);
    expect(r.returningList().map((m) => m.id)).toEqual(['old1', 'old2', 'old3']);
  });

  it('ở lại 5–10 phút rồi đổi người khác; người vừa hiện thì chưa được chọn lại (cooldownMin)', () => {
    const { r, run } = roster('vua', { pool: people(5), rand: seq(0) }); // rand 0: ở lại 5 phút, 2 người
    let now = run(0, 30);
    expect(r.returningList().map((m) => m.id)).toEqual(['old0', 'old1']);
    now = run(now, 5 * 60);
    const ids = r.returningList().map((m) => m.id);
    expect(ids).not.toContain('old0');
    expect(ids).not.toContain('old1');
    expect(ids.length).toBe(2);
    run(now, 6 * 60);
    expect(r.returningList().map((m) => m.id)).toEqual(expect.not.arrayContaining(['old0', 'old1'])); // vẫn trong 30 phút
  });

  it('chính người đó tương tác: chuyển sang người xem thật, giữ nhân vật (báo để trụ trì chào riêng); chỉ vào phòng thì chưa', () => {
    const { r, run, backs } = roster('vua', { pool: people(3), rand: seq(0.99) });
    const now = run(0, 30);
    expect(r.returningList().map((m) => m.id)).toContain('old0');
    expect(send(r, 'join', 'old0', now + 1)).toBe(false);
    expect(r.returningList().map((m) => m.id)).toContain('old0');
    expect(send(r, 'comment', 'old0', now + 2)).toBe(true);
    expect(r.has('old0')).toBe(true);
    expect(r.returningList().map((m) => m.id)).not.toContain('old0');
    expect(backs).toEqual(['old0']);
  });

  it('chọn ngẫu nhiên theo điểm, ưu tiên người không có mặt trong phiên', () => {
    const c = (id: string, points: number, present = false): ReturningCandidate => ({ platformId: id, nickname: id, points, present, topItemId: null });
    const list = [c('a', 100), c('b', 300), c('here', 10_000, true)];
    expect(pickReturning(list, () => false, () => 0)!.platformId).toBe('a');
    expect(pickReturning(list, () => false, () => 0.3)!.platformId).toBe('b'); // 0,3 × 400 = 120 > 100
    expect(pickReturning(list, (id) => id !== 'here', () => 0.5)!.platformId).toBe('here'); // chỉ còn người có mặt
    expect(pickReturning(list, () => true, () => 0)).toBeNull();
  });
});

describe('người góp công cũ, dân phu với dữ liệu thật', () => {
  let root: string;
  let core: GameCore;
  const clock = new FakeClock(Date.UTC(2026, 10, 12, 5, 0, 0));

  beforeEach(() => {
    root = makeTempRoot();
    disableEvents(root);
    core = openTestCore(root, clock);
  });
  afterEach(async () => {
    await core.close();
    removeTempRoot(root);
  });

  const gift = (n: number, coins: number, id: string) =>
    core.processEvent({ type: 'gift', user: viewer(n), giftId: 'g', giftName: 'G', coinValueEach: coins, count: 1, ts: clock.t, eventId: id });

  it('người có công từ phiên trước, có mặt hay chưa, hạng mục góp nhiều nhất', () => {
    core.sessions.startManual();
    gift(1, 100, 'a');
    gift(2, 300, 'b');
    core.sessions.endManual();
    const s2 = core.sessions.startManual();
    gift(3, 50, 'c'); // chỉ có công trong phiên này: không phải người góp công cũ
    core.processEvent({ type: 'like', user: viewer(2), count: 1, ts: clock.t, eventId: 'l' });
    const list = returningCandidates(core.db, s2.id);
    expect(list.map((x) => [x.platformId, x.points, x.present])).toEqual([
      ['p2', 30_000, true],
      ['p1', 10_000, false],
    ]);
    expect(list[0]!.topItemId).toBe('san_nen');
  });

  it('trạng thái overlay: người góp công cũ có dòng "đã góp …", dân phu chỉ có nhãn nghề; danh sách loại trừ được tôn trọng', () => {
    core.sessions.startManual();
    gift(1, 100, 'a');
    gift(2, 200, 'b');
    core.sessions.endManual();
    core.sessions.startManual();
    core.setReturningExcluded('p2', true);
    // Phiên cũ đã qua: hai người kia không còn trên bản đồ.
    (core.roster as unknown as { members: Map<string, unknown> }).members.clear();
    core.setCrowdForced('vang');
    for (let k = 0; k < 120; k++) {
      clock.advance(500);
      core.roster.tick(clock.t);
    }
    const actors = actorList(core, true);
    const ret = actors.filter((a) => a.kind === 'returning');
    expect(ret).toEqual([{ id: 'p1', kind: 'returning', name: 'Người xem 1', title: null, note: 'đã góp San nền công trường' }]);
    const npcs = actors.filter((a) => a.kind === 'npc');
    expect(npcs.length).toBeGreaterThanOrEqual(6);
    for (const n of npcs) {
      expect(n.look).toBeTruthy();
      expect(n.name).toBe(n.look === 'tusi' ? '' : n.look === 'thomoc' ? 'Thợ mộc' : n.look === 'thone' ? 'Thợ nề' : 'Dân phu');
    }
    expect(buildOverlayState(core, null).anonCrowd).toBeNull();
    // Bỏ loại trừ thì người đó được chọn lại.
    core.setReturningExcluded('p2', false);
    for (let k = 0; k < 40; k++) {
      clock.advance(500);
      core.roster.tick(clock.t);
    }
    expect(core.roster.returningList().map((m) => m.id).sort()).toEqual(['p1', 'p2']);
    // Loại trừ người đang hiện: đi ra ngay.
    core.setReturningExcluded('p1', true);
    expect(core.roster.returningList().map((m) => m.id)).toEqual(['p2']);
  });

  it('phòng rất đông: đám đông vô danh theo số người tương tác 5 phút, chữ bộ đếm từ kho thoại', () => {
    core.sessions.startManual();
    for (let i = 0; i < 200; i++) core.processEvent({ type: 'like', user: viewer(i), count: 1, ts: clock.t, eventId: `x${i}` });
    core.setCrowdForced('ratdong');
    const c = buildOverlayState(core, null).anonCrowd!;
    expect(c.text).toBe('200 người đang góp sức');
    expect(c.sprites).toBe(13); // 200 / 15 ≈ 13 (trong khoảng 6–24)
    expect(buildOverlayState(core, null).characters).toMatchObject({ birdsEverySec: 180, npcCartEverySec: 0, npcPace: 0.75 });
  });
});

describe('trụ trì chào người góp công cũ quay lại', () => {
  it('nói nhóm returning, đánh dấu đã chào (không chào lại như người mới)', () => {
    const said: SayMessage[] = [];
    const greeted = new Set<string>();
    let now = 1_000_000;
    const d = new AbbotDirector({
      selector: { pick: (group, ctx) => ({ group, text: `${group}|${JSON.stringify(ctx.vars)}`, verified: true }) },
      config: () => config,
      tier: () => 'vua',
      verifiedOnly: () => true,
      progress: () => ({ item: { id: 'gac_chuong', name: 'Gác chuông', number: 8, count: 23 }, stage: { number: 5, count: 10, name: 'Dựng cột', ritual: null }, percent: 0, completed: false, items: [] }) as unknown as ProgressView,
      name: (raw) => raw,
      sessionId: () => 1,
      greeted: { has: (s, p) => greeted.has(`${s}:${p}`), add: (s, p) => void greeted.add(`${s}:${p}`) },
      itemContributors: () => 0,
      send: (m) => said.push(m),
      now: () => now,
      rng: () => 0,
    });
    d.onReturning('u1', 'Bà Tư');
    const r: ProcessResult = { status: 'counted', eventRowId: 1, score: null, multiplier: null, progress: null };
    d.onEvent({ type: 'comment', user: { platformId: 'u1', uniqueId: 'u1', nickname: 'Bà Tư' }, text: 'chào', ts: now }, r);
    for (let k = 0; k < 60; k++) {
      now += 500;
      d.tick();
    }
    expect(said.map((m) => m.text)).toEqual(['returning|{"name":"Bà Tư","item":"Gác chuông","stage":"Dựng cột"}']);
  });
});

describe('đám đông vô danh, công trường tự chạy (overlay)', () => {
  const site = { rect: { x: 400, y: 600, w: 300, h: 400 }, baseY: 1000 };
  const pts = [
    { x: 550, y: 900 }, // trong công trình: bỏ
    { x: 300, y: 950 }, // phía sau đường chân (hậu cảnh)
    { x: 900, y: 980 },
    { x: 550, y: 1200 }, // phía trước
    { x: 200, y: 800 }, // bị che
  ];

  it('đứng ở hậu cảnh trước, tránh khung công trình và chỗ bị công trình khác che; thiếu chỗ thì đứng thành nhóm', () => {
    const out = crowdSpots(pts, site, 3, (p) => p.x === 200);
    expect(out.length).toBe(3);
    expect(out.every((p) => !(p.x > 380 && p.x < 720 && p.y < 1040))).toBe(true);
    expect(Math.abs(out[0]!.x - 300)).toBeLessThan(10); // hậu cảnh gần công trình nhất trước
    expect(Math.abs(out[2]!.y - 1200)).toBeLessThan(10);
    expect(crowdSpots(pts, site, 7).length).toBe(7);
    expect(crowdSpots([], site, 5)).toEqual([]);
  });

  it('hẹn giờ quanh số giây đặt (±40%); 0 = không bao giờ', () => {
    expect(nextDelay(100, () => 0)).toBe(60);
    expect(nextDelay(100, () => 1)).toBe(140);
    expect(nextDelay(0, () => 0.5)).toBe(Infinity);
    const t = new NpcCartTimer(() => 0.5);
    let fired = 0;
    for (let s = 0; s < 600; s += 1) if (t.tick(1, 150)) fired++;
    expect(fired).toBe(4); // lần đầu sau ~75 giây, sau đó mỗi ~150 giây
    let none = 0;
    for (let s = 0; s < 600; s += 1) if (t.tick(1, 0)) none++;
    expect(none).toBe(0);
  });
});
