// Đọc, kiểm tra, lưu assets/manifest.json. Thiếu manifest hoặc thiếu ảnh thì game vẫn chạy (vẽ hình tạm).

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { Manifest } from '../../shared/manifest.js';
import { formatZodError } from '../config/schema.js';
import { PART_KEYS } from '../../shared/parts.js';

const point = z.strictObject({ x: z.number(), y: z.number() });
const entry = z.strictObject({
  file: z.string().regex(/^[a-z0-9_/]+\.png$/, 'Tên file phải là chữ thường không dấu, đuôi .png'),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
  anchor: point,
});

const mapFile = (ext: string) => z.string().regex(new RegExp(`^[a-z0-9_/]+\\.(${ext})$`), 'Tên file phải là chữ thường không dấu');
const rect = { x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive() };
const mapSchema = z.strictObject({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  scale: z.number().positive(),
  rawWidth: z.number().int().positive(),
  rawHeight: z.number().int().positive(),
  overlap: z.number().int().min(0),
  source: z.enum(['esrgan', 'lanczos']),
  tiles: z.array(z.strictObject({ file: mapFile('jpg|png'), y: z.number().int().min(0), h: z.number().int().positive() })).min(1),
  reference: mapFile('jpg|png').nullable(),
  buildings: z.array(
    z.strictObject({
      id: z.string().regex(/^[a-z0-9_]+$/),
      items: z.array(z.string()).min(1),
      layer: z.enum(['ground', 'object']),
      file: mapFile('png'),
      ...rect,
      baseY: z.number(),
      fg: z.strictObject({ file: mapFile('png'), ...rect }).nullable(),
      tierLinesY: z.array(z.number()).optional(),
      parts: z
        .strictObject({ keys: z.array(z.enum(PART_KEYS)), ...rect, source: z.enum(['auto', 'edited']) })
        .nullable()
        .optional(),
    }),
  ),
});

export const manifestSchema = z.strictObject({
  version: z.literal(1),
  images: z.record(z.string(), entry),
  map: mapSchema.optional(),
});

export class ManifestError extends Error {
  constructor(readonly problems: string[]) {
    super(`assets/manifest.json có lỗi:\n- ${problems.join('\n- ')}`);
  }
}

export function manifestPath(rootDir: string): string {
  return path.join(rootDir, 'assets', 'manifest.json');
}

export function gameAssetsDir(rootDir: string): string {
  return path.join(rootDir, 'assets', 'game');
}

/** Khóa và ảnh của bản tháp cũ (đã bỏ sau R4): manifest cũ còn thì tự bỏ đi khi đọc. */
const LEGACY_KEYS = ['background', 'tower'];
const LEGACY_IMAGE = /^(tower|bg)\//;
const LEGACY_ENTRY_KEYS = ['eaveLineY', 'topY', 'bottomY', 'eaveWidth', 'auto', 'tuned'];

export function stripLegacyManifest(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const m = { ...(raw as Record<string, unknown>) };
  for (const k of LEGACY_KEYS) delete m[k];
  if (m.images && typeof m.images === 'object') {
    const images: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(m.images as Record<string, unknown>)) {
      if (LEGACY_IMAGE.test(k)) continue;
      if (v && typeof v === 'object') {
        const e = { ...(v as Record<string, unknown>) };
        for (const x of LEGACY_ENTRY_KEYS) delete e[x];
        images[k] = e;
      } else images[k] = v;
    }
    m.images = images;
  }
  return m;
}

export function validateManifest(raw: unknown): Manifest {
  const r = manifestSchema.safeParse(stripLegacyManifest(raw));
  if (!r.success) throw new ManifestError(formatZodError(r.error));
  return r.data as Manifest;
}

/** Đọc manifest; chưa có thì trả về null (overlay vẽ hình tạm). */
export function loadManifest(rootDir: string): Manifest | null {
  const file = manifestPath(rootDir);
  if (!fs.existsSync(file)) return null;
  return validateManifest(JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')));
}

export function saveManifest(rootDir: string, m: Manifest): void {
  const valid = validateManifest(m);
  const file = manifestPath(rootDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(valid, null, 2) + '\n', 'utf8');
  fs.renameSync(`${file}.tmp`, file);
}

/** Mã phiên bản ảnh: đổi khi manifest đổi, để overlay biết mà tải lại. */
const versionCache = new Map<string, { stamp: string; version: string }>();

export function assetsVersion(rootDir: string): string {
  const file = manifestPath(rootDir);
  if (!fs.existsSync(file)) return 'none';
  const st = fs.statSync(file);
  const stamp = `${st.mtimeMs}:${st.size}`;
  const cached = versionCache.get(file);
  if (cached?.stamp === stamp) return cached.version;
  const version = crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex').slice(0, 12);
  versionCache.set(file, { stamp, version });
  return version;
}

/** Danh sách ảnh khai báo trong manifest (kể cả bản đồ) mà file không tồn tại. */
export function missingFiles(rootDir: string, m: Manifest): string[] {
  const dir = gameAssetsDir(rootDir);
  const files = Object.values(m.images).map((e) => e.file);
  if (m.map) {
    files.push(...m.map.tiles.map((t) => t.file));
    for (const b of m.map.buildings) files.push(b.file, ...(b.fg ? [b.fg.file] : []));
  }
  return files.filter((f) => !fs.existsSync(path.join(dir, f)));
}
