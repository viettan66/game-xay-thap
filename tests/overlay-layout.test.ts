// Bố cục giao diện và hàm định dạng dùng chung của overlay.

import { describe, expect, it } from 'vitest';
import { hudRects } from '../overlay/src/hudLayout.js';
import { formatPoints, nextBoardIndex, rectInside, rectsOverlap, STAGE_H, STAGE_W, truncateToWidth } from '../overlay/src/layout.js';
import type { Board } from '../shared/protocol.js';

describe('giao diện không đặt vào vùng an toàn (mục 8)', () => {
  for (const safe of [
    { top: 180, bottom: 600, right: 150 },
    { top: 240, bottom: 700, right: 200 },
  ]) {
    it(`vùng an toàn trên ${safe.top}, dưới ${safe.bottom}, phải ${safe.right}`, () => {
      const r = hudRects(safe);
      const content = { x: 0, y: safe.top, w: STAGE_W - safe.right, h: STAGE_H - safe.top - safe.bottom };
      const fixed = { badge: r.badge, progress: r.progress, events: r.events, minimap: r.minimap, disclaimer: r.disclaimer };
      for (const [name, rect] of Object.entries({ ...fixed, ...r.boards, site: r.site })) {
        expect(rectInside(rect, content), name).toBe(true);
        expect(rect.w, name).toBeGreaterThan(0);
        expect(rect.h, name).toBeGreaterThan(0);
      }
      const list = Object.entries({ progress: r.progress, events: r.events, minimap: r.minimap, disclaimer: r.disclaimer });
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          expect(rectsOverlap(list[i]![1], list[j]![1]), `${list[i]![0]} chồng ${list[j]![0]}`).toBe(false);
        }
      }
      // Dải miễn trừ nằm ngay trên vùng an toàn phía dưới.
      expect(r.disclaimer.y + r.disclaimer.h).toBe(STAGE_H - safe.bottom);
    });
  }
});

describe('chữ và số trên overlay', () => {
  const measure = (s: string) => [...new Intl.Segmenter('vi', { granularity: 'grapheme' }).segment(s)].length * 10;

  it('cắt tên dài cho vừa, thêm "…"', () => {
    const t = truncateToWidth('Nguyễn Hoàng Bảo Khánh Linh', 100, measure);
    expect(t.endsWith('…')).toBe(true);
    expect(measure(t)).toBeLessThanOrEqual(100);
    expect(truncateToWidth('Lan', 100, measure)).toBe('Lan');
  });

  it('không cắt vỡ emoji hay chữ có dấu tổ hợp', () => {
    const emoji = truncateToWidth('Bé Na 👨‍👩‍👧🌸🌸🌸🌸', 70, measure);
    expect(emoji).toBe('Bé Na…');
    const nfd = 'Tiếng Việt rất dài'.normalize('NFD');
    const cut = truncateToWidth(nfd, 60, measure);
    expect(cut.normalize('NFC')).toBe('Tiếng…');
  });

  it('định dạng số kiểu Việt Nam', () => {
    expect(formatPoints(1234567)).toBe('1.234.567');
  });
});

describe('luân phiên bảng xếp hạng', () => {
  const b = (key: Board['key'], n: number): Board => ({
    key,
    title: key,
    rows: Array.from({ length: n }, (_, i) => ({ rank: i + 1, platformId: `p${i}`, nickname: 'x', avatarUrl: null, points: 1 })),
  });

  it('lần lượt top phiên → top tổng → bia hạng mục, rồi quay lại', () => {
    const boards = [b('session', 2), b('total', 3), b('item', 1)];
    expect(nextBoardIndex(boards, 0)).toBe(1);
    expect(nextBoardIndex(boards, 1)).toBe(2);
    expect(nextBoardIndex(boards, 2)).toBe(0);
  });

  it('bỏ qua bảng chưa có ai; tất cả trống thì hiện bảng tổng', () => {
    expect(nextBoardIndex([b('session', 0), b('total', 3), b('item', 2)], 2)).toBe(1);
    expect(nextBoardIndex([b('session', 0), b('total', 0), b('item', 0)], 2)).toBe(1);
  });
});
