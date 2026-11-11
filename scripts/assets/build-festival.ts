// Cắt bộ múa lân (phần thưởng khi đủ mục tiêu tim, giai đoạn 4b) từ ảnh đã tách nền
// assets/work/nobg/lion_dance.png (do `npm run assets:nobg lion_dance` tạo) thành assets/game/festival/*.png
// và ghi vào assets/manifest.json. Các khung cùng một động tác có cùng cỡ ô, chân thẳng hàng (neo giữa đáy).
// Thứ tự trong ảnh gốc: hàng 1 lân nhìn thẳng (4 khung), hàng 2 lân đi ngang sang phải (4 khung),
// hàng 3: người đánh trống (2), người đánh chũm chọe (2), ông Địa cầm quạt (2).

import path from 'node:path';
import { loadManifest, saveManifest } from '../../server/assets/manifest.js';
import { extractSprite, findSprites, opaqueBounds, packGroup, readingOrder, type Frame } from '../slice-sheet.js';
import { crop, loadImg, saveImg } from './image.js';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
export const FESTIVAL_GROUPS: [string, number][] = [
  ['lion_front', 4],
  ['lion_side', 4],
  ['drum', 2],
  ['cymbal', 2],
  ['ongdia', 2],
];

const sheet = await loadImg(path.join(ROOT, 'assets', 'work', 'nobg', 'lion_dance.png'));
const { sprites, labels } = findSprites(sheet, { minGap: 10 });
const found = readingOrder(sprites);
const total = FESTIVAL_GROUPS.reduce((a, [, n]) => a + n, 0);
if (found.length !== total) {
  console.error(`[LỖI] Tìm thấy ${found.length} hình, cần ${total}. Kiểm tra lại ảnh lion_dance sau khi tách nền.`);
  process.exit(1);
}
const manifest = loadManifest(ROOT);
if (!manifest) {
  console.error('[LỖI] Chưa có assets/manifest.json.');
  process.exit(1);
}
let k = 0;
for (const [name, n] of FESTIVAL_GROUPS) {
  const frames: Frame[] = [];
  for (let i = 1; i <= n; i++) {
    let img = extractSprite(sheet, labels, found[k++]!);
    const b = opaqueBounds(img);
    if (b) img = crop(img, b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
    frames.push({ name: `festival/${name}_${i}`, img, ax: img.width / 2, ay: img.height });
  }
  const group = packGroup(frames, 2);
  for (const f of group.frames) {
    const file = `${f.name}.png`;
    await saveImg(f.img, path.join(ROOT, 'assets', 'game', file));
    manifest.images[f.name] = { file, w: group.cellW, h: group.cellH, anchor: { x: group.ax, y: group.ay } };
    console.log(`- ${file} ${group.cellW}×${group.cellH}`);
  }
}
manifest.images = Object.fromEntries(Object.entries(manifest.images).sort(([a], [b]) => a.localeCompare(b)));
saveManifest(ROOT, manifest);
console.log('Xong: đã ghi assets/manifest.json');
