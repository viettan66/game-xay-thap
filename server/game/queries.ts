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

export function topFloor(db: DB, floor: number, limit: number): LeaderRow[] {
  return withRank(
    db
      .prepare<[number, number], RawRow>(
        `SELECT f.platform_id AS platformId, u.nickname, u.avatar_url AS avatarUrl, f.points
         FROM floor_contributions f JOIN users u ON u.platform_id = f.platform_id
         WHERE f.floor = ? AND f.points > 0
         ORDER BY f.points DESC, f.reached_seq ASC LIMIT ?`,
      )
      .all(floor, limit),
  );
}

export function floorContributorCount(db: DB, floor: number): number {
  return (
    db
      .prepare<[number], { n: number }>('SELECT COUNT(*) AS n FROM floor_contributions WHERE floor = ? AND points > 0')
      .get(floor)?.n ?? 0
  );
}
