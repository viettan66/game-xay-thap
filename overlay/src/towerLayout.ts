// Xếp chồng tầng tháp theo ảnh thật (thuần, test được; dùng chung cho overlay và trang /tools/assets).
//
// Quy tắc (mục 7, 8 SPEC):
// - Mọi ảnh tầng căn theo eaveLineY (mép dưới dải ngói), KHÔNG căn theo mép ảnh (ảnh giai đoạn 5 có đèn lồng nên cao hơn).
// - Tầng 1 đặt đáy thân (bottomY) lên mặt bệ móng trong ảnh nền (towerAnchor).
// - Tầng n+1 đặt eaveLineY của nó trùng topY (mép trên phẳng) của tầng n.
// - Tầng n thu nhỏ towerTaper^(n-1) so với tầng 1; tầng 1 rộng floor1WidthPx (tính theo bề rộng mái hiên).
// - Chóp đặt lên tầng cuối theo cùng quy tắc, mái chóp rộng spireScale lần mái tầng cuối.

import { FLOOR_STAGE_KEYS, SPIRE_KEY, type Manifest, type ManifestEntry, type Point } from '../../shared/manifest.js';
import { CAMERA_FOCUS_Y } from './layout.js';

export interface FloorArt {
  key: string;
  w: number;
  h: number;
  /** Điểm neo ngang (tâm mái hiên) trong ảnh. */
  ax: number;
  eaveLineY: number;
  topY: number;
  bottomY: number;
  eaveWidth: number;
}

export interface TowerArt {
  /** Ảnh 5 giai đoạn, chỉ số 0 = giai đoạn 1. */
  stages: FloorArt[];
  spire: FloorArt;
}

export interface TowerParams {
  floor1WidthPx: number;
  towerTaper: number;
  anchor: Point;
  spireScale: number;
}

export interface PlacedPiece {
  key: string;
  floor: number;
  stage: number;
  /** Toạ độ "thế giới" (trước khi dịch camera) của điểm neo (tâm mái, mép dưới dải ngói). */
  x: number;
  eaveY: number;
  scale: number;
  /** Mép trên phẳng sau khi đặt (chỗ tầng sau đặt lên). */
  topY: number;
  /** Đáy thân sau khi đặt. */
  bottomY: number;
}

// Kích thước tạm khi chưa có ảnh (gần với ảnh tầng thật đã cắt).
const PLACEHOLDER: Omit<FloorArt, 'key'> = { w: 420, h: 470, ax: 210, eaveLineY: 380, topY: 52, bottomY: 418, eaveWidth: 404 };

function art(key: string, e: ManifestEntry | undefined): FloorArt {
  if (!e || e.eaveLineY === undefined || e.topY === undefined) return { key, ...PLACEHOLDER };
  return {
    key,
    w: e.w,
    h: e.h,
    ax: e.anchor.x,
    eaveLineY: e.eaveLineY,
    topY: e.topY,
    bottomY: e.bottomY ?? e.h,
    eaveWidth: e.eaveWidth ?? e.w,
  };
}

export function towerArtFrom(m: Manifest | null): TowerArt {
  return {
    stages: FLOOR_STAGE_KEYS.map((k) => art(k, m?.images[k])),
    spire: art(SPIRE_KEY, m?.images[SPIRE_KEY]),
  };
}

export interface TowerPlacement {
  floors: PlacedPiece[];
  spire: PlacedPiece | null;
}

/**
 * Vị trí các tầng đang hiện: tầng 1 … tầng đang xây (tầng dưới dùng ảnh giai đoạn 5,
 * tầng đang xây dùng ảnh giai đoạn hiện tại). Xong tháp thì thêm chóp.
 */
export function placeTower(
  a: TowerArt,
  p: TowerParams,
  tower: { floor: number; stage: number; completed: boolean; totalFloors: number },
): TowerPlacement {
  const ref = a.stages[4]!;
  const base = p.floor1WidthPx / ref.eaveWidth;
  const last = tower.completed ? tower.totalFloors : tower.floor;
  const floors: PlacedPiece[] = [];
  let prevTop = 0;
  for (let n = 1; n <= last; n++) {
    const stage = n < tower.floor || tower.completed ? 5 : tower.stage;
    const s = a.stages[stage - 1]!;
    const scale = base * Math.pow(p.towerTaper, n - 1);
    const eaveY = n === 1 ? p.anchor.y - (s.bottomY - s.eaveLineY) * scale : prevTop;
    const topY = eaveY - (s.eaveLineY - s.topY) * scale;
    floors.push({ key: s.key, floor: n, stage, x: p.anchor.x, eaveY, scale, topY, bottomY: eaveY + (s.bottomY - s.eaveLineY) * scale });
    prevTop = topY;
  }
  let spire: PlacedPiece | null = null;
  if (tower.completed && floors.length > 0) {
    const top = floors.at(-1)!;
    const sp = a.spire;
    const scale = (p.spireScale * top.scale * ref.eaveWidth) / sp.eaveWidth;
    spire = {
      key: sp.key,
      floor: tower.totalFloors + 1,
      stage: 5,
      x: p.anchor.x,
      eaveY: top.topY,
      scale,
      topY: top.topY - sp.eaveLineY * scale,
      bottomY: top.topY + (sp.bottomY - sp.eaveLineY) * scale,
    };
  }
  return { floors, spire };
}

/** Độ dịch camera để tầng đang xây (hoặc chóp) nằm ở ~45% màn hình; tháp còn thấp thì đứng yên. */
export function cameraTargetFor(placement: TowerPlacement): number {
  const piece = placement.spire ?? placement.floors.at(-1);
  if (!piece) return 0;
  const center = (piece.eaveY + piece.topY) / 2;
  return Math.max(0, CAMERA_FOCUS_Y - center);
}
