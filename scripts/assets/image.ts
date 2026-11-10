// Ảnh RGBA trong bộ nhớ + đọc/ghi bằng sharp. Dùng cho các script xử lý đồ họa.

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

export interface Img {
  width: number;
  height: number;
  /** RGBA, 4 byte mỗi điểm ảnh. */
  data: Uint8Array;
}

export function blank(width: number, height: number): Img {
  return { width, height, data: new Uint8Array(width * height * 4) };
}

export async function loadImg(file: string): Promise<Img> {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8Array(data.buffer, data.byteOffset, data.length) };
}

export async function saveImg(img: Img, file: string): Promise<void> {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length), {
    raw: { width: img.width, height: img.height, channels: 4 },
  })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(file);
}

export function alphaAt(img: Img, x: number, y: number): number {
  return img.data[(y * img.width + x) * 4 + 3]!;
}

export function crop(img: Img, x: number, y: number, w: number, h: number): Img {
  const out = blank(w, h);
  for (let row = 0; row < h; row++) {
    const sy = y + row;
    if (sy < 0 || sy >= img.height) continue;
    for (let col = 0; col < w; col++) {
      const sx = x + col;
      if (sx < 0 || sx >= img.width) continue;
      const si = (sy * img.width + sx) * 4;
      const di = (row * w + col) * 4;
      out.data.set(img.data.subarray(si, si + 4), di);
    }
  }
  return out;
}

/** Chép src lên dst tại (dx, dy), không pha trộn (dst coi như trong suốt ở chỗ đó). */
export function blit(dst: Img, src: Img, dx: number, dy: number): void {
  for (let y = 0; y < src.height; y++) {
    const ty = y + dy;
    if (ty < 0 || ty >= dst.height) continue;
    for (let x = 0; x < src.width; x++) {
      const tx = x + dx;
      if (tx < 0 || tx >= dst.width) continue;
      const si = (y * src.width + x) * 4;
      if (src.data[si + 3] === 0) continue;
      dst.data.set(src.data.subarray(si, si + 4), (ty * dst.width + tx) * 4);
    }
  }
}
