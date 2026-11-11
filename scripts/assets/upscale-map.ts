// Phóng to 3 ảnh bản đồ bằng AI (Real-ESRGAN, mục 7): map_built, map_empty, map_ground_ext.
// Ảnh gốc KHÔNG bị sửa: chép sang assets/work/map/src/ với tên không dấu (công cụ ESRGAN đọc tên tiếng Việt không ổn định),
// rồi phóng ×4 vào assets/work/esrgan/<tên>_x4.png. Bước sau (`npm run assets:map`) thu về hệ tọa độ bản đồ.
//
// Chạy:  npm run assets:upscale            (bỏ qua ảnh đã phóng rồi)
//        npm run assets:upscale -- --force (phóng lại hết)
// Cần thư mục .tools/realesrgan/ (xem README mục 3b). Không có thì báo cách cài, không làm gì.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { rawPath, upscaledPath } from '../../server/assets/rawFiles.js';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const EXE = path.join(ROOT, '.tools', 'realesrgan', 'realesrgan-ncnn-vulkan.exe');
const SRC_DIR = path.join(ROOT, 'assets', 'work', 'map', 'src');
const OUT_DIR = path.join(ROOT, 'assets', 'work', 'esrgan');
const MAP_SOURCES = ['map_built', 'map_empty', 'map_ground_ext'] as const;

function main(): void {
  if (!fs.existsSync(EXE)) {
    console.error(`[LỖI] Chưa có Real-ESRGAN (${EXE}). Xem README mục 3b để tải về.`);
    process.exit(1);
  }
  const force = process.argv.includes('--force');
  fs.mkdirSync(SRC_DIR, { recursive: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const name of MAP_SOURCES) {
    const out = upscaledPath(ROOT, name);
    if (!force && fs.existsSync(out)) {
      console.log(`- ${name}: đã có, bỏ qua (thêm --force để làm lại)`);
      continue;
    }
    const src = path.join(SRC_DIR, `${name}.png`);
    fs.copyFileSync(rawPath(ROOT, name), src);
    console.log(`- ${name}: đang phóng ×4 bằng Real-ESRGAN…`);
    const r = spawnSync(EXE, ['-i', src, '-o', out, '-n', 'realesrgan-x4plus'], { stdio: 'inherit', cwd: path.dirname(EXE) });
    if (r.status !== 0 || !fs.existsSync(out)) {
      console.error(`[LỖI] Real-ESRGAN không chạy được với ${name} (mã ${r.status}).`);
      process.exit(1);
    }
  }
  console.log('Xong. Chạy tiếp: npm run assets:map');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) main();
