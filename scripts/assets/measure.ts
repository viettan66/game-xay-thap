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

export interface EaveMetrics {
  /** Mép dưới dải ngói (điểm neo chung khi xếp tầng). */
  eaveLineY: number;
  /** Mép trên phẳng, nơi tầng sau đặt lên. */
  topY: number;
  /** Đáy phần thân (không tính đèn lồng thòng xuống). */
  bottomY: number;
  /** Tâm mái hiên theo chiều ngang. */
  centerX: number;
  /** Bề rộng mái hiên (chỗ rộng nhất, gồm cả đầu đao). */
  eaveWidth: number;
}

/** Điểm màu ngói (cam đất) và màu dầm đỡ (đỏ sẫm) trên mỗi hàng. */
export function rowColors(img: Img): { tile: number[]; dark: number[] } {
  const tile = new Array<number>(img.height).fill(0);
  const dark = new Array<number>(img.height).fill(0);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      if (img.data[i + 3]! < 128) continue;
      const r = img.data[i]!;
      const g = img.data[i + 1]!;
      const b = img.data[i + 2]!;
      if (r > 170 && g > 70 && g < 150 && b < 120) tile[y]!++;
      else if (r > 60 && r < 150 && g < 60) dark[y]!++;
    }
  }
  return { tile, dark };
}

/**
 * Đo một tầng tháp (hoặc chóp). Dải ngói nằm dưới thân, là phần rộng nhất của hình (hai đầu đao).
 * - eaveLineY: chỗ màu đổi từ ngói (cam đất) sang dầm đỡ (đỏ sẫm) và giữ như vậy ít nhất `sustain` hàng
 *   (bỏ qua vệt bóng mảnh giữa các lớp ngói).
 * - topY: hàng đầu tiên rộng ≥ topRatio bề rộng lớn nhất (bỏ qua cây giàn giáo, đống gạch ở trên).
 * - bottomY: hàng cuối còn rộng ≥ bottomRatio (chân dầm đỡ).
 */
export function measureEave(img: Img, opts: { topRatio?: number; bottomRatio?: number; sustain?: number } = {}): EaveMetrics {
  const widths = rowWidths(img);
  const maxW = Math.max(...widths);
  const widest = widths.indexOf(maxW);
  const sustain = opts.sustain ?? 6;
  const { tile, dark } = rowColors(img);
  const peakTile = Math.max(...tile.slice(widest));
  const isBracket = (y: number) => tile[y]! < 0.25 * peakTile && dark[y]! > tile[y]!;
  let eaveLineY = -1;
  for (let y = widest + 1; y + sustain <= img.height; y++) {
    let ok = 0;
    for (let k = 0; k < sustain; k++) if (isBracket(y + k)) ok++;
    if (ok >= Math.ceil(sustain * 0.8) && isBracket(y)) {
      eaveLineY = y;
      break;
    }
  }
  if (eaveLineY < 0) {
    // Dự phòng: hết dải rộng ≥ 90% thì coi là hết ngói.
    eaveLineY = widest;
    while (eaveLineY + 1 < widths.length && widths[eaveLineY + 1]! >= maxW * 0.9) eaveLineY++;
    eaveLineY++;
  }
  const topY = Math.max(0, widths.findIndex((w) => w >= maxW * (opts.topRatio ?? 0.72)));
  let bottomY = widths.length - 1;
  while (bottomY > eaveLineY && widths[bottomY]! < maxW * (opts.bottomRatio ?? 0.1)) bottomY--;

  let centerSum = 0;
  let centerN = 0;
  let eaveWidth = 0;
  for (let y = widest; y < eaveLineY; y++) {
    const e = rowExtent(img, y);
    if (!e) continue;
    centerSum += (e[0] + e[1]) / 2;
    centerN++;
    eaveWidth = Math.max(eaveWidth, e[1] - e[0] + 1);
  }
  return {
    eaveLineY,
    topY,
    bottomY: bottomY + 1,
    centerX: centerN ? centerSum / centerN : img.width / 2,
    eaveWidth,
  };
}
