// Bố cục giao diện overlay 1080×1920 (mục 8 SPEC, giai đoạn R4). Hàm thuần, có test.
// Mọi khung nằm trong vùng an toàn (trừ 180px trên, 600px dưới, 150px phải: nền tảng tự vẽ ở đó).
// - Thanh tiến độ: góc trên phải, ngay dưới vùng an toàn trên (nằm trên vùng núi).
// - Ô sự kiện: ngay dưới thanh tiến độ.
// - Bảng xếp hạng thu gọn: 3 chỗ đặt sẵn (trái giữa, phải giữa, trái trên), tự chọn chỗ không che hạng mục đang xây.
// - Trụ trì (mục 9): góc trái phía trên vùng comment; tự né sang phải nếu che hạng mục đang xây.
// - Bản đồ thu nhỏ: góc dưới phải (chỉ hiện khi thu toàn cảnh; lúc đó trụ trì đứng bên trái).
// - Dải miễn trừ: sát trên vùng an toàn dưới.

import type { BoardPosition, SafeArea } from '../../shared/protocol.js';
import type { CamView } from './camera.js';
import { STAGE_H, STAGE_W, type Rect } from './layout.js';

export type BoardSlot = Exclude<BoardPosition, 'auto'>;
export const BOARD_SLOTS: BoardSlot[] = ['leftMiddle', 'rightMiddle', 'leftTop'];

export const PROGRESS_SIZE = { w: 460, h: 156 };
export const EVENT_LINE_H = 38;
export const EVENT_MAX_LINES = 4;
export const BOARD_SIZE = { w: 300, titleH: 46, rowH: 44, rows: 5, pad: 10 };
export const DISCLAIMER_H = 36;
/** Trụ trì cao bao nhiêu điểm ảnh màn hình (ảnh gốc 586×693). */
export const ABBOT_SIZE = { w: 212, h: 250 };

export type AbbotSide = 'left' | 'right';
const M = 12;

export interface HudRects {
  /** Vùng trong vùng an toàn. */
  content: Rect;
  /** Vùng camera đặt hạng mục đang xây vào giữa (trùng content). */
  view: CamView;
  badge: Rect;
  progress: Rect;
  /** Ô sự kiện: chiều cao tối đa; khung thật co theo số dòng. */
  events: Rect;
  boards: Record<BoardSlot, Rect>;
  /** Hộp tối đa của bản đồ thu nhỏ (giữ tỉ lệ, neo góc dưới phải). */
  minimap: Rect;
  /** Chỗ đứng của trụ trì: bên trái (mặc định) và bên phải (khi né công trình). */
  abbot: Record<AbbotSide, Rect>;
  /** Thông báo quà lớn: góc trên trái, dưới nhãn CHẾ ĐỘ THỬ. */
  toast: Rect;
  /** Chip "+công" kèm tên (phòng đông): bay lên rồi mờ, ngay dưới chỗ thông báo quà. */
  plus: Rect;
  /** Sân diễn múa lân khi đủ mục tiêu tim: dải ngay trên dải miễn trừ. */
  festival: Rect;
  disclaimer: Rect;
  /** Vùng vẽ công trường tạm bằng hình khối (khi chưa có bản đồ). */
  site: Rect;
}

export function boardHeight(): number {
  return BOARD_SIZE.titleH + BOARD_SIZE.rows * BOARD_SIZE.rowH + BOARD_SIZE.pad;
}

export function hudRects(safe: SafeArea): HudRects {
  const left = 0;
  const right = STAGE_W - safe.right;
  const top = safe.top;
  const bottom = STAGE_H - safe.bottom;
  const content = { x: left, y: top, w: right - left, h: bottom - top };
  const progress = { x: right - M - PROGRESS_SIZE.w, y: top + M, w: PROGRESS_SIZE.w, h: PROGRESS_SIZE.h };
  const events = { x: progress.x, y: progress.y + progress.h + 8, w: PROGRESS_SIZE.w, h: EVENT_LINE_H * EVENT_MAX_LINES + 12 };
  const badge = { x: 16, y: top + M, w: Math.max(120, progress.x - 16 - 12), h: 44 };
  const disclaimer = { x: left, y: bottom - DISCLAIMER_H, w: right - left, h: DISCLAIMER_H };
  const bh = boardHeight();
  const midY = Math.round((top + bottom) / 2 - bh / 2);
  const boards: Record<BoardSlot, Rect> = {
    leftTop: { x: left + M, y: badge.y + badge.h + M, w: BOARD_SIZE.w, h: bh },
    leftMiddle: { x: left + M, y: Math.max(midY, badge.y + badge.h + M), w: BOARD_SIZE.w, h: bh },
    rightMiddle: { x: right - M - BOARD_SIZE.w, y: Math.max(midY, events.y + events.h + M), w: BOARD_SIZE.w, h: bh },
  };
  const mmH = Math.min(320, disclaimer.y - M - (boards.leftMiddle.y + bh + M));
  const minimap = { x: right - M - 220, y: disclaimer.y - M - Math.max(120, mmH), w: 220, h: Math.max(120, mmH) };
  const abbotY = disclaimer.y - 8 - ABBOT_SIZE.h;
  const abbot: Record<AbbotSide, Rect> = {
    left: { x: left + M, y: abbotY, ...ABBOT_SIZE },
    right: { x: right - M - ABBOT_SIZE.w, y: abbotY, ...ABBOT_SIZE },
  };
  const siteTop = progress.y + progress.h + M;
  const site = { x: left + 16, y: siteTop, w: right - 32, h: disclaimer.y - M - siteTop };
  const toast = { x: left + M, y: badge.y + badge.h + 10, w: Math.min(440, progress.x - M - (left + M)), h: 96 };
  const plus = { x: left + M, y: toast.y + toast.h + 8, w: toast.w, h: 34 };
  const festival = { x: left, y: disclaimer.y - 8 - 280, w: right - left, h: 280 };
  return { content, view: { left, right, top, bottom }, badge, progress, events, boards, minimap, abbot, toast, plus, festival, disclaimer, site };
}

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * Chọn chỗ đặt bảng xếp hạng. Cài đặt cố định thì dùng đúng chỗ đó. "auto": giữ chỗ hiện tại nếu không che
 * hạng mục đang xây; không thì lấy chỗ đầu tiên không che (trái giữa → phải giữa → trái trên);
 * chỗ nào cũng che thì lấy chỗ che ít nhất.
 */
export function chooseBoardSlot(slots: Record<BoardSlot, Rect>, focus: Rect | null, setting: BoardPosition, current: BoardSlot | null): BoardSlot {
  if (setting !== 'auto') return setting;
  if (!focus) return current ?? BOARD_SLOTS[0]!;
  const pad = { x: focus.x - 10, y: focus.y - 10, w: focus.w + 20, h: focus.h + 20 };
  const cover = (s: BoardSlot) => overlapArea(slots[s], pad);
  if (current && cover(current) === 0) return current;
  const free = BOARD_SLOTS.find((s) => cover(s) === 0);
  if (free) return free;
  return [...BOARD_SLOTS].sort((a, b) => cover(a) - cover(b))[0]!;
}

/**
 * Trụ trì đứng bên nào: mặc định bên trái; che hạng mục đang xây thì sang phải (nếu bên phải không che).
 * Lúc thu toàn cảnh, bản đồ thu nhỏ ở bên phải nên trụ trì đứng bên trái.
 */
export function chooseAbbotSide(spots: Record<AbbotSide, Rect>, focus: Rect | null, overview: boolean): AbbotSide {
  if (overview || !focus) return 'left';
  const pad = { x: focus.x - 10, y: focus.y - 10, w: focus.w + 20, h: focus.h + 20 };
  const left = overlapArea(spots.left, pad);
  if (left === 0) return 'left';
  return overlapArea(spots.right, pad) < left ? 'right' : 'left';
}

/** Đồng hồ đếm ngược "m:ss" hoặc "h:mm:ss". */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
