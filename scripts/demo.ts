// Chạy thử lõi game với vài sự kiện mẫu, CHỈ trên hồ sơ test (không bao giờ đụng dữ liệu thật).
//   npm run demo            chạy thêm một lượt sự kiện mẫu
//   npm run demo -- --reset xóa dữ liệu thử rồi chạy lại từ đầu
// Tên người xem ở đây là tên thử, có chữ "(thử)", chỉ dùng trong hồ sơ test.

import fs from 'node:fs';
import path from 'node:path';
import type { LiveEvent, LiveUser } from '../shared/types.js';
import { GameCore } from '../server/core.js';
import { topFloor, topSession, topTotal } from '../server/game/queries.js';
import { profilePaths } from '../server/profile.js';

const rootDir = path.resolve(import.meta.dirname, '..');
const paths = profilePaths(rootDir, 'test');

if (process.argv.includes('--reset')) {
  try {
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(paths.dbFile + suffix, { force: true });
    console.log('Đã xóa dữ liệu thử (data/test/game.db).');
  } catch {
    console.error('[LỖI] Không xóa được dữ liệu thử. Hãy đóng cửa sổ start-test.bat trước rồi chạy lại.');
    process.exit(1);
  }
}

const core = GameCore.open({ rootDir, profile: 'test' });
const unit = core.config.labels.pointUnitLabel;
const fmt = (n: number) => n.toLocaleString('vi-VN');
const user = (n: number, name: string): LiveUser => ({
  platformId: `demo-${n}`,
  uniqueId: `demo${n}`,
  nickname: `${name} (thử)`,
});

function show(title: string): void {
  const s = core.engine.status();
  console.log(`   → ${s.floorName}, giai đoạn ${s.stage}/5 "${s.stageName}", ${s.percent}% (${fmt(s.floorPoints)}/${fmt(s.floorCost)} ${unit})`);
  if (title) console.log('');
}

function send(label: string, ev: LiveEvent): void {
  const r = core.processEvent(ev);
  const pts = r.score?.points ?? 0;
  let why = '';
  if (r.score?.skipped === 'cooldown') why = ' (chưa đủ 30 giây từ comment trước nên không tính)';
  if (r.score?.skipped === 'daily_cap') why = ' (đã chạm trần tim + comment trong ngày)';
  if (r.score && r.score.basePoints < r.score.rawPoints && r.score.basePoints > 0) why = ' (chạm trần ngày, chỉ tính một phần)';
  const mult = r.multiplier && r.multiplier.total !== 1 ? ` ×${r.multiplier.total}` : '';
  if (r.status === 'duplicate') why = ' (trùng mã sự kiện đã nhận, bỏ qua)';
  console.log(`• ${label}: +${fmt(pts)} ${unit}${mult}${why}`);
  const done = (r.tower?.transitions ?? []).flatMap((t) => (t.type === 'floor_complete' ? [t.floor] : []));
  if (done.includes(0)) console.log('   ✔ Xong nền móng');
  const floors = done.filter((f) => f > 0);
  if (floors.length === 1) console.log(`   ✔ Xong tầng ${floors[0]}`);
  if (floors.length > 1) console.log(`   ✔ Xong tầng ${floors[0]} đến ${floors.at(-1)} (${floors.length} tầng một lúc)`);
  if (r.tower?.transitions.some((t) => t.type === 'tower_complete')) console.log('   ★ Tháp đã hoàn thành!');
  show('');
}

const now = Date.now();
const sec = (s: number) => now + s * 1000;

console.log('\n=== CHẠY THỬ LÕI GAME (hồ sơ test) ===');
show('Trạng thái ban đầu');

const session = core.sessions.startManual();
console.log(`Bắt đầu phiên thử #${session.id}\n`);

send('Minh thả 1.500 tim', { type: 'like', user: user(1, 'Minh'), count: 1500, ts: sec(0) });
send('Lan comment', { type: 'comment', user: user(2, 'Lan'), text: 'Chào thầy', ts: sec(1) });
send('Lan comment lại sau 10 giây', { type: 'comment', user: user(2, 'Lan'), text: 'Cố lên', ts: sec(11) });
send('Lan comment sau 40 giây', { type: 'comment', user: user(2, 'Lan'), text: 'Xây nhanh nào', ts: sec(41) });
send('Minh thả thêm 1.000 tim', { type: 'like', user: user(1, 'Minh'), count: 1000, ts: sec(50) });
send('Hùng tặng 5 bông hồng (1 xu)', {
  type: 'gift', user: user(3, 'Hùng'), giftId: 'rose', giftName: 'Rose', coinValueEach: 1, count: 5, ts: sec(60),
});
send('Mai tặng quà 100 xu', {
  type: 'gift', user: user(4, 'Mai'), giftId: 'g100', giftName: 'Gift 100', coinValueEach: 100, count: 1, ts: sec(70),
});
const bigGift: LiveEvent = {
  type: 'gift', user: user(5, 'Tú'), giftId: 'g2000', giftName: 'Gift 2000', coinValueEach: 2000, count: 1, ts: sec(80),
  eventId: `demo-gift-${now}`,
};
send('Tú tặng quà 2.000 xu (vượt nhiều tầng một lúc)', bigGift);
send('Mất mạng, kết nối lại, nền tảng gửi lại đúng quà đó', bigGift);

const board = (title: string, rows: { rank: number; nickname: string; points: number }[]) => {
  console.log(`\n${title}`);
  if (rows.length === 0) console.log('   (chưa có ai)');
  for (const r of rows) console.log(`   ${r.rank}. ${r.nickname}: ${fmt(r.points)} ${unit}`);
};
const floor = core.engine.status().floor;
board('Bảng tổng (top 5):', topTotal(core.db, 5));
board(`Top phiên #${session.id}:`, topSession(core.db, session.id, 5));
board('Bia ghi danh nền móng:', topFloor(core.db, 0, 5));
board(`Bia ghi danh tầng ${floor} (đang xây):`, topFloor(core.db, floor, 5));

core.sessions.endManual();
await core.close();
console.log(`\nĐã kết thúc phiên thử và tạo bản backup trong data\\test\\backups.`);
console.log('Mở start-test.bat (hoặc làm mới trang trạng thái) để xem kết quả trên trình duyệt.\n');
