// Dựng trạng thái gửi xuống overlay. Mọi chữ hiển thị lấy từ config, không viết cứng.

import { computeMultiplier, goldenHourEndsAt } from '../../shared/events.js';
import { displayName } from '../../shared/names.js';
import type { Board, BoardRow, CrowdTier, EventLine, OverlayState, PiecesConfig } from '../../shared/protocol.js';
import { assetsVersion } from '../assets/manifest.js';
import type { GameCore } from '../core.js';
import { honorStatues, topItem, topSession, topTotal } from '../game/queries.js';
import { fillTemplate } from '../../shared/project.js';

/** Số tượng ghi danh gửi xuống overlay (mới nhất); ô ghi danh xoay vòng trong số này. */
export const HONOR_LIMIT = 300;

// Bảng xếp hạng thu gọn (mục 8): top 5 mỗi bảng.
export const BOARD_LIMITS = { session: 5, total: 5, item: 5 } as const;

/** Chế độ độ đông đang áp dụng (mục 9A). */
export function currentCrowd(core: GameCore): CrowdTier {
  return core.crowd.tier;
}

/** Tên hiện trên overlay: đã lọc từ cấm, rỗng thì tên ẩn danh (mục 8, 14.7). */
export function overlayName(core: GameCore, raw: string | null | undefined): string {
  const cfg = core.config;
  return displayName(raw, cfg.nameFilter.bannedWords, cfg.labels.anonymousName);
}

/** Câu đang bật của một nhóm thoại. Live thật (kể cả diễn tập) thì chỉ dùng câu đã duyệt (mục 9C). */
export function dialogueLines(core: GameCore, group: string, liveOnly: boolean): string[] {
  const g = core.configStore.getDialogues().groups[group];
  return (g?.lines ?? []).filter((l) => l.enabled && (!liveOnly || l.verified)).map((l) => l.text);
}

export function buildOverlayState(core: GameCore, badge: string | null): OverlayState {
  const cfg = core.config;
  const progress = core.engine.status();
  const session = core.sessions.current();
  const events = core.configStore.getEvents();

  const named = (rows: BoardRow[]): BoardRow[] => rows.map((r) => ({ ...r, nickname: overlayName(core, r.nickname) }));
  const boards: Board[] = [
    {
      key: 'session',
      title: cfg.labels.boards.sessionTop,
      rows: session ? named(topSession(core.db, session.id, BOARD_LIMITS.session)) : [],
    },
    { key: 'total', title: cfg.labels.boards.totalTop, rows: named(topTotal(core.db, BOARD_LIMITS.total)) },
    {
      key: 'item',
      title: fillTemplate(cfg.labels.boards.itemTop, { item: progress.item.name }),
      rows: named(topItem(core.db, progress.item.id, BOARD_LIMITS.item)),
    },
  ];

  const now = core.now();
  const manualGolden = core.engine.goldenManualUntil();
  const m = computeMultiplier(now, events, cfg.goldenHour, manualGolden, cfg.multipliers);
  const labels = m.activeEventKeys.map((k) => events.find((e) => e.key === k)?.name ?? k);
  if (m.goldenHour) labels.push(cfg.labels.goldenHour);

  // Ô sự kiện (mục 8): giờ vàng có đếm ngược, sự kiện lịch, tổng hệ số khi có từ hai thứ trở lên.
  const L = cfg.labels.events;
  const mult = (x: number) => String(Math.round(x * 100) / 100).replace('.', ',');
  const eventBox: EventLine[] = [];
  // Mục tiêu tim của phiên (bảng 9A): chỉ khi đang có phiên.
  const goal = core.goals.info();
  if (goal.sessionId !== null) {
    const fmt = (n: number) => n.toLocaleString('vi-VN');
    const reward = cfg.heartGoal.reward;
    if (goal.target !== null) {
      // Câu goal_text cố định theo nấc (không đổi mỗi lần gửi trạng thái).
      const lines = dialogueLines(core, 'goal_text', badge !== cfg.labels.testBadge);
      const tpl = lines.length ? lines[goal.target % lines.length]! : '';
      const text = fillTemplate(L.heartGoal, { count: fmt(goal.count), target: fmt(goal.target), goal: fillTemplate(tpl, { target: fmt(goal.target), reward }) });
      eventBox.push({ kind: 'goal', text: text.replace(/\s*·\s*$/, ''), endsAt: null });
    } else if (goal.reached.length) {
      eventBox.push({ kind: 'goal', text: fillTemplate(L.heartGoalDone, { count: fmt(goal.count), reward }), endsAt: null });
    }
  }
  if (m.goldenHour) {
    eventBox.push({
      kind: 'golden',
      text: fillTemplate(L.goldenHour, { name: cfg.labels.goldenHour, multiplier: mult(m.goldenMultiplier) }),
      endsAt: goldenHourEndsAt(cfg.goldenHour, now, manualGolden),
    });
  }
  for (const k of m.activeEventKeys) {
    const e = events.find((x) => x.key === k);
    if (e) eventBox.push({ kind: 'event', text: fillTemplate(L.event, { name: e.name, multiplier: mult(e.multiplier) }), endsAt: null });
  }
  if (eventBox.filter((e) => e.kind !== 'goal').length > 1 && m.total !== 1) eventBox.push({ kind: 'total', text: fillTemplate(L.total, { multiplier: mult(m.total) }), endsAt: null });
  const crowd = currentCrowd(core);
  const cam = cfg.camera;

  return {
    profile: core.profile,
    badge,
    progress,
    boards,
    multiplier: m.total !== 1 ? { total: m.total, labels } : null,
    labels: { pointUnit: cfg.labels.pointUnitLabel, disclaimer: cfg.labels.disclaimer },
    layout: {
      safeArea: cfg.overlay.safeArea,
      boardRotateSec: cfg.overlay.boardRotateSec,
    },
    hud: {
      boardPosition: cfg.overlay.boardPosition,
      minimap: cfg.overlay.minimap,
      opacity: { ...cfg.overlay.opacity },
      boardRotateSec: cfg.overlay.boardRotateSec,
      toastSec: cfg.toast.sec,
    },
    camera: {
      maxZoom: cam.maxZoom,
      siteWidth: cam.siteWidth,
      overviewEverySec: cam.overviewEverySec[crowd],
      overviewSec: cam.overviewSec,
      tourEverySec: cam.tourEverySec[crowd],
      tourSec: cam.tourSec,
      ceremonySec: cam.ceremonySec,
      ceremonyZoom: cam.ceremonyZoom,
      shakeMinCoins: cam.shakeMinCoins,
    },
    crowd,
    eventBox,
    serverNow: now,
    pieces: {
      size: cfg.pieces.size as PiecesConfig['size'],
      maxPerSec: cfg.pieces.maxPerSec[crowd],
      materials: cfg.pieces.materials,
      burstSec: cfg.pieces.burstSec,
    },
    // Live thật (kể cả diễn tập) chỉ dùng câu đã duyệt; giả lập (nhãn CHẾ ĐỘ THỬ) dùng tất cả.
    texts: { pieceBurst: dialogueLines(core, 'piece_burst', badge !== cfg.labels.testBadge) },
    actors: core.roster.list().map((m) => ({ id: m.id, name: m.name, title: m.title })),
    honors: honorStatues(core.db, HONOR_LIMIT).map((h) => ({ id: h.id, seq: h.seq, name: overlayName(core, h.nickname) })),
    characters: {
      heightMap: cfg.characters.heightMap,
      boostSec: cfg.characters.boostSec,
      plusText: cfg.labels.actorPlus,
      maxVehicles: cfg.characters.maxVehicles,
      honorRotateSec: cfg.honor.rotateSec,
    },
    assetsVersion: assetsVersion(core.rootDir),
  };
}
