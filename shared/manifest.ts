// Khai báo ảnh game (assets/manifest.json, mục 7 SPEC): đường dẫn, kích thước, điểm neo, thông số căn chỉnh.
// Toạ độ tính bằng điểm ảnh của chính file ảnh đó (riêng phần `map` tính theo hệ tọa độ bản đồ, xem shared/map.ts).

import type { MapManifest } from './map.js';

export interface Point {
  x: number;
  y: number;
}

export interface ManifestImage {
  /** Đường dẫn trong assets/game, ví dụ "abbot/abbot_pray.png". */
  file: string;
  w: number;
  h: number;
  /** Điểm neo: nhân vật, trụ trì, bia là bàn chân / đáy. */
  anchor: Point;
}

export type ManifestEntry = ManifestImage;

export interface Manifest {
  version: 1;
  images: Record<string, ManifestEntry>;
  /** Bản đồ quần thể chùa (giai đoạn R2): nền ghép, công trình, tiền cảnh. Chưa dựng thì không có. */
  map?: MapManifest;
}

/** URL phục vụ ảnh trên server. */
export function assetUrl(file: string): string {
  return `/assets/game/${file}`;
}
