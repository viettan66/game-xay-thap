// Trụ trì nói gì, lúc nào (mục 9, 9A, 9C SPEC). Không vẽ gì: gửi tin "say" xuống overlay (dáng + câu thoại).
//
// - Hàng đợi có ưu tiên: lễ, mở / đóng phiên > cảm ơn quà > chào, báo tiến độ > thoại tự do.
//   Thoại tự do bị bỏ khi hàng đợi đang dài; hàng đợi quá dài thì bỏ câu kém ưu tiên nhất.
//   Câu được chọn lúc sắp nói (đúng chế độ độ đông lúc đó). Mỗi lần nói một câu, hiện 4–6 giây tùy độ dài.
// - Chào người mới (bảng 9A): vắng chào từng người khi vào; vừa chào lần tương tác đầu trong phiên, gộp nhóm
//   tối đa 1 câu/greetGroupSec giây; đông và rất đông không chào. Mỗi người chào bằng tên tối đa 1 lần/phiên.
// - Cảm ơn quà: vắng, vừa cảm ơn mọi quà (vừa: quà liên tiếp của cùng người được gộp); đông cảm ơn quà từ
//   waveMinCoins xu và quà đầu tiên của mỗi người; rất đông chỉ cảm ơn quà từ bowMinCoins xu. Quà còn lại ở đông,
//   rất đông được gộp thành một câu cảm ơn chung mỗi thanksGroupSec giây.
// - Dáng: quà từ waveMinCoins xu vẫy chào, quà rất lớn (từ bowMinCoins xu) cúi chào (phòng vắng: cúi chào mọi quà),
//   lễ và xong hạng mục dang tay, còn lại chắp tay.
// - Báo tiến độ ở đông, rất đông khi giai đoạn qua các mốc progressMarks (%). Thoại tự do theo idleSec của chế độ.
// - Tên người xem đi qua bộ lọc tên. Live thật chỉ nói câu đã duyệt.

import type { AbbotPose, CrowdTier, ProgressView, ServerMessage } from '../../shared/protocol.js';
import type { ProgressTransition } from '../../shared/project.js';
import type { LiveEvent } from '../../shared/types.js';
import type { GameConfig } from '../config/schema.js';
import type { DialogueSelector, DialogueVars } from '../dialogue/selector.js';
import type { ProcessResult } from '../game/engine.js';

export type SayMessage = Extract<ServerMessage, { type: 'say' }>;

/** Ưu tiên trong hàng đợi. */
export const PRIORITY = { free: 0, greet: 1, gift: 2, event: 3 } as const;

interface QueueItem {
  key: string | null;
  groups: string[];
  vars: DialogueVars;
  pose: AbbotPose;
  priority: number;
  at: number;
  /** Chưa được nói trước thời điểm này (ví dụ đợi mảnh cuối của giai đoạn đặt xong). */
  notBefore: number;
  /** Gộp quà liên tiếp của cùng người. */
  gift?: { pid: string; name: string; coins: number; giftId: string };
}

export interface GreetStore {
  has(sessionId: number, platformId: string): boolean;
  add(sessionId: number, platformId: string): void;
}

export interface AbbotDeps {
  selector: Pick<DialogueSelector, 'pick'>;
  config: () => GameConfig;
  tier: () => CrowdTier;
  /** Live thật: chỉ nói câu đã duyệt. */
  verifiedOnly: () => boolean;
  progress: () => ProgressView;
  /** Tên hiển thị đã lọc. */
  name: (raw: string) => string;
  sessionId: () => number | null;
  greeted: GreetStore;
  /** Số người đã góp công cho hạng mục (cho câu "cảm ơn {count} thiện hữu"). */
  itemContributors: (itemId: string) => number;
  send: (msg: SayMessage) => void;
  now: () => number;
  rng?: () => number;
}

/** Thời gian hiện bong bóng: 4–6 giây tùy độ dài câu. */
export function sayDurationMs(text: string | null): number {
  if (!text) return 3000;
  return Math.round(Math.max(4000, Math.min(6000, 2500 + text.length * 45)));
}

/** Gộp tên: "A", "A và B", "A, B và C". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} và ${names[names.length - 1]}`;
}

export class AbbotDirector {
  private queue: QueueItem[] = [];
  private busyUntil = 0;
  private nextIdleAt: number | null = null;
  private idleTurn = 0;
  private pendingGreet: { pid: string; name: string }[] = [];
  private greetFlushAt: number | null = null;
  private groupGifters = new Set<string>();
  private groupFlushAt: number | null = null;
  /** Người đã tặng quà trong phiên (phòng đông: cảm ơn quà đầu tiên). */
  private giftedInSession = new Set<string>();
  private giftSession: number | null = null;
  /** Phần trăm giai đoạn lần trước (để báo khi qua mốc). */
  private lastStage: { key: string; percent: number } | null = null;
  private readonly rng: () => number;

  constructor(private readonly d: AbbotDeps) {
    this.rng = d.rng ?? Math.random;
  }

  get queueLength(): number {
    return this.queue.length;
  }

  // ---------- Đầu vào ----------

  onSessionStart(): void {
    this.giftedInSession.clear();
    const p = this.d.progress();
    this.enqueue({ groups: ['session_start'], vars: { item: p.item.name, stage: p.stage.name }, pose: 'welcome', priority: PRIORITY.event });
  }

  onSessionEnd(): void {
    this.queue = this.queue.filter((q) => q.priority >= PRIORITY.event);
    this.enqueue({ groups: ['session_end'], vars: {}, pose: 'pray', priority: PRIORITY.event });
  }

  onEvent(ev: LiveEvent, r: ProcessResult): void {
    if (ev.type === 'viewers' || r.status === 'duplicate') return;
    const tier = this.d.tier();
    const pid = ev.user.platformId;
    const name = this.d.name(ev.user.nickname);
    const session = this.d.sessionId();
    if (session !== this.giftSession) {
      this.giftSession = session;
      this.giftedInSession.clear();
    }

    // Chào người mới.
    if (session !== null && !this.d.greeted.has(session, pid)) {
      if (tier === 'vang' && ev.type === 'join') {
        this.d.greeted.add(session, pid);
        const p = this.d.progress();
        this.enqueue({ key: `greet:${pid}`, groups: ['greet_single'], vars: { name, item: p.item.name, stage: p.stage.name }, pose: 'wave', priority: PRIORITY.greet });
      } else if (tier === 'vua' && (ev.type === 'like' || ev.type === 'comment' || ev.type === 'gift')) {
        this.d.greeted.add(session, pid);
        this.pendingGreet.push({ pid, name });
        this.greetFlushAt ??= this.d.now() + this.d.config().abbot.greetGroupSec * 1000;
      }
    }

    if (ev.type === 'gift' && r.status === 'counted') this.onGift(pid, name, Math.max(0, ev.coinValueEach) * Math.max(0, ev.count), ev.giftId, tier);
    if (r.progress) this.onTransitions(r.progress.transitions);
    this.checkMilestone(tier);
  }

  private onGift(pid: string, name: string, coins: number, giftId: string, tier: CrowdTier): void {
    const a = this.d.config().abbot;
    const first = !this.giftedInSession.has(pid);
    this.giftedInSession.add(pid);
    const individual =
      tier === 'vang' || tier === 'vua' ? true : tier === 'dong' ? coins >= a.waveMinCoins || first : coins >= a.bowMinCoins;
    if (!individual) {
      this.groupGifters.add(pid);
      this.groupFlushAt ??= this.d.now() + a.thanksGroupSec * 1000;
      return;
    }
    // Phòng vừa: quà liên tiếp của cùng người (chưa kịp cảm ơn) được gộp thành một câu.
    const key = `gift:${pid}`;
    const pending = tier === 'vua' ? this.queue.find((q) => q.key === key && q.gift) : undefined;
    if (pending?.gift) {
      pending.gift.coins += coins;
      Object.assign(pending, this.giftParts(pending.gift.name, pending.gift.coins, pending.gift.giftId, tier));
      return;
    }
    this.enqueue({ key, priority: PRIORITY.gift, gift: { pid, name, coins, giftId }, ...this.giftParts(name, coins, giftId, tier) });
  }

  private giftParts(name: string, coins: number, giftId: string, tier: CrowdTier): Pick<QueueItem, 'groups' | 'vars' | 'pose'> {
    const cfg = this.d.config();
    const t = [...cfg.gifts.tiers].reverse().find((x) => coins >= x.minCoins) ?? cfg.gifts.tiers[0]!;
    const display = cfg.gifts.displayNames[giftId];
    const gift = display ? `${t.name} (${display})` : t.name;
    const pose: AbbotPose = tier === 'vang' || coins >= cfg.abbot.bowMinCoins ? 'bow' : coins >= cfg.abbot.waveMinCoins ? 'wave' : 'pray';
    return { groups: [t.dialogue, 'gift_small'], vars: { name, gift }, pose };
  }

  onTransitions(ts: ProgressTransition[]): void {
    const p = this.d.progress();
    const now = this.d.now();
    for (const t of ts) {
      if (t.type === 'stage_complete' && t.ritual) {
        const item = p.items.find((i) => i.id === t.itemId);
        this.enqueue({
          groups: ['stage_ritual'],
          vars: { ritual: t.ritual, item: item?.name, stage: item?.stages[t.stageIndex]?.name },
          pose: 'welcome',
          priority: PRIORITY.event,
          notBefore: now + 2000,
        });
      } else if (t.type === 'item_complete') {
        const item = p.items.find((i) => i.id === t.itemId);
        this.enqueue({
          groups: ['item_complete'],
          vars: { item: item?.name, count: this.d.itemContributors(t.itemId) },
          pose: 'welcome',
          priority: PRIORITY.event,
          notBefore: now + 2000,
        });
      }
    }
  }

  /** Báo tiến độ khi giai đoạn qua mốc % (phòng đông, rất đông). */
  private checkMilestone(tier: CrowdTier): void {
    const p = this.d.progress();
    const key = `${p.item.id}:${p.stage.number}`;
    const prev = this.lastStage?.key === key ? this.lastStage.percent : 0;
    this.lastStage = { key, percent: p.percent };
    if (p.completed || (tier !== 'dong' && tier !== 'ratdong')) return;
    const mark = [...this.d.config().abbot.progressMarks].sort((a, b) => b - a).find((m) => prev < m && p.percent >= m);
    if (mark === undefined) return;
    this.enqueue({ key: 'progress', groups: ['progress'], vars: { item: p.item.name, stage: p.stage.name, percent: mark }, pose: 'pray', priority: PRIORITY.greet });
  }

  // ---------- Hàng đợi ----------

  private enqueue(i: Omit<QueueItem, 'at' | 'notBefore' | 'key'> & { key?: string | null; notBefore?: number }): void {
    const now = this.d.now();
    const item: QueueItem = { key: i.key ?? null, at: now, notBefore: i.notBefore ?? now, ...i } as QueueItem;
    if (item.key) {
      const same = this.queue.findIndex((q) => q.key === item.key);
      if (same >= 0) {
        this.queue[same] = { ...item, at: this.queue[same]!.at };
        return;
      }
    }
    // Thoại tự do bị bỏ nếu hàng đợi đang dài.
    if (item.priority === PRIORITY.free && this.queue.length >= 2) return;
    this.queue.push(item);
    this.queue.sort((a, b) => b.priority - a.priority || a.at - b.at);
    const max = this.d.config().abbot.maxQueue;
    while (this.queue.length > max) {
      // Bỏ câu kém ưu tiên nhất, cũ nhất.
      let worst = this.queue.length - 1;
      for (let k = this.queue.length - 1; k >= 0; k--) if (this.queue[k]!.priority < this.queue[worst]!.priority) worst = k;
      this.queue.splice(worst, 1);
    }
  }

  private scheduleIdle(now: number): void {
    const [a, b] = this.d.config().abbot.idleSec[this.d.tier()];
    this.nextIdleAt = b > 0 ? now + (a + (b - a) * this.rng()) * 1000 : null;
  }

  /** Gọi định kỳ (khoảng mỗi nửa giây): gộp chào, gộp cảm ơn, thoại tự do, nói câu kế tiếp. */
  tick(): void {
    const now = this.d.now();
    const tier = this.d.tier();
    if (this.greetFlushAt !== null && now >= this.greetFlushAt) {
      const list = this.pendingGreet.splice(0);
      this.greetFlushAt = null;
      const p = this.d.progress();
      if (list.length === 1) {
        this.enqueue({ key: `greet:${list[0]!.pid}`, groups: ['greet_single'], vars: { name: list[0]!.name, item: p.item.name, stage: p.stage.name }, pose: 'wave', priority: PRIORITY.greet });
      } else if (list.length > 1) {
        const shown = list.slice(0, 3).map((x) => x.name);
        const rest = list.length - shown.length;
        this.enqueue({
          key: 'greet:group',
          groups: ['greet_group'],
          vars: { names: joinNames(shown), n: rest > 0 ? rest : undefined, stage: p.stage.name },
          pose: 'wave',
          priority: PRIORITY.greet,
        });
      }
    }
    if (this.groupFlushAt !== null && now >= this.groupFlushAt) {
      const n = this.groupGifters.size;
      this.groupGifters.clear();
      this.groupFlushAt = null;
      if (n > 0) this.enqueue({ key: 'gift:group', groups: ['gift_thanks_group'], vars: { n }, pose: 'wave', priority: PRIORITY.gift });
    }
    if (this.nextIdleAt === null) this.scheduleIdle(now);
    if (this.nextIdleAt !== null && now >= this.nextIdleAt && !this.queue.length && now >= this.busyUntil) {
      const p = this.d.progress();
      if (tier === 'dong' && !p.completed && p.percent > 0) {
        this.enqueue({ groups: ['progress', 'idle_howto'], vars: { item: p.item.name, stage: p.stage.name, percent: p.percent }, pose: 'pray', priority: PRIORITY.free });
      } else if (tier === 'vang' || tier === 'vua' || tier === 'dong') {
        // Kể chuyện hai lần thì hướng dẫn một lần.
        const group = this.idleTurn++ % 3 === 2 ? 'idle_howto' : 'idle_story';
        this.enqueue({ groups: [group, group === 'idle_story' ? 'idle_howto' : 'idle_story'], vars: {}, pose: 'pray', priority: PRIORITY.free });
      }
      this.scheduleIdle(now);
    }
    this.speakNext(now, tier);
  }

  private speakNext(now: number, tier: CrowdTier): void {
    if (now < this.busyUntil) return;
    for (let k = 0; k < this.queue.length; k++) {
      const item = this.queue[k]!;
      if (now < item.notBefore) continue;
      this.queue.splice(k, 1);
      k--;
      let picked = null;
      for (const g of item.groups) {
        picked = this.d.selector.pick(g, { tier, vars: item.vars, verifiedOnly: this.d.verifiedOnly(), now });
        if (picked) break;
      }
      // Không có câu hợp lệ: vẫn đổi dáng cho lễ, quà lớn; còn lại bỏ qua.
      if (!picked && item.pose === 'pray') continue;
      const text = picked?.text ?? null;
      const durationMs = sayDurationMs(text);
      this.d.send({ type: 'say', text, pose: item.pose, durationMs, verified: picked?.verified ?? true });
      this.busyUntil = now + durationMs + 700;
      this.scheduleIdle(now);
      return;
    }
  }
}
