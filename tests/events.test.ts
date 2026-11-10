import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { activeEvents, computeMultiplier, isGoldenHourActive, type GameEventDef, type MultiplierRules } from '../shared/events.js';
import { vnTs } from '../shared/time.js';
import { REPO_ROOT } from './helpers.js';

const DEFAULT_EVENTS = (
  JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'config', 'defaults', 'events.json'), 'utf8')) as {
    events: GameEventDef[];
  }
).events;
const rules: MultiplierRules = { maxTotalMultiplier: 4, eventCombine: 'max', goldenHourCombine: 'multiply' };
const noGolden = { multiplier: 2, schedule: [] };
const keys = (ts: number) => activeEvents(DEFAULT_EVENTS, ts).map((e) => e.key);

describe('lịch sự kiện mặc định (14.11)', () => {
  it('ngày thường không có sự kiện', () => {
    expect(keys(vnTs(2026, 3, 10, 12))).toEqual([]); // thứ Ba, 22/1 âm
  });

  it('Mùng 1 và Rằm hàng tháng (tính cả tháng nhuận)', () => {
    expect(keys(vnTs(2026, 3, 19, 9))).toEqual(['mung_1']); // 1/2 âm
    expect(keys(vnTs(2026, 4, 2, 9))).toEqual(['ram']); // 15/2 âm, thứ Năm
    expect(keys(vnTs(2025, 8, 8, 9))).toEqual(['ram']); // 15/6 nhuận 2025
  });

  it('Vu Lan chỉ rơi vào tháng 7 thường; trùng Rằm thì cả hai cùng diễn ra, ưu tiên Vu Lan', () => {
    expect(keys(vnTs(2025, 9, 6, 10))).toEqual(['vu_lan', 'ram']); // thứ Bảy, 10 giờ sáng
  });

  it('Tết từ ngày cuối tháng Chạp đến mùng 3; năm 2026 tháng Chạp chỉ có 29 ngày', () => {
    expect(keys(vnTs(2026, 2, 15, 12))).toEqual([]); // 28 tháng Chạp
    expect(keys(vnTs(2026, 2, 16, 0, 0))).toEqual(['tet']); // 29 tháng Chạp = ngày cuối
    expect(keys(vnTs(2026, 2, 17, 12))).toEqual(['tet', 'mung_1']);
    expect(keys(vnTs(2026, 2, 19, 23, 59))).toEqual(['tet']); // mùng 3
    expect(keys(vnTs(2026, 2, 20, 0, 0))).toEqual([]); // mùng 4
  });

  it('Tết năm có ngày 30 tháng Chạp (Giáp Thìn 2024): ngày 29 chưa phải Tết', () => {
    expect(keys(vnTs(2024, 2, 8, 12))).toEqual([]); // 29 tháng Chạp
    expect(keys(vnTs(2024, 2, 9, 12))).toEqual(['tet']); // 30 tháng Chạp
  });

  it('2025–2031 tháng Chạp đều chỉ có 29 ngày: Tết vẫn bắt đầu từ ngày cuối tháng', () => {
    expect(keys(vnTs(2025, 1, 28, 12))).toEqual(['tet']); // 29 tháng Chạp Giáp Thìn
    expect(keys(vnTs(2031, 1, 22, 12))).toEqual(['tet']); // 29 tháng Chạp Canh Tuất
  });

  it('cuối tuần chỉ trong khung 20:00–22:00 thứ Bảy, Chủ nhật', () => {
    expect(keys(vnTs(2026, 3, 14, 19, 59))).toEqual([]); // thứ Bảy
    expect(keys(vnTs(2026, 3, 14, 20, 0))).toEqual(['cuoi_tuan']);
    expect(keys(vnTs(2026, 3, 15, 21, 59))).toEqual(['cuoi_tuan']); // Chủ nhật
    expect(keys(vnTs(2026, 3, 15, 22, 0))).toEqual([]);
    expect(keys(vnTs(2026, 3, 16, 20, 30))).toEqual([]); // thứ Hai
  });

  it('dùng giờ Việt Nam, không phụ thuộc múi giờ máy: 17:00 UTC đã là ngày hôm sau', () => {
    expect(keys(Date.UTC(2026, 3, 1, 16, 59))).toEqual([]); // 23:59 ngày 1/4 giờ VN (14/2 âm)
    expect(keys(Date.UTC(2026, 3, 1, 17, 0))).toEqual(['ram']); // 00:00 ngày 2/4 giờ VN
  });

  it('sự kiện tắt thì không tính', () => {
    const off = DEFAULT_EVENTS.map((e) => ({ ...e, enabled: false }));
    expect(activeEvents(off, vnTs(2026, 2, 17, 12))).toEqual([]);
  });
});

describe('hệ số nhân và trần (mục 4, 14.11)', () => {
  it('nhiều sự kiện trùng ngày: lấy hệ số cao nhất, không cộng dồn', () => {
    const m = computeMultiplier(vnTs(2026, 2, 17, 12), DEFAULT_EVENTS, noGolden, null, rules);
    expect(m.activeEventKeys).toEqual(['tet', 'mung_1']);
    expect(m.eventMultiplier).toBe(2);
    expect(m.total).toBe(2);
  });

  it('chế độ nhân dồn (đổi được trong config)', () => {
    const m = computeMultiplier(vnTs(2026, 2, 17, 12), DEFAULT_EVENTS, noGolden, null, {
      ...rules,
      eventCombine: 'multiply',
    });
    expect(m.eventMultiplier).toBe(3);
  });

  it('giờ vàng nhân với hệ số sự kiện', () => {
    const golden = { multiplier: 2, schedule: [{ weekdays: [2], from: '20:00', to: '21:00' }] };
    // 10/3/2026 là thứ Ba
    expect(computeMultiplier(vnTs(2026, 3, 10, 20, 30), DEFAULT_EVENTS, golden, null, rules).total).toBe(2);
    expect(computeMultiplier(vnTs(2026, 3, 10, 21, 0), DEFAULT_EVENTS, golden, null, rules).total).toBe(1);
    // Rằm (×2) trùng giờ vàng (×2) = ×4
    const ram = { multiplier: 2, schedule: [{ weekdays: [4], from: '20:00', to: '21:00' }] };
    expect(computeMultiplier(vnTs(2026, 4, 2, 20, 15), DEFAULT_EVENTS, ram, null, rules).total).toBe(4);
  });

  it('có trần tổng maxTotalMultiplier', () => {
    // Rằm tháng Giêng 2026 (×3) + giờ vàng ×2 = ×6, bị giới hạn ở ×4
    const golden = { multiplier: 2, schedule: [{ weekdays: [0, 1, 2, 3, 4, 5, 6], from: '00:00', to: '00:00' }] };
    const m = computeMultiplier(vnTs(2026, 3, 3, 12), DEFAULT_EVENTS, golden, null, rules);
    expect(m.activeEventKeys[0]).toBe('ram_thang_gieng');
    expect(m.total).toBe(4);
    expect(m.capped).toBe(true);
  });

  it('bật giờ vàng thủ công có hạn', () => {
    const t = vnTs(2026, 3, 10, 9);
    expect(isGoldenHourActive(noGolden, t, t + 60_000)).toBe(true);
    expect(isGoldenHourActive(noGolden, t + 60_000, t + 60_000)).toBe(false);
    expect(computeMultiplier(t, DEFAULT_EVENTS, noGolden, t + 1, rules).total).toBe(2);
  });

  it('khung giờ qua nửa đêm', () => {
    const golden = { multiplier: 2, schedule: [{ weekdays: [2], from: '23:00', to: '01:00' }] };
    expect(isGoldenHourActive(golden, vnTs(2026, 3, 10, 23, 30), null)).toBe(true);
    expect(isGoldenHourActive(golden, vnTs(2026, 3, 10, 0, 30), null)).toBe(true);
    expect(isGoldenHourActive(golden, vnTs(2026, 3, 10, 1, 0), null)).toBe(false);
  });
});
