// Dựng trạng thái gửi xuống overlay. Mọi chữ hiển thị lấy từ config, không viết cứng.

import { computeMultiplier } from '../../shared/events.js';
import type { Board, OverlayState, PiecesConfig } from '../../shared/protocol.js';
import { assetsVersion } from '../assets/manifest.js';
import type { GameCore } from '../core.js';
import { topItem, topSession, topTotal } from '../game/queries.js';
import { fillTemplate } from '../../shared/project.js';

export const BOARD_LIMITS = { session: 5, total: 10, item: 5 } as const;

/** Câu đang bật của một nhóm thoại. Live thật (không có nhãn thử) thì chỉ dùng câu đã duyệt (mục 9C). */
export function dialogueLines(core: GameCore, group: string, liveOnly: boolean): string[] {
  const g = core.configStore.getDialogues().groups[group];
  return (g?.lines ?? []).filter((l) => l.enabled && (!liveOnly || l.verified)).map((l) => l.text);
}

export function buildOverlayState(core: GameCore, badge: string | null): OverlayState {
  const cfg = core.config;
  const progress = core.engine.status();
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
      key: 'item',
      title: fillTemplate(cfg.labels.boards.itemTop, { item: progress.item.name }),
      rows: topItem(core.db, progress.item.id, BOARD_LIMITS.item),
    },
  ];

  const m = computeMultiplier(core.now(), events, cfg.goldenHour, core.engine.goldenManualUntil(), cfg.multipliers);
  const labels = m.activeEventKeys.map((k) => events.find((e) => e.key === k)?.name ?? k);
  if (m.goldenHour) labels.push(cfg.labels.goldenHour);

  return {
    profile: core.profile,
    badge,
    progress,
    boards,
    multiplier: m.total !== 1 ? { total: m.total, labels } : null,
    labels: { pointUnit: cfg.labels.pointUnitLabel, disclaimer: cfg.labels.disclaimer },
    layout: { ...cfg.overlay },
    pieces: {
      size: cfg.pieces.size as PiecesConfig['size'],
      // Chế độ độ đông (mục 9A) làm ở giai đoạn 4; tạm dùng mức "vừa".
      maxPerSec: cfg.pieces.maxPerSec.vua,
      materials: cfg.pieces.materials,
      burstSec: cfg.pieces.burstSec,
    },
    texts: { pieceBurst: dialogueLines(core, 'piece_burst', badge === null) },
    assetsVersion: assetsVersion(core.rootDir),
  };
}
