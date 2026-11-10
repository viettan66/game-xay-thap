// Web server (Express). Giai đoạn 1 chỉ có trang trạng thái tạm thời; admin đầy đủ làm ở giai đoạn 7.

import path from 'node:path';
import express from 'express';
import { totalTowerCost } from '../shared/tower.js';
import type { GameCore } from './core.js';
import { topFloor, topSession, topTotal } from './game/queries.js';

export function buildStatus(core: GameCore) {
  const cfg = core.config;
  const tower = core.engine.status();
  const session = core.sessions.current();
  return {
    profile: core.profile,
    nodeVersion: process.versions.node,
    tower,
    totalTowerCost: totalTowerCost(cfg.tower),
    session: session ? { id: session.id, startedAt: session.started_at } : null,
    boards: {
      total: { title: cfg.labels.boards.totalTop, rows: topTotal(core.db, 10) },
      session: {
        title: cfg.labels.boards.sessionTop,
        rows: session ? topSession(core.db, session.id, 5) : [],
      },
      floor: {
        title: cfg.labels.boards.floorTop.replace('{floor}', String(tower.floor)),
        rows: topFloor(core.db, tower.floor, 5),
      },
    },
    pointUnit: cfg.labels.pointUnitLabel,
    liveSource: cfg.liveSource,
  };
}

export function createApp(core: GameCore, rootDir: string): express.Express {
  const app = express();
  app.disable('x-powered-by');

  app.get('/api/status', (_req, res) => {
    res.json(buildStatus(core));
  });
  app.get('/admin', (_req, res) => {
    res.sendFile(path.join(rootDir, 'admin', 'index.html'));
  });
  app.get('/', (_req, res) => {
    res.redirect('/admin');
  });
  return app;
}
