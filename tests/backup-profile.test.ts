import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isDailyBackupDue, listBackups, selectBackupsToDelete } from '../server/backup.js';
import { profilePaths, resolveProfile } from '../server/profile.js';
import { vnTs } from '../shared/time.js';
import { disableEvents, FakeClock, makeTempRoot, openTestCore, removeTempRoot, viewer } from './helpers.js';
import { GameCore } from '../server/core.js';

let root: string;
beforeEach(() => {
  root = makeTempRoot();
  disableEvents(root);
});
afterEach(() => {
  removeTempRoot(root);
});

describe('backup (mục 6)', () => {
  it('giữ N bản mới nhất, xóa bản cũ nhất', () => {
    const names = ['20261103-040000_daily', '20261101-040000_daily', '20261102-220000_session-end'];
    expect(selectBackupsToDelete(names, 2)).toEqual(['20261101-040000_daily']);
    expect(selectBackupsToDelete(names, 5)).toEqual([]);
  });

  it('backup hằng ngày: tới giờ và hôm nay chưa có bản daily', () => {
    const t = vnTs(2026, 11, 10, 4, 0);
    expect(isDailyBackupDue(vnTs(2026, 11, 10, 3, 59), '04:00', [])).toBe(false);
    expect(isDailyBackupDue(t, '04:00', [])).toBe(true);
    expect(isDailyBackupDue(t, '04:00', ['20261110-040012_daily'])).toBe(false);
    expect(isDailyBackupDue(t, '04:00', ['20261110-010000_session-end'])).toBe(true);
    expect(isDailyBackupDue(t, '04:00', ['20261109-040000_daily'])).toBe(true);
  });

  it('kết thúc phiên thì tạo backup có DB và config; chỉ giữ số bản theo config', async () => {
    const clock = new FakeClock(vnTs(2026, 11, 10, 20));
    const core = openTestCore(root, clock, (c) => {
      c.backup.keep = 2;
    });
    for (let i = 0; i < 3; i++) {
      core.sessions.startManual();
      core.processEvent({ type: 'like', user: viewer(1), count: 10, ts: clock.t });
      clock.advance(60_000);
      core.sessions.endManual();
      clock.advance(60_000);
    }
    await core.close();

    const list = listBackups(core.paths.backupsDir);
    expect(list).toHaveLength(2);
    const newest = path.join(core.paths.backupsDir, list.at(-1)!);
    expect(fs.readdirSync(newest).sort()).toEqual(['config.json', 'events.json', 'game.db']);
    const copy = new Database(path.join(newest, 'game.db'), { readonly: true });
    expect((copy.prepare('SELECT total_points AS n FROM users').get() as { n: number }).n).toBe(30);
    copy.close();
  });
});

describe('hồ sơ dữ liệu (14.2)', () => {
  it('chọn hồ sơ bằng --profile hoặc GAME_PROFILE, mặc định là test', () => {
    expect(resolveProfile(['--profile=production'], {})).toBe('production');
    expect(resolveProfile([], { GAME_PROFILE: 'production' })).toBe('production');
    expect(resolveProfile([], {})).toBe('test');
    expect(() => resolveProfile(['--profile=that'], {})).toThrow(/không hợp lệ/);
  });

  it('production và test có DB, avatar, backup, log riêng', () => {
    const p = profilePaths(root, 'production');
    const t = profilePaths(root, 'test');
    for (const k of ['dbFile', 'avatarsDir', 'backupsDir', 'logsDir'] as const) expect(p[k]).not.toBe(t[k]);
    expect(p.dbFile).toBe(path.join(root, 'data', 'production', 'game.db'));
  });

  it('dữ liệu của hồ sơ test không lẫn sang production', async () => {
    const clock = new FakeClock(vnTs(2026, 11, 10, 20));
    const test = GameCore.open({ rootDir: root, profile: 'test', now: clock.now });
    test.processEvent({ type: 'gift', user: viewer(1), giftId: 'g', giftName: 'G', coinValueEach: 10, count: 1, ts: clock.t });
    await test.close();
    const prod = GameCore.open({ rootDir: root, profile: 'production', now: clock.now });
    expect(prod.engine.status().totalPoints).toBe(0);
    await prod.close();
  });
});
