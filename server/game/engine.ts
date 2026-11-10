// Lõi game: nhận sự kiện chuẩn hóa, tính công, cộng vào tháp, ghi DB.
// Mỗi sự kiện được xử lý trong MỘT transaction (user + contributions + state cùng lúc, mục 6).
// Trạng thái tháp luôn đọc từ DB, nên tắt máy bật lại vẫn đúng tầng, đúng giai đoạn, đúng phần trăm.

import { computeMultiplier, type GameEventDef, type MultiplierInfo } from '../../shared/events.js';
import { scoreEvent, type ScoreResult } from '../../shared/points.js';
import {
  applyPoints,
  floorCost,
  initialTowerState,
  percentOf,
  repriceCurrentFloor,
  stageOf,
  type ApplyResult,
  type TowerRules,
  type TowerState,
} from '../../shared/tower.js';
import { vnDayKey } from '../../shared/time.js';
import type { LiveEvent } from '../../shared/types.js';
import type { GameConfig } from '../config/schema.js';
import type { DB } from '../db/database.js';

export const POST_COMPLETION_NOTE = 'sau khánh thành';

interface GameStateRow {
  current_floor: number;
  current_stage: number;
  floor_points: number;
  floor_cost: number;
  total_points: number;
  started_at: number;
  completed_at: number | null;
  golden_manual_until: number | null;
}

export interface TowerStatus {
  floor: number;
  totalFloors: number;
  floorName: string;
  stage: number;
  stageName: string;
  floorPoints: number;
  floorCost: number;
  percent: number;
  totalPoints: number;
  completed: boolean;
}

export interface ProcessResult {
  status: 'counted' | 'zero' | 'duplicate' | 'ignored';
  eventRowId: number | null;
  score: ScoreResult | null;
  multiplier: MultiplierInfo | null;
  /** Kết quả cộng vào tháp (null nếu không có điểm hoặc tháp đã xong). */
  tower: ApplyResult | null;
}

export interface RepricePreview {
  floor: number;
  oldCost: number;
  newCost: number;
}

export interface EngineDeps {
  db: DB;
  config: () => GameConfig;
  events: () => GameEventDef[];
  sessionId: () => number | null;
  now?: () => number;
}

function prepareStatements(db: DB) {
  return {
    getState: db.prepare<[], GameStateRow>('SELECT * FROM game_state WHERE id = 1'),
    insertState: db.prepare(
      `INSERT INTO game_state (id, current_floor, current_stage, floor_points, floor_cost, total_points, started_at)
       VALUES (1, @floor, 1, 0, @cost, 0, @ts)`,
    ),
    updateState: db.prepare(
      `UPDATE game_state SET current_floor = @floor, current_stage = @stage, floor_points = @floorPoints,
         floor_cost = @floorCost, total_points = total_points + @addTotal,
         completed_at = COALESCE(completed_at, @completedAt)
       WHERE id = 1`,
    ),
    setGolden: db.prepare('UPDATE game_state SET golden_manual_until = ? WHERE id = 1'),
    insertFloor: db.prepare(
      'INSERT OR IGNORE INTO floors (floor, cost, started_at) VALUES (@floor, @cost, @ts)',
    ),
    completeFloor: db.prepare('UPDATE floors SET completed_at = @ts WHERE floor = @floor AND completed_at IS NULL'),
    setFloorCost: db.prepare('UPDATE floors SET cost = @cost WHERE floor = @floor'),
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
    addFloorContribution: db.prepare(
      `INSERT INTO floor_contributions (floor, platform_id, points, reached_seq) VALUES (@floor, @pid, @points, @seq)
       ON CONFLICT (floor, platform_id) DO UPDATE SET points = points + excluded.points, reached_seq = excluded.reached_seq`,
    ),
    addSessionContribution: db.prepare(
      `INSERT INTO session_contributions (session_id, platform_id, points, reached_seq) VALUES (@sid, @pid, @points, @seq)
       ON CONFLICT (session_id, platform_id) DO UPDATE SET points = points + excluded.points, reached_seq = excluded.reached_seq`,
    ),
    insertEvent: db.prepare(
      `INSERT INTO events (ts, session_id, platform_id, type, source_event_id, payload_json, base_points, multiplier, points, floor, stage, note)
       VALUES (@ts, @sid, @pid, @type, @sourceId, @payload, @base, @mult, @points, @floor, @stage, @note)`,
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

  /** Tạo trạng thái ban đầu (tầng 0 = nền móng) nếu DB còn trống. */
  init(): void {
    if (this.q.getState.get()) return;
    const ts = this.now();
    const s = initialTowerState(this.deps.config().tower);
    this.db.transaction(() => {
      this.q.insertState.run({ floor: s.floor, cost: s.floorCost, ts });
      this.q.insertFloor.run({ floor: s.floor, cost: s.floorCost, ts });
    })();
  }

  private row(): GameStateRow {
    const r = this.q.getState.get();
    if (!r) throw new Error('game_state chưa được khởi tạo (gọi init() trước)');
    return r;
  }

  towerState(): TowerState {
    const r = this.row();
    return {
      floor: r.current_floor,
      floorPoints: r.floor_points,
      floorCost: r.floor_cost,
      completed: r.completed_at !== null,
    };
  }

  status(): TowerStatus {
    const cfg = this.deps.config();
    const r = this.row();
    const s = this.towerState();
    const stage = s.completed ? 5 : stageOf(s.floorPoints, s.floorCost, cfg.tower.stageRatios);
    const names = s.floor === 0 ? cfg.labels.foundationStages : cfg.labels.floorStages;
    return {
      floor: s.floor,
      totalFloors: cfg.tower.totalFloors,
      floorName: s.floor === 0 ? cfg.labels.foundationName : cfg.labels.floorName.replace('{floor}', String(s.floor)),
      stage,
      stageName: names[stage - 1] ?? '',
      floorPoints: s.floorPoints,
      floorCost: s.floorCost,
      percent: s.completed ? 100 : percentOf(s.floorPoints, s.floorCost),
      totalPoints: r.total_points,
      completed: s.completed,
    };
  }

  goldenManualUntil(): number | null {
    return this.row().golden_manual_until;
  }

  /** Bật giờ vàng thủ công đến thời điểm until (null = tắt). */
  setGoldenManualUntil(until: number | null): void {
    this.q.setGolden.run(until);
  }

  processEvent(ev: LiveEvent): ProcessResult {
    const empty = { eventRowId: null, score: null, multiplier: null, tower: null };
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

      const before = this.towerState();
      const stageBefore = before.completed ? 5 : stageOf(before.floorPoints, before.floorCost, cfg.tower.stageRatios);
      const tower = score.points > 0 && !before.completed ? applyPoints(before, score.points, cfg.tower) : null;
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
          floor: before.floor,
          stage: stageBefore,
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
        for (const a of tower?.allocations ?? []) {
          this.q.addFloorContribution.run({ floor: a.floor, pid, points: a.points, seq });
        }
        if (sid !== null) this.q.addSessionContribution.run({ sid, pid, points: score.points, seq });
      }
      if (score.capUsedDelta > 0) this.q.addCap.run({ day, pid, delta: score.capUsedDelta });
      if (score.commentCounted) this.q.setLastComment.run(ev.ts, pid);

      this.persistTower(tower?.state ?? before, tower, ev.ts, score.points);
      return { status: score.points > 0 ? 'counted' : 'zero', eventRowId: seq, score, multiplier, tower };
    })();
  }

  /** Giá tầng đang xây có khác nếu áp dụng bộ quy tắc mới không. */
  previewReprice(rules: TowerRules): RepricePreview | null {
    const s = this.towerState();
    if (s.completed) return null;
    const newCost = floorCost(s.floor, rules);
    return newCost === s.floorCost ? null : { floor: s.floor, oldCost: s.floorCost, newCost };
  }

  /** Đổi giá tầng đang xây theo quy tắc mới (admin đã xác nhận, 14.10). */
  applyReprice(rules: TowerRules): ApplyResult {
    const ts = this.now();
    return this.db.transaction(() => {
      const before = this.towerState();
      const newCost = floorCost(before.floor, rules);
      const result = repriceCurrentFloor(before, newCost, rules);
      this.q.setFloorCost.run({ floor: before.floor, cost: newCost });
      this.q.insertEvent.run({
        ts,
        sid: this.deps.sessionId(),
        pid: null,
        type: 'reprice',
        sourceId: null,
        payload: JSON.stringify({ floor: before.floor, oldCost: before.floorCost, newCost }),
        base: 0,
        mult: 1,
        points: 0,
        floor: before.floor,
        stage: stageOf(before.floorPoints, before.floorCost, rules.stageRatios),
        note: 'Đổi giá tầng đang xây',
      });
      this.persistTower(result.state, result, ts, 0);
      return result;
    })();
  }

  private persistTower(state: TowerState, result: ApplyResult | null, ts: number, addTotal: number): void {
    const cfg = this.deps.config();
    let completedAt: number | null = null;
    for (const t of result?.transitions ?? []) {
      if (t.type === 'floor_complete') this.q.completeFloor.run({ floor: t.floor, ts });
      else if (t.type === 'floor_start') this.q.insertFloor.run({ floor: t.floor, cost: t.cost, ts });
      else if (t.type === 'tower_complete') completedAt = ts;
    }
    this.q.updateState.run({
      floor: state.floor,
      stage: state.completed ? 5 : stageOf(state.floorPoints, state.floorCost, cfg.tower.stageRatios),
      floorPoints: state.floorPoints,
      floorCost: state.floorCost,
      addTotal,
      completedAt,
    });
  }
}
