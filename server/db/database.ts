// Mở DB SQLite (WAL) và chạy migration (mục 6 SPEC).

import Database from 'better-sqlite3';
import { MIGRATIONS, type Migration } from './migrations.js';

export type DB = Database.Database;

export function openDatabase(file: string, migrations: Migration[] = MIGRATIONS): DB {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  // FULL: mỗi sự kiện đã ghi là chắc chắn nằm trên đĩa, kể cả khi mất điện đột ngột.
  db.pragma('synchronous = FULL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db, migrations);
  return db;
}

export function schemaVersion(db: DB): number {
  return db.pragma('user_version', { simple: true }) as number;
}

export function migrate(db: DB, migrations: Migration[] = MIGRATIONS): number[] {
  const applied: number[] = [];
  const sorted = [...migrations].sort((a, b) => a.version - b.version);
  for (const m of sorted) {
    if (m.version <= schemaVersion(db)) continue;
    db.transaction(() => {
      db.exec(m.sql);
      db.pragma(`user_version = ${m.version}`);
    })();
    applied.push(m.version);
  }
  return applied;
}
