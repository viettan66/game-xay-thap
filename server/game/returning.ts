// Người góp công cũ (mục 9B, giai đoạn 4e): người xem THẬT có công từ phiên trước, hiện lại trên công trường khi phòng vắng.
// Chọn ngẫu nhiên có trọng số theo điểm, ưu tiên người không có mặt trong phiên hiện tại. Admin có danh sách loại trừ
// (người không muốn hiện lại), lưu trong bảng settings của hồ sơ.

import type { DB } from '../db/database.js';
import { getSetting, setSetting } from '../db/settings.js';

export const EXCLUDED_KEY = 'returning_excluded';

export interface ReturningCandidate {
  platformId: string;
  nickname: string;
  /** Công góp từ các phiên trước (tổng công trừ công của phiên đang chạy). */
  points: number;
  /** Đã có sự kiện (vào phòng, tim, comment, quà) trong phiên đang chạy. */
  present: boolean;
  /** Hạng mục người đó góp nhiều nhất. */
  topItemId: string | null;
}

/** Những người có công từ phiên trước, nhiều công nhất trước (tối đa `limit` người). */
export function returningCandidates(db: DB, sessionId: number | null, limit = 300): ReturningCandidate[] {
  const rows = db
    .prepare<{ sid: number; limit: number }, { platformId: string; nickname: string; points: number; present: number; topItemId: string | null }>(
      `SELECT u.platform_id AS platformId, u.nickname,
              u.total_points - COALESCE(sc.points, 0) AS points,
              EXISTS (SELECT 1 FROM events e WHERE e.platform_id = u.platform_id AND e.session_id = @sid) AS present,
              (SELECT ic.item_id FROM item_contributions ic WHERE ic.platform_id = u.platform_id
                 ORDER BY ic.points DESC, ic.reached_seq ASC LIMIT 1) AS topItemId
       FROM users u
       LEFT JOIN session_contributions sc ON sc.session_id = @sid AND sc.platform_id = u.platform_id
       WHERE u.total_points - COALESCE(sc.points, 0) > 0
       ORDER BY points DESC, u.reached_seq ASC
       LIMIT @limit`,
    )
    .all({ sid: sessionId ?? -1, limit });
  return rows.map((r) => ({ ...r, present: r.present === 1 }));
}

/**
 * Chọn một người: ngẫu nhiên theo trọng số điểm, ưu tiên người không có mặt trong phiên (chỉ khi không còn ai mới xét
 * người đang có mặt). `skip` = những người không được chọn (đang có nhân vật, vừa hiện, bị loại trừ).
 */
export function pickReturning(cands: ReturningCandidate[], skip: (id: string) => boolean, rand: () => number): ReturningCandidate | null {
  const ok = cands.filter((c) => c.points > 0 && !skip(c.platformId));
  const absent = ok.filter((c) => !c.present);
  const pool = absent.length ? absent : ok;
  const total = pool.reduce((a, c) => a + c.points, 0);
  if (!pool.length || total <= 0) return null;
  let r = rand() * total;
  for (const c of pool) {
    r -= c.points;
    if (r < 0) return c;
  }
  return pool[pool.length - 1]!;
}

/** Danh sách người không muốn hiện lại dưới dạng người góp công cũ (platformId). */
export function excludedIds(db: DB): string[] {
  const v = getSetting<unknown>(db, EXCLUDED_KEY, []);
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

export function setExcluded(db: DB, platformId: string, excluded: boolean): string[] {
  const list = new Set(excludedIds(db));
  if (excluded) list.add(platformId);
  else list.delete(platformId);
  const out = [...list];
  setSetting(db, EXCLUDED_KEY, out);
  return out;
}
