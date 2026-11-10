// Backup DB (mục 6 SPEC): mỗi ngày và mỗi khi kết thúc phiên, giữ tổng cộng N bản gần nhất.
// Mỗi bản là một thư mục "YYYYMMDD-HHmmss_<lý do>" chứa game.db và các file config đang dùng.

import fs from 'node:fs';
import path from 'node:path';
import { parseHHMM, vnDayKey, vnParts, vnStamp } from '../shared/time.js';
import type { DB } from './db/database.js';

const BACKUP_NAME = /^(\d{8})-(\d{6})_[a-z0-9-]+$/;

export function listBackups(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && BACKUP_NAME.test(d.name))
    .map((d) => d.name)
    .sort();
}

/** Chọn các bản cũ nhất cần xóa để chỉ còn `keep` bản. Tên bắt đầu bằng thời gian nên sắp theo tên là đúng thứ tự. */
export function selectBackupsToDelete(names: string[], keep: number): string[] {
  const sorted = [...names].sort();
  return sorted.slice(0, Math.max(0, sorted.length - keep));
}

export interface BackupOptions {
  db: DB;
  backupsDir: string;
  configDir: string;
  keep: number;
  reason: string;
  ts: number;
}

export async function createBackup(o: BackupOptions): Promise<string> {
  const name = `${vnStamp(o.ts)}_${o.reason}`;
  const folder = path.join(o.backupsDir, name);
  fs.mkdirSync(folder, { recursive: true });
  await o.db.backup(path.join(folder, 'game.db'));
  for (const f of ['config.json', 'events.json']) {
    const src = path.join(o.configDir, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(folder, f));
  }
  for (const old of selectBackupsToDelete(listBackups(o.backupsDir), o.keep)) {
    fs.rmSync(path.join(o.backupsDir, old), { recursive: true, force: true });
  }
  return folder;
}

/** Hôm nay (giờ Việt Nam) đã tới giờ backup hằng ngày mà chưa có bản "daily" nào chưa. */
export function isDailyBackupDue(ts: number, dailyTime: string, existing: string[]): boolean {
  const p = vnParts(ts);
  if (p.hour * 60 + p.minute < parseHHMM(dailyTime)) return false;
  const today = vnDayKey(ts).replaceAll('-', '');
  return !existing.some((n) => n.startsWith(today) && n.endsWith('_daily'));
}
