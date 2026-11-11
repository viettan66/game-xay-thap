// Camera TẠM cho bản đồ (giai đoạn R2): bản đồ co vừa bề ngang khung 1080, lia dọc để hạng mục đang xây
// nằm giữa vùng nhìn thấy, không bao giờ lộ ra ngoài mép bản đồ (mục 8). R4 làm camera đầy đủ (zoom, overview, tour).
// Hàm thuần, có test.

import type { MapManifest, MapRect } from '../../shared/map.js';
import { STAGE_H, STAGE_W } from './layout.js';

export interface MapCamera {
  scale: number;
  x: number;
  y: number;
}

/** Vùng màn hình còn thấy được bản đồ (giữa giao diện phía trên và dải miễn trừ phía dưới). */
export interface ViewBand {
  top: number;
  bottom: number;
}

export function mapCamera(map: Pick<MapManifest, 'width' | 'height'>, focus: MapRect | null, view: ViewBand): MapCamera {
  const scale = STAGE_W / map.width;
  const center = (view.top + view.bottom) / 2;
  const fy = focus ? focus.y + focus.h / 2 : map.height / 2;
  const minY = Math.min(0, STAGE_H - map.height * scale);
  const y = Math.max(minY, Math.min(0, center - fy * scale));
  return { scale, x: 0, y };
}

export type ItemLook = 'done' | 'building' | 'todo';

/** Độ đậm của công trình theo trạng thái (tạm cho R2; R3 thay bằng hiển thị từng giai đoạn). */
export function lookAlpha(look: ItemLook, pulse: number): number {
  if (look === 'done') return 1;
  if (look === 'building') return 0.38 + 0.12 * Math.sin(pulse * 2.5);
  return 0;
}
