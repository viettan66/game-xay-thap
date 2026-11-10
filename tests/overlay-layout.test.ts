import { describe, expect, it } from 'vitest';
import {
  bannerTitle,
  CAMERA_FOCUS_Y,
  cameraTarget,
  floorWidth,
  FOUNDATION_HEIGHT,
  formatMultiplier,
  formatPoints,
  lerpCamera,
  nextBoardIndex,
  rectInside,
  rectsOverlap,
  STAGE_H,
  STAGE_W,
  towerGeometry,
  truncateToWidth,
  uiRects,
} from '../overlay/src/layout.js';
import type { Board, OverlayLayout } from '../shared/protocol.js';

const layout: OverlayLayout = {
  safeArea: { top: 180, bottom: 600, right: 150 },
  floor1WidthPx: 520,
  towerTaper: 0.995,
  towerCenterX: 510,
  towerBaseY: 1215,
  boardRotateSec: 15,
};

describe('xếp chồng tầng tạm', () => {
  it('tầng n thu nhỏ towerTaper^(n-1) so với tầng 1', () => {
    expect(floorWidth(1, layout)).toBe(520);
    expect(floorWidth(2, layout)).toBeCloseTo(520 * 0.995);
    expect(floorWidth(100, layout)).toBeCloseTo(520 * Math.pow(0.995, 99));
    expect(floorWidth(0, layout)).toBeGreaterThan(520); // nền móng rộng hơn
  });

  it('tầng sau đặt ngay trên tầng trước', () => {
    const g = towerGeometry(layout, 100);
    expect(g.baseY).toHaveLength(101);
    expect(g.baseY[0]).toBe(1215);
    expect(g.baseY[1]).toBe(1215 - FOUNDATION_HEIGHT);
    for (let f = 1; f < 100; f++) expect(g.baseY[f + 1]).toBeCloseTo(g.baseY[f]! - g.heights[f]!);
  });
});

describe('camera', () => {
  const g = towerGeometry(layout, 100);

  it('tháp còn thấp thì camera đứng yên ở cảnh nền', () => {
    expect(cameraTarget(g, 0, false)).toBe(0);
    expect(cameraTarget(g, 1, false)).toBe(0);
  });

  it('tháp cao thì giữ tầng đang xây ở khoảng 45% chiều cao màn hình', () => {
    for (const f of [5, 27, 100]) {
      const offset = cameraTarget(g, f, false);
      expect(offset).toBeGreaterThan(0);
      const centerOnScreen = g.baseY[f]! - g.heights[f]! / 2 + offset;
      expect(centerOnScreen).toBeCloseTo(CAMERA_FOCUS_Y);
      expect(CAMERA_FOCUS_Y / STAGE_H).toBeCloseTo(0.45);
    }
  });

  it('xong tháp thì camera nhìn lên chóp', () => {
    expect(cameraTarget(g, 100, true)).toBeGreaterThan(cameraTarget(g, 100, false));
  });

  it('camera đi mượt, không vượt quá đích', () => {
    let c = 0;
    const values: number[] = [];
    for (let i = 0; i < 120; i++) {
      c = lerpCamera(c, 1000, 1 / 60);
      values.push(c);
    }
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(values.at(-1)!).toBeGreaterThan(900);
    expect(values.at(-1)!).toBeLessThanOrEqual(1000);
  });
});

describe('giao diện không đặt vào vùng an toàn (mục 8)', () => {
  for (const safe of [
    { top: 180, bottom: 600, right: 150 },
    { top: 240, bottom: 700, right: 200 },
  ]) {
    it(`vùng an toàn trên ${safe.top}, dưới ${safe.bottom}, phải ${safe.right}`, () => {
      const r = uiRects(safe);
      const content = { x: 0, y: safe.top, w: STAGE_W - safe.right, h: STAGE_H - safe.top - safe.bottom };
      const parts = { badge: r.badge, banner: r.banner, chip: r.chip, board: r.board, disclaimer: r.disclaimer };
      for (const [name, rect] of Object.entries(parts)) {
        expect(rectInside(rect, content), name).toBe(true);
        expect(rect.w, name).toBeGreaterThan(0);
        expect(rect.h, name).toBeGreaterThan(0);
      }
      const list = Object.entries(parts);
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          expect(rectsOverlap(list[i]![1], list[j]![1]), `${list[i]![0]} chồng ${list[j]![0]}`).toBe(false);
        }
      }
      // Dải miễn trừ nằm ngay trên vùng an toàn phía dưới.
      expect(r.disclaimer.y + r.disclaimer.h).toBe(STAGE_H - safe.bottom);
    });
  }

  it('bảng xếp hạng đủ chỗ cho 10 dòng với vùng an toàn mặc định', () => {
    expect(uiRects(layout.safeArea).board.h).toBeGreaterThanOrEqual(66 + 10 * 62);
  });
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
    expect(formatMultiplier(1.5)).toBe('×1,5');
    expect(formatMultiplier(2)).toBe('×2');
  });

  it('tiêu đề banner', () => {
    expect(bannerTitle(0, 'Nền móng', 100)).toBe('Nền móng');
    expect(bannerTitle(27, 'Tầng 27', 100)).toBe('Tầng 27/100');
  });
});

describe('luân phiên bảng xếp hạng', () => {
  const b = (key: Board['key'], n: number): Board => ({
    key,
    title: key,
    rows: Array.from({ length: n }, (_, i) => ({ rank: i + 1, platformId: `p${i}`, nickname: 'x', avatarUrl: null, points: 1 })),
  });

  it('lần lượt top phiên → top tổng → bia tầng, rồi quay lại', () => {
    const boards = [b('session', 2), b('total', 3), b('floor', 1)];
    expect(nextBoardIndex(boards, 0)).toBe(1);
    expect(nextBoardIndex(boards, 1)).toBe(2);
    expect(nextBoardIndex(boards, 2)).toBe(0);
  });

  it('bỏ qua bảng chưa có ai; tất cả trống thì hiện bảng tổng', () => {
    expect(nextBoardIndex([b('session', 0), b('total', 3), b('floor', 2)], 2)).toBe(1);
    expect(nextBoardIndex([b('session', 0), b('total', 0), b('floor', 0)], 2)).toBe(1);
  });
});
