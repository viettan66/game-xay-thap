// Thiết lập nhỏ lưu riêng trong DB của từng hồ sơ (ví dụ: hồ sơ test đang dùng giả lập hay live thật).

import type { DB } from './database.js';

export function getSetting<T>(db: DB, key: string, fallback: T): T {
  const row = db.prepare<[string], { value_json: string }>('SELECT value_json FROM settings WHERE key = ?').get(key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value_json) as T;
  } catch {
    return fallback;
  }
}

export function setSetting(db: DB, key: string, value: unknown): void {
  db.prepare(
    `INSERT INTO settings (key, value_json) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET value_json = excluded.value_json`,
  ).run(key, JSON.stringify(value));
}
