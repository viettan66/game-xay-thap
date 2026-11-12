// Nhân vật người xem trên bản đồ (mục 9, 9A) và hiệu ứng quà theo mức: phần server và hàm dùng chung (giai đoạn 4d).

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GameConfig } from '../server/config/schema.js';
import type { GameCore } from '../server/core.js';
import { honorStatues } from '../server/game/queries.js';
import { CharacterRoster, evictOrder, idleLimitMs, shouldSpawn, type RosterMember } from '../server/game/roster.js';
import { buildOverlayState } from '../server/overlay/state.js';
import { giftEffect, lookFor, shortName, statueMinCoins, tierEffect, titleFor, VIEWER_LOOKS } from '../shared/characters.js';
import type { CrowdTier } from '../shared/protocol.js';
import type { UserLiveEvent } from '../shared/types.js';
import { disableEvents, FakeClock, makeTempRoot, openTestCore, REPO_ROOT, removeTempRoot, viewer } from './helpers.js';

const config = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'config', 'defaults', 'config.json'), 'utf8')) as GameConfig;
const MIN = 60_000;

describe('kiểu nhân vật, danh hiệu, tên, mức quà', () => {
  it('kiểu nhân vật cố định theo platformId, không bao giờ là chú tiểu (quyết định 19)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const l = lookFor(`user-${i}`);
      expect(l).toBe(lookFor(`user-${i}`));
      expect(l).not.toBe('tusi');
      seen.add(l);
    }
    expect([...seen].sort()).toEqual([...VIEWER_LOOKS].sort()); // đủ cả nam, nữ, thợ mộc, thợ nề
  });

  it('danh hiệu theo tổng công: mức cao nhất đã đạt; chưa đạt mức nào thì không có', () => {
    expect(titleFor(999, config.titles)).toBeNull();
    expect(titleFor(1000, config.titles)).toBe('Thợ phụ');
    expect(titleFor(150_000, config.titles)).toBe('Đốc công');
    expect(titleFor(99_999_999, config.titles)).toBe('Tổng công trình sư');
  });

  it('tên dài hơn 14 ký tự thì cắt bớt kèm "…", emoji tính là một ký tự', () => {
    expect(shortName('Nguyễn Văn An')).toBe('Nguyễn Văn An');
    expect(shortName('Nguyễn Thị Minh Khai Hà Nội')).toBe('Nguyễn Thị Mi…');
    expect(Array.from(shortName('Hoa 🌸🌸🌸🌸🌸🌸🌸🌸🌸🌸🌸🌸')).length).toBe(14);
  });

  it('hiệu ứng theo giá trị một lần tặng (mục 9): gạch < 10, bó gỗ, xe trâu, voi, chuông, tượng ≥ 5.000', () => {
    const t = config.gifts.tiers;
    expect([1, 9, 10, 99, 100, 499, 500, 999, 1000, 4999, 5000, 99999].map((c) => giftEffect(t, c))).toEqual([
      'brick', 'brick', 'logs', 'logs', 'cart', 'cart', 'elephant', 'elephant', 'bell', 'bell', 'statue', 'statue',
    ]);
    expect(statueMinCoins(t)).toBe(5000);
  });

  it('mức quà ghi rõ effect thì dùng effect; không có ảnh thì theo thứ tự mức', () => {
    expect(tierEffect([{ minCoins: 0, icon: 'items/brick', effect: 'bell' }], 0)).toBe('bell');
    expect(tierEffect([{ minCoins: 0 }, { minCoins: 50 }], 1)).toBe('logs');
    expect(statueMinCoins([{ minCoins: 0 }, { minCoins: 10, effect: 'cart' }])).toBeNull();
  });
});

// ---- Danh sách nhân vật (thuần) ----

const ev = (type: UserLiveEvent['type'], id: string, extra: Record<string, unknown> = {}): UserLiveEvent =>
  ({ type, user: { platformId: id, uniqueId: id, nickname: id }, ts: 0, count: 1, text: 'x', giftId: 'g', giftName: 'G', coinValueEach: 1, ...extra }) as UserLiveEvent;

function roster(tier: CrowdTier, patch: Partial<GameConfig['characters']> = {}) {
  let t = tier;
  const r = new CharacterRoster({ config: () => ({ ...config.characters, ...patch }), tier: () => t });
  return { r, setTier: (x: CrowdTier) => (t = x) };
}

const send = (r: CharacterRoster, type: UserLiveEvent['type'], id: string, now: number, coins = 0, extra: Record<string, unknown> = {}) =>
  r.onEvent({ ev: ev(type, id, extra), name: `Tên ${id}`, title: null, coins }, now);

describe('khi nào sinh nhân vật (bảng 9A)', () => {
  const rules = config.characters.spawn;

  it('vắng: vào phòng là có; vừa: tương tác đầu tiên; vào phòng thôi thì chưa', () => {
    expect(shouldSpawn(rules.vang, ev('join', 'a'), { likes: 0, comments: 0, coins: 0 })).toBe(true);
    expect(shouldSpawn(rules.vua, ev('join', 'a'), { likes: 0, comments: 0, coins: 0 })).toBe(false);
    expect(shouldSpawn(rules.vua, ev('like', 'a'), { likes: 1, comments: 0, coins: 0 })).toBe(true);
    expect(shouldSpawn(rules.vua, ev('comment', 'a'), { likes: 0, comments: 1, coins: 0 })).toBe(true);
  });

  it('đông: quà, hoặc ≥ 50 tim, hoặc ≥ 3 comment trong phiên', () => {
    expect(shouldSpawn(rules.dong, ev('like', 'a'), { likes: 49, comments: 0, coins: 0 })).toBe(false);
    expect(shouldSpawn(rules.dong, ev('like', 'a'), { likes: 50, comments: 0, coins: 0 })).toBe(true);
    expect(shouldSpawn(rules.dong, ev('comment', 'a'), { likes: 0, comments: 2, coins: 0 })).toBe(false);
    expect(shouldSpawn(rules.dong, ev('comment', 'a'), { likes: 0, comments: 3, coins: 0 })).toBe(true);
    expect(shouldSpawn(rules.dong, ev('gift', 'a'), { likes: 0, comments: 0, coins: 1 })).toBe(true);
  });

  it('rất đông: chỉ khi tặng quà', () => {
    expect(shouldSpawn(rules.ratdong, ev('like', 'a'), { likes: 100_000, comments: 0, coins: 0 })).toBe(false);
    expect(shouldSpawn(rules.ratdong, ev('comment', 'a'), { likes: 0, comments: 50, coins: 0 })).toBe(false);
    expect(shouldSpawn(rules.ratdong, ev('gift', 'a'), { likes: 0, comments: 0, coins: 1 })).toBe(true);
  });

  it('đếm tim, comment cộng dồn trong phiên; phiên mới thì đếm lại', () => {
    const { r } = roster('dong');
    for (let i = 0; i < 4; i++) expect(send(r, 'like', 'a', 0, 0, { count: 12 })).toBe(false); // 48 tim
    expect(send(r, 'like', 'a', 0, 0, { count: 2 })).toBe(true); // 50 tim
    expect(r.has('a')).toBe(true);
    send(r, 'comment', 'b', 0);
    send(r, 'comment', 'b', 0);
    r.onSessionStart();
    expect(send(r, 'comment', 'b', 0)).toBe(false); // phiên mới: mới 1 comment
  });
});

describe('rời màn hình, đầy chỗ', () => {
  it('không tương tác quá idleMin của chế độ thì đi ra; rời dần từng người (leaveGapSec)', () => {
    const { r } = roster('vua');
    send(r, 'like', 'a', 0);
    send(r, 'like', 'b', 0);
    send(r, 'like', 'c', 5 * MIN);
    expect(r.tick(10 * MIN)).toBe(false); // đúng 10 phút: chưa quá
    expect(r.tick(10 * MIN + 1000)).toBe(true);
    expect(r.size).toBe(2); // mỗi lần chỉ một người
    expect(r.tick(10 * MIN + 2000)).toBe(false); // chưa đủ leaveGapSec (2 giây)
    expect(r.tick(10 * MIN + 3100)).toBe(true);
    expect(r.list().map((m) => m.id)).toEqual(['c']);
  });

  it('chỉ vào phòng (không tương tác) không làm mới giờ; tương tác thì làm mới', () => {
    const { r } = roster('vang');
    send(r, 'join', 'a', 0);
    send(r, 'join', 'a', 25 * MIN);
    expect(r.tick(31 * MIN)).toBe(true);
    expect(r.has('a')).toBe(false);
    send(r, 'join', 'b', 0);
    send(r, 'comment', 'b', 25 * MIN);
    r.tick(31 * MIN);
    expect(r.has('b')).toBe(true);
  });

  it('rất đông: người tặng từ 1.000 xu trong phiên ở lại 10 phút thay vì 3 phút', () => {
    const m = (coins: number): RosterMember => ({ id: 'x', name: 'x', title: null, joinedAt: 0, lastActive: 0, sessionCoins: coins, recentGifts: [] });
    expect(idleLimitMs(config.characters, 'ratdong', m(999))).toBe(3 * MIN);
    expect(idleLimitMs(config.characters, 'ratdong', m(1000))).toBe(10 * MIN);
    expect(idleLimitMs(config.characters, 'dong', m(5000))).toBe(5 * MIN);
  });

  it('đổi chế độ: hết giờ theo chế độ mới nhưng vẫn rời dần, không biến mất cùng lúc', () => {
    const { r, setTier } = roster('vang');
    for (const id of ['a', 'b', 'c', 'd']) send(r, 'like', id, 0);
    setTier('ratdong');
    let t = 4 * MIN;
    expect(r.tick(t)).toBe(true);
    expect(r.size).toBe(3);
    for (let k = 0; k < 3; k++) r.tick((t += 2100));
    expect(r.size).toBe(0);
  });

  it('thứ tự rời khi đầy chỗ theo chế độ (cột "Ưu tiên giữ khi đầy chỗ")', () => {
    const mk = (id: string, lastActive: number, sessionCoins: number, recent: [number, number][] = []): RosterMember => ({
      id, name: id, title: null, joinedAt: 0, lastActive, sessionCoins, recentGifts: recent,
    });
    const now = 30 * MIN;
    const list = [mk('cu', 1 * MIN, 0), mk('moi', 20 * MIN, 0), mk('qua_cu', 2 * MIN, 500, [[2 * MIN, 500]]), mk('qua_moi', 25 * MIN, 100, [[25 * MIN, 100]])];
    // vừa: giữ người tương tác gần nhất → người lâu nhất rời trước.
    expect(evictOrder(list, 'vua', now, 10 * MIN).map((m) => m.id)).toEqual(['cu', 'qua_cu', 'moi', 'qua_moi']);
    // đông: giữ người tặng quà → người không tặng rời trước.
    expect(evictOrder(list, 'dong', now, 10 * MIN).map((m) => m.id)).toEqual(['cu', 'moi', 'qua_cu', 'qua_moi']);
    // rất đông: giữ người tặng nhiều nhất trong 10 phút gần đây (quà 500 xu đã quá 10 phút).
    expect(evictOrder(list, 'ratdong', now, 10 * MIN).map((m) => m.id)).toEqual(['cu', 'qua_cu', 'moi', 'qua_moi']);
  });

  it('đầy chỗ: người ưu tiên thấp nhất nhường chỗ; người mới thấp nhất thì không sinh', () => {
    const { r, setTier } = roster('vua', { maxCharacters: 2 });
    send(r, 'like', 'a', 1000);
    send(r, 'like', 'b', 2000);
    expect(send(r, 'like', 'c', 3000)).toBe(true);
    expect(r.list().map((m) => m.id).sort()).toEqual(['b', 'c']); // a lâu nhất: nhường chỗ
    setTier('ratdong');
    send(r, 'gift', 'b', 4000, 1000);
    send(r, 'gift', 'c', 5000, 500);
    expect(send(r, 'gift', 'd', 6000, 1)).toBe(false); // tặng ít nhất: không chen được
    expect(send(r, 'gift', 'e', 7000, 800)).toBe(true); // hơn c: c nhường
    expect(r.list().map((m) => m.id).sort()).toEqual(['b', 'e']);
  });
});

// ---- Server thật: tượng ghi danh, trạng thái overlay ----

describe('tượng võ tướng đá, trạng thái gửi xuống overlay', () => {
  let root: string;
  let core: GameCore;
  const clock = new FakeClock(Date.UTC(2026, 10, 12, 5, 0, 0));

  beforeEach(() => {
    root = makeTempRoot();
    disableEvents(root);
    core = openTestCore(root, clock);
    core.sessions.startManual();
    core.setCrowdForced('vua');
  });
  afterEach(async () => {
    await core.close();
    removeTempRoot(root);
  });

  const gift = (n: number, coins: number, id: string) =>
    core.processEvent({ type: 'gift', user: viewer(n), giftId: 'g', giftName: 'G', coinValueEach: coins, count: 1, ts: clock.t, eventId: id });

  it('quà từ 5.000 xu một lần tặng: một tượng mang tên người tặng, ghi cùng sự kiện; trùng sự kiện không thêm tượng', () => {
    expect(gift(1, 4999, 'e1').honorId).toBeNull();
    const r = gift(2, 5000, 'e2');
    expect(r.honorId).toBeGreaterThan(0);
    expect(gift(2, 5000, 'e2').status).toBe('duplicate');
    gift(3, 20000, 'e3');
    const h = honorStatues(core.db, 10);
    expect(h.map((x) => [x.seq, x.platformId, x.coins])).toEqual([
      [0, 'p2', 5000],
      [1, 'p3', 20000],
    ]);
    const s = buildOverlayState(core, null);
    expect(s.honors).toEqual([
      { id: h[0]!.id, seq: 0, name: 'Người xem 2' },
      { id: h[1]!.id, seq: 1, name: 'Người xem 3' },
    ]);
  });

  it('tượng cũ vẫn giữ thứ tự (ô ghi danh) khi chỉ gửi những tượng mới nhất', () => {
    for (let i = 0; i < 5; i++) gift(i + 1, 5000, `s${i}`);
    expect(honorStatues(core.db, 2).map((h) => h.seq)).toEqual([3, 4]);
  });

  it('nhân vật trong trạng thái overlay: tên đã lọc, danh hiệu theo tổng công', () => {
    core.processEvent({ type: 'like', user: viewer(1, 'Bé Na'), count: 3, ts: clock.t, eventId: 'l1' });
    gift(2, 100, 'g1'); // 10.000 công
    const s = buildOverlayState(core, null);
    expect(s.actors).toEqual([
      { id: 'p1', kind: 'viewer', name: 'Bé Na', title: null },
      { id: 'p2', kind: 'viewer', name: 'Người xem 2', title: 'Thợ cả' },
    ]);
    expect(s.characters).toMatchObject({ heightMap: 54, boostSec: 4, plusText: '+{points} {unit}', honorRotateSec: 20 });
  });

  it('khởi động lại giữa phiên: dựng lại nhân vật từ sự kiện của phiên, bỏ người đã hết giờ', async () => {
    core.processEvent({ type: 'like', user: viewer(1), count: 1, ts: clock.t, eventId: 'a' });
    clock.advance(9 * MIN);
    core.processEvent({ type: 'comment', user: viewer(2), text: 'chào', ts: clock.t, eventId: 'b' });
    clock.advance(2 * MIN);
    await core.close();
    core = openTestCore(root, clock);
    core.setCrowdForced('vua');
    expect(core.roster.list().map((m) => m.id)).toEqual(['p2']); // p1 đã 11 phút không tương tác (vừa: 10 phút)
  });
});
