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

/** Chế độ độ đông (mục 9A). Giai đoạn 4 mới tự tính; trước đó server luôn gửi "vua". */
export type CrowdTier = 'vang' | 'vua' | 'dong' | 'ratdong';

/** Chế độ camera bấm từ admin hoặc do game gọi (mục 8). `site` là chế độ thường. */
export type CameraMode = 'site' | 'overview' | 'tour' | 'ceremony';

/** Thông số camera (config.json camera), số giây tự động đã chọn theo chế độ độ đông hiện tại. */
export interface CameraConfig {
  maxZoom: number;
  /** Công trình chiếm bao nhiêu phần bề ngang khung hình ở chế độ site (0,45–0,6). */
  siteWidth: number;
  /** Mỗi bao nhiêu giây tự thu toàn cảnh / lia giới thiệu (0 = không tự động). */
  overviewEverySec: number;
  overviewSec: number;
  tourEverySec: number;
  tourSec: number;
  ceremonySec: number;
  ceremonyZoom: number;
  /** Quà từ bao nhiêu xu thì camera rung nhẹ. */
  shakeMinCoins: number;
}

/** Dáng trụ trì (mục 9): chắp tay, vẫy chào, cúi chào, dang tay. */
export type AbbotPose = 'pray' | 'wave' | 'bow' | 'welcome';

export type BoardPosition = 'auto' | 'leftMiddle' | 'rightMiddle' | 'leftTop';

/** Bố cục giao diện (mục 8, 14.13). */
export interface HudConfig {
  boardPosition: BoardPosition;
  minimap: 'overview' | 'always' | 'off';
  /** Độ đậm nền từng khung (0–1). */
  opacity: { progress: number; board: number; events: number; disclaimer: number };
  boardRotateSec: number;
  /** Thông báo quà lớn hiện bao nhiêu giây. */
  toastSec: number;
}

/** Một dòng trong ô sự kiện. Chữ đã điền sẵn, riêng {time} overlay tự đếm ngược tới endsAt. */
export interface EventLine {
  kind: 'golden' | 'event' | 'total' | 'goal';
  text: string;
  endsAt: number | null;
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
  hud: HudConfig;
  camera: CameraConfig;
  crowd: CrowdTier;
  /** Ô sự kiện: mục tiêu tim, giờ vàng (đếm ngược), sự kiện lịch, tổng hệ số. Rỗng thì ẩn ô. */
  eventBox: EventLine[];
  /** Giờ của server lúc gửi (ms), để overlay đếm ngược đúng dù đồng hồ máy lệch. */
  serverNow: number;
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
  | {
      type: 'contribution';
      /** Tên đã lọc (từ cấm → tên ẩn danh). */
      name: string;
      source: 'gift' | 'like' | 'comment';
      points: number;
      /** Tổng số xu của quà (0 với tim, bình luận): quà lớn thì camera rung nhẹ. */
      coins: number;
      allocations: Allocation[];
    }
  /** Trụ trì nói một câu (text null: chỉ đổi dáng). verified false: câu chưa duyệt (chỉ có ở giả lập, viền cam). */
  | { type: 'say'; text: string | null; pose: AbbotPose; durationMs: number; verified: boolean }
  /**
   * Thông báo quà (mục 8): kind "big" bật lên khoảng 4 giây (avatar, tên, ảnh vật phẩm); "plus" chỉ hiện "+công" kèm tên.
   * Cùng id = gộp vào thông báo đang chờ / đang hiện (quà nhỏ liên tiếp của cùng một người).
   */
  | { type: 'toast'; id: string; kind: 'big' | 'plus'; platformId: string; name: string; text: string; icon: string | null; coins: number; verified: boolean }
  /** Đủ mục tiêu tim của phiên: mở khóa phần thưởng (múa lân, bảng 9A). */
  | { type: 'festival'; target: number; durationMs: number }
  /** Admin bấm "Toàn cảnh" / "Lia giới thiệu" (mục 8). */
  | { type: 'camera'; mode: Exclude<CameraMode, 'site'> };
