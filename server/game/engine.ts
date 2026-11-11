// Lõi game: nhận sự kiện chuẩn hóa, tính công, cộng vào công trình, ghi DB.
// Mỗi sự kiện được xử lý trong MỘT transaction (user + contributions + state cùng lúc, mục 6).
// Trạng thái công trình luôn đọc từ DB, nên tắt máy bật lại vẫn đúng hạng mục, đúng giai đoạn, đúng phần trăm.

import { computeMultiplier, type GameEventDef, type MultiplierInfo } from '../../shared/events.js';
import { scoreEvent, type ScoreResult } from '../../shared/points.js';
import {
  applyPoints,
  extendIfNeeded,
  initialProgress,
  itemIndexOf,
  repriceCurrentStage,
  startedItemProblems,
  type ApplyResult,
  type ProgressState,
  type ResolvedProject,
} from '../../shared/project.js';
import type { ProgressView } from '../../shared/protocol.js';
import { progressView } from '../../shared/progressView.js';
import { vnDayKey } from '../../shared/time.js';
import type { LiveEvent } from '../../shared/types.js';
import type { GameConfig } from '../config/schema.js';
import { ConfigError, PROJECT_FILE } from '../config/store.js';
import type { DB } from '../db/database.js';

export const POST_COMPLETION_NOTE = 'sau khánh thành';
export const REPRICE_NOTE = 'Đổi giá giai đoạn đang xây';

interface GameStateRow {
  current_item_id: string;
  current_stage_index: number;
  stage_points: number;
  stage_cost: number;
  total_points: number;
  started_at: number;
  completed_at: number | null;
  golden_manual_until: number | null;
}

export interface ProcessResult {
  status: 'counted' | 'zero' | 'duplicate' | 'ignored';
  eventRowId: number | null;
  score: ScoreResult | null;
  multiplier: MultiplierInfo | null;
  /** Kết quả cộng vào công trình (null nếu không có điểm hoặc công trình đã xong). */
  progress: ApplyResult | null;
}

export interface RepricePreview {
  itemId: string;
  itemName: string;
  /** Giai đoạn đang xây, đếm từ 0. */
  stageIndex: number;
  oldCost: number;
  newCost: number;
}

export interface EngineDeps {
  db: DB;
  config: () => GameConfig;
  project: () => ResolvedProject;
  events: () => GameEventDef[];
  sessionId: () => number | null;
  now?: () => number;
}

function prepareStatements(db: DB) {
  return {
    getState: db.prepare<[], GameStateRow>('SELECT * FROM game_state WHERE id = 1'),
    insertState: db.prepare(
      `INSERT INTO game_state (id, current_item_id, current_stage_index, stage_points, stage_cost, total_points, started_at)
       VALUES (1, @itemId, 0, 0, @cost, 0, @ts)`,
    ),
    updateState: db.prepare(
      `UPDATE game_state SET current_item_id = @itemId, current_stage_index = @stageIndex, stage_points = @stagePoints,
         stage_cost = @stageCost, total_points = total_points + @addTotal,
         completed_at = CASE WHEN @completed = 1 THEN COALESCE(completed_at, @ts) ELSE NULL END
       WHERE id = 1`,
    ),
    setGolden: db.prepare('UPDATE game_state SET golden_manual_until = ? WHERE id = 1'),
    startedItems: db.prepare<[], { item_id: string; stage_count: number }>(
      'SELECT item_id, stage_count FROM items ORDER BY rowid',
    ),
    insertItem: db.prepare(
      'INSERT OR IGNORE INTO items (item_id, stage_count, started_at) VALUES (@itemId, @stageCount, @ts)',
    ),
    completeItem: db.prepare('UPDATE items SET completed_at = @ts WHERE item_id = @itemId AND completed_at IS NULL'),
    insertStage: db.prepare(
      'INSERT OR IGNORE INTO stages (item_id, stage_index, cost, started_at) VALUES (@itemId, @stageIndex, @cost, @ts)',
    ),
    completeStage: db.prepare(
      'UPDATE stages SET completed_at = @ts WHERE item_id = @itemId AND stage_index = @stageIndex AND completed_at IS NULL',
    ),
    setStageCost: db.prepare('UPDATE stages SET cost = @cost WHERE item_id = @itemId AND stage_index = @stageIndex'),
    findSource: db.prepare<[string], { id: number }>('SELECT id FROM events WHERE source_event_id = ?'),
    upsertUser: db.prepare(
      `INSERT INTO users (platform_id, unique_id, nickname, avatar_url, first_seen, last_seen)
       VALUES (@pid, @uniqueId, @nickname, @avatarUrl, @ts, @ts)
       ON CONFLICT (platform_id) DO UPDATE SET
         unique_id = excluded.unique_id,
         nickname = excluded.nickname,
         avatar_url = COALESCE(excluded.avatar_url, users.avatar_url),
         last_seen = MAX(users.last_seen, excluded.last_seen)`,
    ),
    getUser: db.prepare<[string], { last_comment_counted_at: number | null }>(
      'SELECT last_comment_counted_at FROM users WHERE platform_id = ?',
    ),
    addUserPoints: db.prepare(
      `UPDATE users SET total_points = total_points + @points, gift_points = gift_points + @gift,
         like_points = like_points + @like, comment_points = comment_points + @comment, reached_seq = @seq
       WHERE platform_id = @pid`,
    ),
    setLastComment: db.prepare('UPDATE users SET last_comment_counted_at = ? WHERE platform_id = ?'),
    getCap: db.prepare<[string, string], { like_comment_points: number }>(
      'SELECT like_comment_points FROM daily_caps WHERE day = ? AND platform_id = ?',
    ),
    addCap: db.prepare(
      `INSERT INTO daily_caps (day, platform_id, like_comment_points) VALUES (@day, @pid, @delta)
       ON CONFLICT (day, platform_id) DO UPDATE SET like_comment_points = like_comment_points + excluded.like_comment_points`,
    ),
    addItemContribution: db.prepare(
      `INSERT INTO item_contributions (item_id, platform_id, points, reached_seq) VALUES (@itemId, @pid, @points, @seq)
       ON CONFLICT (item_id, platform_id) DO UPDATE SET points = points + excluded.points, reached_seq = excluded.reached_seq`,
    ),
    addStageContribution: db.prepare(
      `INSERT INTO stage_contributions (item_id, stage_index, platform_id, points, reached_seq)
       VALUES (@itemId, @stageIndex, @pid, @points, @seq)
       ON CONFLICT (item_id, stage_index, platform_id) DO UPDATE SET
         points = points + excluded.points, reached_seq = excluded.reached_seq`,
    ),
    addSessionContribution: db.prepare(
      `INSERT INTO session_contributions (session_id, platform_id, points, reached_seq) VALUES (@sid, @pid, @points, @seq)
       ON CONFLICT (session_id, platform_id) DO UPDATE SET points = points + excluded.points, reached_seq = excluded.reached_seq`,
    ),
    insertEvent: db.prepare(
      `INSERT INTO events (ts, session_id, platform_id, type, source_event_id, payload_json, base_points, multiplier, points, item_id, stage_index, note)
       VALUES (@ts, @sid, @pid, @type, @sourceId, @payload, @base, @mult, @points, @itemId, @stageIndex, @note)`,
    ),
  };
}

export class GameEngine {
  private readonly db: DB;
  private readonly deps: EngineDeps;
  private readonly now: () => number;
  private readonly q: ReturnType<typeof prepareStatements>;

  constructor(deps: EngineDeps) {
    this.deps = deps;
    this.db = deps.db;
    this.now = deps.now ?? Date.now;
    this.q = prepareStatements(this.db);
  }

  /**
   * Tạo trạng thái ban đầu (hạng mục đầu tiên, giai đoạn 1) nếu DB còn trống, rồi kiểm tra project.json
   * còn khớp với những gì đã xây. Không khớp (ví dụ sửa tay xóa mất hạng mục đang xây) thì báo lỗi, không đoán.
   */
  init(): void {
    if (!this.q.getState.get()) {
      const ts = this.now();
      const p = this.deps.project();
      const s = initialProgress(p);
      this.db.transaction(() => {
        this.q.insertState.run({ itemId: s.itemId, cost: s.stageCost, ts });
        this.q.insertItem.run({ itemId: s.itemId, stageCount: p.items[0]!.stages.length, ts });
        this.q.insertStage.run({ itemId: s.itemId, stageIndex: 0, cost: s.stageCost, ts });
      })();
    }
    const problems = this.projectProblems(this.deps.project());
    if (problems.length > 0) throw new ConfigError(PROJECT_FILE, problems);
    this.syncProject();
  }

  private row(): GameStateRow {
    const r = this.q.getState.get();
    if (!r) throw new Error('game_state chưa được khởi tạo (gọi init() trước)');
    return r;
  }

  progressState(): ProgressState {
    const r = this.row();
    return {
      itemId: r.current_item_id,
      stageIndex: r.current_stage_index,
      stagePoints: r.stage_points,
      stageCost: r.stage_cost,
      completed: r.completed_at !== null,
    };
  }

  /** Những chỗ một danh sách hạng mục (mới) không khớp với những gì đã xây. Rỗng = dùng được. */
  projectProblems(p: ResolvedProject): string[] {
    const started = this.q.startedItems.all();
    const problems = startedItemProblems(
      started.map((r) => r.item_id),
      new Map(started.map((r) => [r.item_id, r.stage_count])),
      p,
    );
    const s = this.progressState();
    if (itemIndexOf(p, s.itemId) < 0 && !problems.some((x) => x.includes(`"${s.itemId}"`))) {
      problems.push(`Không có hạng mục đang xây "${s.itemId}" trong danh sách`);
    }
    return problems;
  }

  status(): ProgressView {
    return progressView(this.progressState(), this.deps.project(), this.deps.config().labels.progress, this.row().total_points);
  }

  goldenManualUntil(): number | null {
    return this.row().golden_manual_until;
  }

  /** Bật giờ vàng thủ công đến thời điểm until (null = tắt). */
  setGoldenManualUntil(until: number | null): void {
    this.q.setGolden.run(until);
  }

  processEvent(ev: LiveEvent): ProcessResult {
    const empty = { eventRowId: null, score: null, multiplier: null, progress: null };
    if (ev.type === 'viewers') return { status: 'ignored', ...empty };

    return this.db.transaction((): ProcessResult => {
      if (ev.eventId && this.q.findSource.get(ev.eventId)) return { status: 'duplicate', ...empty };

      const cfg = this.deps.config();
      const pid = ev.user.platformId;
      this.q.upsertUser.run({
        pid,
        uniqueId: ev.user.uniqueId,
        nickname: ev.user.nickname,
        avatarUrl: ev.user.avatarUrl ?? null,
        ts: ev.ts,
      });
      const user = this.q.getUser.get(pid)!;
      const day = vnDayKey(ev.ts);
      const capUsed = this.q.getCap.get(day, pid)?.like_comment_points ?? 0;

      const row = this.row();
      const multiplier = computeMultiplier(
        ev.ts,
        this.deps.events(),
        cfg.goldenHour,
        row.golden_manual_until,
        cfg.multipliers,
      );
      const score = scoreEvent(
        ev,
        { capUsedToday: capUsed, lastCommentCountedAt: user.last_comment_counted_at },
        cfg.points,
        multiplier.total,
      );

      const before = this.progressState();
      const progress =
        score.points > 0 && !before.completed ? applyPoints(before, score.points, this.deps.project()) : null;
      const sid = this.deps.sessionId();

      const seq = Number(
        this.q.insertEvent.run({
          ts: ev.ts,
          sid,
          pid,
          type: ev.type,
          sourceId: ev.eventId ?? null,
          payload: JSON.stringify(ev),
          base: score.basePoints,
          mult: multiplier.total,
          points: score.points,
          itemId: before.itemId,
          stageIndex: before.stageIndex,
          note: before.completed ? POST_COMPLETION_NOTE : null,
        }).lastInsertRowid,
      );

      if (score.points > 0) {
        this.q.addUserPoints.run({
          pid,
          seq,
          points: score.points,
          gift: score.source === 'gift' ? score.points : 0,
          like: score.source === 'like' ? score.points : 0,
          comment: score.source === 'comment' ? score.points : 0,
        });
        // Quà lớn vượt nhiều giai đoạn / hạng mục: ghi công cho TỪNG nơi theo phần điểm rơi vào đó (14.4).
        for (const a of progress?.allocations ?? []) {
          this.q.addStageContribution.run({ itemId: a.itemId, stageIndex: a.stageIndex, pid, points: a.points, seq });
          this.q.addItemContribution.run({ itemId: a.itemId, pid, points: a.points, seq });
        }
        if (sid !== null) this.q.addSessionContribution.run({ sid, pid, points: score.points, seq });
      }
      if (score.capUsedDelta > 0) this.q.addCap.run({ day, pid, delta: score.capUsedDelta });
      if (score.commentCounted) this.q.setLastComment.run(ev.ts, pid);

      this.persist(progress?.state ?? before, progress, ev.ts, score.points);
      return { status: score.points > 0 ? 'counted' : 'zero', eventRowId: seq, score, multiplier, progress };
    })();
  }

  /** Giá giai đoạn đang xây có khác nếu dùng danh sách hạng mục mới không (14.10). */
  previewReprice(p: ResolvedProject): RepricePreview | null {
    const s = this.progressState();
    if (s.completed) return null;
    const item = p.items.find((i) => i.id === s.itemId);
    const newCost = item?.stages[s.stageIndex]?.cost;
    if (!item || newCost === undefined || newCost === s.stageCost) return null;
    return { itemId: item.id, itemName: item.name, stageIndex: s.stageIndex, oldCost: s.stageCost, newCost };
  }

  /** Đổi giá giai đoạn đang xây theo danh sách mới (admin đã xác nhận, 14.10). Gọi sau khi đã lưu project.json. */
  applyReprice(p: ResolvedProject): ApplyResult | null {
    const preview = this.previewReprice(p);
    if (!preview) return null;
    const ts = this.now();
    return this.db.transaction(() => {
      const before = this.progressState();
      const result = repriceCurrentStage(before, preview.newCost, p);
      this.q.setStageCost.run({ itemId: before.itemId, stageIndex: before.stageIndex, cost: preview.newCost });
      this.q.insertEvent.run({
        ts,
        sid: this.deps.sessionId(),
        pid: null,
        type: 'reprice',
        sourceId: null,
        payload: JSON.stringify(preview),
        base: 0,
        mult: 1,
        points: 0,
        itemId: before.itemId,
        stageIndex: before.stageIndex,
        note: REPRICE_NOTE,
      });
      this.persist(result.state, result, ts, 0);
      return result;
    })();
  }

  /** Công trình đã xong mà danh sách vừa được nối thêm hạng mục: mở hạng mục mới (14.12). */
  syncProject(): ApplyResult | null {
    const result = extendIfNeeded(this.progressState(), this.deps.project());
    if (!result) return null;
    const ts = this.now();
    this.db.transaction(() => this.persist(result.state, result, ts, 0))();
    return result;
  }

  private persist(state: ProgressState, result: ApplyResult | null, ts: number, addTotal: number): void {
    const p = this.deps.project();
    for (const t of result?.transitions ?? []) {
      if (t.type === 'stage_complete') this.q.completeStage.run({ itemId: t.itemId, stageIndex: t.stageIndex, ts });
      else if (t.type === 'stage_start') this.q.insertStage.run({ itemId: t.itemId, stageIndex: t.stageIndex, cost: t.cost, ts });
      else if (t.type === 'item_complete') this.q.completeItem.run({ itemId: t.itemId, ts });
      else if (t.type === 'item_start') {
        const stageCount = p.items.find((i) => i.id === t.itemId)?.stages.length ?? 0;
        this.q.insertItem.run({ itemId: t.itemId, stageCount, ts });
      }
    }
    this.q.updateState.run({
      itemId: state.itemId,
      stageIndex: state.stageIndex,
      stagePoints: state.stagePoints,
      stageCost: state.stageCost,
      addTotal,
      completed: state.completed ? 1 : 0,
      ts,
    });
  }
}
