// Camera trên bản đồ (mục 8, R4) và bố cục giao diện mới. Dùng kích thước bản đồ thật (1728 × 5575).

import { describe, expect, it } from 'vitest';
import {
  CameraDirector,
  ceremonyCamera,
  clampCamera,
  maxScale,
  minScale,
  overviewCamera,
  shakeOffset,
  siteCamera,
  STAGE_H,
  STAGE_W,
  tourCamera,
  type CameraInput,
  type MapCamera,
} from '../overlay/src/camera.js';
import { BOARD_SLOTS, chooseAbbotSide, chooseBoardSlot, formatCountdown, hudRects } from '../overlay/src/hudLayout.js';
import { rectInside, rectsOverlap } from '../overlay/src/layout.js';
import type { CameraConfig } from '../shared/protocol.js';

const map = { width: 1728, height: 5575 };
const safe = { top: 180, bottom: 600, right: 150 };
const view = hudRects(safe).view;
const cfg: CameraConfig = {
  maxZoom: 1.6,
  siteWidth: 0.52,
  overviewEverySec: 360,
  overviewSec: 9,
  tourEverySec: 0,
  tourSec: 20,
  ceremonySec: 5,
  ceremonyZoom: 1.15,
  shakeMinCoins: 1000,
};
const R = {
  chinhDien: { x: 470, y: 763, w: 761, h: 530 },
  gacChuong: { x: 174, y: 1349, w: 297, h: 433 },
  tamQuan: { x: 451, y: 1700, w: 820, h: 533 },
  sanNen: { x: 0, y: 550, w: 1728, h: 1957 },
  thapTang1: { x: 448, y: 692, w: 247, h: 54 },
  complex: { x: 0, y: 220, w: 1728, h: 2287 },
};

/** Khung hình không lộ ra ngoài bản đồ, tỉ lệ trong giới hạn. */
function expectInside(c: MapCamera, maxZoom = cfg.maxZoom) {
  expect(c.x).toBeLessThanOrEqual(1e-6);
  expect(c.y).toBeLessThanOrEqual(1e-6);
  expect(c.x + map.width * c.scale).toBeGreaterThanOrEqual(STAGE_W - 1e-6);
  expect(c.y + map.height * c.scale).toBeGreaterThanOrEqual(STAGE_H - 1e-6);
  expect(c.scale).toBeGreaterThanOrEqual(minScale(map) - 1e-9);
  expect(c.scale).toBeLessThanOrEqual(maxScale(map, maxZoom) + 1e-9);
}

/** Tâm khung công trình trên màn hình. */
const centerOnScreen = (c: MapCamera, r: { x: number; y: number; w: number; h: number }) => ({
  x: c.x + (r.x + r.w / 2) * c.scale,
  y: c.y + (r.y + r.h / 2) * c.scale,
});

describe('giới hạn camera', () => {
  it('nhỏ nhất: bản đồ vừa bề ngang 1080; lớn nhất: ×maxZoom', () => {
    expect(minScale(map)).toBeCloseTo(1080 / 1728);
    expect(maxScale(map, 1.6)).toBeCloseTo(1);
  });

  it('không bao giờ lộ ra ngoài mép bản đồ', () => {
    expectInside(clampCamera(map, { scale: 0.1, x: 500, y: 500 }, 1.6));
    expectInside(clampCamera(map, { scale: 9, x: -99999, y: -99999 }, 1.6));
  });
});

describe('chế độ site', () => {
  it('công trình lớn chiếm siteWidth bề ngang, nằm giữa vùng nhìn thấy', () => {
    const c = siteCamera(map, R.chinhDien, view, cfg);
    expectInside(c);
    expect((R.chinhDien.w * c.scale) / STAGE_W).toBeCloseTo(0.52, 2);
    const p = centerOnScreen(c, R.chinhDien);
    expect(p.x).toBeCloseTo((view.left + view.right) / 2, 0);
    expect(p.y).toBeCloseTo((view.top + view.bottom) / 2, 0);
  });

  it('công trình nhỏ: phóng tới maxZoom là dừng', () => {
    const c = siteCamera(map, R.gacChuong, view, cfg);
    expect(c.scale).toBeCloseTo(maxScale(map, 1.6));
    expectInside(c);
  });

  it('nền rộng cả bản đồ: tỉ lệ nhỏ nhất, không lộ mép', () => {
    const c = siteCamera(map, R.sanNen, view, cfg);
    expect(c.scale).toBeCloseTo(minScale(map));
    expectInside(c);
  });

  it('cổng tam quan và tầng tháp trên đỉnh đều được đặt giữa vùng nhìn thấy (nhờ mặt đất nối dài)', () => {
    for (const r of [R.tamQuan, R.thapTang1]) {
      const c = siteCamera(map, r, view, cfg);
      const p = centerOnScreen(c, r);
      expect(p.y).toBeGreaterThan(view.top);
      expect(p.y).toBeLessThan(view.bottom);
      expectInside(c);
    }
  });

  it('chưa có hạng mục: giữa bản đồ, tỉ lệ nhỏ nhất', () => {
    expect(siteCamera(map, null, view, cfg).scale).toBeCloseTo(minScale(map));
  });
});

describe('overview, tour, ceremony', () => {
  it('overview: tỉ lệ nhỏ nhất, lia từ đỉnh quần thể xuống chân', () => {
    const a = overviewCamera(map, R.complex, view, 0, 1.6);
    const b = overviewCamera(map, R.complex, view, 1, 1.6);
    expect(a.scale).toBeCloseTo(minScale(map));
    // Đỉnh quần thể ở mép trên vùng nhìn thấy (hoặc cao hơn chút nếu bản đồ hết trời phía trên).
    expect(a.y + R.complex.y * a.scale).toBeLessThanOrEqual(view.top + 0.5);
    expect(b.y).toBeLessThan(a.y);
    expect(b.y + (R.complex.y + R.complex.h) * b.scale).toBeCloseTo(view.bottom, 0); // chân ở mép dưới
    expectInside(a);
    expectInside(b);
  });

  it('tour: bắt đầu ở đỉnh bản đồ (trời), kết thúc ở cổng tam quan', () => {
    const a = tourCamera(map, R.tamQuan, view, 0, 1.6);
    const b = tourCamera(map, R.tamQuan, view, 1, 1.6);
    expect(a.y).toBeCloseTo(0);
    const p = centerOnScreen(b, R.tamQuan);
    expect(p.y).toBeCloseTo((view.top + view.bottom) / 2, 0);
    expect(b.scale).toBeGreaterThan(a.scale);
    for (let t = 0; t <= 1; t += 0.1) expectInside(tourCamera(map, R.tamQuan, view, t, 1.6));
  });

  it('ceremony: đẩy vào dần, không quá maxZoom', () => {
    const a = ceremonyCamera(map, R.chinhDien, view, cfg, 0);
    const b = ceremonyCamera(map, R.chinhDien, view, cfg, 1);
    expect(b.scale / a.scale).toBeCloseTo(1.15, 2);
    expect(ceremonyCamera(map, R.gacChuong, view, cfg, 1).scale).toBeCloseTo(maxScale(map, 1.6));
  });

  it('rung nhẹ rồi tắt hẳn', () => {
    expect(Math.hypot(shakeOffset(0.05).x, shakeOffset(0.05).y)).toBeGreaterThan(0);
    expect(Math.hypot(shakeOffset(0.05).x, shakeOffset(0.05).y)).toBeLessThanOrEqual(7);
    expect(shakeOffset(0.6)).toEqual({ x: 0, y: 0 });
  });
});

describe('bộ điều khiển camera', () => {
  const input = (over: Partial<CameraConfig> = {}): CameraInput => ({
    map,
    view,
    cfg: { ...cfg, ...over },
    focus: R.gacChuong,
    complex: R.complex,
    tourTarget: R.tamQuan,
  });
  const run = (d: CameraDirector, sec: number, inp = input()) => {
    let c = d.update(0, inp);
    for (let t = 0; t < sec; t += 1 / 30) c = d.update(1 / 30, inp);
    return c;
  };

  it('lần đầu đặt thẳng vào chỗ; đổi hạng mục thì lia mượt tới', () => {
    const d = new CameraDirector();
    const first = d.update(0.016, input());
    expect(first).toEqual(siteCamera(map, R.gacChuong, view, cfg));
    const inp = { ...input(), focus: R.chinhDien };
    const step = d.update(1 / 30, inp);
    const goal = siteCamera(map, R.chinhDien, view, cfg);
    expect(Math.abs(step.y - goal.y)).toBeGreaterThan(10); // chưa tới ngay
    const later = run(d, 6, inp);
    expect(later.scale).toBeCloseTo(goal.scale, 2);
    expect(later.y).toBeCloseTo(goal.y, 0);
  });

  it('overview tự động theo giờ hẹn, hết thời gian thì về site', () => {
    const d = new CameraDirector();
    run(d, 10, input({ overviewEverySec: 12 }));
    expect(d.mode).toBe('site');
    run(d, 3, input({ overviewEverySec: 12 }));
    expect(d.mode).toBe('overview');
    run(d, 9.5, input({ overviewEverySec: 12 }));
    expect(d.mode).toBe('site');
  });

  it('0 giây = không tự động (phòng đông)', () => {
    const d = new CameraDirector();
    run(d, 30, input({ overviewEverySec: 0, tourEverySec: 0 }));
    expect(d.mode).toBe('site');
  });

  it('admin bấm toàn cảnh / lia giới thiệu; đang lễ thì không chen vào', () => {
    const d = new CameraDirector();
    d.request('overview');
    expect(d.mode).toBe('overview');
    d.request('ceremony', R.gacChuong);
    d.request('tour');
    expect(d.mode).toBe('ceremony');
    run(d, 5.5);
    expect(d.mode).toBe('site');
    d.request('tour');
    expect(d.mode).toBe('tour');
  });

  it('mọi khung hình trong lúc chuyển chế độ và rung đều không lộ mép bản đồ', () => {
    const d = new CameraDirector();
    const inp = input();
    d.update(0, inp);
    d.request('tour');
    d.shake();
    for (let t = 0; t < 25; t += 1 / 30) expectInside(d.update(1 / 30, inp));
  });
});

describe('bố cục giao diện mới', () => {
  const r = hudRects(safe);
  const fixed = { badge: r.badge, progress: r.progress, events: r.events, disclaimer: r.disclaimer, minimap: r.minimap };

  it('mọi khung nằm trong vùng an toàn', () => {
    for (const [k, rect] of Object.entries({ ...fixed, ...r.boards })) {
      expect(rectInside(rect, r.content), k).toBe(true);
    }
  });

  it('thanh tiến độ ở góc trên phải, dải miễn trừ sát trên vùng an toàn dưới', () => {
    expect(r.progress.x + r.progress.w).toBeGreaterThan(r.content.x + r.content.w - 20);
    expect(r.progress.y).toBeLessThan(r.content.y + 20);
    expect(r.disclaimer.y + r.disclaimer.h).toBe(STAGE_H - safe.bottom);
  });

  it('bảng xếp hạng ở chỗ nào cũng không đè thanh tiến độ, ô sự kiện, dải miễn trừ, bản đồ thu nhỏ', () => {
    for (const s of BOARD_SLOTS) {
      for (const [k, rect] of Object.entries(fixed)) {
        if (k === 'badge' && s !== 'leftTop') continue;
        expect(rectsOverlap(r.boards[s], rect), `${s} đè ${k}`).toBe(false);
      }
    }
  });

  it('tự chọn chỗ không che hạng mục đang xây', () => {
    const left = { x: 100, y: 600, w: 250, h: 300 }; // công trình lệch trái giữa
    expect(chooseBoardSlot(r.boards, left, 'auto', null)).toBe('rightMiddle');
    const small = { x: 400, y: 650, w: 150, h: 150 };
    expect(chooseBoardSlot(r.boards, small, 'auto', null)).toBe('leftMiddle');
    // Giữ chỗ hiện tại khi vẫn không che (bảng không nhảy qua lại).
    expect(chooseBoardSlot(r.boards, small, 'auto', 'rightMiddle')).toBe('rightMiddle');
    expect(chooseBoardSlot(r.boards, left, 'auto', 'leftMiddle')).toBe('rightMiddle');
    expect(chooseBoardSlot(r.boards, { x: 700, y: 900, w: 50, h: 50 }, 'auto', 'leftTop')).toBe('leftTop');
    // Che hết thì chọn chỗ che ít nhất.
    const huge = { x: 0, y: 300, w: 930, h: 900 };
    expect(BOARD_SLOTS).toContain(chooseBoardSlot(r.boards, huge, 'auto', null));
    expect(chooseBoardSlot(r.boards, huge, 'auto', null)).toBe('leftTop');
    // Cài cố định thì không tự đổi.
    expect(chooseBoardSlot(r.boards, left, 'leftMiddle', null)).toBe('leftMiddle');
  });

  it('trụ trì đứng góc trái phía trên vùng comment, không đè bảng, dải miễn trừ; né sang phải khi che công trình', () => {
    for (const side of ['left', 'right'] as const) {
      const a = r.abbot[side];
      expect(rectInside(a, r.content), side).toBe(true);
      expect(rectsOverlap(a, r.disclaimer), side).toBe(false);
      for (const s of BOARD_SLOTS) expect(rectsOverlap(a, r.boards[s]), `${side} – ${s}`).toBe(false);
    }
    expect(r.abbot.left.x).toBeLessThan(100);
    expect(r.abbot.left.y + r.abbot.left.h).toBeGreaterThan(r.disclaimer.y - 20);
    expect(chooseAbbotSide(r.abbot, null, false)).toBe('left');
    expect(chooseAbbotSide(r.abbot, { x: 0, y: 1000, w: 300, h: 200 }, false)).toBe('right');
    expect(chooseAbbotSide(r.abbot, { x: 0, y: 1000, w: 300, h: 200 }, true)).toBe('left'); // toàn cảnh: bản đồ thu nhỏ ở bên phải
    expect(chooseAbbotSide(r.abbot, { x: 0, y: 900, w: 930, h: 400 }, false)).toBe('left'); // che cả hai bên thì đứng yên bên trái
  });

  it('đồng hồ đếm ngược', () => {
    expect(formatCountdown(65_000)).toBe('1:05');
    expect(formatCountdown(3_725_000)).toBe('1:02:05');
    expect(formatCountdown(-5)).toBe('0:00');
  });
});
