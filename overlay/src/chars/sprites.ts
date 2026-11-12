// Ảnh nhân vật theo kiểu, hướng đi, việc đang làm (mục 9). Hàm thuần, có test.
// Tên ảnh sau khi cắt (giai đoạn 4c): chars/<kiểu>_<down|up|right>_<0..3> (0 = đứng yên), chars/<kiểu>_<brick_up|basket_up|wood_down>_<k>
// (mang vác), chars/<kiểu>_<việc>_<k> (làm việc). Thiếu ảnh thì danh sách rỗng, lớp vẽ tự vẽ hình tạm.

import type { CharLook } from '../../../shared/characters.js';
import type { PartKey } from '../../../shared/parts.js';
import type { StageBuild } from '../../../shared/project.js';

export const CHAR_LOOKS: readonly CharLook[] = ['danphu_nam', 'danphu_nu', 'thomoc', 'thone', 'tusi'];
export type WalkDir = 'down' | 'up' | 'right';
export type CarryKind = 'brick' | 'basket' | 'wood';

const CARRY_NAME: Record<CarryKind, string> = { brick: 'brick_up', basket: 'basket_up', wood: 'wood_down' };

export interface LookFrames {
  /** [đứng yên, bước 1, bước 2, bước 3] theo hướng (thiếu khung nào thì bỏ). */
  walk: Record<WalkDir, string[]>;
  carry: Record<CarryKind, string[]>;
  /** Việc → các khung (theo thứ tự). */
  work: Map<string, string[]>;
}

const emptyFrames = (): LookFrames => ({ walk: { down: [], up: [], right: [] }, carry: { brick: [], basket: [], wood: [] }, work: new Map() });

/** Gom tên ảnh trong manifest thành bộ khung theo kiểu nhân vật. */
export function catalog(keys: Iterable<string>): Map<CharLook, LookFrames> {
  const out = new Map<CharLook, LookFrames>();
  const raw = new Map<string, [number, string][]>();
  for (const key of keys) {
    if (!key.startsWith('chars/')) continue;
    const m = /^chars\/(.+)_(\d+)$/.exec(key);
    if (!m) continue;
    const look = CHAR_LOOKS.find((l) => m[1]!.startsWith(`${l}_`));
    if (!look) continue;
    const rest = m[1]!.slice(look.length + 1);
    const id = `${look}|${rest}`;
    if (!raw.has(id)) raw.set(id, []);
    raw.get(id)!.push([Number(m[2]), key]);
  }
  for (const [id, list] of raw) {
    const [look, rest] = id.split('|') as [CharLook, string];
    const frames = list.sort((a, b) => a[0] - b[0]).map(([, k]) => k);
    if (!out.has(look)) out.set(look, emptyFrames());
    const f = out.get(look)!;
    if (rest === 'down' || rest === 'up' || rest === 'right') f.walk[rest] = frames;
    else {
      const carry = (Object.keys(CARRY_NAME) as CarryKind[]).find((c) => CARRY_NAME[c] === rest);
      if (carry) f.carry[carry] = frames;
      else f.work.set(rest, frames);
    }
  }
  return out;
}

/** Nhóm việc theo giai đoạn thi công (mục 9: cắm mốc, đào → cuốc xẻng; dựng cột, khung → khiêng gỗ, kéo dây;
 *  xây tường, lát nền → thợ nề; lợp ngói → chuyền ngói lên giàn giáo). */
export type WorkKind = 'stake' | 'dig' | 'haul' | 'mason' | 'wood' | 'roof' | 'decor' | 'water';

const PART_KIND: Record<PartKey, WorkKind> = { nen: 'mason', cot: 'wood', khung: 'wood', mai: 'roof', tuong: 'mason', trangtri: 'decor', nuoc: 'water' };

export function workKind(build: StageBuild | null | undefined): WorkKind {
  if (!build) return 'mason';
  if (build.parts.length === 0) return build.look === 'coc' ? 'stake' : build.look === 'dao' ? 'dig' : 'haul';
  if (build.look === 'wood') return 'wood';
  if (build.parts.includes('mai')) return 'roof';
  return PART_KIND[build.parts[0]!];
}

/** Việc ưu tiên của từng nhóm (lấy những việc kiểu nhân vật có ảnh, theo thứ tự). */
export const WORK_PREF: Record<WorkKind, string[]> = {
  stake: ['measure', 'rope', 'hammer', 'hoe'],
  dig: ['hoe', 'sand', 'chisel', 'rope'],
  haul: ['sand', 'hoe', 'rope', 'tile'],
  mason: ['lay', 'trowel', 'stone', 'chisel', 'sand', 'hammer', 'hoe'],
  wood: ['rope', 'saw', 'hammer', 'measure', 'carve'],
  roof: ['tile', 'rope'],
  decor: ['carve', 'chisel', 'hammer', 'measure', 'tile'],
  water: ['water', 'hoe', 'sand', 'rope'],
};

/** Các việc (có ảnh) hợp với nhóm việc, tối đa 2 việc đầu theo thứ tự ưu tiên; không có thì việc bất kỳ có ảnh. */
export function workActions(frames: LookFrames | undefined, kind: WorkKind): string[] {
  if (!frames) return [];
  const have = WORK_PREF[kind].filter((a) => (frames.work.get(a)?.length ?? 0) > 0);
  if (have.length) return have.slice(0, 2);
  return [...frames.work.keys()].slice(0, 1);
}

/** Nhóm việc làm trên giàn giáo: tỉ lệ người lên sàn giàn giáo (còn lại đứng dưới đất). */
export function scaffoldShare(kind: WorkKind): number {
  return kind === 'roof' ? 0.75 : kind === 'decor' ? 0.5 : kind === 'wood' || kind === 'mason' ? 0.3 : 0;
}

/** Vật liệu mang vác theo loại đống vật liệu (props). */
export function carryOf(prop: string): CarryKind {
  return prop === 'gach' ? 'brick' : prop === 'go' ? 'wood' : 'basket';
}

/** Khung đi bộ: lặp bước 1 → 2 → 3 → 2 (khung 0 là đứng yên). */
export function walkFrame(frames: string[], t: number, fps = 8): string | null {
  if (!frames.length) return null;
  if (frames.length < 4) return frames[0]!;
  const cycle = [1, 2, 3, 2];
  return frames[cycle[Math.floor(t * fps) % cycle.length]!]!;
}

/** Khung lặp đều (làm việc, mang vác). */
export function loopFrame(frames: string[], t: number, fps: number): string | null {
  if (!frames.length) return null;
  return frames[Math.floor(t * fps) % frames.length]!;
}
