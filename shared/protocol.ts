// Dữ liệu server gửi xuống overlay qua WebSocket (đường /ws).
// Khi overlay kết nối (hoặc kết nối lại), server gửi ngay toàn bộ trạng thái hiện tại (mục 12 SPEC).

import type { TowerTransition } from './tower.js';

export interface TowerView {
  floor: number;
  totalFloors: number;
  /** "Nền móng" hoặc "Tầng 5" (lấy từ config). */
  floorName: string;
  stage: number;
  stageName: string;
  floorPoints: number;
  floorCost: number;
  percent: number;
  totalPoints: number;
  completed: boolean;
}

export interface BoardRow {
  rank: number;
  platformId: string;
  nickname: string;
  avatarUrl: string | null;
  points: number;
}

export type BoardKey = 'session' | 'total' | 'floor';

export interface Board {
  key: BoardKey;
  title: string;
  rows: BoardRow[];
}

export interface SafeArea {
  top: number;
  bottom: number;
  right: number;
}

export interface OverlayLayout {
  safeArea: SafeArea;
  floor1WidthPx: number;
  towerTaper: number;
  towerCenterX: number;
  towerBaseY: number;
  boardRotateSec: number;
}

export interface OverlayState {
  profile: 'production' | 'test';
  /** "CHẾ ĐỘ THỬ" (giả lập), "DIỄN TẬP" (hồ sơ test với live thật), hoặc null (live thật). */
  badge: string | null;
  tower: TowerView;
  /** Luôn theo thứ tự: top phiên → top tổng → bia tầng hiện tại. */
  boards: Board[];
  /** Hệ số đang áp dụng (sự kiện, giờ vàng), null nếu ×1. */
  multiplier: { total: number; labels: string[] } | null;
  labels: {
    pointUnit: string;
    disclaimer: string;
  };
  layout: OverlayLayout;
  /** Đổi khi assets/manifest.json đổi (ví dụ vừa lưu ở /tools/assets): overlay tải lại ảnh. */
  assetsVersion: string;
}

export type ServerMessage =
  | { type: 'state'; state: OverlayState }
  | { type: 'tower'; transitions: TowerTransition[] };
