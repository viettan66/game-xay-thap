// Ghép các phần của server: hồ sơ, config, DB, lõi game, phiên live, backup.
// Dùng chung cho server thật (main.ts), script demo và test.

import path from 'node:path';
import { resolveProject, type ApplyResult, type ProjectFile, type ResolvedProject } from '../shared/project.js';
import type { LiveEvent } from '../shared/types.js';
import { createBackup, isDailyBackupDue, listBackups } from './backup.js';
import type { GameConfig } from './config/schema.js';
import { ConfigError, ConfigStore, PROJECT_FILE, type ConfigChange } from './config/store.js';
import { openDatabase, type DB } from './db/database.js';
import { retireLegacyTowerDb } from './db/legacy.js';
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

export interface SaveConfigResult {
  status: 'saved';
  changes: ConfigChange[];
}

export type SaveProjectResult =
  | { status: 'saved'; changes: ConfigChange[]; repriced: RepricePreview | null; progress: ApplyResult[] }
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
  private resolved: { file: ProjectFile; project: ResolvedProject } | null = null;

  private constructor(o: CoreOptions) {
    this.now = o.now ?? Date.now;
    this.log = o.logger ?? silentLogger;
    this.rootDir = o.rootDir;
    this.paths = profilePaths(o.rootDir, o.profile);
    this.configDir = o.configDir ?? path.join(o.rootDir, 'config');

    // Đọc config trước: config lỗi thì dừng ngay, chưa đụng tới DB.
    this.configStore = new ConfigStore(this.configDir);
    this.createdConfigFiles = this.configStore.load();
    if (this.configStore.upgradedKeys.length > 0) {
      this.log.info(`Đã dọn khóa của bản tháp cũ khỏi config.json: ${this.configStore.upgradedKeys.join(', ')}`);
    }
    if (this.configStore.upgradedProjectStages > 0) {
      this.log.info(`Đã chuyển ${this.configStore.upgradedProjectStages} giai đoạn trong project.json sang cách xây từng mảnh (visual → build)`);
    }

    ensureProfileDirs(this.paths);
    const retired = retireLegacyTowerDb(this.paths.dbFile);
    if (retired) this.log.info(`Dữ liệu bản tháp cũ được giữ lại ở ${retired}; bắt đầu dữ liệu quần thể chùa mới.`);
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
      project: () => this.project,
      events: () => this.configStore.getEvents(),
      sessionId: () => this.sessions.currentId(),
      now: this.now,
    });
    try {
      this.engine.init();
      this.sessions.recoverOnBoot();
    } catch (e) {
      // project.json không khớp với dữ liệu đã xây: đóng DB rồi báo lỗi (để file không bị giữ khóa).
      this.db.close();
      throw e;
    }
  }

  static open(o: CoreOptions): GameCore {
    return new GameCore(o);
  }

  get config(): GameConfig {
    return this.configStore.get();
  }

  /** Danh sách hạng mục đã ghép mẫu giai đoạn và tính giá (từ config/project.json). */
  get project(): ResolvedProject {
    const file = this.configStore.getProject();
    if (this.resolved?.file !== file) this.resolved = { file, project: resolveProject(file) };
    return this.resolved.project;
  }

  get profile(): ProfileName {
    return this.paths.profile;
  }

  processEvent(ev: LiveEvent): ProcessResult {
    return this.engine.processEvent(ev);
  }

  /** Lưu config.json mới (kiểm tra bằng zod, ghi nhật ký, áp dụng ngay). */
  saveConfig(next: unknown, opts: { source: string }): SaveConfigResult {
    const changes = this.configStore.saveConfig(next);
    this.logChanges(changes, opts.source);
    return { status: 'saved', changes };
  }

  /**
   * Lưu danh sách hạng mục mới (14.10, 14.12).
   * - Hạng mục đã bắt đầu không được xóa, đổi thứ tự, đổi số giai đoạn: báo lỗi, không lưu.
   * - Giá giai đoạn ĐANG xây thay đổi mà chưa có xác nhận: trả về "needs_confirmation", không lưu gì.
   *   confirmReprice = true: tính lại theo giá mới (đủ điểm thì xong ngay, dư chuyển tiếp).
   *   confirmReprice = false: giai đoạn đang xây giữ giá cũ, các giai đoạn sau dùng giá mới.
   * - Công trình đã xong mà danh sách có thêm hạng mục: mở hạng mục mới.
   */
  saveProject(next: unknown, opts: { source: string; confirmReprice?: boolean }): SaveProjectResult {
    const valid = this.configStore.validateProject(next);
    const project = resolveProject(valid);
    const problems = this.engine.projectProblems(project);
    if (problems.length > 0) throw new ConfigError(PROJECT_FILE, problems);
    const reprice = this.engine.previewReprice(project);
    if (reprice && opts.confirmReprice === undefined) return { status: 'needs_confirmation', reprice };

    const changes = this.configStore.saveProject(valid);
    this.logChanges(changes, opts.source);
    const progress: ApplyResult[] = [];
    let repriced: RepricePreview | null = null;
    if (reprice && opts.confirmReprice) {
      const r = this.engine.applyReprice(this.project);
      if (r) progress.push(r);
      repriced = reprice;
      this.log.info(`Đổi giá giai đoạn ${reprice.stageIndex + 1} của "${reprice.itemName}": ${reprice.oldCost} → ${reprice.newCost}`);
    }
    const extended = this.engine.syncProject();
    if (extended) progress.push(extended);
    return { status: 'saved', changes, repriced, progress };
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
