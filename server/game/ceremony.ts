// Các loại lễ và bia (mục 10 SPEC, giai đoạn 5); credit cuối công trình (14.12). Không viết cứng chữ: tiêu đề bia, dòng
// "…và N thiện hữu khác", dòng đầu / cuối credit lấy từ kho thoại; chữ giai đoạn mới lấy từ config labels.progress.stage.
// - Xong giai đoạn thường: lễ ngắn (bụi, lóe sáng, chữ giai đoạn mới).
// - Xong giai đoạn có ritual: camera đẩy vào, trụ trì dang tay, bia top người góp của giai đoạn đó.
// - Xong hạng mục: giàn giáo tháo, đèn lồng sáng, bia top người góp của hạng mục; hạng mục lớn thêm múa lân, pháo hoa, hoa đăng.
//   Giai đoạn cuối của hạng mục không có lễ giai đoạn riêng (lễ hạng mục đã gồm).
// - Xong hạng mục cuối: khánh thành toàn công trình (bia top người góp toàn công trình), rồi credit.

import type { CeremonyInfo, CreditsInfo, SteleInfo } from '../../shared/protocol.js';
import { fillTemplate, type ProgressTransition, type ResolvedProject } from '../../shared/project.js';
import type { GameConfig } from '../config/schema.js';
import type { DB } from '../db/database.js';
import { itemContributorCount, stageContributorCount, topItem, topStage, topTotal, type LeaderRow } from './queries.js';

/** Chọn chữ trong kho thoại: câu đầu tiên dùng được của nhóm (đủ biến), ưu tiên câu thỏa `prefer`; đã điền biến. */
export type LinePicker = (group: string, vars: Record<string, string | number>, prefer?: (text: string) => boolean) => string | null;

export interface CeremonyDeps {
  db: DB;
  project: ResolvedProject;
  config: GameConfig;
  line: LinePicker;
  /** Tên hiện trên overlay (đã lọc từ cấm). */
  name: (raw: string) => string;
}

export type SteleTarget = { kind: 'stage'; itemId: string; stageIndex: number } | { kind: 'item'; itemId: string } | { kind: 'project' };

const usesStage = (t: string) => t.includes('{ritual}') || t.includes('{stage}');

/** Số người đã góp công vào toàn công trình. */
export function totalContributorCount(db: DB): number {
  return db.prepare<[], { n: number }>('SELECT COUNT(*) AS n FROM users WHERE total_points > 0').get()?.n ?? 0;
}

/** Bia ghi danh của một giai đoạn, một hạng mục, hoặc toàn công trình (top `ceremony.steleTop` người, mục 10). */
export function steleFor(d: CeremonyDeps, t: SteleTarget): SteleInfo {
  const top = d.config.ceremony.steleTop;
  const item = t.kind === 'project' ? null : d.project.items.find((i) => i.id === t.itemId);
  const itemName = t.kind === 'project' ? d.project.name : (item?.name ?? t.itemId);
  let rows: LeaderRow[];
  let total: number;
  let title: string | null;
  if (t.kind === 'stage') {
    rows = topStage(d.db, t.itemId, t.stageIndex, top);
    total = stageContributorCount(d.db, t.itemId, t.stageIndex);
    const st = item?.stages[t.stageIndex];
    title = d.line('ceremony_title', { item: itemName, stage: st?.name ?? '', ritual: st?.ritual ?? st?.name ?? '' }, usesStage);
  } else {
    rows = t.kind === 'item' ? topItem(d.db, t.itemId, top) : topTotal(d.db, top);
    total = t.kind === 'item' ? itemContributorCount(d.db, t.itemId) : totalContributorCount(d.db);
    title = d.line('ceremony_title', { item: itemName }, (x) => !usesStage(x));
  }
  const others = total - rows.length;
  return {
    title: title ?? itemName,
    rows: rows.map((r) => ({ rank: r.rank, name: d.name(r.nickname), points: r.points })),
    others: others > 0 ? d.line('ceremony_others', { n: others.toLocaleString('vi-VN') }) : null,
  };
}

/** Các lễ ứng với những gì vừa xong (theo thứ tự), kèm bia đã tính ngay lúc xong. */
export function ceremoniesFor(ts: ProgressTransition[], d: CeremonyDeps): CeremonyInfo[] {
  const c = d.config.ceremony;
  const out: CeremonyInfo[] = [];
  for (const t of ts) {
    if (t.type === 'stage_complete') {
      const item = d.project.items.find((i) => i.id === t.itemId);
      if (!item) continue;
      const next = item.stages[t.stageIndex + 1];
      // Giai đoạn cuối: lễ hạng mục đã gồm.
      if (!next) continue;
      if (t.ritual) {
        out.push({
          id: `stage_ritual:${t.itemId}:${t.stageIndex}`,
          kind: 'stage_ritual',
          itemId: t.itemId,
          stageIndex: t.stageIndex,
          size: item.size,
          durationSec: c.stageRitualSec,
          shortSec: Math.min(c.shortSec, c.stageRitualSec),
          banner: null,
          stele: steleFor(d, { kind: 'stage', itemId: t.itemId, stageIndex: t.stageIndex }),
          festival: false,
        });
      } else {
        out.push({
          id: `stage_minor:${t.itemId}:${t.stageIndex}`,
          kind: 'stage_minor',
          itemId: t.itemId,
          stageIndex: t.stageIndex,
          size: item.size,
          durationSec: c.stageMinorSec,
          // Quà rất lớn vượt nhiều giai đoạn: mỗi giai đoạn chỉ khoảng 1 giây (14.4).
          shortSec: Math.min(1, c.stageMinorSec),
          banner: fillTemplate(d.config.labels.progress.stage, { number: t.stageIndex + 2, count: item.stages.length, stage: next.name }),
          stele: null,
          festival: false,
        });
      }
    } else if (t.type === 'item_complete') {
      const full = c.itemSec[t.size];
      out.push({
        id: `item_complete:${t.itemId}`,
        kind: 'item_complete',
        itemId: t.itemId,
        stageIndex: null,
        size: t.size,
        durationSec: full,
        // Nhiều lễ dồn lại: hạng mục nhỏ rút gọn; hạng mục vừa, lớn luôn diễn đủ (14.4).
        shortSec: t.size === 'nho' ? Math.min(c.shortSec, full) : full,
        banner: null,
        stele: steleFor(d, { kind: 'item', itemId: t.itemId }),
        festival: t.size === 'lon',
      });
    } else if (t.type === 'project_complete') {
      out.push({
        id: 'project_complete',
        kind: 'project_complete',
        itemId: null,
        stageIndex: null,
        size: null,
        durationSec: c.projectSec,
        shortSec: c.projectSec,
        banner: null,
        stele: steleFor(d, { kind: 'project' }),
        festival: true,
      });
    }
  }
  return out;
}

/** Admin chiếu lại một bia bất kỳ (mục 10): lễ "replay" chỉ có camera đẩy vào và bia. */
export function replayCeremony(d: CeremonyDeps, t: SteleTarget, id: string): CeremonyInfo {
  const item = t.kind === 'project' ? null : d.project.items.find((i) => i.id === t.itemId);
  return {
    id,
    kind: 'replay',
    itemId: t.kind === 'project' ? null : t.itemId,
    stageIndex: t.kind === 'stage' ? t.stageIndex : null,
    size: item?.size ?? null,
    durationSec: d.config.ceremony.replaySec,
    shortSec: d.config.ceremony.replaySec,
    banner: null,
    stele: steleFor(d, t),
    festival: false,
  };
}

/** Một bia có thể xem lại: giai đoạn có lễ đã xong, hạng mục đã xong, toàn công trình (đã khánh thành). */
export interface SteleEntry {
  kind: 'stage' | 'item' | 'project';
  itemId: string | null;
  itemName: string;
  stageIndex: number | null;
  stageName: string | null;
  ritual: string | null;
  completedAt: number;
}

export function steleEntries(db: DB, project: ResolvedProject): SteleEntry[] {
  const out: SteleEntry[] = [];
  const items = new Map(project.items.map((i) => [i.id, i]));
  for (const r of db
    .prepare<[], { item_id: string; stage_index: number; completed_at: number }>('SELECT item_id, stage_index, completed_at FROM stages WHERE completed_at IS NOT NULL')
    .all()) {
    const it = items.get(r.item_id);
    const st = it?.stages[r.stage_index];
    // Chỉ giai đoạn có lễ, và không phải giai đoạn cuối (đã có bia hạng mục).
    if (!it || !st?.ritual || r.stage_index === it.stages.length - 1) continue;
    out.push({ kind: 'stage', itemId: it.id, itemName: it.name, stageIndex: r.stage_index, stageName: st.name, ritual: st.ritual, completedAt: r.completed_at });
  }
  for (const r of db.prepare<[], { item_id: string; completed_at: number }>('SELECT item_id, completed_at FROM items WHERE completed_at IS NOT NULL').all()) {
    const it = items.get(r.item_id);
    if (it) out.push({ kind: 'item', itemId: it.id, itemName: it.name, stageIndex: null, stageName: null, ritual: null, completedAt: r.completed_at });
  }
  const done = db.prepare<[], { completed_at: number | null }>('SELECT completed_at FROM game_state WHERE id = 1').get()?.completed_at;
  if (done) out.push({ kind: 'project', itemId: null, itemName: project.name, stageIndex: null, stageName: null, ritual: null, completedAt: done });
  return out.sort((a, b) => a.completedAt - b.completedAt || (a.kind === 'item' ? 1 : 0) - (b.kind === 'item' ? 1 : 0));
}

/** Credit cuối công trình: TẤT CẢ người góp công, nhiều công trước, bằng công thì ai đạt trước xếp trên (14.5, 14.12). */
export function creditsOf(d: CeremonyDeps): CreditsInfo {
  const rows = d.db
    .prepare<[], { nickname: string }>('SELECT nickname FROM users WHERE total_points > 0 ORDER BY total_points DESC, reached_seq ASC')
    .all();
  return {
    project: d.project.name,
    title: d.line('credits_title', { count: rows.length.toLocaleString('vi-VN') }) ?? '',
    names: rows.map((r) => d.name(r.nickname)),
    end: d.line('credits_end', {}) ?? '',
  };
}
