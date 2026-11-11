// Bảng xếp hạng. Bằng điểm thì ai đạt mức điểm đó trước được xếp trên (14.5): sắp theo reached_seq.

import type { DB } from '../db/database.js';

export interface LeaderRow {
  rank: number;
  platformId: string;
  nickname: string;
  avatarUrl: string | null;
  points: number;
}

type RawRow = Omit<LeaderRow, 'rank'>;
const withRank = (rows: RawRow[]): LeaderRow[] => rows.map((r, i) => ({ rank: i + 1, ...r }));

export function topTotal(db: DB, limit: number): LeaderRow[] {
  return withRank(
    db
      .prepare<[number], RawRow>(
        `SELECT platform_id AS platformId, nickname, avatar_url AS avatarUrl, total_points AS points
         FROM users WHERE total_points > 0
         ORDER BY total_points DESC, reached_seq ASC LIMIT ?`,
      )
      .all(limit),
  );
}

export function topSession(db: DB, sessionId: number, limit: number): LeaderRow[] {
  return withRank(
    db
      .prepare<[number, number], RawRow>(
        `SELECT s.platform_id AS platformId, u.nickname, u.avatar_url AS avatarUrl, s.points
         FROM session_contributions s JOIN users u ON u.platform_id = s.platform_id
         WHERE s.session_id = ? AND s.points > 0
         ORDER BY s.points DESC, s.reached_seq ASC LIMIT ?`,
      )
      .all(sessionId, limit),
  );
}

/** Bia hạng mục: top người góp vào một hạng mục. */
export function topItem(db: DB, itemId: string, limit: number): LeaderRow[] {
  return withRank(
    db
      .prepare<[string, number], RawRow>(
        `SELECT c.platform_id AS platformId, u.nickname, u.avatar_url AS avatarUrl, c.points
         FROM item_contributions c JOIN users u ON u.platform_id = c.platform_id
         WHERE c.item_id = ? AND c.points > 0
         ORDER BY c.points DESC, c.reached_seq ASC LIMIT ?`,
      )
      .all(itemId, limit),
  );
}

/** Bia giai đoạn (cho giai đoạn có lễ): top người góp vào một giai đoạn. stageIndex đếm từ 0. */
export function topStage(db: DB, itemId: string, stageIndex: number, limit: number): LeaderRow[] {
  return withRank(
    db
      .prepare<[string, number, number], RawRow>(
        `SELECT c.platform_id AS platformId, u.nickname, u.avatar_url AS avatarUrl, c.points
         FROM stage_contributions c JOIN users u ON u.platform_id = c.platform_id
         WHERE c.item_id = ? AND c.stage_index = ? AND c.points > 0
         ORDER BY c.points DESC, c.reached_seq ASC LIMIT ?`,
      )
      .all(itemId, stageIndex, limit),
  );
}

/** Số người đã góp vào hạng mục (dòng "…và N thiện hữu khác" trên bia). */
export function itemContributorCount(db: DB, itemId: string): number {
  return (
    db
      .prepare<[string], { n: number }>('SELECT COUNT(*) AS n FROM item_contributions WHERE item_id = ? AND points > 0')
      .get(itemId)?.n ?? 0
  );
}

export function stageContributorCount(db: DB, itemId: string, stageIndex: number): number {
  return (
    db
      .prepare<[string, number], { n: number }>(
        'SELECT COUNT(*) AS n FROM stage_contributions WHERE item_id = ? AND stage_index = ? AND points > 0',
      )
      .get(itemId, stageIndex)?.n ?? 0
  );
}
