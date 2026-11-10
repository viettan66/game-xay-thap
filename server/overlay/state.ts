// Dựng trạng thái gửi xuống overlay. Mọi chữ hiển thị lấy từ config, không viết cứng.

import { computeMultiplier } from '../../shared/events.js';
import type { Board, OverlayState } from '../../shared/protocol.js';
import { assetsVersion } from '../assets/manifest.js';
import type { GameCore } from '../core.js';
import { topFloor, topSession, topTotal } from '../game/queries.js';

export const BOARD_LIMITS = { session: 5, total: 10, floor: 5 } as const;

export function buildOverlayState(core: GameCore, badge: string | null): OverlayState {
  const cfg = core.config;
  const tower = core.engine.status();
  const session = core.sessions.current();
  const events = core.configStore.getEvents();

  const boards: Board[] = [
    {
      key: 'session',
      title: cfg.labels.boards.sessionTop,
      rows: session ? topSession(core.db, session.id, BOARD_LIMITS.session) : [],
    },
    { key: 'total', title: cfg.labels.boards.totalTop, rows: topTotal(core.db, BOARD_LIMITS.total) },
    {
      key: 'floor',
      title: cfg.labels.boards.floorTop.replace('{floorName}', tower.floorName).replace('{floor}', String(tower.floor)),
      rows: topFloor(core.db, tower.floor, BOARD_LIMITS.floor),
    },
  ];

  const m = computeMultiplier(core.now(), events, cfg.goldenHour, core.engine.goldenManualUntil(), cfg.multipliers);
  const labels = m.activeEventKeys.map((k) => events.find((e) => e.key === k)?.name ?? k);
  if (m.goldenHour) labels.push(cfg.labels.goldenHour);

  return {
    profile: core.profile,
    badge,
    tower,
    boards,
    multiplier: m.total !== 1 ? { total: m.total, labels } : null,
    labels: { pointUnit: cfg.labels.pointUnitLabel, disclaimer: cfg.labels.disclaimer },
    layout: { ...cfg.overlay },
    assetsVersion: assetsVersion(core.rootDir),
  };
}
