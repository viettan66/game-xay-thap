// Overlay game (PixiJS v8): một trang, vẽ ở khung 1080×1920, co giãn vừa cửa sổ.
// Dùng làm Browser Source trong OBS: http://127.0.0.1:3000/overlay/ (1080×1920).
// Phím D: bật/tắt khung debug vùng an toàn; khi bật, kéo thả ảnh chụp màn hình live vào để so (ui/screenshot.ts).
//
// R4 (mục 8 SPEC): camera site / overview / tour / ceremony (camera.ts, trong scene/map.ts) và giao diện mới
// (hudLayout.ts + ui/hud.ts): thanh tiến độ góc trên phải, bảng xếp hạng thu gọn tự dời chỗ không che công trình,
// ô sự kiện, bản đồ thu nhỏ (mặc định chỉ khi thu toàn cảnh), dải miễn trừ nhỏ.
// Chưa dựng bản đồ (thiếu manifest.map) thì vẽ tạm bằng hình khối theo hạng mục (scene/site.ts).

import { Application, Container } from 'pixi.js';
import type { OverlayState, ServerMessage } from '../../shared/protocol.js';
import { destroyArt, EMPTY_ART, loadArt, type Art } from './art.js';
import { chooseAbbotSide, chooseBoardSlot, hudRects, type BoardSlot, type HudRects } from './hudLayout.js';
import { STAGE_H, STAGE_W } from './layout.js';
import { connectServer } from './net.js';
import { MapView } from './scene/map.js';
import { SiteView } from './scene/site.js';
import { loadFonts } from './theme.js';
import { AbbotView } from './ui/abbot.js';
import { Badge, ConnectionDot, Disclaimer } from './ui/chrome.js';
import { FestivalView } from './ui/festival.js';
import { ToastView } from './ui/toast.js';
import { SafeAreaDebug } from './ui/debug.js';
import { CompactBoard, EventBox, ProgressPanel } from './ui/hud.js';
import { Minimap } from './ui/minimap.js';
import { ScreenshotCompare } from './ui/screenshot.js';

interface Hud {
  key: string;
  rects: HudRects;
  root: Container;
  progress: ProgressPanel;
  board: CompactBoard;
  events: EventBox;
  badge: Badge;
  disclaimer: Disclaimer;
  slot: BoardSlot | null;
}

const DEFAULT_SAFE = { top: 180, bottom: 600, right: 150 };

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

  // Lớp từ sau ra trước: bản đồ (hoặc hình khối tạm) → giao diện → bản đồ thu nhỏ → debug.
  const initial = hudRects(DEFAULT_SAFE);
  const site = new SiteView(initial.site);
  const mapView = new MapView(initial.view, app.renderer);
  const uiLayer = new Container();
  const minimap = new Minimap();
  // Trụ trì (mục 9): không gian màn hình, trên giao diện, dưới bản đồ thu nhỏ.
  const abbot = new AbbotView(initial.abbot);
  // Thông báo quà (mục 8) và múa lân khi đủ mục tiêu tim (bảng 9A).
  const toasts = new ToastView(initial.toast, initial.plus);
  const festival = new FestivalView(initial.festival);
  const safeDebug = new SafeAreaDebug();
  const shots = new ScreenshotCompare(app.canvas);
  const dot = new ConnectionDot(STAGE_W - 170, 200);
  app.stage.addChild(
    site.container,
    mapView.container,
    uiLayer,
    festival.container,
    abbot.container,
    toasts.container,
    minimap.container,
    safeDebug.container,
    dot.container,
  );
  const showMap = () => {
    mapView.container.visible = mapView.ready;
    site.container.visible = !mapView.ready;
  };
  showMap();

  let state: OverlayState | null = null;
  let hud: Hud | null = null;
  let art: Art = EMPTY_ART;
  let loadingVersion: string | null = null;

  const ensureHud = (s: OverlayState): Hud => {
    const key = JSON.stringify(s.layout.safeArea);
    if (hud && hud.key === key) return hud;
    hud?.root.destroy({ children: true });
    const r = hudRects(s.layout.safeArea);
    const slot: BoardSlot = s.hud.boardPosition === 'auto' ? 'leftMiddle' : s.hud.boardPosition;
    const next: Hud = {
      key,
      rects: r,
      root: new Container(),
      progress: new ProgressPanel(r.progress),
      board: new CompactBoard(r.boards[slot]),
      events: new EventBox(r.events),
      badge: new Badge(r.badge),
      disclaimer: new Disclaimer(r.disclaimer),
      slot,
    };
    next.board.setArt(art);
    next.root.addChild(next.disclaimer.container, next.board.container, next.events.container, next.progress.container, next.badge.container);
    uiLayer.addChild(next.root);
    abbot.setSpots(r.abbot);
    toasts.setRects(r.toast, r.plus, s.hud.toastSec);
    festival.setRect(r.festival);
    hud = next;
    loadMinimap();
    return next;
  };

  const loadMinimap = () => {
    const map = art.manifest?.map;
    if (!map || !hud) return;
    void minimap.load(map, art.version, mapView.complexRect, hud.rects.minimap);
  };

  const applyArt = (a: Art) => {
    const old = art;
    art = a;
    hud?.board.setArt(a);
    abbot.setArt(a);
    toasts.setArt(a);
    festival.setArt(a);
    mapView.setArt(a);
    showMap();
    loadMinimap();
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
    const h = ensureHud(s);
    site.setArea(h.rects.site);
    site.update(s.progress);
    mapView.setView(h.rects.view);
    mapView.setCameraConfig(s.camera);
    mapView.update(s.progress);
    h.progress.update(s.progress, s.hud.opacity.progress);
    h.board.update(s.boards, s.labels.pointUnit, s.hud.opacity.board, s.hud.boardRotateSec);
    h.events.update(s.eventBox, s.serverNow, s.hud.opacity.events);
    h.badge.update(s.badge);
    toasts.setRects(h.rects.toast, h.rects.plus, s.hud.toastSec);
    h.disclaimer.update(s.labels.disclaimer, s.hud.opacity.disclaimer);
    safeDebug.update(s.layout.safeArea);
  };

  const onMessage = (m: ServerMessage) => {
    if (m.type === 'state') apply(m.state);
    else if (m.type === 'contribution') {
      mapView.contribution(m);
      // Quà lớn: camera rung nhẹ (mục 8).
      if (state && m.coins >= state.camera.shakeMinCoins) mapView.shake();
    } else if (m.type === 'camera') mapView.requestCamera(m.mode);
    else if (m.type === 'say') abbot.say(m);
    else if (m.type === 'toast') toasts.push(m);
    else if (m.type === 'festival') festival.start(m.durationMs);
    else if (m.type === 'progress' && !mapView.ready) {
      // Hình khối tạm (chưa có bản đồ): chớp sáng ngay. Trên bản đồ thì chớp khi mảnh cuối của giai đoạn đã đặt xong.
      for (const t of m.transitions) {
        const strength = t.type === 'item_complete' ? 0.9 : t.type === 'stage_complete' ? 0.45 : 0;
        if (strength > 0 && 'itemId' in t) site.flash(t.itemId, strength);
      }
    }
  };
  connectServer(onMessage, (ok) => dot.set(ok));

  const setDebug = (v: boolean) => {
    safeDebug.visible = v;
    shots.enabled = v;
  };
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'd' && e.key !== 'D') return;
    setDebug(!safeDebug.visible);
  });
  // Mở overlay với ?debug=1 thì bật sẵn khung debug.
  if (new URLSearchParams(location.search).has('debug')) setDebug(true);

  let slow = 0;
  let dim = 1;
  app.ticker.add((t) => {
    if (!state) return;
    const dt = Math.min(0.1, t.deltaMS / 1000);
    if (mapView.ready) mapView.tick(dt, state.pieces, state.texts.pieceBurst);
    else site.tick(dt);
    const overview = mapView.ready && mapView.cameraMode === 'overview';
    // Thu toàn cảnh: các bảng mờ xuống 30%, chỉ còn thanh tiến độ (mục 8).
    dim += ((overview ? 0.3 : 1) - dim) * Math.min(1, dt * 3);
    const mm = state.hud.minimap;
    minimap.want = mapView.ready && (mm === 'always' || (mm === 'overview' && overview)) ? 1 : 0;
    minimap.tick(dt);
    if (hud) {
      hud.board.dim = dim;
      hud.events.dim = dim;
      slow -= dt;
      if (slow <= 0) {
        slow = 0.5;
        // Bảng xếp hạng tự dời sang chỗ không che hạng mục đang xây (chỉ xét khi camera ở chế độ thường).
        if (!mapView.ready || mapView.cameraMode === 'site') {
          const slot = chooseBoardSlot(hud.rects.boards, mapView.ready ? mapView.focusOnScreen() : null, state.hud.boardPosition, hud.slot);
          if (slot !== hud.slot) {
            hud.slot = slot;
            hud.board.place(hud.rects.boards[slot]);
          }
        }
        if (minimap.want > 0 || minimap.container.visible) minimap.update(mapView.displayStatus());
        // Trụ trì né sang phải nếu che hạng mục đang xây.
        abbot.setSide(chooseAbbotSide(hud.rects.abbot, mapView.ready ? mapView.focusOnScreen() : null, overview));
      }
      abbot.tick(dt);
      toasts.tick(dt);
      festival.tick(dt);
      hud.progress.tick(dt);
      hud.board.tick(dt);
      hud.events.tick(dt);
    }
  });
}

void boot();
