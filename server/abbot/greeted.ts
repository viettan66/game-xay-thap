// Người đã được trụ trì chào bằng tên trong phiên (mục 9C: mỗi người tối đa 1 lần/phiên), lưu trong DB
// để khởi động lại giữa phiên không chào lại.

import type { DB } from '../db/database.js';
import type { GreetStore } from './director.js';

export function dbGreetStore(db: DB): GreetStore {
  const has = db.prepare<[number, string], { x: number }>('SELECT 1 AS x FROM session_greeted WHERE session_id = ? AND platform_id = ?');
  const add = db.prepare('INSERT OR IGNORE INTO session_greeted (session_id, platform_id) VALUES (?, ?)');
  return {
    has: (sessionId, platformId) => !!has.get(sessionId, platformId),
    add: (sessionId, platformId) => {
      add.run(sessionId, platformId);
    },
  };
}
