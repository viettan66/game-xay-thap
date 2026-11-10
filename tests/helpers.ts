import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GameCore } from '../server/core.js';
import type { GameConfig } from '../server/config/schema.js';
import type { LiveUser } from '../shared/types.js';

export const REPO_ROOT = path.resolve(import.meta.dirname, '..');

/** Thư mục tạm có config/defaults giống dự án thật. */
export function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'btp-test-'));
  fs.cpSync(path.join(REPO_ROOT, 'config', 'defaults'), path.join(root, 'config', 'defaults'), { recursive: true });
  return root;
}

export function removeTempRoot(root: string): void {
  fs.rmSync(root, { recursive: true, force: true });
}

/** Đồng hồ giả để test chạy đúng thời gian mong muốn. */
export class FakeClock {
  constructor(public t: number) {}
  now = (): number => this.t;
  advance(ms: number): void {
    this.t += ms;
  }
}

export function openTestCore(root: string, clock: FakeClock, patch?: (c: GameConfig) => void): GameCore {
  if (patch) {
    const file = path.join(root, 'config', 'defaults', 'config.json');
    const cfg = JSON.parse(fs.readFileSync(file, 'utf8')) as GameConfig;
    patch(cfg);
    fs.mkdirSync(path.join(root, 'config'), { recursive: true });
    fs.writeFileSync(path.join(root, 'config', 'config.json'), JSON.stringify(cfg));
  }
  return GameCore.open({ rootDir: root, profile: 'test', now: clock.now });
}

/** Tắt mọi sự kiện nhân điểm để test không phụ thuộc ngày âm lịch. */
export function disableEvents(root: string): void {
  fs.mkdirSync(path.join(root, 'config'), { recursive: true });
  fs.writeFileSync(path.join(root, 'config', 'events.json'), JSON.stringify({ events: [] }));
}

export const viewer = (n: number, nickname = `Người xem ${n}`): LiveUser => ({
  platformId: `p${n}`,
  uniqueId: `u${n}`,
  nickname,
});
