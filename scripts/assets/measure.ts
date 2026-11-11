// Đo điểm căn chỉnh bằng phân tích điểm ảnh (mục 7 SPEC).

import type { Img } from './image.js';

/** Số điểm đục (alpha ≥ ngưỡng) trên mỗi hàng. */
export function rowWidths(img: Img, alphaMin = 128): number[] {
  const out = new Array<number>(img.height).fill(0);
  for (let y = 0; y < img.height; y++) {
    let c = 0;
    for (let x = 0; x < img.width; x++) if (img.data[(y * img.width + x) * 4 + 3]! >= alphaMin) c++;
    out[y] = c;
  }
  return out;
}

/** Mép trái, mép phải (tính cả) của phần đục trên một hàng. */
export function rowExtent(img: Img, y: number, alphaMin = 128): [number, number] | null {
  let l = -1;
  let r = -1;
  for (let x = 0; x < img.width; x++) {
    if (img.data[(y * img.width + x) * 4 + 3]! < alphaMin) continue;
    if (l < 0) l = x;
    r = x;
  }
  return l < 0 ? null : [l, r];
}

/** Tâm theo chiều ngang của phần đầu (đoạn trên cùng của hình), dùng để căn nhân vật cho thẳng. */
export function headCenterX(img: Img, fraction = 0.18, alphaMin = 128): number {
  const widths = rowWidths(img, alphaMin);
  const top = widths.findIndex((w) => w > 0);
  let bottom = widths.length - 1;
  while (bottom > 0 && widths[bottom] === 0) bottom--;
  const limit = top + Math.max(1, Math.round((bottom - top) * fraction));
  let sum = 0;
  let count = 0;
  for (let y = top; y <= limit; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.data[(y * img.width + x) * 4 + 3]! < alphaMin) continue;
      sum += x;
      count++;
    }
  }
  return count ? sum / count : img.width / 2;
}

export function bottomOf(img: Img, alphaMin = 64): number {
  for (let y = img.height - 1; y >= 0; y--) {
    for (let x = 0; x < img.width; x++) if (img.data[(y * img.width + x) * 4 + 3]! >= alphaMin) return y + 1;
  }
  return img.height;
}
