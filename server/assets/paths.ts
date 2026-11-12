// Lối đi và ô ghi danh (giai đoạn 4c): file assets/map-paths.json (chỉnh trên trang /tools/paths),
// được chép vào manifest.map (paths, honorSlots) để overlay đọc cùng bản đồ.

import fs from 'node:fs';
import path from 'node:path';
import type { MapPaths } from '../../shared/paths.js';
import { formatZodError } from '../config/schema.js';
import { loadManifest, ManifestError, mapPathsSchema, saveManifest } from './manifest.js';

export const PATHS_FILE = path.join('assets', 'map-paths.json');

export function loadPaths(root: string): MapPaths | null {
  const file = path.join(root, PATHS_FILE);
  if (!fs.existsSync(file)) return null;
  return validatePaths(JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')));
}

export function validatePaths(raw: unknown): MapPaths {
  const r = mapPathsSchema.safeParse(raw);
  if (!r.success) throw new ManifestError(formatZodError(r.error));
  const ids = new Set<string>();
  for (const p of r.data.paths) {
    if (ids.has(p.id)) throw new ManifestError([`Hai lối đi trùng mã "${p.id}"`]);
    ids.add(p.id);
  }
  return { paths: r.data.paths, honorSlots: r.data.honorSlots };
}

/** Ghi file lối đi (giữ dòng ghi chú) rồi chép vào manifest. */
export function savePaths(root: string, next: unknown): MapPaths {
  const valid = validatePaths(next);
  const file = path.join(root, PATHS_FILE);
  let note: string | undefined;
  try {
    note = (JSON.parse(fs.readFileSync(file, 'utf8')) as { _ghi_chu?: string })._ghi_chu;
  } catch {
    note = undefined;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, `${JSON.stringify({ ...(note ? { _ghi_chu: note } : {}), ...valid }, null, 2)}\n`, 'utf8');
  fs.renameSync(`${file}.tmp`, file);
  syncManifestPaths(root);
  return valid;
}

/** Chép lối đi vào manifest.map (nếu khác). Trả về true nếu có ghi. */
export function syncManifestPaths(root: string): boolean {
  const m = loadManifest(root);
  const p = loadPaths(root);
  if (!m?.map || !p) return false;
  if (JSON.stringify(m.map.paths ?? null) === JSON.stringify(p.paths) && JSON.stringify(m.map.honorSlots ?? null) === JSON.stringify(p.honorSlots)) return false;
  saveManifest(root, { ...m, map: { ...m.map, paths: p.paths, honorSlots: p.honorSlots } });
  return true;
}
