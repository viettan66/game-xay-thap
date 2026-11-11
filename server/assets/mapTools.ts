// Phần bản đồ của trang /tools/assets (mục 7, R2): xem khung cắt, sửa khung / baseY / mép tầng tháp, cắt lại.
// Đổi khung một phần object thì chạy lại rembg cho công trình đó (scripts/assets/map_segment.py, cần .venv),
// rồi dựng lại cả bản đồ (vì phần nền trừ đi mọi công trình). Mỗi lúc chỉ chạy một lần cắt.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { buildMap, cutsPath, formatCuts, loadCuts, MapCutError, missingSegments, saveCuts, validateCuts, type CutBuilding, type MapCuts } from './mapCut.js';
import type { MapManifest } from '../../shared/map.js';

export interface MapTools {
  /** Chạy rembg cho các công trình (mã). */
  segment(ids: string[]): Promise<void>;
  /** Dựng lại bản đồ, trả về phần map của manifest. */
  build(): Promise<MapManifest>;
  /** Có Python + rembg để tách lại không. */
  canSegment(): boolean;
}

export function pythonPath(root: string): string {
  return process.platform === 'win32' ? path.join(root, '.venv', 'Scripts', 'python.exe') : path.join(root, '.venv', 'bin', 'python');
}

/** Cách làm thật: gọi script Python và bộ cắt bản đồ. */
export function defaultMapTools(root: string): MapTools {
  return {
    canSegment: () => fs.existsSync(pythonPath(root)),
    segment: (ids) =>
      new Promise((resolve, reject) => {
        const py = pythonPath(root);
        if (!fs.existsSync(py)) {
          reject(new MapCutError(['Chưa cài Python + rembg (.venv) nên chưa tách lại được. Xem README mục 3b.']));
          return;
        }
        const child = spawn(py, [path.join(root, 'scripts', 'assets', 'map_segment.py'), ...ids], { cwd: root, windowsHide: true });
        let out = '';
        child.stdout.on('data', (d: Buffer) => (out += d.toString('utf8')));
        child.stderr.on('data', (d: Buffer) => (out += d.toString('utf8')));
        child.on('error', (e) => reject(new MapCutError([`Không chạy được Python: ${e.message}`])));
        child.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new MapCutError([`Tách nền (rembg) lỗi, mã ${code}: ${out.trim().split('\n').slice(-3).join(' | ')}`]));
        });
      }),
    build: () => buildMap(root),
  };
}

const sameBoxes = (a: CutBuilding | undefined, b: CutBuilding) =>
  !!a &&
  a.parts.length === b.parts.length &&
  a.parts.every((p, k) => p.mode === b.parts[k]!.mode && p.box.join() === b.parts[k]!.box.join());

/**
 * Lưu khung cắt mới của một công trình rồi cắt lại. Khung object đổi thì tách nền lại công trình đó.
 * Lỗi thì trả file khung cắt về như cũ.
 */
export async function updateBuildingCut(root: string, tools: MapTools, next: unknown): Promise<{ cuts: MapCuts; map: MapManifest }> {
  const old = loadCuts(root);
  const draft = structuredClone(old);
  const nb = next as CutBuilding;
  const idx = draft.buildings.findIndex((b) => b.id === nb?.id);
  if (idx < 0) throw new MapCutError([`Không có công trình "${String(nb?.id)}"`]);
  draft.buildings[idx] = nb;
  const cuts = validateCuts(draft);
  const building = cuts.buildings[idx]!;
  const oldText = fs.readFileSync(cutsPath(root), 'utf8');
  saveCuts(root, cuts);
  try {
    const needSegment = !sameBoxes(old.buildings[idx], building) || missingSegments(root, cuts).includes(building.id);
    if (needSegment && building.parts.some((p) => p.mode === 'object')) await tools.segment([building.id]);
    const map = await tools.build();
    return { cuts, map };
  } catch (e) {
    fs.writeFileSync(cutsPath(root), oldText, 'utf8');
    throw e;
  }
}

/** Hàng đợi: mỗi lúc chỉ một lần cắt (cắt lại cả bản đồ mất vài giây). */
export class MapCutQueue {
  private last: Promise<unknown> = Promise.resolve();
  run<T>(job: () => Promise<T>): Promise<T> {
    const p = this.last.then(job, job);
    this.last = p.catch(() => undefined);
    return p;
  }
}

export { formatCuts };
