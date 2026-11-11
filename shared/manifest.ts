// Khai báo ảnh game (assets/manifest.json, mục 7 SPEC): đường dẫn, kích thước, điểm neo, thông số căn chỉnh.
// Toạ độ tính bằng điểm ảnh của chính file ảnh đó (riêng phần `map` tính theo hệ tọa độ bản đồ, xem shared/map.ts).

import type { MapManifest } from './map.js';

export interface Point {
  x: number;
  y: number;
}

export interface ManifestImage {
  /** Đường dẫn trong assets/game, ví dụ "tower/floor_stage_1.png". */
  file: string;
  w: number;
  h: number;
  /** Điểm neo: tầng tháp là (tâm mái, eaveLineY); nhân vật, bia là bàn chân / đáy. */
  anchor: Point;
}

/** Thông số riêng của ảnh tầng tháp và chóp. */
export interface EaveInfo {
  /** Mép dưới dải ngói (điểm neo chung). Các ảnh tầng căn theo dòng này, KHÔNG căn theo mép ảnh. */
  eaveLineY: number;
  /** Mép trên phẳng, nơi tầng sau đặt lên. */
  topY: number;
  /** Đáy phần thân (không tính đèn lồng). Tầng 1 đặt đáy này lên bệ móng. */
  bottomY: number;
  /** Bề rộng mái hiên, dùng để tính tỉ lệ thu phóng theo floor1WidthPx. */
  eaveWidth: number;
  /** Giá trị máy tự đo (giữ lại để so khi chỉnh tay). */
  auto?: { eaveLineY: number; topY: number };
  /** Đã chỉnh tay trên trang /tools/assets: chạy lại script cắt ảnh sẽ không ghi đè. */
  tuned?: boolean;
}

export type ManifestEntry = ManifestImage & Partial<EaveInfo>;

export interface BackgroundVariant {
  key: string;
  label: string;
  background: string;
  sky: string;
}

export interface Manifest {
  version: 1;
  images: Record<string, ManifestEntry>;
  background: {
    /** Bản nền đang dùng chính thức (A, B…). */
    variant: string;
    variants: BackgroundVariant[];
    /** Điểm đặt tháp trên ảnh nền 1080×1920: giữa mặt bệ móng. */
    towerAnchor: Point;
    /** Trời và nền chồng nhau bao nhiêu điểm ảnh, có mặt nạ mờ dần (mục 8). */
    skyOverlap: number;
  };
  tower: {
    /** Bề rộng mái chóp so với mái tầng cuối. */
    spireScale: number;
  };
  /** Bản đồ quần thể chùa (giai đoạn R2): nền ghép, công trình, tiền cảnh. Chưa dựng thì không có. */
  map?: MapManifest;
}

export const FLOOR_STAGE_KEYS = [1, 2, 3, 4, 5].map((n) => `tower/floor_stage_${n}`);
export const SPIRE_KEY = 'tower/spire';
export const BG_KEY = 'bg/background';
export const SKY_KEY = 'bg/sky_upper';

/** URL phục vụ ảnh trên server. */
export function assetUrl(file: string): string {
  return `/assets/game/${file}`;
}
