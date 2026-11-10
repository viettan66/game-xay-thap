// Chuẩn bị trước khi chạy game (start.bat / start-test.bat gọi file này).
// 1. Kiểm tra phiên bản Node.js.  2. Cài thư viện nếu thiếu.  3. Đóng gói overlay nếu code overlay mới hơn bản đã đóng gói.
// Viết bằng JavaScript thuần để chạy được cả khi chưa cài thư viện.
// Mã thoát: 0 = sẵn sàng, 3 = lỗi cần người sửa.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const fail = (msg) => {
  console.error(`\n[LỖI] ${msg}\n`);
  process.exit(3);
};
const run = (args, what) => {
  console.log(`${what}, vui lòng chờ...`);
  const r = spawnSync('npm', args, { cwd: root, stdio: 'inherit', shell: true });
  if (r.status !== 0) fail(`${what} thất bại. Kiểm tra mạng Internet rồi chạy lại.`);
};

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 12)) {
  fail(`Node.js ${process.versions.node} quá cũ.\nHãy cài Node.js 24 LTS tại https://nodejs.org/dist/latest-v24.x/ (file -x64.msi), rồi chạy lại.`);
}
if (major < 24) console.warn(`[Lưu ý] Đang dùng Node.js ${process.versions.node}. Nên cài Node.js 24 LTS.`);

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const missing = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter(
  (name) => !fs.existsSync(path.join(root, 'node_modules', name, 'package.json')),
);
if (missing.length > 0) run(['install'], `Đang cài thư viện (thiếu: ${missing.join(', ')})`);

function newestMtime(p) {
  if (!fs.existsSync(p)) return 0;
  const st = fs.statSync(p);
  if (!st.isDirectory()) return st.mtimeMs;
  let max = 0;
  for (const entry of fs.readdirSync(p)) max = Math.max(max, newestMtime(path.join(p, entry)));
  return max;
}
const built = path.join(root, 'dist', 'overlay', 'index.html');
const builtAt = fs.existsSync(built) ? fs.statSync(built).mtimeMs : 0;
const sourceAt = Math.max(
  newestMtime(path.join(root, 'overlay')),
  newestMtime(path.join(root, 'shared')),
  newestMtime(path.join(root, 'package-lock.json')),
);
if (sourceAt > builtAt) run(['run', 'build'], 'Đang đóng gói overlay');

process.exit(0);
