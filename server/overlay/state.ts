// Dựng trạng thái gửi xuống overlay. Mọi chữ hiển thị lấy từ config, không viết cứng.

import { computeMultiplier, goldenHourEndsAt } from '../../shared/events.js';
import { displayName } from '../../shared/names.js';
import type { ActorInfo, AnonCrowd, Board, BoardRow, CrowdTier, EventLine, OverlayState, PiecesConfig } from '../../shared/protocol.js';
import type { CharLook } from '../../shared/characters.js';
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

/** Dòng đang bật thứ `index` của một nhóm (giữ đúng vị trí dòng, dòng tắt / chưa duyệt khi live thật = null). */
function lineAt(core: GameCore, group: string, index: number, liveOnly: boolean): string | null {
  const l = core.configStore.getDialogues().groups[group]?.lines[index];
  return l && l.enabled && (!liveOnly || l.verified) ? l.text : null;
}

/** Nhãn nghề của dân phu theo kiểu nhân vật (nhóm npc_labels: dòng 1 dân phu, dòng 2 thợ mộc, dòng 3 thợ nề; chú tiểu không có). */
export function npcLabel(core: GameCore, look: CharLook, liveOnly: boolean): string {
  if (!core.config.npc.showRole) return '';
  const idx = look === 'danphu_nam' || look === 'danphu_nu' ? 0 : look === 'thomoc' ? 1 : look === 'thone' ? 2 : -1;
  return idx < 0 ? '' : (lineAt(core, 'npc_labels', idx, liveOnly) ?? '');
}

/** Nhân vật trên bản đồ: người xem, người góp công cũ, dân phu (mục 9, 9B). */
export function actorList(core: GameCore, liveOnly: boolean): ActorInfo[] {
  const r = core.roster;
  const names = new Map(core.project.items.map((i) => [i.id, i.name]));
  const subtitle = dialogueLines(core, 'returning_subtitle', liveOnly)[0] ?? null;
  return [
    ...r.list().map((m): ActorInfo => ({ id: m.id, kind: 'viewer', name: m.name, title: m.title })),
    ...r.returningList().map((m): ActorInfo => {
      const item = m.itemId ? names.get(m.itemId) : undefined;
      return { id: m.id, kind: 'returning', name: m.name, title: null, note: item && subtitle ? fillTemplate(subtitle, { item }) : null };
    }),
    ...r.npcList().map((m): ActorInfo => ({ id: m.id, kind: 'npc', name: npcLabel(core, m.look, liveOnly), title: null, look: m.look })),
  ];
}

/** Đám đông vô danh (bảng 9A, chỉ phòng rất đông): số hình người theo số người tương tác 5 phút, chữ bộ đếm. */
export function anonCrowd(core: GameCore, crowd: CrowdTier, liveOnly: boolean): AnonCrowd | null {
  if (crowd !== 'ratdong') return null;
  const a = core.config.ambient;
  const count = core.crowd.info(core.now()).interactors;
  const [lo, hi] = a.crowdSprites;
  const tpl = dialogueLines(core, 'crowd_counter', liveOnly)[0];
  return {
    sprites: Math.max(lo, Math.min(hi, Math.round(count / a.crowdPerSprite))),
    text: tpl ? fillTemplate(tpl, { count: count.toLocaleString('vi-VN') }) : '',
  };
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
    actors: actorList(core, badge !== cfg.labels.testBadge),
    honors: honorStatues(core.db, HONOR_LIMIT).map((h) => ({ id: h.id, seq: h.seq, name: overlayName(core, h.nickname) })),
    characters: {
      heightMap: cfg.characters.heightMap,
      boostSec: cfg.characters.boostSec,
      plusText: cfg.labels.actorPlus,
      maxVehicles: cfg.characters.maxVehicles,
      honorRotateSec: cfg.honor.rotateSec,
      npcPace: cfg.npc.pace,
      birdsEverySec: cfg.ambient.birdsEverySec[crowd],
      npcCartEverySec: cfg.ambient.npcCartEverySec[crowd],
      flags: cfg.ambient.flags,
    },
    anonCrowd: anonCrowd(core, crowd, badge !== cfg.labels.testBadge),
    assetsVersion: assetsVersion(core.rootDir),
  };
}
