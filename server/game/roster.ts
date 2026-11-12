// Danh sách nhân vật người xem đang có trên bản đồ (mục 9, bảng 9A). Thuần (không đụng DB), có test.
// Server quyết định AI có nhân vật; overlay lo đi lại, làm việc, đi vào / đi ra cho mượt.
// - Sinh nhân vật theo chế độ độ đông: vắng = vào phòng; vừa = tương tác đầu tiên; đông = quà, ≥ 50 tim hoặc ≥ 3 comment
//   trong phiên; rất đông = chỉ khi tặng quà (số liệu trong config characters.spawn).
// - Không tương tác quá idleMin của chế độ hiện tại thì đi ra (rất đông: người tặng nhiều được ở lâu hơn). Rời dần từng người.
// - Tối đa maxCharacters. Đầy chỗ: bỏ người có thứ tự ưu tiên thấp nhất theo chế độ (người mới thấp nhất thì không sinh).
//   (NPC và người góp công cũ rời trước người thật: thêm ở phần 4e.)

import type { CrowdTier } from '../../shared/protocol.js';
import type { UserLiveEvent } from '../../shared/types.js';
import type { GameConfig } from '../config/schema.js';

export type RosterConfig = GameConfig['characters'];

export interface RosterMember {
  id: string;
  name: string;
  title: string | null;
  joinedAt: number;
  /** Lần tương tác gần nhất (tim, comment, quà); người chỉ vào phòng thì là lúc vào. */
  lastActive: number;
  /** Tổng xu đã tặng trong phiên. */
  sessionCoins: number;
  /** Các lần tặng gần đây [thời điểm, xu] (để xét người tặng nhiều nhất trong topWindowSec). */
  recentGifts: [number, number][];
}

interface Counter {
  likes: number;
  comments: number;
  coins: number;
}

export interface RosterEvent {
  ev: UserLiveEvent;
  /** Tên đã lọc từ cấm. */
  name: string;
  /** Danh hiệu theo tổng công sau sự kiện này. */
  title: string | null;
  /** Xu của quà (0 nếu không phải quà). */
  coins: number;
}

const isInteraction = (ev: UserLiveEvent) => ev.type === 'like' || ev.type === 'comment' || ev.type === 'gift';

/** Có sinh nhân vật cho người này không (mục 9A "Sinh nhân vật khi"). Quà luôn sinh. */
export function shouldSpawn(rule: RosterConfig['spawn'][CrowdTier], ev: UserLiveEvent, c: Counter): boolean {
  if (ev.type === 'gift') return true;
  if (ev.type === 'join') return rule.onJoin;
  if (rule.onJoin) return true; // phòng vắng: đã có mặt là có nhân vật, kể cả khi không thấy sự kiện vào phòng
  if (ev.type === 'like') return rule.likes > 0 && c.likes >= rule.likes;
  if (ev.type === 'comment') return rule.comments > 0 && c.comments >= rule.comments;
  return false;
}

/** Bao lâu không tương tác thì rời màn hình (ms). Phòng rất đông: người tặng ≥ bigGiverCoins được ở lâu hơn. */
export function idleLimitMs(cfg: RosterConfig, tier: CrowdTier, m: RosterMember): number {
  const base = cfg.idleMin[tier];
  const min = tier === 'ratdong' && m.sessionCoins >= cfg.bigGiverCoins ? Math.max(base, cfg.bigGiverIdleMin) : base;
  return min * 60_000;
}

const recentCoins = (m: RosterMember, now: number, windowMs: number) =>
  m.recentGifts.reduce((a, [ts, c]) => (now - ts <= windowMs ? a + c : a), 0);

/**
 * Thứ tự rời đi khi đầy chỗ (phần tử đầu rời trước), theo cột "Ưu tiên giữ khi đầy chỗ" của bảng 9A:
 * vừa = giữ người tương tác gần nhất; đông = giữ người tặng quà; rất đông = giữ người tặng nhiều nhất gần đây.
 * Còn lại: người lâu không tương tác nhất và góp ít nhất rời trước (mục 9).
 */
export function evictOrder(members: RosterMember[], tier: CrowdTier, now: number, windowMs: number): RosterMember[] {
  const key = (m: RosterMember): number[] => {
    const base = [m.lastActive, m.sessionCoins, m.joinedAt];
    if (tier === 'dong') return [m.sessionCoins > 0 ? 1 : 0, ...base];
    if (tier === 'ratdong') return [recentCoins(m, now, windowMs), ...base];
    return base;
  };
  return [...members].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i]! - kb[i]!;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export interface RosterDeps {
  config: () => RosterConfig;
  tier: () => CrowdTier;
}

export class CharacterRoster {
  private readonly members = new Map<string, RosterMember>();
  /** Đếm tim, comment, xu trong phiên của từng người (kể cả người chưa có nhân vật). */
  private counters = new Map<string, Counter>();
  private lastLeaveAt = -Infinity;

  constructor(private readonly deps: RosterDeps) {}

  /** Danh sách đang có, theo thứ tự vào. */
  list(): RosterMember[] {
    return [...this.members.values()].sort((a, b) => a.joinedAt - b.joinedAt || (a.id < b.id ? -1 : 1));
  }

  has(id: string): boolean {
    return this.members.has(id);
  }

  get size(): number {
    return this.members.size;
  }

  /** Phiên mới: đếm lại tim, comment, xu trong phiên. Nhân vật đang có vẫn ở lại tới khi hết giờ. */
  onSessionStart(): void {
    this.counters = new Map();
    for (const m of this.members.values()) m.sessionCoins = 0;
  }

  /** Một sự kiện của người xem. Trả về true nếu danh sách nhân vật thay đổi (thêm, bớt, đổi tên, danh hiệu). */
  onEvent(e: RosterEvent, now: number): boolean {
    const { ev } = e;
    const c = this.counters.get(ev.user.platformId) ?? { likes: 0, comments: 0, coins: 0 };
    if (ev.type === 'like') c.likes += Math.max(0, ev.count);
    else if (ev.type === 'comment') c.comments += 1;
    else if (ev.type === 'gift') c.coins += Math.max(0, e.coins);
    this.counters.set(ev.user.platformId, c);

    const id = ev.user.platformId;
    const cfg = this.deps.config();
    const m = this.members.get(id);
    if (m) {
      const changed = m.name !== e.name || m.title !== e.title;
      m.name = e.name;
      m.title = e.title;
      if (isInteraction(ev)) m.lastActive = now;
      if (ev.type === 'gift' && e.coins > 0) {
        m.sessionCoins = c.coins;
        m.recentGifts = m.recentGifts.filter(([ts]) => now - ts <= cfg.topWindowSec * 1000);
        m.recentGifts.push([now, e.coins]);
      }
      return changed;
    }
    if (!shouldSpawn(cfg.spawn[this.deps.tier()], ev, c)) return false;
    const cand: RosterMember = {
      id,
      name: e.name,
      title: e.title,
      joinedAt: now,
      lastActive: now,
      sessionCoins: c.coins,
      recentGifts: ev.type === 'gift' && e.coins > 0 ? [[now, e.coins]] : [],
    };
    if (this.members.size >= cfg.maxCharacters) {
      const order = evictOrder([...this.members.values(), cand], this.deps.tier(), now, cfg.topWindowSec * 1000);
      if (order[0] === cand) return false; // người mới có ưu tiên thấp nhất: không sinh
      // Đầy chỗ: người ưu tiên thấp nhất đi ra cho người mới vào (có thể nhiều người nếu vừa giảm maxCharacters).
      for (const out of order) {
        if (this.members.size < cfg.maxCharacters) break;
        if (out !== cand) this.members.delete(out.id);
      }
    }
    this.members.set(id, cand);
    return true;
  }

  /**
   * Gọi định kỳ: người không tương tác quá lâu đi ra; thừa chỗ (vừa giảm maxCharacters) thì bớt dần.
   * Mỗi leaveGapSec giây chỉ một người rời, để nhân vật không biến mất cùng lúc khi đổi chế độ (mục 9A).
   * `all` = true: bỏ hết những người đã hết giờ ngay (dựng lại sau khi khởi động).
   */
  tick(now: number, all = false): boolean {
    const cfg = this.deps.config();
    const tier = this.deps.tier();
    if (!all && now - this.lastLeaveAt < cfg.leaveGapSec * 1000) return false;
    let changed = false;
    for (;;) {
      const members = [...this.members.values()];
      const idle = members.filter((m) => now - m.lastActive > idleLimitMs(cfg, tier, m)).sort((a, b) => a.lastActive - b.lastActive);
      const out = idle[0] ?? (members.length > cfg.maxCharacters ? evictOrder(members, tier, now, cfg.topWindowSec * 1000)[0] : undefined);
      if (!out) break;
      this.members.delete(out.id);
      this.lastLeaveAt = now;
      changed = true;
      if (!all) break;
    }
    return changed;
  }
}
