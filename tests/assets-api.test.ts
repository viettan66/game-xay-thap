// API ảnh game và trang /tools/assets, chạy trên thư mục tạm có manifest và ảnh nhỏ.

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ManifestError, validateManifest } from '../server/assets/manifest.js';
import { silentLogger } from '../server/logger.js';
import { startServer, type RunningServer } from '../server/server.js';
import type { Manifest } from '../shared/manifest.js';
import { disableEvents, makeTempRoot, removeTempRoot } from './helpers.js';

let root: string;
let srv: RunningServer | null = null;

function sampleManifest(): Manifest {
  return {
    version: 1,
    images: {
      'abbot/abbot_pray': { file: 'abbot/abbot_pray.png', w: 40, h: 50, anchor: { x: 20, y: 50 } },
      'ui/medal_gold': { file: 'ui/medal_gold.png', w: 30, h: 30, anchor: { x: 15, y: 15 } },
    },
  };
}

async function png(file: string, color: { r: number; g: number; b: number }) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await sharp({ create: { width: 4, height: 4, channels: 4, background: { ...color, alpha: 1 } } }).png().toFile(file);
}

beforeEach(async () => {
  root = makeTempRoot();
  disableEvents(root);
  const game = path.join(root, 'assets', 'game');
  for (const e of Object.values(sampleManifest().images)) await png(path.join(game, e.file), { r: 200, g: 0, b: 0 });
  fs.writeFileSync(path.join(root, 'assets', 'manifest.json'), JSON.stringify(sampleManifest()));
});
afterEach(async () => {
  await srv?.close();
  srv = null;
  removeTempRoot(root);
});

const start = async () => {
  srv = await startServer({ rootDir: root, profile: 'test', logger: silentLogger, port: 0, simulatorTimer: false });
  return srv;
};

describe('kiểm tra manifest', () => {
  it('tên file sai thì báo lỗi', () => {
    const m = sampleManifest();
    m.images['abbot/abbot_pray']!.file = 'Abbot Pray.PNG';
    expect(() => validateManifest(m)).toThrow(ManifestError);
  });

  it('manifest của bản tháp cũ: tự bỏ phần tháp, nền tháp, thông số căn tầng', () => {
    const old = {
      ...sampleManifest(),
      images: {
        ...sampleManifest().images,
        'tower/spire': { file: 'tower/spire.png', w: 40, h: 50, anchor: { x: 20, y: 40 }, eaveLineY: 40, topY: 5 },
        'bg/background': { file: 'bg/background.png', w: 1080, h: 1920, anchor: { x: 0, y: 0 } },
        'chars/a': { file: 'chars/a.png', w: 10, h: 10, anchor: { x: 5, y: 10 }, tuned: true },
      },
      background: { variant: 'A', variants: [], towerAnchor: { x: 508, y: 1215 }, skyOverlap: 150 },
      tower: { spireScale: 1 },
    };
    const m = validateManifest(old);
    expect(Object.keys(m.images).sort()).toEqual(['abbot/abbot_pray', 'chars/a', 'ui/medal_gold']);
    expect(m.images['chars/a']).toEqual({ file: 'chars/a.png', w: 10, h: 10, anchor: { x: 5, y: 10 } });
    expect('background' in m).toBe(false);
    expect('tower' in m).toBe(false);
  });
});

describe('server phục vụ ảnh và trang /tools/assets', () => {
  it('trả manifest và file ảnh; ảnh không có thì 404', async () => {
    await start();
    const m = (await (await fetch(`${srv!.url}/assets/manifest.json`)).json()) as Manifest;
    expect(Object.keys(m.images)).toContain('abbot/abbot_pray');
    const img = await fetch(`${srv!.url}/assets/game/abbot/abbot_pray.png`);
    expect(img.status).toBe(200);
    expect(img.headers.get('content-type')).toContain('image/png');
    expect((await fetch(`${srv!.url}/assets/game/khong-co.png`)).status).toBe(404);
  });

  it('chưa có manifest thì báo 404 kèm hướng dẫn, game vẫn chạy', async () => {
    fs.rmSync(path.join(root, 'assets', 'manifest.json'));
    await start();
    const r = await fetch(`${srv!.url}/assets/manifest.json`);
    expect(r.status).toBe(404);
    expect(((await r.json()) as { error: string }).error).toContain('assets:build');
    expect((await fetch(`${srv!.url}/api/status`)).status).toBe(200);
  });

  it('danh sách ảnh và file thiếu cho trang /tools/assets', async () => {
    fs.rmSync(path.join(root, 'assets', 'game', 'ui', 'medal_gold.png'));
    await start();
    const r = (await (await fetch(`${srv!.url}/api/tools/assets`)).json()) as { manifest: Manifest; missing: string[] };
    expect(Object.keys(r.manifest.images)).toHaveLength(2);
    expect(r.missing).toEqual(['ui/medal_gold.png']);
  });

  it('trang /tools/assets: chưa đóng gói thì báo cách làm', async () => {
    await start();
    const r = await fetch(`${srv!.url}/tools/assets`);
    expect(r.status).toBe(503);
    expect(await r.text()).toContain('npm run build');
  });
});
