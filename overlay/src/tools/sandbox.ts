// Lõi thuần của trang thử /tools/build (R3c): công trình xây thử ngay trong trình duyệt.
// Dùng đúng hàm tính công (shared/points.ts) và hàm cộng điểm tràn giai đoạn (shared/project.ts) như server,
// nhưng KHÔNG ghi gì vào dữ liệu game: tải lại trang là xây lại từ đầu giai đoạn đã chọn.

import { scoreEvent, type PointRules } from '../../../shared/points.js';
import { applyPoints, type ProgressState, type ResolvedProject } from '../../../shared/project.js';
import { progressView, type ProgressLabels } from '../../../shared/progressView.js';
import type { ProgressView, ServerMessage } from '../../../shared/protocol.js';
import type { LiveEvent, LiveUser } from '../../../shared/types.js';

export type Contribution = Extract<ServerMessage, { type: 'contribution' }>;

/** Các nút trên trang thử. */
export type TrialAction = 'like10' | 'small' | 'large' | 'huge';
export const TRIAL_ACTIONS: TrialAction[] = ['like10', 'small', 'large', 'huge'];
/** Giá trị quà mặc định (xu), sửa được trên trang. Quà "rất lớn" theo SPEC là từ 1.000 xu. */
export const DEFAULT_COINS: Record<Exclude<TrialAction, 'like10'>, number> = { small: 1, large: 100, huge: 1000 };

/** Trạng thái xây khi bắt đầu thử ở hạng mục, giai đoạn đã chọn (các giai đoạn trước coi như xong). */
export function stateAt(p: ResolvedProject, itemId: string, stageIndex: number): ProgressState {
  const item = p.items.find((i) => i.id === itemId) ?? p.items[0]!;
  const k = Math.max(0, Math.min(item.stages.length - 1, Math.floor(stageIndex)));
  return { itemId: item.id, stageIndex: k, stagePoints: 0, stageCost: item.stages[k]!.cost, completed: false };
}

const TRIAL_USER: LiveUser = { platformId: 'trial', uniqueId: 'trial', nickname: 'trial' };

/** Một lần bấm nút thành sự kiện live giả, rồi tính công bằng đúng hàm của game (hệ số ×1, không tính trần ngày). */
export function trialEvent(action: TrialAction, coins: number, ts: number): LiveEvent {
  if (action === 'like10') return { type: 'like', user: TRIAL_USER, count: 10, ts };
  return { type: 'gift', user: TRIAL_USER, giftId: `trial_${action}`, giftName: action, coinValueEach: Math.max(0, Math.floor(coins)), count: 1, ts };
}

export function trialPoints(action: TrialAction, coins: number, rules: PointRules, ts = 0): { source: 'gift' | 'like'; points: number } {
  const r = scoreEvent(trialEvent(action, coins, ts), { capUsedToday: 0, lastCommentCountedAt: null }, rules, 1);
  return { source: action === 'like10' ? 'like' : 'gift', points: r.points };
}

/** Công trình xây thử: giữ tiến độ trong bộ nhớ, mỗi lần bấm trả về tin "contribution" như server gửi. */
export class Sandbox {
  private state: ProgressState;
  private total = 0;

  constructor(
    private readonly project: ResolvedProject,
    private readonly labels: ProgressLabels,
    itemId: string,
    stageIndex: number,
  ) {
    this.state = stateAt(project, itemId, stageIndex);
  }

  select(itemId: string, stageIndex: number): void {
    this.state = stateAt(this.project, itemId, stageIndex);
  }

  get progress(): ProgressState {
    return this.state;
  }

  give(name: string, source: Contribution['source'], points: number): Contribution | null {
    if (points <= 0) return null;
    const r = applyPoints(this.state, points, this.project);
    this.state = r.state;
    this.total += points;
    return { type: 'contribution', name, source, points, allocations: r.allocations };
  }

  view(): ProgressView {
    return progressView(this.state, this.project, this.labels, this.total);
  }
}

/** Bắn liên tục: chọn ngẫu nhiên một nút (tim nhiều nhất, quà cực lớn không có để khỏi chạy hết công trình). */
export function pickAuto(r: number): TrialAction {
  return r < 0.6 ? 'like10' : r < 0.95 ? 'small' : 'large';
}

/** Đo FPS: trung bình 1 giây gần nhất, và mức thấp nhất trong 10 giây gần nhất (đo theo từng giây). */
export class FpsMeter {
  private frames: number[] = [];
  private samples: { t: number; fps: number }[] = [];
  private lastSample = -Infinity;
  fps = 0;
  low = 0;

  frame(nowMs: number): void {
    this.frames.push(nowMs);
    while (this.frames.length > 1 && nowMs - this.frames[0]! > 1000) this.frames.shift();
    const span = nowMs - this.frames[0]!;
    this.fps = span > 0 ? ((this.frames.length - 1) * 1000) / span : 0;
    if (span >= 900 && nowMs - this.lastSample >= 1000) {
      this.samples.push({ t: nowMs, fps: this.fps });
      this.lastSample = nowMs;
    }
    while (this.samples.length && nowMs - this.samples[0]!.t > 10_000) this.samples.shift();
    this.low = this.samples.length ? Math.min(...this.samples.map((x) => x.fps)) : this.fps;
  }

  reset(): void {
    this.frames = [];
    this.samples = [];
    this.lastSample = -Infinity;
    this.fps = 0;
    this.low = 0;
  }
}
