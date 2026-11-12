// Cắt ảnh nhân vật, xe trâu / voi, tượng võ tướng đá (giai đoạn 4c, SPEC mục 7) từ ảnh đã tách nền
// assets/work/nobg/<tên>.png (do `npm run assets:nobg <tên>` tạo) thành:
//   chars/<loại>_<hướng hoặc việc>_<khung>.png, vehicles/<loại>_<hướng>_<khung>.png, honor/statue_<kiểu>.png
// và ghi vào assets/manifest.json (điểm neo ở giữa bàn chân / đáy).
//   npm run assets:chars
//
// Tỉ lệ: mọi ảnh thu về cùng một thước đo: dáng đứng nhìn thẳng (down_0) của mỗi loại nhân vật cao CHAR_REF_HEIGHT điểm ảnh.
// Ảnh làm việc vẽ to hơn ảnh đi lại, nên cân riêng: dáng cầm ngói đứng thẳng (tile_1) cao bằng dáng đứng.
// Xe trâu, voi, tượng có chiều cao riêng (so với người). Overlay chỉ cần: đơn vị bản đồ / điểm ảnh = heightMap / CHAR_REF_HEIGHT.
// Các khung cùng một động tác có cùng cỡ ô và chân thẳng hàng.

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { loadManifest, saveManifest } from '../../server/assets/manifest.js';
import { CHAR_REF_HEIGHT } from '../../shared/paths.js';
import { extractSprite, findSprites, opaqueBounds, packGroup, readingOrder, type Frame } from '../slice-sheet.js';
import { SHEETS, spriteName } from './chars-sheets.js';
import { crop, loadImg, saveImg, type Img } from './image.js';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const NOBG = path.join(ROOT, 'assets', 'work', 'nobg');
const GAME = path.join(ROOT, 'assets', 'game');

/** Chiều cao (điểm ảnh, theo thước CHAR_REF_HEIGHT = một người) của khung chuẩn cho xe và tượng. */
const REF: Record<string, { frame: string; height: number }> = {
  vehicles_cart: { frame: 'vehicles/cart_down_1', height: Math.round(CHAR_REF_HEIGHT * 1.15) },
  vehicles_elephant: { frame: 'vehicles/elephant_down_1', height: Math.round(CHAR_REF_HEIGHT * 2.1) },
  honor: { frame: 'honor/statue_1', height: Math.round(CHAR_REF_HEIGHT * 1.45) },
};

async function resize(img: Img, k: number): Promise<Img> {
  const w = Math.max(1, Math.round(img.width * k));
  const h = Math.max(1, Math.round(img.height * k));
  const buf = await sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length), { raw: { width: img.width, height: img.height, channels: 4 } })
    .resize(w, h, { kernel: 'lanczos3' })
    .raw()
    .toBuffer();
  return { width: w, height: h, data: new Uint8Array(buf.buffer, buf.byteOffset, buf.length) };
}

/** Tâm theo chiều ngang của phần chân (đoạn dưới cùng của hình), để các khung đứng thẳng hàng. */
function footCenterX(img: Img): number {
  const rows = Math.max(3, Math.round(img.height * 0.06));
  let sum = 0;
  let n = 0;
  for (let y = img.height - rows; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.data[(y * img.width + x) * 4 + 3]! >= 128) {
        sum += x;
        n++;
      }
    }
  }
  return n ? sum / n : img.width / 2;
}

const only = new Set(process.argv.slice(2));
const manifest = loadManifest(ROOT);
if (!manifest) {
  console.error('[LỖI] Chưa có assets/manifest.json.');
  process.exit(1);
}

// 1. Cắt từng hình (bỏ phần trong suốt thừa).
const cut = new Map<string, Img>();
/** Hình thuộc tấm nào (để cân riêng tấm đi lại và tấm làm việc). */
const sheetOf = new Map<string, string>();
let problems = 0;
for (const s of SHEETS) {
  if (only.size && !only.has(s.sheet)) continue;
  const file = path.join(NOBG, `${s.sheet}.png`);
  if (!fs.existsSync(file)) {
    console.error(`[LỖI] Thiếu ${path.relative(ROOT, file)}: chạy "npm run assets:nobg ${s.sheet}" trước.`);
    problems++;
    continue;
  }
  const sheet = await loadImg(file);
  const { sprites, labels } = findSprites(sheet, { minGap: s.minGap ?? 14, minArea: 400 });
  const found = readingOrder(sprites);
  if (found.length !== s.names.length) {
    console.error(`[LỖI] ${s.sheet}: tìm thấy ${found.length} hình, cần ${s.names.length}.`);
    problems++;
    continue;
  }
  found.forEach((sp, i) => {
    if (s.names[i] === '-') return;
    let img = extractSprite(sheet, labels, sp);
    const b = opaqueBounds(img);
    if (b) img = crop(img, b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
    cut.set(spriteName(s.prefix, s.names[i]!), img);
    sheetOf.set(spriteName(s.prefix, s.names[i]!), s.sheet);
  });
}
if (problems) process.exit(1);

// 2. Hệ số thu nhỏ: theo loại nhân vật (dáng đứng nhìn thẳng), theo xe, theo tượng.
const fitOf = new Map<string, number>();
for (const s of SHEETS) for (const [action, h] of Object.entries(s.fit ?? {})) fitOf.set(spriteName(s.prefix, action), h);
const factor = (name: string): number => {
  const action = name.replace(/_\d+$/, '');
  const fit = fitOf.get(action);
  const fitRef = cut.get(`${action}_1`);
  if (fit && fitRef) return fit / fitRef.height;
  if (name.startsWith('chars/')) {
    const type = name.slice('chars/'.length).split('_').slice(0, name.startsWith('chars/danphu') ? 2 : 1).join('_');
    const work = sheetOf.get(name)?.endsWith('_work');
    const ref = cut.get(work ? `chars/${type}_tile_1` : `chars/${type}_down_0`);
    return ref ? (work ? Math.round(CHAR_REF_HEIGHT * 0.98) : CHAR_REF_HEIGHT) / ref.height : 1;
  }
  const key = name.startsWith('vehicles/cart') ? 'vehicles_cart' : name.startsWith('vehicles/elephant') ? 'vehicles_elephant' : 'honor';
  const ref = cut.get(REF[key]!.frame);
  return ref ? REF[key]!.height / ref.height : 1;
};

// 3. Gom khung theo động tác (bỏ số khung ở cuối tên), cùng cỡ ô, chân thẳng hàng; ghi file và manifest.
const groups = new Map<string, Frame[]>();
for (const [name, img0] of cut) {
  const img = await resize(img0, factor(name));
  const key = name.startsWith('honor/') ? name : name.replace(/_\d+$/, '');
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key)!.push({ name, img, ax: footCenterX(img), ay: img.height });
}
// Nhóm ảnh làm lại hết: xóa mục cũ cùng nhóm trong manifest (kể cả bộ dân phu tạm của bản tháp cũ).
const rebuilt = new Set(SHEETS.filter((s) => !only.size || only.has(s.sheet)).map((s) => s.group));
for (const k of Object.keys(manifest.images)) if (rebuilt.has(k.split('/')[0] as 'chars')) delete manifest.images[k];
for (const g of rebuilt) {
  const dir = path.join(GAME, g);
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (f.endsWith('.png')) fs.rmSync(path.join(dir, f));
}
let count = 0;
for (const [key, frames] of groups) {
  const packed = packGroup(frames, 2);
  for (const f of packed.frames) {
    const file = `${f.name}.png`;
    await saveImg(f.img, path.join(GAME, file));
    manifest.images[f.name] = { file, w: packed.cellW, h: packed.cellH, anchor: { x: packed.ax, y: packed.ay } };
    count++;
  }
  console.log(`- ${key}: ${frames.length} khung, ô ${packed.cellW}×${packed.cellH}`);
}
manifest.images = Object.fromEntries(Object.entries(manifest.images).sort(([a], [b]) => a.localeCompare(b)));
saveManifest(ROOT, manifest);
console.log(`Xong: ${count} ảnh. Đã ghi assets/manifest.json`);
