// Giờ Việt Nam (Asia/Ho_Chi_Minh) luôn là UTC+7, không có giờ mùa hè,
// nên chỉ cần cộng 7 giờ rồi đọc theo UTC. Không phụ thuộc múi giờ của máy.

export const VN_OFFSET_MS = 7 * 3600_000;

export interface VnParts {
  year: number;
  month: number; // 1..12
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = Chủ nhật, 1 = Thứ hai, …, 6 = Thứ bảy */
  weekday: number;
}

export function vnParts(ts: number): VnParts {
  const d = new Date(ts + VN_OFFSET_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
    weekday: d.getUTCDay(),
  };
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** Khóa ngày theo giờ Việt Nam, dạng YYYY-MM-DD. */
export function vnDayKey(ts: number): string {
  const p = vnParts(ts);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Dấu thời gian dạng YYYYMMDD-HHmmss theo giờ Việt Nam (dùng đặt tên file). */
export function vnStamp(ts: number): string {
  const p = vnParts(ts);
  return `${p.year}${pad(p.month)}${pad(p.day)}-${pad(p.hour)}${pad(p.minute)}${pad(p.second)}`;
}

/** Đổi giờ Việt Nam sang dấu thời gian (ms). */
export function vnTs(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): number {
  return Date.UTC(year, month - 1, day, hour, minute, second) - VN_OFFSET_MS;
}

/** "HH:MM" → số phút tính từ 00:00. */
export function parseHHMM(s: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) throw new Error(`Giờ không hợp lệ: "${s}" (cần dạng HH:MM)`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Phút hiện tại trong ngày nằm trong khung [from, to). Khung qua nửa đêm (22:00–02:00) vẫn đúng. */
export function inTimeWindow(minuteOfDay: number, from: string, to: string): boolean {
  const a = parseHHMM(from);
  const b = parseHHMM(to);
  if (a === b) return true; // cả ngày
  return a < b ? minuteOfDay >= a && minuteOfDay < b : minuteOfDay >= a || minuteOfDay < b;
}
