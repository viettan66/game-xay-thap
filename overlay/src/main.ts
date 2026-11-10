// Overlay game (PixiJS v8): một trang, vẽ ở khung 1080×1920, co giãn vừa cửa sổ.
// Dùng làm Browser Source trong OBS: http://127.0.0.1:3000/overlay/ (1080×1920).

import { Application, Container } from 'pixi.js';
import type { OverlayState, ServerMessage } from '../../shared/protocol.js';
import { cameraTarget, lerpCamera, STAGE_H, STAGE_W, uiRects } from './layout.js';
import { connectServer } from './net.js';
import { createGround, createMountains, createSky } from './scene/background.js';
import { TowerView } from './scene/tower.js';
import { loadFonts } from './theme.js';
import { Badge, ConnectionDot, Disclaimer, MultiplierChip } from './ui/chrome.js';
import { Banner } from './ui/banner.js';
import { BoardPanel } from './ui/board.js';

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

  // Lớp từ sau ra trước: trời → núi (trôi chậm) → mặt đất + tháp (đi theo camera) → giao diện.
  const sky = createSky();
  const scenery = new Container();
  const world = new Container();
  const uiLayer = new Container();
  app.stage.addChild(sky, scenery, world, uiLayer);
  const tower = new TowerView();
  const dot = new ConnectionDot(STAGE_W - 170, 200);
  app.stage.addChild(dot.container);

  let state: OverlayState | null = null;
  let ui: Ui | null = null;
  let sceneryKey = '';
  let camera = 0;
  let cameraReady = false;

  const ensureScene = (s: OverlayState) => {
    const key = String(s.layout.towerBaseY);
    if (key === sceneryKey) return;
    sceneryKey = key;
    scenery.removeChildren().forEach((c) => c.destroy({ children: true }));
    world.removeChildren().forEach((c) => {
      if (c !== tower.container) c.destroy({ children: true });
    });
    scenery.addChild(createMountains(s.layout.towerBaseY));
    world.addChild(createGround(s.layout.towerBaseY), tower.container);
  };

  const ensureUi = (s: OverlayState): Ui => {
    const key = JSON.stringify(s.layout.safeArea);
    if (ui && ui.key === key) return ui;
    ui?.root.destroy({ children: true });
    const r = uiRects(s.layout.safeArea);
    const next: Ui = {
      key,
      root: new Container(),
      banner: new Banner(r.banner),
      board: new BoardPanel(r.board),
      badge: new Badge(r.badge),
      chip: new MultiplierChip(r.chip),
      disclaimer: new Disclaimer(r.disclaimer),
    };
    next.root.addChild(next.disclaimer.container, next.board.container, next.banner.container, next.chip.container, next.badge.container);
    uiLayer.addChild(next.root);
    ui = next;
    return next;
  };

  const apply = (s: OverlayState) => {
    state = s;
    ensureScene(s);
    tower.update(s);
    const u = ensureUi(s);
    u.banner.update(s);
    u.board.update(s);
    u.badge.update(s.badge);
    u.chip.update(s.multiplier);
    u.disclaimer.update(s.labels.disclaimer);
  };

  const onMessage = (m: ServerMessage) => {
    if (m.type === 'state') apply(m.state);
    else if (m.type === 'tower') {
      for (const t of m.transitions) {
        if (t.type === 'stage_complete') tower.flashFloor(t.floor, 0.45);
        if (t.type === 'floor_complete') tower.flashFloor(t.floor, 0.8);
      }
    }
  };
  connectServer(onMessage, (ok) => dot.set(ok));

  app.ticker.add((t) => {
    if (!state) return;
    const dt = Math.min(0.1, t.deltaMS / 1000);
    const geom = tower.geometry();
    if (geom) {
      const target = cameraTarget(geom, state.tower.floor, state.tower.completed);
      // Lần đầu mở overlay thì đặt camera đúng chỗ ngay, không lia từ dưới đất lên.
      camera = cameraReady ? lerpCamera(camera, target, dt) : target;
      cameraReady = true;
      world.y = camera;
      scenery.y = camera * 0.5;
    }
    tower.tick(dt);
    ui?.banner.tick(dt);
    ui?.board.tick(dt);
  });
}

void boot();
