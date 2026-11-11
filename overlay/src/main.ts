// Overlay game (PixiJS v8): một trang, vẽ ở khung 1080×1920, co giãn vừa cửa sổ.
// Dùng làm Browser Source trong OBS: http://127.0.0.1:3000/overlay/ (1080×1920).
// Phím D: bật/tắt khung debug vùng an toàn.
// Giai đoạn R2: bản đồ quần thể chùa thật (scene/map.ts). Chưa dựng bản đồ (thiếu manifest.map) thì vẽ tạm bằng
// hình khối theo hạng mục (scene/site.ts). Cảnh tháp cũ (scene/tower.ts,
// scene/background.ts) chỉ còn dùng ở trang /tools/assets, chờ dọn sau R4.

import { Application, Container } from 'pixi.js';
import type { OverlayState, SafeArea, ServerMessage } from '../../shared/protocol.js';
import { destroyArt, EMPTY_ART, loadArt, type Art } from './art.js';
import { rectsOverlap, STAGE_H, STAGE_W, uiRects, type Rect } from './layout.js';
import { connectServer } from './net.js';
import type { ViewBand } from './mapLayout.js';
import { MapView } from './scene/map.js';
import { SiteView } from './scene/site.js';
import { loadFonts } from './theme.js';
import { Badge, ConnectionDot, Disclaimer, MultiplierChip } from './ui/chrome.js';
import { Banner } from './ui/banner.js';
import { BoardPanel } from './ui/board.js';
import { SafeAreaDebug } from './ui/debug.js';

interface Ui {
  key: string;
  root: Container;
  banner: Banner;
  board: BoardPanel;
  badge: Badge;
  chip: MultiplierChip;
  disclaimer: Disclaimer;
}

/** Vùng màn hình còn thấy bản đồ: dưới khối giao diện phía trên, trên dải miễn trừ. */
function mapViewBand(safe: SafeArea): ViewBand {
  const r = uiRects(safe);
  return { top: r.chip.y + r.chip.h, bottom: r.disclaimer.y };
}

async function boot(): Promise<void> {
  await loadFonts();
  const app = new Application();
  await app.init({ width: STAGE_W, height: STAGE_H, background: 0x000000, antialias: true, resolution: 1 });
  const host = document.getElementById('stage')!;
  host.appendChild(app.canvas);
  const fit = () => {
    const s = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
    app.canvas.style.width = `${STAGE_W * s}px`;
    app.canvas.style.height = `${STAGE_H * s}px`;
  };
  fit();
  window.addEventListener('resize', fit);

  // Lớp từ sau ra trước: công trường (hình khối tạm) → giao diện → debug.
  const site = new SiteView(uiRects({ top: 180, bottom: 600, right: 150 }).site);
  const mapView = new MapView(mapViewBand({ top: 180, bottom: 600, right: 150 }));
  const uiLayer = new Container();
  const safeDebug = new SafeAreaDebug();
  const dot = new ConnectionDot(STAGE_W - 170, 200);
  app.stage.addChild(site.container, mapView.container, uiLayer, safeDebug.container, dot.container);
  const showMap = () => {
    mapView.container.visible = mapView.ready;
    site.container.visible = !mapView.ready;
  };
  showMap();

  let state: OverlayState | null = null;
  let ui: Ui | null = null;
  let art: Art = EMPTY_ART;
  let loadingVersion: string | null = null;

  const ensureUi = (s: OverlayState): Ui => {
    const key = JSON.stringify(s.layout.safeArea);
    if (ui && ui.key === key) return ui;
    ui?.root.destroy({ children: true });
    const r = uiRects(s.layout.safeArea);
    const next: Ui = {
      key,
      root: new Container(),
      banner: new Banner(r.banner, r.progress, r.progressInfo),
      board: new BoardPanel(r.board),
      badge: new Badge(r.badge),
      chip: new MultiplierChip(r.chip),
      disclaimer: new Disclaimer(r.disclaimer),
    };
    next.banner.setArt(art);
    next.board.setArt(art);
    next.root.addChild(next.disclaimer.container, next.board.container, next.banner.container, next.chip.container, next.badge.container);
    uiLayer.addChild(next.root);
    ui = next;
    return next;
  };

  const applyArt = (a: Art) => {
    const old = art;
    art = a;
    ui?.banner.setArt(a);
    ui?.board.setArt(a);
    mapView.setArt(a);
    showMap();
    if (old !== EMPTY_ART) destroyArt(old);
  };

  const apply = (s: OverlayState) => {
    state = s;
    // Manifest đổi (vừa lưu ở /tools/assets) thì tải lại ảnh.
    if (s.assetsVersion !== art.version && s.assetsVersion !== loadingVersion) {
      loadingVersion = s.assetsVersion;
      void loadArt(s.assetsVersion).then((a) => {
        if (loadingVersion !== a.version) return destroyArt(a);
        applyArt(a);
        if (state) apply(state);
      });
    }
    site.setArea(uiRects(s.layout.safeArea).site);
    site.update(s.progress);
    mapView.setView(mapViewBand(s.layout.safeArea));
    mapView.update(s.progress);
    const u = ensureUi(s);
    u.banner.update(s);
    u.board.update(s);
    u.badge.update(s.badge);
    u.chip.update(s.multiplier);
    u.disclaimer.update(s.labels.disclaimer);
    safeDebug.update(s.layout.safeArea);
  };

  const onMessage = (m: ServerMessage) => {
    if (m.type === 'state') apply(m.state);
    else if (m.type === 'progress') {
      for (const t of m.transitions) {
        const strength = t.type === 'item_complete' ? 0.9 : t.type === 'stage_complete' ? 0.45 : 0;
        if (strength > 0 && 'itemId' in t) {
          site.flash(t.itemId, strength);
          mapView.flash(t.itemId, strength);
        }
      }
    }
  };
  connectServer(onMessage, (ok) => dot.set(ok));

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'd' && e.key !== 'D') return;
    safeDebug.visible = !safeDebug.visible;
  });
  // Mở overlay với ?debug=1 thì bật sẵn khung debug.
  if (new URLSearchParams(location.search).has('debug')) safeDebug.visible = true;

  app.ticker.add((t) => {
    if (!state) return;
    const dt = Math.min(0.1, t.deltaMS / 1000);
    if (mapView.ready) mapView.tick(dt);
    else site.tick(dt);
    // Tạm cho R2 (R4 làm bố cục mới): banner hoặc bảng che hạng mục đang xây thì mờ đi để vẫn thấy công trình.
    const focus = mapView.ready ? mapView.focusOnScreen() : null;
    if (ui && state) {
      const r = uiRects(state.layout.safeArea);
      const top: Rect = { x: r.banner.x, y: r.banner.y, w: r.banner.w, h: r.chip.y + r.chip.h - r.banner.y };
      const fade = (c: { alpha: number }, covers: boolean) => {
        const target = covers ? 0.3 : 1;
        c.alpha += (target - c.alpha) * Math.min(1, dt * 4);
      };
      fade(ui.banner.container, !!focus && rectsOverlap(focus, top));
      fade(ui.board.container, !!focus && rectsOverlap(focus, r.board));
    }
    ui?.banner.tick(dt);
    ui?.board.tick(dt);
  });
}

void boot();
