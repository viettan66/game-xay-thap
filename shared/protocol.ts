// Dữ liệu server gửi xuống overlay qua WebSocket (đường /ws).
// Khi overlay kết nối (hoặc kết nối lại), server gửi ngay toàn bộ trạng thái hiện tại (mục 12 SPEC).

import type { PartKey } from './parts.js';
import type { Allocation, ItemSize, ProgressTransition, StageBuild } from './project.js';

/** Giai đoạn của một hạng mục: tên, giá, cách xây từng mảnh (mục 5, 7). */
export interface ProgressStageInfo {
  name: string;
  cost: number;
  build: StageBuild;
}

export interface ProgressItem {
  id: string;
  name: string;
  area: string;
  status: 'done' | 'building' | 'todo';
  stages: ProgressStageInfo[];
}

/** Tiến độ công trình (mục 5, 8). Số thứ tự hạng mục và giai đoạn đếm từ 1. */
export interface ProgressView {
  projectName: string;
  item: { id: string; name: string; number: number; count: number; size: ItemSize; area: string };
  stage: { number: number; count: number; name: string; ritual: string | null; build: StageBuild };
  stagePoints: number;
  stageCost: number;
  /** Phần trăm của giai đoạn, hạng mục, toàn công trình (0–100). */
  percent: number;
  itemPercent: number;
  projectPercent: number;
  /** Số công đã xây vào công trình và tổng công cần. */
  donePoints: number;
  projectCost: number;
  /** Tổng công đã nhận (kể cả sau khánh thành). */
  totalPoints: number;
  completed: boolean;
  /** Ba dòng chữ trên thanh tiến độ, đã điền từ mẫu trong config (labels.progress). */
  lines: { item: string; stage: string; project: string };
  /** Mọi hạng mục theo thứ tự xây, kèm trạng thái. */
  items: ProgressItem[];
}

export interface BoardRow {
  rank: number;
  platformId: string;
  nickname: string;
  avatarUrl: string | null;
  points: number;
}

export type BoardKey = 'session' | 'total' | 'item';

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
  /** Thông số tháp cũ (chỉ /tools/assets còn dùng, bỏ sau R4). */
  floor1WidthPx: number;
  towerTaper: number;
  towerCenterX: number;
  towerBaseY: number;
  boardRotateSec: number;
}

/** Thông số xây từng mảnh (config.json mục pieces). */
export interface PiecesConfig {
  /** Cỡ mảnh [rộng, cao] theo vùng, điểm ảnh bản đồ. Cột: rộng 0 = cả bề ngang cột. */
  size: Record<PartKey, [number, number]>;
  /** Số mảnh đặt tối đa mỗi giây (theo chế độ độ đông hiện tại). */
  maxPerSec: number;
  /** Tên vật liệu hiện trong nhãn piece_burst, theo vùng và theo hiệu ứng mặt đất. */
  materials: Record<string, string>;
  /** Vùng vừa xây sáng viền và nhãn hiện trong bao nhiêu giây. */
  burstSec: number;
}

export interface OverlayState {
  profile: 'production' | 'test';
  /** "CHẾ ĐỘ THỬ" (giả lập), "DIỄN TẬP" (hồ sơ test với live thật), hoặc null (live thật). */
  badge: string | null;
  progress: ProgressView;
  /** Luôn theo thứ tự: top phiên → top tổng → bia hạng mục đang xây. */
  boards: Board[];
  /** Hệ số đang áp dụng (sự kiện, giờ vàng), null nếu ×1. */
  multiplier: { total: number; labels: string[] } | null;
  labels: {
    pointUnit: string;
    disclaimer: string;
  };
  layout: OverlayLayout;
  pieces: PiecesConfig;
  /** Câu lấy từ kho thoại (config/dialogues.json) mà overlay tự hiện. */
  texts: { pieceBurst: string[] };
  /** Đổi khi assets/manifest.json đổi (ví dụ vừa lưu ở /tools/assets): overlay tải lại ảnh. */
  assetsVersion: string;
}

export type ServerMessage =
  | { type: 'state'; state: OverlayState }
  /** Giai đoạn / hạng mục vừa xong hoặc vừa bắt đầu (để overlay chớp sáng, sau này là lễ). */
  | { type: 'progress'; transitions: ProgressTransition[] }
  /** Một lần có công (quà, tim, bình luận): overlay cho mảnh bay vào đúng giai đoạn, ghi tên người góp. */
  | { type: 'contribution'; name: string; source: 'gift' | 'like' | 'comment'; points: number; allocations: Allocation[] };
