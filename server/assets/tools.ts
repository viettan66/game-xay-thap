// Lệnh của trang /tools/assets: chỉnh điểm căn tầng tháp, vị trí đặt tháp, tỉ lệ chóp, chọn bản nền.

import { z } from 'zod';
import { FLOOR_STAGE_KEYS, SPIRE_KEY, type Manifest } from '../../shared/manifest.js';
import { formatZodError } from '../config/schema.js';
import { ManifestError } from './manifest.js';

const tuneKeys: [string, ...string[]] = [SPIRE_KEY, ...FLOOR_STAGE_KEYS];

export const toolUpdateSchema = z.strictObject({
  pieces: z
    .partialRecord(z.enum(tuneKeys), z.strictObject({ eaveLineY: z.number().min(0), topY: z.number().min(0) }))
    .optional(),
  towerAnchor: z.strictObject({ x: z.number().min(0).max(1080), y: z.number().min(0).max(1920) }).optional(),
  spireScale: z.number().min(0.3).max(3).optional(),
  floor1WidthPx: z.number().int().min(100).max(1000).optional(),
  towerTaper: z.number().min(0.9).max(1).optional(),
});

export type ToolUpdate = z.infer<typeof toolUpdateSchema>;

export function parseToolUpdate(raw: unknown): ToolUpdate {
  const r = toolUpdateSchema.safeParse(raw);
  if (!r.success) throw new ManifestError(formatZodError(r.error));
  return r.data;
}

/** Áp phần chỉnh vào manifest (bản sao mới). Ảnh được chỉnh tay đánh dấu tuned để chạy lại script không ghi đè. */
export function applyToManifest(m: Manifest, u: ToolUpdate): Manifest {
  const next: Manifest = structuredClone(m);
  for (const [key, v] of Object.entries(u.pieces ?? {})) {
    if (!v) continue;
    const e = next.images[key];
    if (!e) throw new ManifestError([`Manifest chưa có ảnh ${key}`]);
    if (v.topY >= v.eaveLineY) throw new ManifestError([`${key}: topY phải nhỏ hơn eaveLineY`]);
    if (v.eaveLineY > e.h) throw new ManifestError([`${key}: eaveLineY vượt quá chiều cao ảnh (${e.h})`]);
    const changed = v.eaveLineY !== e.eaveLineY || v.topY !== e.topY;
    e.eaveLineY = Math.round(v.eaveLineY);
    e.topY = Math.round(v.topY);
    if (changed) e.tuned = true;
  }
  // Các ảnh tầng phải dùng chung eaveLineY (cùng khung, căn theo mép dưới dải ngói).
  const floorEave = new Set(FLOOR_STAGE_KEYS.map((k) => next.images[k]?.eaveLineY).filter((v) => v !== undefined));
  if (floorEave.size > 1) throw new ManifestError(['5 ảnh tầng phải có cùng eaveLineY']);
  if (u.towerAnchor) next.background.towerAnchor = { x: Math.round(u.towerAnchor.x), y: Math.round(u.towerAnchor.y) };
  if (u.spireScale !== undefined) next.tower.spireScale = Math.round(u.spireScale * 1000) / 1000;
  return next;
}
