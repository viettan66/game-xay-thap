import { describe, expect, it } from 'vitest';
import { isLastDayOfLunarMonth, leapMonthOfYear, lunarToSolar, solarToLunar } from '../shared/lunar.js';

// Các ngày đã biết theo lịch Việt Nam (UTC+7).
const TET: [number, string][] = [
  [2024, '2024-02-10'],
  [2025, '2025-01-29'],
  [2026, '2026-02-17'],
  [2027, '2027-02-06'],
  [2028, '2028-01-26'],
  [2029, '2029-02-13'],
  [2030, '2030-02-02'], // Trung Quốc (UTC+8) là 03/02/2030
];

const iso = (d: { year: number; month: number; day: number } | null) =>
  d ? `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}` : null;

describe('âm lịch Việt Nam (thuật toán Hồ Ngọc Đức, UTC+7)', () => {
  it.each(TET)('Tết %i là %s', (year, date) => {
    expect(iso(lunarToSolar(1, 1, year))).toBe(date);
    const [y, m, d] = date.split('-').map(Number) as [number, number, number];
    expect(solarToLunar(y, m, d)).toEqual({ day: 1, month: 1, year, leap: false });
  });

  it('các năm lịch Việt Nam khác lịch Trung Quốc', () => {
    expect(iso(lunarToSolar(1, 1, 1985))).toBe('1985-01-21'); // Trung Quốc: 20/02/1985
    expect(iso(lunarToSolar(1, 1, 2007))).toBe('2007-02-17'); // Trung Quốc: 18/02/2007
  });

  it('ngày lễ đã biết năm 2025', () => {
    expect(solarToLunar(2025, 2, 12)).toEqual({ day: 15, month: 1, year: 2025, leap: false }); // Rằm tháng Giêng
    expect(solarToLunar(2025, 5, 12)).toEqual({ day: 15, month: 4, year: 2025, leap: false }); // Phật Đản
    expect(solarToLunar(2025, 9, 6)).toEqual({ day: 15, month: 7, year: 2025, leap: false }); // Vu Lan
    expect(solarToLunar(2025, 10, 6)).toEqual({ day: 15, month: 8, year: 2025, leap: false }); // Trung Thu
    expect(solarToLunar(2026, 9, 25)).toEqual({ day: 15, month: 8, year: 2026, leap: false }); // Trung Thu 2026
  });

  it('tháng nhuận: 2025 nhuận tháng 6, 2028 nhuận tháng 5, các năm khác trong 2026–2030 không nhuận', () => {
    expect(leapMonthOfYear(2025)).toBe(6);
    expect(leapMonthOfYear(2028)).toBe(5);
    for (const y of [2026, 2027, 2029, 2030]) expect(leapMonthOfYear(y)).toBe(0);

    expect(solarToLunar(2025, 6, 25)).toEqual({ day: 1, month: 6, year: 2025, leap: false });
    expect(solarToLunar(2025, 7, 25)).toEqual({ day: 1, month: 6, year: 2025, leap: true });
    expect(solarToLunar(2025, 8, 23)).toEqual({ day: 1, month: 7, year: 2025, leap: false });
    expect(iso(lunarToSolar(1, 6, 2025, true))).toBe('2025-07-25');
    expect(iso(lunarToSolar(1, 5, 2028, false))).toBe('2028-05-24');
    expect(iso(lunarToSolar(1, 5, 2028, true))).toBe('2028-06-23');
  });

  it('hỏi tháng nhuận không tồn tại thì trả về null', () => {
    expect(lunarToSolar(1, 3, 2026, true)).toBeNull();
    expect(lunarToSolar(1, 7, 2025, true)).toBeNull();
  });

  it('Tết Bính Ngọ 2026 không có ngày 30: tháng Chạp kết thúc ngày 29 (16/02/2026)', () => {
    expect(solarToLunar(2026, 2, 16)).toEqual({ day: 29, month: 12, year: 2025, leap: false });
    expect(isLastDayOfLunarMonth(2026, 2, 16)).toBe(true);
    expect(isLastDayOfLunarMonth(2026, 2, 15)).toBe(false);
  });

  it('đổi qua đổi lại khớp nhau cho mọi ngày 2025–2030', () => {
    let d = new Date(Date.UTC(2025, 0, 1));
    const end = Date.UTC(2031, 0, 1);
    while (d.getTime() < end) {
      const y = d.getUTCFullYear();
      const m = d.getUTCMonth() + 1;
      const day = d.getUTCDate();
      const l = solarToLunar(y, m, day);
      expect(l.day).toBeGreaterThanOrEqual(1);
      expect(l.day).toBeLessThanOrEqual(30);
      expect(lunarToSolar(l.day, l.month, l.year, l.leap)).toEqual({ year: y, month: m, day });
      d = new Date(d.getTime() + 86_400_000);
    }
  });
});
