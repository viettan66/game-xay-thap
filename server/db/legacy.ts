// DB của bản tháp 100 tầng (trước khi đổi sang quần thể chùa) có cấu trúc khác, không nâng cấp được.
// Chủ dự án cho phép tạo lại DB vì chưa có dữ liệu production thật. Để an toàn, file cũ được ĐỔI TÊN
// thành game.thap-cu.db (giữ lại để tra cứu), không xóa.

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

/** Không đổi tên được DB cũ (thường do cửa sổ game cũ vẫn mở file): cần người xử lý, không tự khởi động lại. */
export class LegacyDbError extends Error {}

/** DB có bảng `floors` là DB của bản tháp cũ. */
export function isLegacyTowerDb(file: string): boolean {
  if (!fs.existsSync(file)) return false;
  const db = new Database(file);
  try {
    const row = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'floors'").get();
    // Gộp nhật ký WAL vào file chính trước khi đổi tên, để file giữ lại có đủ dữ liệu.
    if (row) db.pragma('wal_checkpoint(TRUNCATE)');
    return !!row;
  } finally {
    db.close();
  }
}

/** Đổi tên DB tháp cũ (nếu có). Trả về đường dẫn file đã đổi tên, hoặc null nếu không phải DB cũ. */
export function retireLegacyTowerDb(file: string): string | null {
  if (!isLegacyTowerDb(file)) return null;
  const dir = path.dirname(file);
  let target = path.join(dir, 'game.thap-cu.db');
  for (let n = 2; fs.existsSync(target); n++) target = path.join(dir, `game.thap-cu-${n}.db`);
  try {
    fs.renameSync(file, target);
  } catch (e) {
    throw new LegacyDbError(
      `Không đổi tên được dữ liệu tháp cũ (${file}): ${(e as Error).message}. ` +
        'Có thể cửa sổ game cũ vẫn đang mở: hãy đóng hết cửa sổ game rồi mở lại.',
    );
  }
  for (const suffix of ['-wal', '-shm']) fs.rmSync(file + suffix, { force: true });
  return target;
}
