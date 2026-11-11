// Chế độ theo độ đông của phòng (mục 9A SPEC): vang / vua / dong / ratdong. Không đọc DB, có test.
//
// - Hai chỉ số trong cửa sổ trượt (mặc định 5 phút): số người xem đồng thời (sự kiện `viewers`, lấy số gần nhất)
//   và số người có tương tác thật (comment, tim, quà). Chế độ = mức cao hơn trong hai cách tính.
//   Nguồn live không báo số người xem thì chỉ dùng số người tương tác.
// - Độ trễ: phải ở mức mới liên tục `hysteresisSec` (mặc định 120 giây) mới đổi.
//   Riêng chuyển LÊN mức đông hơn khi có đợt dồn dập (quá `burstEvents` sự kiện trong `burstWindowSec`) thì đổi ngay.
// - Admin ép một chế độ (hoặc để tự động).

import type { CrowdTier } from '../../shared/protocol.js';
import type { LiveEvent } from '../../shared/types.js';

export const CROWD_TIERS: CrowdTier[] = ['vang', 'vua', 'dong', 'ratdong'];

export interface CrowdRules {
  /** Ngưỡng trên của vang, vua, dong (người xem): ≤ [0] vang, ≤ [1] vua, ≤ [2] dong, lớn hơn là ratdong. */
  viewers: [number, number, number];
  /** Ngưỡng trên của vang, vua, dong (người tương tác trong cửa sổ). */
  interactors: [number, number, number];
  windowSec: number;
  hysteresisSec: number;
  burstEvents: number;
  burstWindowSec: number;
}

export interface CrowdInfo {
  /** Chế độ đang áp dụng (đã tính ép tay). */
  tier: CrowdTier;
  /** Chế độ tự tính (đã qua độ trễ). */
  auto: CrowdTier;
  /** Mức tính ngay lúc này (chưa qua độ trễ). */
  raw: CrowdTier;
  forced: CrowdTier | null;
  viewers: number | null;
  interactors: number;
}

const rank = (t: CrowdTier) => CROWD_TIERS.indexOf(t);

export function tierOf(n: number, bounds: [number, number, number]): CrowdTier {
  if (n <= bounds[0]) return 'vang';
  if (n <= bounds[1]) return 'vua';
  if (n <= bounds[2]) return 'dong';
  return 'ratdong';
}

export function higherTier(a: CrowdTier, b: CrowdTier): CrowdTier {
  return rank(a) >= rank(b) ? a : b;
}

export class CrowdTracker {
  private lastViewers: { ts: number; count: number } | null = null;
  private interactions = new Map<string, number>();
  private events: number[] = [];
  private current: CrowdTier | null = null;
  private candidate: { tier: CrowdTier; since: number } | null = null;
  forced: CrowdTier | null = null;

  constructor(private rules: () => CrowdRules) {}

  /** Ghi nhận một sự kiện live (chỉ sự kiện đã được tính, không tính sự kiện trùng). */
  observe(ev: LiveEvent, now: number): void {
    if (ev.type === 'viewers') {
      this.lastViewers = { ts: now, count: Math.max(0, Math.floor(ev.count)) };
      return;
    }
    this.events.push(now);
    if (ev.type === 'like' || ev.type === 'comment' || ev.type === 'gift') this.interactions.set(ev.user.platformId, now);
  }

  private prune(now: number): void {
    const r = this.rules();
    const from = now - r.windowSec * 1000;
    for (const [id, ts] of this.interactions) if (ts < from) this.interactions.delete(id);
    if (this.lastViewers && this.lastViewers.ts < from) this.lastViewers = null;
    const burstFrom = now - r.burstWindowSec * 1000;
    let k = 0;
    while (k < this.events.length && this.events[k]! < burstFrom) k++;
    if (k) this.events.splice(0, k);
  }

  /** Mức tính ngay lúc này theo hai chỉ số. */
  rawTier(now: number): CrowdTier {
    this.prune(now);
    const r = this.rules();
    const byInteract = tierOf(this.interactions.size, r.interactors);
    return this.lastViewers ? higherTier(byInteract, tierOf(this.lastViewers.count, r.viewers)) : byInteract;
  }

  /** Cập nhật chế độ tự động (gọi sau mỗi sự kiện và định kỳ). Trả về true nếu chế độ đang áp dụng vừa đổi. */
  update(now: number): boolean {
    const before = this.tier;
    const raw = this.rawTier(now);
    const r = this.rules();
    if (this.current === null) this.current = raw;
    else if (raw === this.current) this.candidate = null;
    else {
      const burst = this.events.length > r.burstEvents;
      if (rank(raw) > rank(this.current) && burst) {
        this.current = raw;
        this.candidate = null;
      } else if (this.candidate?.tier !== raw) this.candidate = { tier: raw, since: now };
      else if (now - this.candidate.since >= r.hysteresisSec * 1000) {
        this.current = raw;
        this.candidate = null;
      }
    }
    return this.tier !== before;
  }

  get tier(): CrowdTier {
    return this.forced ?? this.current ?? 'vang';
  }

  info(now: number): CrowdInfo {
    const raw = this.rawTier(now);
    return {
      tier: this.tier,
      auto: this.current ?? raw,
      raw,
      forced: this.forced,
      viewers: this.lastViewers?.count ?? null,
      interactors: this.interactions.size,
    };
  }
}
