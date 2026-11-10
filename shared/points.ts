// Hàm tính công DUY NHẤT của game (mục 4 SPEC). Hàm thuần: không đọc DB, không đọc đồng hồ.
//
// Quy tắc đã chốt (mục 16):
// - Hệ số nhân áp dụng cho mọi nguồn (quà, tim, comment).
// - Trần tim + comment mỗi ngày tính trên điểm GỐC (trước khi nhân).
// - Làm tròn từng sự kiện, từ 0,5 trở lên làm tròn lên.

import type { LiveEvent } from './types.js';

export interface PointRules {
  giftPointsPerCoin: number;
  likePoints: number;
  commentPoints: number;
  commentCooldownSec: number;
  dailyLikeCommentCap: number;
}

/** Trạng thái của MỘT người xem cần để tính điểm. */
export interface UserPointState {
  /** Điểm gốc từ tim + comment đã dùng trong ngày (theo giờ Việt Nam). */
  capUsedToday: number;
  /** Lần cuối một comment của người này được tính công (ms), hoặc null. */
  lastCommentCountedAt: number | null;
}

export type ScoreSource = 'gift' | 'like' | 'comment' | 'none';

export interface ScoreResult {
  source: ScoreSource;
  /** Điểm gốc trước trần ngày và trước hệ số. */
  rawPoints: number;
  /** Điểm gốc sau trần ngày (trước hệ số). */
  basePoints: number;
  multiplier: number;
  /** Điểm cuối cùng được cộng. */
  points: number;
  /** Phần trần ngày bị dùng thêm bởi sự kiện này. */
  capUsedDelta: number;
  /** Comment này có được tính công không (để bắt đầu lại 30 giây chờ). */
  commentCounted: boolean;
  skipped?: 'cooldown' | 'daily_cap';
}

/** Làm tròn số không âm: từ 0,5 trở lên làm tròn lên. Bỏ qua sai số dấu phẩy động rất nhỏ. */
export function roundHalfUp(x: number): number {
  if (x <= 0) return 0;
  return Math.floor(x + 0.5 + 1e-9);
}

const nonNegInt = (n: number) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

export function scoreEvent(
  ev: LiveEvent,
  state: UserPointState,
  rules: PointRules,
  multiplier: number,
): ScoreResult {
  const mult = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
  const none = (source: ScoreSource, raw = 0, skipped?: ScoreResult['skipped']): ScoreResult => ({
    source,
    rawPoints: raw,
    basePoints: 0,
    multiplier: mult,
    points: 0,
    capUsedDelta: 0,
    commentCounted: false,
    ...(skipped ? { skipped } : {}),
  });

  switch (ev.type) {
    case 'gift': {
      const raw = nonNegInt(ev.coinValueEach) * nonNegInt(ev.count) * rules.giftPointsPerCoin;
      return {
        source: 'gift',
        rawPoints: raw,
        basePoints: raw,
        multiplier: mult,
        points: roundHalfUp(raw * mult),
        capUsedDelta: 0,
        commentCounted: false,
      };
    }
    case 'like': {
      const raw = nonNegInt(ev.count) * rules.likePoints;
      return applyDailyCap('like', raw, state, rules, mult) ?? none('like', raw, 'daily_cap');
    }
    case 'comment': {
      const raw = rules.commentPoints;
      const last = state.lastCommentCountedAt;
      if (last !== null && ev.ts - last < rules.commentCooldownSec * 1000) {
        return none('comment', raw, 'cooldown');
      }
      const r = applyDailyCap('comment', raw, state, rules, mult);
      return r ? { ...r, commentCounted: true } : none('comment', raw, 'daily_cap');
    }
    default:
      return none('none');
  }
}

function applyDailyCap(
  source: 'like' | 'comment',
  raw: number,
  state: UserPointState,
  rules: PointRules,
  mult: number,
): ScoreResult | null {
  const remaining = Math.max(0, rules.dailyLikeCommentCap - state.capUsedToday);
  const base = Math.min(raw, remaining);
  if (base <= 0) return null;
  return {
    source,
    rawPoints: raw,
    basePoints: base,
    multiplier: mult,
    points: roundHalfUp(base * mult),
    capUsedDelta: base,
    commentCounted: false,
  };
}
