// Lịch sự kiện (dương lịch, âm lịch) và hệ số nhân điểm (mục 4, 14.11 SPEC). Hàm thuần.

import { isLastDayOfLunarMonth, solarToLunar } from './lunar.js';
import { inTimeWindow, vnParts } from './time.js';

export interface GameEventDef {
  key: string;
  name: string;
  enabled: boolean;
  /** Ưu tiên khi nhiều sự kiện trùng nhau (lấy trang trí, thoại của sự kiện ưu tiên cao hơn). */
  priority: number;
  multiplier: number;
  // Chỉ dùng MỘT trong các kiểu ngày sau:
  /** Dương lịch "MM-DD". */
  solar?: string;
  /** Âm lịch "MM-DD" (chỉ tháng thường, không tính tháng nhuận). */
  lunar?: string;
  /** Lặp hàng tháng theo âm lịch: ngày 1..30 (tính cả tháng nhuận). */
  lunarMonthlyDay?: number;
  /** Khoảng ngày âm lịch, "MM-DD" hoặc "MM-last" (ngày cuối tháng). Ví dụ Tết: 12-last → 01-03. */
  lunarRange?: { from: string; to: string };
  /** Thứ trong tuần theo giờ Việt Nam: 0 = Chủ nhật … 6 = Thứ bảy. */
  weekdays?: number[];
  /** Khung giờ "HH:MM"–"HH:MM". Không có = cả ngày. */
  time?: { from: string; to: string };
  theme?: string[];
  playlist?: string;
}

export interface GoldenHourRules {
  multiplier: number;
  schedule: { weekdays: number[]; from: string; to: string }[];
}

export interface MultiplierRules {
  maxTotalMultiplier: number;
  /** Nhiều sự kiện trùng ngày: lấy hệ số cao nhất ("max") hay nhân dồn ("multiply"). */
  eventCombine: 'max' | 'multiply';
  /** Ghép hệ số sự kiện với giờ vàng: nhân ("multiply") hay lấy cao nhất ("max"). */
  goldenHourCombine: 'multiply' | 'max';
}

export interface MultiplierInfo {
  /** Hệ số cuối cùng (đã áp trần). */
  total: number;
  eventMultiplier: number;
  goldenMultiplier: number;
  /** Khóa các sự kiện đang diễn ra, ưu tiên cao trước. */
  activeEventKeys: string[];
  goldenHour: boolean;
  capped: boolean;
}

type DayBound = { month: number; day: number | 'last' };

function parseBound(s: string): DayBound {
  const m = /^(\d{1,2})-(\d{1,2}|last)$/.exec(s);
  if (!m) throw new Error(`Ngày âm lịch không hợp lệ: "${s}"`);
  return { month: Number(m[1]), day: m[2] === 'last' ? 'last' : Number(m[2]) };
}

function parseMonthDay(s: string): { month: number; day: number } {
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(s);
  if (!m) throw new Error(`Ngày không hợp lệ: "${s}" (cần dạng MM-DD)`);
  return { month: Number(m[1]), day: Number(m[2]) };
}

function dateMatches(def: GameEventDef, ts: number): boolean {
  const p = vnParts(ts);
  if (def.solar !== undefined) {
    const md = parseMonthDay(def.solar);
    return p.month === md.month && p.day === md.day;
  }
  if (def.weekdays !== undefined) {
    return def.weekdays.includes(p.weekday);
  }
  const lunar = solarToLunar(p.year, p.month, p.day);
  if (def.lunar !== undefined) {
    const md = parseMonthDay(def.lunar);
    return !lunar.leap && lunar.month === md.month && lunar.day === md.day;
  }
  if (def.lunarMonthlyDay !== undefined) {
    return lunar.day === def.lunarMonthlyDay;
  }
  if (def.lunarRange !== undefined) {
    const from = parseBound(def.lunarRange.from);
    const to = parseBound(def.lunarRange.to);
    const isLast = () => isLastDayOfLunarMonth(p.year, p.month, p.day);
    const afterFrom =
      lunar.month > from.month ||
      (lunar.month === from.month && (from.day === 'last' ? isLast() : lunar.day >= from.day));
    const beforeTo =
      lunar.month < to.month ||
      (lunar.month === to.month && (to.day === 'last' ? true : lunar.day <= to.day));
    const wraps =
      from.month > to.month ||
      (from.month === to.month && from.day !== 'last' && to.day !== 'last' && from.day > to.day);
    return wraps ? afterFrom || beforeTo : afterFrom && beforeTo;
  }
  return false;
}

export function isEventActive(def: GameEventDef, ts: number): boolean {
  if (!def.enabled) return false;
  if (def.time) {
    const p = vnParts(ts);
    if (!inTimeWindow(p.hour * 60 + p.minute, def.time.from, def.time.to)) return false;
  }
  return dateMatches(def, ts);
}

/** Các sự kiện đang diễn ra, ưu tiên cao trước. */
export function activeEvents(defs: GameEventDef[], ts: number): GameEventDef[] {
  return defs.filter((d) => isEventActive(d, ts)).sort((a, b) => b.priority - a.priority);
}

export function isGoldenHourActive(rules: GoldenHourRules, ts: number, manualUntil: number | null): boolean {
  if (manualUntil !== null && ts < manualUntil) return true;
  const p = vnParts(ts);
  const minute = p.hour * 60 + p.minute;
  return rules.schedule.some((s) => s.weekdays.includes(p.weekday) && inTimeWindow(minute, s.from, s.to));
}

export function computeMultiplier(
  ts: number,
  defs: GameEventDef[],
  golden: GoldenHourRules,
  manualGoldenUntil: number | null,
  rules: MultiplierRules,
): MultiplierInfo {
  const active = activeEvents(defs, ts);
  let eventMultiplier = 1;
  if (active.length > 0) {
    eventMultiplier =
      rules.eventCombine === 'multiply'
        ? active.reduce((acc, e) => acc * e.multiplier, 1)
        : Math.max(...active.map((e) => e.multiplier));
  }
  const goldenHour = isGoldenHourActive(golden, ts, manualGoldenUntil);
  const goldenMultiplier = goldenHour ? golden.multiplier : 1;
  const combined =
    rules.goldenHourCombine === 'max'
      ? Math.max(eventMultiplier, goldenMultiplier)
      : eventMultiplier * goldenMultiplier;
  const total = Math.min(combined, rules.maxTotalMultiplier);
  return {
    total,
    eventMultiplier,
    goldenMultiplier,
    activeEventKeys: active.map((e) => e.key),
    goldenHour,
    capped: combined > rules.maxTotalMultiplier,
  };
}
