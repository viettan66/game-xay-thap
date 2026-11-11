// Dựng bản đồ quần thể chùa (mục 7): ghép nền, cắt công trình, lớp tiền cảnh, ghi assets/manifest.json (phần map).
// Thứ tự đầy đủ:  npm run assets:upscale  →  npm run assets:segment  →  npm run assets:map
// Thêm --background để ghép lại ảnh nền dù đã có.

import path from 'node:path';
import { buildMap, MapCutError } from '../../server/assets/mapCut.js';

const ROOT = path.resolve(import.meta.dirname, '..', '..');

try {
  const t = Date.now();
  const map = await buildMap(ROOT, { log: (s) => console.log(s), forceBackground: process.argv.includes('--background') });
  console.log(`Xong sau ${((Date.now() - t) / 1000).toFixed(1)} giây: bản đồ ${map.width}×${map.height}, ${map.buildings.length} công trình.`);
  if (map.source !== 'esrgan') console.log('Lưu ý: chưa có ảnh phóng bằng AI, đang dùng phóng thường. Chạy npm run assets:upscale rồi chạy lại.');
} catch (e) {
  if (e instanceof MapCutError) {
    console.error(`[LỖI] ${e.message}`);
    process.exit(1);
  }
  throw e;
}
