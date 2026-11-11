// Đọc, kiểm tra, lưu assets/manifest.json. Thiếu manifest hoặc thiếu ảnh thì game vẫn chạy (vẽ hình tạm).

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { BackgroundVariant, Manifest } from '../../shared/manifest.js';
import { formatZodError } from '../config/schema.js';
import { PART_KEYS } from '../../shared/parts.js';

const point = z.strictObject({ x: z.number(), y: z.number() });
const entry = z.strictObject({
  file: z.string().regex(/^[a-z0-9_/]+\.png$/, 'Tên file phải là chữ thường không dấu, đuôi .png'),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
  anchor: point,
  eaveLineY: z.number().optional(),
  topY: z.number().optional(),
  bottomY: z.number().optional(),
  eaveWidth: z.number().positive().optional(),
  auto: z.strictObject({ eaveLineY: z.number(), topY: z.number() }).optional(),
  tuned: z.boolean().optional(),
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

export const manifestSchema = z
  .strictObject({
    version: z.literal(1),
    images: z.record(z.string(), entry),
    background: z.strictObject({
      variant: z.string(),
      variants: z.array(
        z.strictObject({ key: z.string(), label: z.string(), background: z.string(), sky: z.string() }),
      ),
      towerAnchor: point,
      skyOverlap: z.number().int().min(0).max(1000),
    }),
    tower: z.strictObject({ spireScale: z.number().min(0.3).max(3) }),
    map: mapSchema.optional(),
  })
  .refine((m) => Object.values(m.images).every((e) => e.topY === undefined || e.eaveLineY === undefined || e.topY < e.eaveLineY), {
    message: 'topY phải nằm phía trên eaveLineY',
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

export function validateManifest(raw: unknown): Manifest {
  const r = manifestSchema.safeParse(raw);
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

/** Dùng một bản nền làm chính thức: chép thành bg/background.png và bg/sky_upper.png. */
export function chooseBackground(rootDir: string, variants: BackgroundVariant[], key: string): void {
  const v = variants.find((x) => x.key === key);
  if (!v) throw new ManifestError([`Không có bản nền "${key}"`]);
  const dir = gameAssetsDir(rootDir);
  fs.mkdirSync(path.join(dir, 'bg'), { recursive: true });
  fs.copyFileSync(path.join(dir, v.background), path.join(dir, 'bg', 'background.png'));
  fs.copyFileSync(path.join(dir, v.sky), path.join(dir, 'bg', 'sky_upper.png'));
}
