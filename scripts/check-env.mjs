// Kiểm tra môi trường trước khi chạy game (start.bat gọi file này).
// Viết bằng JavaScript thuần để chạy được cả khi chưa cài thư viện.
// Mã thoát: 0 = ổn, 2 = cần chạy "npm install", 3 = lỗi cần người sửa.

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const [major, minor] = process.versions.node.split('.').map(Number);

if (major < 22 || (major === 22 && minor < 12)) {
  console.error(`\n[LỖI] Node.js ${process.versions.node} quá cũ.`);
  console.error('Hãy cài Node.js 24 LTS tại https://nodejs.org (nút "LTS"), rồi chạy lại.\n');
  process.exit(3);
}
if (major < 24) {
  console.warn(`[Lưu ý] Đang dùng Node.js ${process.versions.node}. Nên cài Node.js 24 LTS.`);
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const missing = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter(
  (name) => !fs.existsSync(path.join(root, 'node_modules', name, 'package.json')),
);
if (missing.length > 0) {
  console.log(`Thiếu thư viện: ${missing.join(', ')}`);
  process.exit(2);
}
process.exit(0);
