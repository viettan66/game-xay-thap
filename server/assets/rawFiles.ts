// Tên ảnh trong SPEC mục 7 → file thật trong assets/raw/ (đọc từ assets/raw-files.json, dùng chung với script Python).
// Ảnh gốc giữ nguyên tên tiếng Việt, không đổi tên, không sửa.

import fs from 'node:fs';
import path from 'node:path';

const file = path.join(import.meta.dirname, '..', '..', 'assets', 'raw-files.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, string>;

export const RAW_FILES: Record<string, string> = Object.fromEntries(Object.entries(data).filter(([k]) => !k.startsWith('_')));

export function rawPath(root: string, name: string): string {
  const f = RAW_FILES[name];
  if (!f) throw new Error(`Không có ảnh "${name}" trong assets/raw-files.json`);
  return path.join(root, 'assets', 'raw', f);
}

/** Ảnh đã phóng ×4 bằng Real-ESRGAN (npm run assets:upscale). */
export function upscaledPath(root: string, name: string): string {
  return path.join(root, 'assets', 'work', 'esrgan', `${name}_x4.png`);
}
