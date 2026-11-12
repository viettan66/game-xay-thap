// Danh sách nhân vật người xem đang có trên bản đồ (mục 9, bảng 9A). Thuần (không đụng DB), có test.
// Server quyết định AI có nhân vật; overlay lo đi lại, làm việc, đi vào / đi ra cho mượt.
// - Sinh nhân vật theo chế độ độ đông: vắng = vào phòng; vừa = tương tác đầu tiên; đông = quà, ≥ 50 tim hoặc ≥ 3 comment
//   trong phiên; rất đông = chỉ khi tặng quà (số liệu trong config characters.spawn).
// - Không tương tác quá idleMin của chế độ hiện tại thì đi ra (rất đông: người tặng nhiều được ở lâu hơn). Rời dần từng người.
// - Tối đa maxCharacters. Đầy chỗ: bỏ người có thứ tự ưu tiên thấp nhất theo chế độ (người mới thấp nhất thì không sinh).
// - Dân phu NPC không tên và người góp công cũ (mục 9B, giai đoạn 4e): số người theo chế độ (vắng nhiều, đông thì không có),
//   thêm dần; tính chung vào maxCharacters; đầy chỗ thì dân phu rời trước, rồi người góp công cũ, rồi người thật.

import type { CharLook } from '../../shared/characters.js';
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

/** Người góp công cũ đang hiện (mục 9B): người xem thật có công từ phiên trước, không tạo sự kiện, không cộng điểm. */
export interface ReturningMember {
  id: string;
  name: string;
  /** Hạng mục người đó góp nhiều nhất (dòng phụ "đã góp {item}"). */
  itemId: string | null;
  joinedAt: number;
  /** Ở lại tới lúc này rồi đổi người khác (5–10 phút). */
  leaveAt: number;
}

/** Dân phu NPC không tên (mục 9B): không góp điểm, không nói, không được chào. */
export interface NpcMember {
  id: string;
  look: CharLook;
  joinedAt: number;
}

export interface ReturningPick {
  id: string;
  name: string;
  itemId: string | null;
}

export interface RosterDeps {
  config: () => RosterConfig;
  tier: () => CrowdTier;
  npc?: () => GameConfig['npc'];
  returning?: () => GameConfig['returning'];
  /** Chọn một người góp công cũ, bỏ qua những người `skip` trả true. Không còn ai thì null. */
  pickReturning?: (skip: (id: string) => boolean) => ReturningPick | null;
  /** Người góp công cũ vào phòng và tương tác: nhân vật chuyển sang người xem thật (trụ trì chào riêng, nhóm returning). */
  onBack?: (m: ReturningMember) => void;
  rand?: () => number;
}

/** Kiểu nhân vật của dân phu NPC: cả chú tiểu (quyết định 19: chú tiểu chỉ làm NPC). */
export const NPC_LOOKS: readonly CharLook[] = ['danphu_nam', 'danphu_nu', 'thomoc', 'thone', 'tusi'];

const pickIn = (r: [number, number], rand: () => number) => r[0] + Math.floor(rand() * (r[1] - r[0] + 1));

export class CharacterRoster {
  private readonly members = new Map<string, RosterMember>();
  private readonly returning = new Map<string, ReturningMember>();
  private npcs: NpcMember[] = [];
  /** Đếm tim, comment, xu trong phiên của từng người (kể cả người chưa có nhân vật). */
  private counters = new Map<string, Counter>();
  /** Người góp công cũ đã hiện gần đây (để đổi người khác, không lặp lại ngay). */
  private readonly shownAt = new Map<string, number>();
  private lastLeaveAt = -Infinity;
  private lastNpcAt = -Infinity;
  private lastReturningAt = -Infinity;
  private npcSeq = 0;
  private targets: { tier: CrowdTier | null; npc: number; returning: number } = { tier: null, npc: 0, returning: 0 };
  private readonly rand: () => number;

  constructor(private readonly deps: RosterDeps) {
    this.rand = deps.rand ?? Math.random;
  }

  /** Người xem thật đang có nhân vật, theo thứ tự vào. */
  list(): RosterMember[] {
    return [...this.members.values()].sort((a, b) => a.joinedAt - b.joinedAt || (a.id < b.id ? -1 : 1));
  }

  returningList(): ReturningMember[] {
    return [...this.returning.values()].sort((a, b) => a.joinedAt - b.joinedAt || (a.id < b.id ? -1 : 1));
  }

  npcList(): NpcMember[] {
    return [...this.npcs];
  }

  has(id: string): boolean {
    return this.members.has(id);
  }

  /** Số người xem thật có nhân vật. */
  get size(): number {
    return this.members.size;
  }

  /** Tổng số nhân vật (người xem + người góp công cũ + dân phu), tính vào maxCharacters. */
  get total(): number {
    return this.members.size + this.returning.size + this.npcs.length;
  }

  /** Số dân phu, người góp công cũ đang nhắm tới theo chế độ hiện tại. */
  get target(): { npc: number; returning: number } {
    return { npc: this.targets.npc, returning: this.targets.returning };
  }

  /** Phiên mới: đếm lại tim, comment, xu trong phiên. Nhân vật đang có vẫn ở lại tới khi hết giờ. */
  onSessionStart(): void {
    this.counters = new Map();
    for (const m of this.members.values()) m.sessionCoins = 0;
  }

  /** Admin vừa cho một người vào danh sách "không hiện lại": nhân vật người góp công cũ của họ đi ra ngay. */
  dropReturning(id: string): boolean {
    return this.returning.delete(id);
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
    const cand: RosterMember = {
      id,
      name: e.name,
      title: e.title,
      joinedAt: now,
      lastActive: now,
      sessionCoins: c.coins,
      recentGifts: ev.type === 'gift' && e.coins > 0 ? [[now, e.coins]] : [],
    };
    // Người góp công cũ đang hiện mà chính người đó tương tác: chuyển sang người xem thật, giữ nguyên nhân vật (mục 9B).
    const back = this.returning.get(id);
    if (back) {
      if (!isInteraction(ev)) return false;
      this.returning.delete(id);
      this.members.set(id, { ...cand, joinedAt: back.joinedAt });
      this.deps.onBack?.(back);
      return true;
    }
    if (!shouldSpawn(cfg.spawn[this.deps.tier()], ev, c)) return false;
    if (this.total >= cfg.maxCharacters) {
      // Đầy chỗ (mục 9): dân phu rời trước, rồi người góp công cũ, rồi người thật theo thứ tự ưu tiên của chế độ.
      if (this.npcs.length) this.npcs.pop();
      else if (this.returning.size) this.dropSoonestReturning();
      else {
        const order = evictOrder([...this.members.values(), cand], this.deps.tier(), now, cfg.topWindowSec * 1000);
        if (order[0] === cand) return false; // người mới có ưu tiên thấp nhất: không sinh
        for (const out of order) {
          if (this.total < cfg.maxCharacters) break;
          if (out !== cand) this.members.delete(out.id);
        }
      }
    }
    this.members.set(id, cand);
    return true;
  }

  private dropSoonestReturning(): void {
    const r = [...this.returning.values()].sort((a, b) => a.leaveAt - b.leaveAt)[0];
    if (r) this.returning.delete(r.id);
  }

  /**
   * Gọi định kỳ (mỗi nửa giây):
   * - thừa chỗ (người xem mới vào): dân phu, rồi người góp công cũ đi ra ngay;
   * - người không tương tác quá lâu, người góp công cũ hết giờ, dân phu / người góp công cũ thừa so với chế độ: đi ra dần,
   *   mỗi leaveGapSec giây một người (đổi chế độ không làm nhân vật biến mất cùng lúc, mục 9A);
   * - thiếu dân phu, người góp công cũ so với chế độ: thêm dần (fillGapSec), không vượt maxCharacters.
   * `all` = true: bỏ hết những người xem đã hết giờ ngay (dựng lại sau khi khởi động).
   */
  tick(now: number, all = false): boolean {
    const cfg = this.deps.config();
    const tier = this.deps.tier();
    const npcCfg = this.deps.npc?.();
    const retCfg = this.deps.returning?.();
    let changed = false;
    if (this.targets.tier !== tier) {
      this.targets = {
        tier,
        npc: npcCfg ? pickIn(npcCfg.count[tier], this.rand) : 0,
        returning: retCfg && this.deps.pickReturning ? pickIn(retCfg.count[tier], this.rand) : 0,
      };
    }
    // Thừa chỗ: dân phu, người góp công cũ nhường chỗ ngay cho người xem thật.
    while (this.total > cfg.maxCharacters && (this.npcs.length || this.returning.size)) {
      if (this.npcs.length) this.npcs.pop();
      else this.dropSoonestReturning();
      changed = true;
    }
    if (all || now - this.lastLeaveAt >= cfg.leaveGapSec * 1000) {
      for (;;) {
        const members = [...this.members.values()];
        const idle = members.filter((m) => now - m.lastActive > idleLimitMs(cfg, tier, m)).sort((a, b) => a.lastActive - b.lastActive);
        const out = idle[0] ?? (members.length > cfg.maxCharacters ? evictOrder(members, tier, now, cfg.topWindowSec * 1000)[0] : undefined);
        if (out) this.members.delete(out.id);
        else if (all) break;
        else {
          const expired = [...this.returning.values()].filter((r) => now >= r.leaveAt).sort((a, b) => a.leaveAt - b.leaveAt)[0];
          if (expired) this.returning.delete(expired.id);
          else if (this.npcs.length > this.targets.npc) this.npcs.shift();
          else if (this.returning.size > this.targets.returning) this.dropSoonestReturning();
          else break;
        }
        this.lastLeaveAt = now;
        changed = true;
        if (!all) break;
      }
    }
    if (all) return changed;
    // Thêm dần dân phu (ưu tiên trước người góp công cũ).
    if (npcCfg && this.npcs.length < this.targets.npc && this.total < cfg.maxCharacters && now - this.lastNpcAt >= npcCfg.fillGapSec * 1000) {
      this.npcs.push({ id: `npc-${++this.npcSeq}`, look: NPC_LOOKS[Math.floor(this.rand() * NPC_LOOKS.length)]!, joinedAt: now });
      this.lastNpcAt = now;
      changed = true;
    }
    if (
      retCfg &&
      this.deps.pickReturning &&
      this.returning.size < this.targets.returning &&
      this.total < cfg.maxCharacters &&
      now - this.lastReturningAt >= retCfg.fillGapSec * 1000
    ) {
      this.lastReturningAt = now;
      const cooldown = retCfg.cooldownMin * 60_000;
      const p = this.deps.pickReturning((id) => this.members.has(id) || this.returning.has(id) || now - (this.shownAt.get(id) ?? -Infinity) < cooldown);
      if (p) {
        const [a, b] = retCfg.staySec;
        this.returning.set(p.id, { ...p, joinedAt: now, leaveAt: now + (a + this.rand() * (b - a)) * 1000 });
        this.shownAt.set(p.id, now);
        if (this.shownAt.size > 1000) for (const [k, t] of this.shownAt) if (now - t >= cooldown) this.shownAt.delete(k);
        changed = true;
      }
    }
    return changed;
  }
}
