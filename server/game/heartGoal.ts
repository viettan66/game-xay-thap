// Mục tiêu tim của phiên (bảng 9A SPEC).
// - Khi bắt đầu phiên: lấy nấc đầu của chế độ độ đông lúc đó (vắng 500, vừa 5.000, đông 10.000, rất đông 50.000 nhiều nấc).
// - Đạt nấc thì mở nấc tiếp theo của chế độ hiện tại (nếu có). Hết nấc mà chế độ tăng lên thì mở nấc tiếp theo
//   của chế độ mới (lớn hơn nấc đã đạt).
// - Mục tiêu đặt tay từ admin luôn được ưu tiên.
// Phần logic thuần (HeartGoal) có test; HeartGoalService đếm tim của phiên và lưu trạng thái vào DB.

import type { CrowdTier } from '../../shared/protocol.js';
import type { LiveEvent } from '../../shared/types.js';
import type { DB } from '../db/database.js';
import { getSetting, setSetting } from '../db/settings.js';
import { CROWD_TIERS } from './crowd.js';

export type GoalTargets = Record<CrowdTier, number[]>;

export interface GoalState {
  sessionId: number;
  /** Nấc đang nhắm tới (null = đã đạt hết). */
  target: number | null;
  reached: number[];
  /** Mục tiêu đặt tay từ admin. */
  manual: number | null;
  tier: CrowdTier;
}

const rank = (t: CrowdTier) => CROWD_TIERS.indexOf(t);
const sorted = (a: number[]) => [...a].sort((x, y) => x - y);

export class HeartGoal {
  state: GoalState | null = null;

  constructor(private readonly targets: () => GoalTargets) {}

  /** Nấc kế tiếp của chế độ, lớn hơn nấc đã đạt cao nhất. */
  private nextFor(tier: CrowdTier, after: number): number | null {
    return sorted(this.targets()[tier]).find((t) => t > after) ?? null;
  }

  start(sessionId: number, tier: CrowdTier): void {
    this.state = { sessionId, target: sorted(this.targets()[tier])[0] ?? null, reached: [], manual: null, tier };
  }

  /** Số tim của phiên vừa đổi: trả về nấc vừa đạt (hoặc null). */
  check(count: number, tier: CrowdTier): number | null {
    const s = this.state;
    if (!s || s.target === null || count < s.target) return null;
    const hit = s.target;
    s.reached.push(hit);
    if (s.manual !== null) {
      // Mục tiêu đặt tay đạt rồi: chờ admin đặt mục tiêu mới (hoặc bỏ đặt tay để về nấc tự động).
      s.target = null;
    } else {
      s.target = this.nextFor(tier, hit);
    }
    s.tier = tier;
    return hit;
  }

  /** Chế độ độ đông đổi trong phiên. */
  onTier(tier: CrowdTier): void {
    const s = this.state;
    if (!s) return;
    if (s.manual === null && s.target === null && rank(tier) > rank(s.tier)) {
      s.target = this.nextFor(tier, Math.max(0, ...s.reached));
    }
    s.tier = tier;
  }

  /** Admin đặt mục tiêu (null = bỏ đặt tay, về nấc tự động). */
  setManual(target: number | null, tier: CrowdTier): void {
    const s = this.state;
    if (!s) return;
    s.manual = target;
    s.target = target ?? this.nextFor(tier, Math.max(0, ...s.reached));
  }
}

export interface GoalInfo {
  sessionId: number | null;
  count: number;
  target: number | null;
  reached: number[];
  manual: number | null;
}

/** Đếm tim của phiên, giữ trạng thái mục tiêu trong DB (khởi động lại giữa phiên vẫn đúng). */
export class HeartGoalService {
  readonly goal: HeartGoal;
  private count = 0;

  constructor(
    private readonly db: DB,
    targets: () => GoalTargets,
    private readonly tier: () => CrowdTier,
    private readonly sessionId: () => number | null,
  ) {
    this.goal = new HeartGoal(targets);
    const saved = getSetting<GoalState | null>(db, 'heart_goal', null);
    const sid = sessionId();
    if (sid !== null) {
      if (saved && saved.sessionId === sid) this.goal.state = saved;
      else this.goal.start(sid, tier());
      this.count = this.sessionLikes(sid);
      this.save();
    }
  }

  private sessionLikes(sid: number): number {
    const r = this.db
      .prepare<[number], { n: number | null }>(
        "SELECT SUM(CAST(json_extract(payload_json, '$.count') AS INTEGER)) AS n FROM events WHERE session_id = ? AND type = 'like'",
      )
      .get(sid);
    return r?.n ?? 0;
  }

  private save(): void {
    setSetting(this.db, 'heart_goal', this.goal.state);
  }

  onSessionStart(sid: number): void {
    this.goal.start(sid, this.tier());
    this.count = this.sessionLikes(sid);
    this.save();
  }

  /** Sự kiện đã ghi (không tính sự kiện trùng): tim thì cộng. Trả về nấc vừa đạt (hoặc null). */
  onEvent(ev: LiveEvent): number | null {
    if (ev.type !== 'like' || !this.goal.state || this.goal.state.sessionId !== this.sessionId()) return null;
    this.count += Math.max(0, Math.floor(ev.count));
    const hit = this.goal.check(this.count, this.tier());
    if (hit !== null) this.save();
    return hit;
  }

  onTier(): void {
    if (!this.goal.state) return;
    this.goal.onTier(this.tier());
    this.save();
  }

  setManual(target: number | null): number | null {
    if (!this.goal.state) return null;
    this.goal.setManual(target, this.tier());
    const hit = this.goal.check(this.count, this.tier());
    this.save();
    return hit;
  }

  info(): GoalInfo {
    const s = this.goal.state;
    const active = s && s.sessionId === this.sessionId();
    return {
      sessionId: active ? s.sessionId : null,
      count: active ? this.count : 0,
      target: active ? s.target : null,
      reached: active ? [...s.reached] : [],
      manual: active ? s.manual : null,
    };
  }
}
