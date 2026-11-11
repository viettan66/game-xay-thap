// Tên người xem hiển thị trên overlay (mục 8 "Lọc tên", 14.7) và đồng hồ giờ vàng của ô sự kiện.

import { describe, expect, it } from 'vitest';
import { goldenHourEndsAt } from '../shared/events.js';
import { cleanName, displayName, foldForMatch, hasBannedWord } from '../shared/names.js';
import { vnTs } from '../shared/time.js';

const ANON = 'Thiện hữu ẩn danh';

describe('lọc tên', () => {
  it('chữ kiểu (𝓜𝓲𝓷𝓱) được chuẩn hóa NFKC', () => {
    expect(cleanName('𝓜𝓲𝓷𝓱')).toBe('Minh');
    expect(cleanName('Ｌａｎ')).toBe('Lan');
  });

  it('bỏ ký tự điều khiển, ký tự vô hình, gộp khoảng trắng; giữ emoji ghép', () => {
    expect(cleanName('  Bé\u0000 Na​  \n Xinh ')).toBe('Bé Na Xinh');
    expect(cleanName('Bé Na 👨‍👩‍👧')).toBe('Bé Na 👨‍👩‍👧');
  });

  it('tên rỗng hoặc chỉ toàn ký tự lạ thì hiện tên ẩn danh', () => {
    expect(displayName('', [], ANON)).toBe(ANON);
    expect(displayName('​\u0000 ', [], ANON)).toBe(ANON);
    expect(displayName('...---', [], ANON)).toBe(ANON);
    expect(displayName(null, [], ANON)).toBe(ANON);
  });

  it('tên chứa từ cấm (kể cả viết hoa, không dấu, chèn dấu chấm) thì hiện tên ẩn danh', () => {
    const banned = ['đồ ngốc', 'spam'];
    expect(displayName('Đồ Ngốc 123', banned, ANON)).toBe(ANON);
    expect(displayName('do.ngoc', banned, ANON)).toBe(ANON);
    expect(displayName('S P A M', banned, ANON)).toBe(ANON);
    expect(displayName('Ngọc Lan', banned, ANON)).toBe('Ngọc Lan');
    expect(hasBannedWord('Hoa Mai', ['   '])).toBe(false);
  });

  it('so không dấu: đ → d, bỏ dấu', () => {
    expect(foldForMatch('Đặng Thị Ánh')).toBe('dangthianh');
  });
});

describe('đồng hồ giờ vàng', () => {
  const rules = { multiplier: 2, schedule: [{ weekdays: [0, 1, 2, 3, 4, 5, 6], from: '20:00', to: '21:00' }] };

  it('đang trong khung lịch: kết thúc lúc hết khung', () => {
    expect(goldenHourEndsAt(rules, vnTs(2026, 3, 10, 20, 15, 30), null)).toBe(vnTs(2026, 3, 10, 21, 0));
  });

  it('ngoài khung, không bật tay: không có', () => {
    expect(goldenHourEndsAt(rules, vnTs(2026, 3, 10, 19, 59), null)).toBeNull();
  });

  it('bật tay: kết thúc lúc hết giờ bật tay; chồng lịch thì lấy lúc muộn hơn', () => {
    const t = vnTs(2026, 3, 10, 18, 0);
    expect(goldenHourEndsAt(rules, t, t + 30 * 60_000)).toBe(t + 30 * 60_000);
    // Bật tay tới 20:00 đúng lúc lịch bắt đầu: nối tiếp tới 21:00.
    expect(goldenHourEndsAt(rules, vnTs(2026, 3, 10, 19, 30), vnTs(2026, 3, 10, 20, 0))).toBe(vnTs(2026, 3, 10, 21, 0));
    // Đang trong lịch, bật tay tới 22:00: lấy 22:00.
    expect(goldenHourEndsAt(rules, vnTs(2026, 3, 10, 20, 30), vnTs(2026, 3, 10, 22, 0))).toBe(vnTs(2026, 3, 10, 22, 0));
  });

  it('khung qua nửa đêm', () => {
    const night = { multiplier: 2, schedule: [{ weekdays: [0, 1, 2, 3, 4, 5, 6], from: '23:00', to: '01:00' }] };
    expect(goldenHourEndsAt(night, vnTs(2026, 3, 10, 23, 30), null)).toBe(vnTs(2026, 3, 11, 1, 0));
  });
});
