// Cắt bộ đống vật liệu (mục 7, R3b) từ ảnh đã tách nền assets/work/nobg/props.png (do `npm run assets:nobg props` tạo)
// thành assets/game/props/<tên>_<mức>.png và ghi vào assets/manifest.json (điểm neo ở giữa đáy).
// Thứ tự trong ảnh gốc: gạch, gỗ, ngói, đá (mỗi loại 3 mức: lớn, vừa, nhỏ); hàng cuối: cát, giá cưa, ròng rọc,
// thang tre, quang gánh, xe cút kít.

import path from 'node:path';
import { loadManifest, saveManifest } from '../../server/assets/manifest.js';
import { extractSprite, findSprites, opaqueBounds, readingOrder } from '../slice-sheet.js';
import { crop, loadImg, saveImg } from './image.js';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
export const PROP_NAMES = [
  'gach_lon', 'gach_vua', 'gach_nho',
  'go_lon', 'go_vua', 'go_nho',
  'ngoi_lon', 'ngoi_vua', 'ngoi_nho',
  'da_lon', 'da_vua', 'da_nho',
  'cat', 'gia_cua', 'rong_roc', 'thang_tre', 'quang_ganh', 'xe_cut_kit',
];

const sheet = await loadImg(path.join(ROOT, 'assets', 'work', 'nobg', 'props.png'));
const found = readingOrder(findSprites(sheet, { minGap: 6 }).sprites);
if (found.length !== PROP_NAMES.length) {
  console.error(`[LỖI] Tìm thấy ${found.length} vật, cần ${PROP_NAMES.length}. Kiểm tra lại ảnh props sau khi tách nền.`);
  process.exit(1);
}
const { labels } = findSprites(sheet, { minGap: 6 });
const manifest = loadManifest(ROOT);
if (!manifest) {
  console.error('[LỖI] Chưa có assets/manifest.json.');
  process.exit(1);
}
for (const [i, s] of found.entries()) {
  const name = PROP_NAMES[i]!;
  let img = extractSprite(sheet, labels, s);
  const b = opaqueBounds(img);
  if (b) img = crop(img, b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
  const file = `props/${name}.png`;
  await saveImg(img, path.join(ROOT, 'assets', 'game', file));
  manifest.images[`props/${name}`] = { file, w: img.width, h: img.height, anchor: { x: Math.round(img.width / 2), y: img.height } };
  console.log(`- ${file} ${img.width}×${img.height}`);
}
manifest.images = Object.fromEntries(Object.entries(manifest.images).sort(([a], [b]) => a.localeCompare(b)));
saveManifest(ROOT, manifest);
console.log('Xong: đã ghi assets/manifest.json');
