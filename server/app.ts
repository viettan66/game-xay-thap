// Web server (Express): trang trạng thái tạm, API điều khiển giả lập và phiên, overlay đã đóng gói.
// Admin đầy đủ làm ở giai đoạn 7.

import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import type { GameCore } from './core.js';
import { SimulatorNotAllowed, type LiveService, type SourceMode } from './live/service.js';
import { FIRE_KINDS, SCENARIO_KEYS, SCENARIOS, type FireKind, type ScenarioKey } from './live/simulator.js';
import { chooseBackground, gameAssetsDir, loadManifest, ManifestError, missingFiles, saveManifest } from './assets/manifest.js';
import { loadCuts, MapCutError, missingSegments } from './assets/mapCut.js';
import { MapCutQueue, updateBuildingCut, type MapTools } from './assets/mapTools.js';
import { applyToManifest, parseToolUpdate } from './assets/tools.js';
import { ConfigError } from './config/store.js';
import type { StateBroadcaster } from './overlay/broadcaster.js';
import { buildOverlayState } from './overlay/state.js';

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
    scenarios: SCENARIO_KEYS.map((k) => ({ key: k, label: SCENARIOS[k].label })),
  };
}

class BadRequest extends Error {}

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
    res.json({
      manifest: m,
      missing: m ? missingFiles(rootDir, m) : [],
      config: { floor1WidthPx: core.config.overlay.floor1WidthPx, towerTaper: core.config.overlay.towerTaper },
    });
  });
  app.post('/api/tools/manifest', (req, res) => {
    const m = loadManifest(rootDir);
    if (!m) throw new ManifestError(['Chưa có assets/manifest.json']);
    const u = parseToolUpdate(body(req));
    saveManifest(rootDir, applyToManifest(m, u));
    // Độ thu nhỏ từng tầng và bề rộng tầng 1 nằm trong config (mục 8, 14.13).
    if (u.floor1WidthPx !== undefined || u.towerTaper !== undefined) {
      const next = structuredClone(core.config);
      if (u.floor1WidthPx !== undefined) next.overlay.floor1WidthPx = u.floor1WidthPx;
      if (u.towerTaper !== undefined) next.overlay.towerTaper = u.towerTaper;
      core.saveConfig(next, { source: 'tools/assets' });
    }
    broadcaster.markDirty();
    res.json({ ok: true, manifest: loadManifest(rootDir) });
  });
  app.post('/api/tools/background', (req, res) => {
    const m = loadManifest(rootDir);
    if (!m) throw new ManifestError(['Chưa có assets/manifest.json']);
    const key = String(body(req).variant ?? '');
    chooseBackground(rootDir, m.background.variants, key);
    saveManifest(rootDir, { ...m, background: { ...m.background, variant: key } });
    broadcaster.markDirty();
    res.json({ ok: true, manifest: loadManifest(rootDir) });
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

  app.get('/tools/assets', (_req, res) => {
    const page = path.join(overlayDir(rootDir), 'tools.html');
    if (!fs.existsSync(page)) return res.status(503).type('html').send('<meta charset="utf-8"><p>Chưa đóng gói. Chạy <code>npm run build</code>.</p>');
    res.sendFile(page);
  });

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
