// Web server (Express): trang trạng thái tạm, API điều khiển giả lập và phiên, overlay đã đóng gói.
// Admin đầy đủ làm ở giai đoạn 7.

import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import type { GameCore } from './core.js';
import { SimulatorNotAllowed, type LiveService, type SourceMode } from './live/service.js';
import { FIRE_KINDS, SCENARIO_KEYS, SCENARIOS, type FireKind, type ScenarioKey } from './live/simulator.js';
import { assetsVersion, gameAssetsDir, loadManifest, ManifestError, missingFiles } from './assets/manifest.js';
import { loadCuts, MapCutError, missingSegments } from './assets/mapCut.js';
import { partsForEditing, partsStatus, proposeForBuilding, saveParts, syncManifestParts, validateLabels } from './assets/parts.js';
import { PARTS } from '../shared/parts.js';
import { MapCutQueue, updateBuildingCut, type MapTools } from './assets/mapTools.js';
import type { GameConfig } from './config/schema.js';
import { ConfigError } from './config/store.js';
import type { StateBroadcaster } from './overlay/broadcaster.js';
import { buildOverlayState, dialogueLines } from './overlay/state.js';

export interface AppDeps {
  core: GameCore;
  live: LiveService;
  broadcaster: StateBroadcaster;
  rootDir: string;
  isAllowedOrigin: (origin: string | undefined) => boolean;
  /** Cắt lại bản đồ trên trang /tools/assets (test thay bằng bản giả). */
  mapTools: MapTools;
}

export function overlayDir(rootDir: string): string {
  return path.join(rootDir, 'dist', 'overlay');
}

export function buildStatus({ core, live }: Pick<AppDeps, 'core' | 'live'>) {
  const cfg = core.config;
  const overlay = buildOverlayState(core, live.badge());
  const session = core.sessions.current();
  return {
    profile: core.profile,
    nodeVersion: process.versions.node,
    progress: overlay.progress,
    session: session ? { id: session.id, startedAt: session.started_at } : null,
    boards: overlay.boards,
    multiplier: overlay.multiplier,
    badge: overlay.badge,
    pointUnit: cfg.labels.pointUnitLabel,
    live: live.status(),
    sim: live.simState(),
    crowd: core.crowd.info(core.now()),
    scenarios: SCENARIO_KEYS.map((k) => ({ key: k, label: SCENARIOS[k].label })),
  };
}

class BadRequest extends Error {}

/** Các thông số hiển thị chỉnh bằng thanh trượt trên trang trạng thái (mục 14.13). */
export function displaySettings(cfg: GameConfig) {
  return {
    maxZoom: cfg.camera.maxZoom,
    siteWidth: cfg.camera.siteWidth,
    boardPosition: cfg.overlay.boardPosition,
    minimap: cfg.overlay.minimap,
    opacity: { ...cfg.overlay.opacity },
  };
}

/** Ghép thông số hiển thị gửi lên vào config (kiểm tra kỹ bằng zod khi lưu). */
function applyDisplay(next: GameConfig, b: Record<string, unknown>): void {
  const num = (v: unknown, name: string) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new BadRequest(`${name} phải là số`);
    return v;
  };
  if (b.maxZoom !== undefined) next.camera.maxZoom = num(b.maxZoom, 'maxZoom');
  if (b.siteWidth !== undefined) next.camera.siteWidth = num(b.siteWidth, 'siteWidth');
  if (b.boardPosition !== undefined) next.overlay.boardPosition = b.boardPosition as GameConfig['overlay']['boardPosition'];
  if (b.minimap !== undefined) next.overlay.minimap = b.minimap as GameConfig['overlay']['minimap'];
  if (b.opacity !== undefined) {
    if (typeof b.opacity !== 'object' || b.opacity === null) throw new BadRequest('opacity không hợp lệ');
    for (const [k, v] of Object.entries(b.opacity)) {
      if (!(k in next.overlay.opacity)) throw new BadRequest(`Không có khung "${k}"`);
      next.overlay.opacity[k as keyof GameConfig['overlay']['opacity']] = num(v, `opacity.${k}`);
    }
  }
}

export function createApp(deps: AppDeps): express.Express {
  const { core, live, broadcaster, rootDir } = deps;
  const app = express();
  app.disable('x-powered-by');

  // Chỉ nhận lệnh dạng JSON từ chính trang của game: chặn trang web lạ gửi lệnh tới 127.0.0.1.
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'GET') return next();
    if (!req.is('application/json')) return res.status(415).json({ error: 'Lệnh phải gửi dạng JSON' });
    if (!deps.isAllowedOrigin(req.headers.origin)) return res.status(403).json({ error: 'Không cho phép' });
    next();
  });
  // Trang chia vùng gửi cả mảng vùng của công trình (công trình lớn vài MB).
  app.use('/api/tools/parts', express.json({ limit: '25mb' }));
  app.use(express.json({ limit: '1mb' }));

  const ok = (res: Response) => {
    broadcaster.markDirty();
    res.json(buildStatus(deps));
  };
  const body = (req: Request) => (req.body ?? {}) as Record<string, unknown>;
  const simSettingsFrom = (b: Record<string, unknown>) => {
    const out: { scenario?: ScenarioKey; speed?: number } = {};
    if (b.scenario !== undefined) {
      if (!SCENARIO_KEYS.includes(b.scenario as ScenarioKey)) throw new BadRequest('Kịch bản không hợp lệ');
      out.scenario = b.scenario as ScenarioKey;
    }
    if (b.speed !== undefined) {
      if (typeof b.speed !== 'number' || !Number.isFinite(b.speed)) throw new BadRequest('Tốc độ phải là số');
      out.speed = b.speed;
    }
    return out;
  };

  app.get('/api/status', (_req, res) => {
    res.json(buildStatus(deps));
  });

  app.post('/api/live/mode', (req, res) => {
    const mode = body(req).mode as SourceMode;
    if (mode !== 'simulator' && mode !== 'live') throw new BadRequest('mode phải là "simulator" hoặc "live"');
    live.setMode(mode);
    ok(res);
  });
  app.post('/api/sim/start', (req, res) => {
    live.simStart(simSettingsFrom(body(req)));
    ok(res);
  });
  app.post('/api/sim/stop', (_req, res) => {
    live.simStop();
    ok(res);
  });
  app.post('/api/sim/settings', (req, res) => {
    live.simSettings(simSettingsFrom(body(req)));
    ok(res);
  });
  app.post('/api/sim/fire', (req, res) => {
    const kind = body(req).kind as FireKind;
    if (!FIRE_KINDS.includes(kind)) throw new BadRequest('Loại sự kiện không hợp lệ');
    live.simFire(kind);
    ok(res);
  });
  // ---- Chế độ độ đông (mục 9A): ép tay hoặc tự động ----
  app.post('/api/crowd', (req, res) => {
    const tier = body(req).tier;
    if (tier === 'auto') core.setCrowdForced(null);
    else if (tier === 'vang' || tier === 'vua' || tier === 'dong' || tier === 'ratdong') core.setCrowdForced(tier);
    else throw new BadRequest('Chế độ không hợp lệ');
    ok(res);
  });

  // ---- Camera và chỉnh hiển thị (mục 8, 14.13) ----
  app.post('/api/camera', (req, res) => {
    const mode = body(req).mode;
    if (mode !== 'overview' && mode !== 'tour' && mode !== 'ceremony') throw new BadRequest('Chế độ camera không hợp lệ');
    broadcaster.camera(mode);
    res.json({ ok: true });
  });
  app.get('/api/display', (_req, res) => {
    res.json(displaySettings(core.config));
  });
  app.post('/api/display', (req, res) => {
    const next = structuredClone(core.config);
    applyDisplay(next, body(req));
    core.saveConfig(next, { source: 'admin/display' });
    broadcaster.markDirty();
    res.json(displaySettings(core.config));
  });

  app.post('/api/session/start', (_req, res) => {
    core.sessions.startManual();
    ok(res);
  });
  app.post('/api/session/end', (_req, res) => {
    core.sessions.endManual();
    ok(res);
  });

  // ---- Ảnh game (mục 7) ----
  app.get('/assets/manifest.json', (_req, res) => {
    const m = loadManifest(rootDir);
    if (!m) return res.status(404).json({ error: 'Chưa có assets/manifest.json (chạy npm run assets:build)' });
    res.set('Cache-Control', 'no-store').json(m);
  });
  app.use('/assets/game', express.static(gameAssetsDir(rootDir), { maxAge: 0, fallthrough: false }));

  // ---- Trang kiểm tra ảnh /tools/assets ----
  app.get('/api/tools/assets', (_req, res) => {
    const m = loadManifest(rootDir);
    res.json({ manifest: m, missing: m ? missingFiles(rootDir, m) : [] });
  });
  // ---- Bản đồ quần thể chùa (R2): khung cắt từng công trình ----
  const mapQueue = new MapCutQueue();
  app.get('/api/tools/map', (_req, res) => {
    const cuts = loadCuts(rootDir);
    res.json({
      cuts,
      map: loadManifest(rootDir)?.map ?? null,
      names: Object.fromEntries(core.project.items.map((i) => [i.id, i.name])),
      canSegment: deps.mapTools.canSegment(),
      missingSegments: missingSegments(rootDir, cuts),
    });
  });
  app.post('/api/tools/map/building', async (req, res) => {
    const r = await mapQueue.run(() => updateBuildingCut(rootDir, deps.mapTools, body(req).building));
    broadcaster.markDirty();
    res.json({ ok: true, ...r });
  });
  app.post('/api/tools/map/rebuild', async (_req, res) => {
    const map = await mapQueue.run(() => deps.mapTools.build());
    broadcaster.markDirty();
    res.json({ ok: true, cuts: loadCuts(rootDir), map });
  });

  // ---- Chia vùng công trình cho "xây từng mảnh" (R3a) ----
  const buildingById = (id: string) => {
    const b = loadManifest(rootDir)?.map?.buildings.find((x) => x.id === id);
    if (!b) throw new BadRequest(`Không có công trình "${id}" trên bản đồ (chạy npm run assets:map)`);
    return b;
  };
  const buildingName = (b: { id: string; items: string[] }) => {
    const names = new Map(core.project.items.map((i) => [i.id, i.name]));
    return b.items.length === 1 ? (names.get(b.items[0]!) ?? b.id) : `Bảo tháp (${b.items.length} tầng)`;
  };
  const partsReply = (b: ReturnType<typeof buildingById>, labels: Uint8Array, source: string) => ({
    building: { id: b.id, name: buildingName(b), w: b.w, h: b.h, file: b.file, layer: b.layer },
    labels: Buffer.from(labels).toString('base64'),
    source,
  });
  app.get('/api/tools/parts', (_req, res) => {
    const map = loadManifest(rootDir)?.map;
    res.json({
      parts: PARTS,
      buildings: (map?.buildings ?? []).map((b) => ({ id: b.id, name: buildingName(b), w: b.w, h: b.h, layer: b.layer, ...partsStatus(rootDir, b.id) })),
    });
  });
  app.get('/api/tools/parts/:id', async (req, res) => {
    const b = buildingById(req.params.id);
    const r = await partsForEditing(rootDir, b);
    res.json(partsReply(b, r.labels, r.source));
  });
  app.post('/api/tools/parts/:id/propose', async (req, res) => {
    const b = buildingById(req.params.id);
    res.json(partsReply(b, await proposeForBuilding(rootDir, b), 'unsaved'));
  });
  app.post('/api/tools/parts/:id', async (req, res) => {
    const b = buildingById(req.params.id);
    const raw = body(req).labels;
    if (typeof raw !== 'string') throw new BadRequest('Thiếu mảng vùng (labels)');
    const labels = new Uint8Array(Buffer.from(raw, 'base64'));
    const problem = validateLabels(labels, b.w, b.h);
    if (problem) throw new BadRequest(problem);
    const source = body(req).edited === false ? 'auto' : 'edited';
    await saveParts(rootDir, b, labels, source);
    syncManifestParts(rootDir, b.id);
    broadcaster.markDirty(); // overlay đang mở tải lại vùng mới
    res.json({ ok: true, ...partsStatus(rootDir, b.id) });
  });
  // ---- Trang thử xây /tools/build (R3c): xây thử trong trình duyệt, không ghi vào dữ liệu game ----
  app.get('/api/tools/build', (_req, res) => {
    const cfg = core.config;
    const now = core.engine.status();
    res.json({
      project: core.project,
      current: { itemId: now.item.id, stageIndex: now.stage.number - 1, completed: now.completed },
      progressLabels: cfg.labels.progress,
      points: cfg.points,
      pieces: { size: cfg.pieces.size, maxPerSec: cfg.pieces.maxPerSec, materials: cfg.pieces.materials, burstSec: cfg.pieces.burstSec },
      // Trang thử không lên sóng: dùng mọi câu đang bật, kể cả câu chưa duyệt (như hồ sơ test).
      texts: { pieceBurst: dialogueLines(core, 'piece_burst', false) },
      labels: { badge: cfg.labels.testBadge, disclaimer: cfg.labels.disclaimer, pointUnit: cfg.labels.pointUnitLabel },
      safeArea: cfg.overlay.safeArea,
      camera: cfg.camera,
      assetsVersion: assetsVersion(rootDir),
    });
  });

  // Trang công cụ (đóng gói bằng Vite vào dist/overlay).
  const toolPage = (url: string, file: string) =>
    app.get(url, (_req, res) => {
      const page = path.join(overlayDir(rootDir), file);
      if (!fs.existsSync(page)) return res.status(503).type('html').send('<meta charset="utf-8"><p>Chưa đóng gói. Chạy <code>npm run build</code>.</p>');
      res.sendFile(page);
    });
  toolPage('/tools/parts', 'parts.html');
  toolPage('/tools/assets', 'tools.html');
  toolPage('/tools/build', 'build.html');

  app.get('/admin', (_req, res) => {
    res.sendFile(path.join(rootDir, 'admin', 'index.html'));
  });

  // Overlay đã đóng gói (npm run build). Chưa có thì báo cách làm thay vì trang trắng.
  const dist = overlayDir(rootDir);
  app.use('/overlay', (req, res, next) => {
    if (fs.existsSync(path.join(dist, 'index.html'))) return next();
    res
      .status(503)
      .type('html')
      .send(
        '<meta charset="utf-8"><body style="font-family:sans-serif;padding:40px">' +
          '<h2>Overlay chưa được đóng gói</h2>' +
          '<p>Đóng cửa sổ game rồi mở lại <b>start-test.bat</b> / <b>start.bat</b> (game tự đóng gói), ' +
          'hoặc chạy lệnh <code>npm run build</code>.</p></body>',
      );
  });
  app.use('/overlay', express.static(dist, { index: 'index.html', maxAge: 0 }));

  app.get('/', (_req, res) => {
    res.redirect('/admin');
  });

  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof SimulatorNotAllowed) return res.status(403).json({ error: err.message });
    if (err instanceof BadRequest) return res.status(400).json({ error: err.message });
    if (err instanceof ManifestError || err instanceof ConfigError || err instanceof MapCutError) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  });
  return app;
}
