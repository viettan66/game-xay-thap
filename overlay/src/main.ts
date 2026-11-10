// Overlay game (PixiJS v8): một trang, vẽ ở khung 1080×1920, co giãn vừa cửa sổ.
// Dùng làm Browser Source trong OBS: http://127.0.0.1:3000/overlay/ (1080×1920).
// Phím D: bật/tắt khung debug vùng an toàn, vạch căn tầng (eaveLineY đỏ, topY xanh), số tầng.

import { Application, Container } from 'pixi.js';
import type { OverlayState, ServerMessage } from '../../shared/protocol.js';
import { destroyArt, EMPTY_ART, loadArt, type Art } from './art.js';
import { lerpCamera, STAGE_H, STAGE_W, uiRects } from './layout.js';
import { connectServer } from './net.js';
import { Backdrop } from './scene/background.js';
import { TowerView } from './scene/tower.js';
import { loadFonts } from './theme.js';
import { cameraTargetFor } from './towerLayout.js';
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

  // Lớp từ sau ra trước: trời (×0,25) → nền có bệ móng (×0,5) → tháp (theo camera) → giao diện → debug.
  const backdrop = new Backdrop();
  const world = new Container();
  const uiLayer = new Container();
  const tower = new TowerView();
  const safeDebug = new SafeAreaDebug();
  const dot = new ConnectionDot(STAGE_W - 170, 200);
  world.addChild(tower.container);
  app.stage.addChild(backdrop.sky, backdrop.land, world, uiLayer, safeDebug.container, dot.container);

  let state: OverlayState | null = null;
  let ui: Ui | null = null;
  let art: Art = EMPTY_ART;
  let loadingVersion: string | null = null;
  let camera = 0;
  let cameraReady = false;

  const ensureUi = (s: OverlayState): Ui => {
    const key = JSON.stringify(s.layout.safeArea);
    if (ui && ui.key === key) return ui;
    ui?.root.destroy({ children: true });
    const r = uiRects(s.layout.safeArea);
    const next: Ui = {
      key,
      root: new Container(),
      banner: new Banner(r.banner, r.progress),
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
    backdrop.build(a, state?.layout.towerBaseY ?? 1215);
    tower.setArt(a);
    ui?.banner.setArt(a);
    ui?.board.setArt(a);
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
    tower.update(s);
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
    else if (m.type === 'tower') {
      for (const t of m.transitions) {
        if (t.type === 'stage_complete') tower.flashFloor(t.floor, 0.4);
        if (t.type === 'floor_complete') tower.flashFloor(t.floor, 0.75);
      }
    }
  };
  connectServer(onMessage, (ok) => dot.set(ok));

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'd' && e.key !== 'D') return;
    safeDebug.visible = !safeDebug.visible;
    tower.setDebug(safeDebug.visible);
  });
  // Mở overlay với ?debug=1 thì bật sẵn khung debug.
  if (new URLSearchParams(location.search).has('debug')) {
    safeDebug.visible = true;
    tower.setDebug(true);
  }

  app.ticker.add((t) => {
    if (!state) return;
    const dt = Math.min(0.1, t.deltaMS / 1000);
    const target = cameraTargetFor(tower.currentPlacement());
    // Lần đầu mở overlay thì đặt camera đúng chỗ ngay, không lia từ dưới đất lên.
    camera = cameraReady ? lerpCamera(camera, target, dt) : target;
    cameraReady = true;
    world.y = camera;
    backdrop.update(camera);
    tower.tick(dt);
    ui?.banner.tick(dt);
    ui?.board.tick(dt);
  });
}

void boot();
