// Dựng toàn bộ ảnh game từ ảnh đã tách nền (assets/work/nobg, do remove_bg.py tạo) → assets/game + assets/manifest.json.
//   npm run assets:build
// Ảnh do script khác thêm vào manifest (props/ của assets:props) và phần bản đồ (assets:map) được giữ nguyên.
// (Ảnh tầng tháp, chóp, nền tháp cũ đã bỏ sau R4.)

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import type { Manifest, ManifestEntry } from '../../shared/manifest.js';
import { saveManifest, validateManifest } from '../../server/assets/manifest.js';
import { extractSprite, findSprites, packGroup, type Frame, type PackedGroup } from '../slice-sheet.js';
import { crop, loadImg, saveImg, type Img } from './image.js';
import { bottomOf, headCenterX, rowWidths } from './measure.js';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const RAW = path.join(ROOT, 'assets', 'raw');
const WORK = path.join(ROOT, 'assets', 'work');
const NOBG = path.join(WORK, 'nobg');
const GAME = path.join(ROOT, 'assets', 'game');
const MANIFEST = path.join(ROOT, 'assets', 'manifest.json');

const images: Record<string, ManifestEntry> = {};
/** Nhóm ảnh script này dựng lại (ảnh cũ cùng nhóm được thay hẳn). */
const BUILT = ['abbot', 'stele', 'ui', 'items'];
const log = (s: string) => console.log(s);

function previous(): Manifest | null {
  if (!fs.existsSync(MANIFEST)) return null;
  try {
    return validateManifest(JSON.parse(fs.readFileSync(MANIFEST, 'utf8')));
  } catch {
    return null;
  }
}
const prev = previous();

async function sheet(name: string): Promise<Img> {
  const file = path.join(NOBG, `${name}.png`);
  if (!fs.existsSync(file)) {
    throw new Error(`Chưa có ${path.relative(ROOT, file)}. Chạy tách nền trước: .venv\\Scripts\\python.exe scripts\\assets\\remove_bg.py`);
  }
  return loadImg(file);
}

function slice(img: Img, expected: number, opts: Parameters<typeof findSprites>[1] = {}): Img[] {
  const { sprites, labels } = findSprites(img, opts);
  if (sprites.length !== expected) {
    throw new Error(`Tìm thấy ${sprites.length} hình, cần ${expected}. Kiểm tra lại ảnh tách nền.`);
  }
  return sprites.map((s) => extractSprite(img, labels, s));
}

async function writeGroup(group: PackedGroup, extra?: (name: string, i: number) => Partial<ManifestEntry>): Promise<void> {
  for (const [i, f] of group.frames.entries()) {
    const file = `${f.name}.png`;
    await saveImg(f.img, path.join(GAME, file));
    images[f.name] = { file, w: group.cellW, h: group.cellH, anchor: { x: group.ax, y: group.ay }, ...extra?.(f.name, i) };
  }
}

/** Nhân vật: căn theo giữa đầu (ngang) và bàn chân (dọc), cùng kích thước ô trong nhóm. */
function charFrame(name: string, img: Img): Frame {
  return { name, img, ax: headCenterX(img), ay: bottomOf(img) };
}

async function abbot(): Promise<void> {
  const names = ['abbot_pray', 'abbot_wave', 'abbot_bow', 'abbot_welcome'];
  const imgs = slice(await sheet('abbot_poses'), 4, { minGap: 16 });
  await writeGroup(packGroup(imgs.map((im, i) => charFrame(`abbot/${names[i]}`, im)), 6));
}

async function stele(): Promise<void> {
  const [img] = slice(await sheet('stele'), 1);
  await writeGroup(packGroup([{ name: 'stele/stele', img: img!, ax: img!.width / 2, ay: bottomOf(img!) }], 6));
}

// Vị trí gần đúng (tâm) của từng món trong ui_kit.png, để gán đúng tên dù bố cục không thẳng hàng.
const UI_LAYOUT: [string, number, number][] = [
  ['ui/banner', 384, 172],
  ['ui/panel_tall', 914, 260],
  ['ui/panel_square', 1244, 214],
  ['ui/progress_frame', 384, 352],
  ['ui/progress_fill', 382, 440],
  ['ui/avatar_frame', 1262, 572],
  ['ui/_steps', 358, 534],
  ['ui/medal_gold', 768, 536],
  ['ui/medal_silver', 908, 536],
  ['ui/medal_bronze', 1048, 536],
  ['ui/title_1', 142, 702],
  ['ui/title_2', 340, 698],
  ['ui/title_3', 542, 700],
  ['ui/title_4', 746, 696],
  ['ui/title_5', 976, 690],
  ['items/brick', 116, 914],
  ['items/logs', 308, 910],
  ['items/buffalo_cart', 564, 914],
  ['items/elephant', 860, 894],
  ['items/bell', 1098, 890],
  ['items/guardian', 1324, 884],
];

async function uiKit(): Promise<void> {
  const img = await sheet('ui_kit');
  const { sprites, labels } = findSprites(img, { coreAlpha: 200, minGap: 6, haloRadius: 36, minArea: 200 });
  if (sprites.length !== UI_LAYOUT.length) throw new Error(`ui_kit: tìm thấy ${sprites.length} món, cần ${UI_LAYOUT.length}`);
  const used = new Set<number>();
  for (const [name, cx, cy] of UI_LAYOUT) {
    let best = -1;
    let bestD = Infinity;
    sprites.forEach((s, i) => {
      if (used.has(i)) return;
      const d = Math.hypot(s.x + s.w / 2 - cx, s.y + s.h / 2 - cy);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best < 0 || bestD > 90) throw new Error(`ui_kit: không tìm thấy món ${name}`);
    used.add(best);
    const part = extractSprite(img, labels, sprites[best]!);
    if (name === 'ui/_steps') {
      await uiSteps(part);
      continue;
    }
    const g = packGroup([{ name, img: part, ax: part.width / 2, ay: part.height / 2 }], 2);
    await writeGroup(g);
  }
  // Huy chương và vòng bước cùng nhóm thì cùng kích thước ô.
  await equalize(['ui/medal_gold', 'ui/medal_silver', 'ui/medal_bronze']);
}

/** Tách hàng 5 vòng nối nhau: lấy 3 vòng đầu (rỗng, đang làm, xong), bỏ đoạn dây nối (code tự vẽ). */
async function uiSteps(row: Img): Promise<void> {
  const cols: number[] = [];
  for (let x = 0; x < row.width; x++) {
    let c = 0;
    for (let y = 0; y < row.height; y++) if (row.data[(y * row.width + x) * 4 + 3]! >= 200) c++;
    cols.push(c);
  }
  const findRuns = (tall: number) => {
    const out: [number, number][] = [];
    cols.forEach((c, x) => {
      if (c < tall) return;
      const last = out.at(-1);
      if (last && x === last[1] + 1) last[1] = x;
      else out.push([x, x]);
    });
    return out;
  };
  // Lượt 1: tìm sơ bộ tâm các vòng (cột cao ≥ nửa đường kính).
  const rough = findRuns(Math.max(...cols) * 0.5);
  if (rough.length < 3) throw new Error('ui_kit: không tách được các vòng bước');
  // Độ dày dây nối = số điểm đục ở cột giữa vòng 1 và vòng 2. Lượt 2: mọi cột cao hơn dây nối là thuộc vòng → đúng bán kính.
  const lineThick = cols[Math.round((rough[0]![1] + rough[1]![0]) / 2)]!;
  const runs = findRuns(lineThick + 4);
  if (runs.length < 3) throw new Error('ui_kit: không tách được các vòng bước');
  const rowsW = rowWidths(row, 200);
  let sum = 0;
  let n = 0;
  rowsW.forEach((w, y) => {
    sum += w * y;
    n += w;
  });
  const cy = sum / n;
  const names = ['ui/step_empty', 'ui/step_current', 'ui/step_done'];
  const frames: Frame[] = [];
  for (let i = 0; i < 3; i++) {
    const [a, b] = runs[i]!;
    const cx = (a + b) / 2;
    const r = (b - a) / 2;
    const reach = i === 1 ? r + 40 : r + 6; // vòng "đang làm" có hào quang
    const x0 = Math.round(cx - reach);
    const y0 = Math.round(cy - reach);
    const size = Math.round(reach * 2);
    const part = crop(row, x0, y0, size, size);
    // Độ dày dây nối: đếm số hàng đục ngay ngoài vòng tròn.
    const probeX = Math.round(cx + r + 4);
    let thick = 0;
    for (let y = 0; y < row.height; y++) if (row.data[(y * row.width + probeX) * 4 + 3]! >= 160) thick++;
    const band = Math.ceil(thick / 2) + 3;
    const lcy = Math.round(cy - y0);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const d = Math.hypot(x0 + x - cx, y0 + y - cy);
        const i = (y * size + x) * 4;
        if (d > reach) {
          part.data[i + 3] = 0;
          continue;
        }
        if (d <= r + 0.5 || Math.abs(y - lcy) > band) continue;
        // Trong dải dây nối, ngoài vòng: vá lại bằng hào quang nội suy từ hàng trên và hàng dưới dải.
        const above = ((lcy - band - 1) * size + x) * 4;
        const below = ((lcy + band + 1) * size + x) * 4;
        const t = (y - (lcy - band - 1)) / (2 * band + 2);
        for (let c = 0; c < 4; c++) part.data[i + c] = Math.round(part.data[above + c]! * (1 - t) + part.data[below + c]! * t);
      }
    }
    frames.push({ name: names[i]!, img: part, ax: cx - x0, ay: cy - y0 });
  }
  await writeGroup(packGroup(frames, 2));
}

async function equalize(names: string[]): Promise<void> {
  const frames: Frame[] = [];
  for (const n of names) {
    const im = await loadImg(path.join(GAME, images[n]!.file));
    frames.push({ name: n, img: im, ax: im.width / 2, ay: im.height / 2 });
  }
  await writeGroup(packGroup(frames, 0));
}

async function main(): Promise<void> {
  log('Dựng ảnh game từ assets/work/nobg → assets/game');
  log('- Trụ trì');
  await abbot();
  log('- Bia đá');
  await stele();
  log('- Bộ giao diện và vật phẩm');
  await uiKit();
  // Ảnh do script khác thêm (ví dụ props/ của assets:props) thì giữ nguyên.
  for (const [k, e] of Object.entries(prev?.images ?? {})) if (!(k in images) && !BUILT.some((g) => k.startsWith(`${g}/`))) images[k] = e;

  const manifest: Manifest = {
    version: 1,
    images: Object.fromEntries(Object.entries(images).sort(([a], [b]) => a.localeCompare(b))),
    // Bản đồ do `npm run assets:map` dựng: giữ nguyên.
    ...(prev?.map ? { map: prev.map } : {}),
  };
  saveManifest(ROOT, manifest);
  log(`Xong: ${Object.keys(images).length} ảnh. Đã ghi assets/manifest.json`);
}

await main();

