// Ghép các phần của server: hồ sơ, config, DB, lõi game, phiên live, backup.
// Dùng chung cho server thật (main.ts), script demo và test.

import path from 'node:path';
import type { LiveEvent } from '../shared/types.js';
import { createBackup, isDailyBackupDue, listBackups } from './backup.js';
import type { GameConfig } from './config/schema.js';
import { ConfigStore, type ConfigChange } from './config/store.js';
import { openDatabase, type DB } from './db/database.js';
import { GameEngine, type ProcessResult, type RepricePreview } from './game/engine.js';
import { silentLogger, type Logger } from './logger.js';
import { ensureProfileDirs, profilePaths, type ProfileName, type ProfilePaths } from './profile.js';
import { SessionManager } from './session.js';

export interface CoreOptions {
  rootDir: string;
  profile: ProfileName;
  /** Thư mục config (mặc định <rootDir>/config). */
  configDir?: string;
  now?: () => number;
  logger?: Logger;
}

export type SaveConfigResult =
  | { status: 'saved'; changes: ConfigChange[]; repriced: RepricePreview | null }
  | { status: 'needs_confirmation'; reprice: RepricePreview };

export class GameCore {
  readonly rootDir: string;
  readonly paths: ProfilePaths;
  readonly configDir: string;
  readonly configStore: ConfigStore;
  readonly db: DB;
  readonly engine: GameEngine;
  readonly sessions: SessionManager;
  readonly createdConfigFiles: string[];
  readonly now: () => number;
  private readonly log: Logger;
  private pendingBackups: Promise<unknown>[] = [];

  private constructor(o: CoreOptions) {
    this.now = o.now ?? Date.now;
    this.log = o.logger ?? silentLogger;
    this.rootDir = o.rootDir;
    this.paths = profilePaths(o.rootDir, o.profile);
    this.configDir = o.configDir ?? path.join(o.rootDir, 'config');

    // Đọc config trước: config lỗi thì dừng ngay, chưa đụng tới DB.
    this.configStore = new ConfigStore(this.configDir);
    this.createdConfigFiles = this.configStore.load();

    ensureProfileDirs(this.paths);
    this.db = openDatabase(this.paths.dbFile);
    this.sessions = new SessionManager(this.db, {
      now: this.now,
      autoEndOfflineMin: () => this.config.session.autoEndOfflineMin,
      onStart: (s) => this.log.info(`Bắt đầu phiên live #${s.id} (${s.start_reason})`),
      onEnd: (s) => {
        this.log.info(`Kết thúc phiên live #${s.id} (${s.end_reason})`);
        this.backup('session-end');
      },
    });
    this.engine = new GameEngine({
      db: this.db,
      config: () => this.config,
      events: () => this.configStore.getEvents(),
      sessionId: () => this.sessions.currentId(),
      now: this.now,
    });
    this.engine.init();
    this.sessions.recoverOnBoot();
  }

  static open(o: CoreOptions): GameCore {
    return new GameCore(o);
  }

  get config(): GameConfig {
    return this.configStore.get();
  }

  get profile(): ProfileName {
    return this.paths.profile;
  }

  processEvent(ev: LiveEvent): ProcessResult {
    return this.engine.processEvent(ev);
  }

  /**
   * Lưu config mới (14.10). Nếu giá tầng ĐANG xây thay đổi mà chưa có xác nhận,
   * trả về "needs_confirmation" và KHÔNG lưu gì. confirmReprice = false: lưu config,
   * giữ giá cũ cho tầng đang xây (chỉ tầng sau dùng giá mới).
   */
  saveConfig(next: unknown, opts: { source: string; confirmReprice?: boolean }): SaveConfigResult {
    const valid = this.configStore.validateConfig(next);
    const reprice = this.engine.previewReprice(valid.tower);
    if (reprice && opts.confirmReprice === undefined) return { status: 'needs_confirmation', reprice };

    const changes = this.configStore.saveConfig(valid);
    this.logChanges(changes, opts.source);
    let repriced: RepricePreview | null = null;
    if (reprice && opts.confirmReprice) {
      this.engine.applyReprice(valid.tower);
      repriced = reprice;
      this.log.info(`Đổi giá tầng ${reprice.floor}: ${reprice.oldCost} → ${reprice.newCost}`);
    }
    return { status: 'saved', changes, repriced };
  }

  saveEvents(next: unknown, opts: { source: string }): ConfigChange[] {
    const changes = this.configStore.saveEvents(next);
    this.logChanges(changes, opts.source);
    return changes;
  }

  private logChanges(changes: ConfigChange[], source: string): void {
    if (changes.length === 0) return;
    const ts = this.now();
    const insert = this.db.prepare(
      'INSERT INTO config_changes (ts, file, path, old_json, new_json, source) VALUES (?, ?, ?, ?, ?, ?)',
    );
    this.db.transaction(() => {
      for (const c of changes) {
        insert.run(ts, c.file, c.path, JSON.stringify(c.oldValue ?? null), JSON.stringify(c.newValue ?? null), source);
      }
    })();
    this.log.info(`Đã lưu ${changes.length} thay đổi config (${source})`);
  }

  /** Tạo bản backup (chạy nền). Lỗi được ghi log, không làm dừng game. */
  backup(reason: string): Promise<string | null> {
    const p = createBackup({
      db: this.db,
      backupsDir: this.paths.backupsDir,
      configDir: this.configDir,
      keep: this.config.backup.keep,
      reason,
      ts: this.now(),
    })
      .then((folder) => {
        this.log.info(`Đã backup: ${path.basename(folder)}`);
        return folder;
      })
      .catch((e: unknown) => {
        this.log.error('Backup thất bại', e);
        return null;
      });
    this.pendingBackups.push(p);
    return p;
  }

  /** Gọi định kỳ: tự kết thúc phiên khi tắt live quá lâu, backup hằng ngày. */
  tick(): void {
    this.sessions.tick();
    if (isDailyBackupDue(this.now(), this.config.backup.dailyTime, listBackups(this.paths.backupsDir))) {
      void this.backup('daily');
    }
  }

  /** Chờ các bản backup đang chạy xong rồi đóng DB. */
  async close(): Promise<void> {
    await Promise.all(this.pendingBackups);
    if (this.db.open) this.db.close();
  }

}
