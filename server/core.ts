// Ghép các phần của server: hồ sơ, config, DB, lõi game, phiên live, backup.
// Dùng chung cho server thật (main.ts), script demo và test.

import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { resolveProject, type ApplyResult, type ProjectFile, type ResolvedProject } from '../shared/project.js';
import { vnStamp } from '../shared/time.js';
import type { LiveEvent } from '../shared/types.js';
import { createBackup, isDailyBackupDue, listBackups } from './backup.js';
import type { GameConfig } from './config/schema.js';
import { ConfigError, ConfigStore, PROJECT_FILE, type ConfigChange } from './config/store.js';
import { openDatabase, type DB } from './db/database.js';
import { retireLegacyTowerDb } from './db/legacy.js';
import { getSetting, setSetting } from './db/settings.js';
import { CROWD_TIERS, CrowdTracker } from './game/crowd.js';
import { HeartGoalService } from './game/heartGoal.js';
import { CharacterRoster, type ReturningPick } from './game/roster.js';
import { audioDir } from './audio/library.js';
import { AudioService } from './audio/service.js';
import { excludedIds, pickReturning, returningCandidates, setExcluded } from './game/returning.js';
import { userTotalPoints } from './game/queries.js';
import { titleFor } from '../shared/characters.js';
import { displayName } from '../shared/names.js';
import { hasUser } from '../shared/types.js';
import type { CrowdTier } from '../shared/protocol.js';
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
  /** Chế độ độ đông của phòng (mục 9A). */
  readonly crowd: CrowdTracker;
  /** Mục tiêu tim của phiên (bảng 9A). */
  readonly goals: HeartGoalService;
  /** Nhân vật người xem đang có trên bản đồ (mục 9, 9A). */
  readonly roster: CharacterRoster;
  /** Âm thanh (mục 10A): thư viện file, thứ tự nhạc nền. */
  readonly audio: AudioService;
  /** Sự kiện cho các phần khác (trụ trì…): 'sessionStart', 'sessionEnd' (SessionRow), 'crowd' (CrowdTier), 'goal' (nấc vừa đạt),
   *  'returning' (người góp công cũ vừa quay lại tương tác: ReturningMember). */
  readonly bus = new EventEmitter();
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
      onStart: (s) => {
        this.log.info(`Bắt đầu phiên live #${s.id} (${s.start_reason})`);
        this.goals?.onSessionStart(s.id);
        this.roster?.onSessionStart();
        this.bus.emit('sessionStart', s);
      },
      onEnd: (s) => {
        this.log.info(`Kết thúc phiên live #${s.id} (${s.end_reason})`);
        this.bus.emit('sessionEnd', s);
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
    this.crowd = new CrowdTracker(() => this.config.crowd);
    this.roster = new CharacterRoster({
      config: () => this.config.characters,
      tier: () => this.crowd.tier,
      npc: () => this.config.npc,
      returning: () => this.config.returning,
      pickReturning: (skip) => this.pickReturning(skip),
      // Người góp công cũ vào phòng và tương tác: trụ trì chào riêng (nhóm returning).
      onBack: (m) => this.bus.emit('returning', m),
    });
    const forced = getSetting<string | null>(this.db, 'crowd_forced', null);
    this.crowd.forced = CROWD_TIERS.includes(forced as CrowdTier) ? (forced as CrowdTier) : null;
    try {
      this.engine.init();
      this.sessions.recoverOnBoot();
      this.goals = new HeartGoalService(this.db, () => this.config.heartGoal.targets, () => this.crowd.tier, () => this.sessions.currentId());
      this.restoreRoster();
      this.audio = new AudioService(this.rootDir, this.db, () => this.configStore.getAudio(), this.log);
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
    const r = this.engine.processEvent(ev);
    if (r.status !== 'duplicate') {
      this.crowd.observe(ev, this.now());
      this.updateCrowd();
      this.goalHit(this.goals.onEvent(ev));
      if (hasUser(ev)) this.rosterEvent(ev, this.now());
    }
    return r;
  }

  /** Chọn một người góp công cũ (mục 9B): người có công từ phiên trước, không bị loại trừ, không đang có nhân vật. */
  private pickReturning(skip: (id: string) => boolean): ReturningPick | null {
    const cfg = this.config;
    const excluded = new Set(excludedIds(this.db));
    const c = pickReturning(returningCandidates(this.db, this.sessions.currentId()), (id) => skip(id) || excluded.has(id), Math.random);
    if (!c) return null;
    return { id: c.platformId, name: displayName(c.nickname, cfg.nameFilter.bannedWords, cfg.labels.anonymousName), itemId: c.topItemId };
  }

  /** Admin: thêm / bỏ một người khỏi danh sách không hiện lại dưới dạng người góp công cũ. Đang hiện thì đi ra ngay. */
  setReturningExcluded(platformId: string, excluded: boolean): string[] {
    const list = setExcluded(this.db, platformId, excluded);
    if (excluded) this.roster.dropReturning(platformId);
    this.log.info(excluded ? `Không hiện lại người góp công cũ: ${platformId}` : `Cho hiện lại người góp công cũ: ${platformId}`);
    return list;
  }

  /** Cập nhật nhân vật của người xem (sinh mới, đổi tên, danh hiệu, lần tương tác). */
  private rosterEvent(ev: import('../shared/types.js').UserLiveEvent, now: number): boolean {
    const cfg = this.config;
    return this.roster.onEvent(
      {
        ev,
        name: displayName(ev.user.nickname, cfg.nameFilter.bannedWords, cfg.labels.anonymousName),
        title: titleFor(userTotalPoints(this.db, ev.user.platformId), cfg.titles),
        coins: ev.type === 'gift' ? Math.max(0, ev.coinValueEach) * Math.max(0, ev.count) : 0,
      },
      now,
    );
  }

  /**
   * Khởi động lại giữa phiên live: dựng lại danh sách nhân vật từ sự kiện của phiên đang chạy (đọc từ bảng events),
   * rồi bỏ ngay những người đã hết giờ. Không có phiên thì bắt đầu trống.
   */
  private restoreRoster(): void {
    const sid = this.sessions.currentId();
    if (sid === null) return;
    const rows = this.db
      .prepare<[number], { ts: number; payload_json: string }>(
        `SELECT ts, payload_json FROM events WHERE session_id = ? AND type IN ('join', 'like', 'comment', 'gift') ORDER BY id DESC LIMIT 20000`,
      )
      .all(sid)
      .reverse();
    for (const row of rows) {
      try {
        const ev = JSON.parse(row.payload_json) as import('../shared/types.js').LiveEvent;
        if (hasUser(ev)) this.rosterEvent(ev, row.ts);
      } catch {
        // dòng hỏng: bỏ qua
      }
    }
    this.roster.tick(this.now(), true);
  }

  /** Cập nhật chế độ độ đông (sau sự kiện và định kỳ); đổi thì ghi log và báo cho các phần khác. */
  updateCrowd(): void {
    if (this.crowd.update(this.now())) {
      this.log.info(`Chế độ độ đông: ${this.crowd.tier}`);
      this.goals.onTier();
      this.bus.emit('crowd', this.crowd.tier);
    }
  }

  /** Admin ép chế độ độ đông (null = tự động). Lưu vào DB của hồ sơ. */
  setCrowdForced(tier: CrowdTier | null): void {
    const before = this.crowd.tier;
    this.crowd.forced = tier;
    setSetting(this.db, 'crowd_forced', tier);
    this.log.info(tier ? `Ép chế độ độ đông: ${tier}` : 'Chế độ độ đông: tự động');
    if (this.crowd.tier !== before) {
      this.goals.onTier();
      this.bus.emit('crowd', this.crowd.tier);
    }
  }

  /** Admin đặt mục tiêu tim của phiên (null = bỏ đặt tay). */
  setHeartGoal(target: number | null): void {
    this.log.info(target === null ? 'Mục tiêu tim: tự động' : `Đặt mục tiêu tim: ${target}`);
    this.goalHit(this.goals.setManual(target));
  }

  private goalHit(target: number | null): void {
    if (target === null) return;
    this.log.info(`Đạt mục tiêu tim của phiên: ${target}`);
    this.bus.emit('goal', target);
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

  /**
   * Lưu kho thoại (mục 9C): backup bản cũ vào thư mục backup của hồ sơ trước, rồi ghi; ghi nhật ký thay đổi.
   * Câu đổi thì vòng shuffle của nhóm đó tự tạo lại (bộ chọn so mã băm danh sách câu).
   */
  saveDialogues(next: unknown, opts: { source: string }): ConfigChange[] {
    const before = this.configStore.getDialogues();
    const { changes } = this.configStore.saveDialogues(next);
    if (changes.length === 0) return changes;
    try {
      const dir = path.join(this.paths.backupsDir, 'dialogues');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `dialogues-${vnStamp(this.now())}.json`), `${JSON.stringify(before, null, 2)}\n`, 'utf8');
      // Giữ 30 bản gần nhất.
      const files = fs.readdirSync(dir).filter((f) => f.startsWith('dialogues-')).sort();
      for (const f of files.slice(0, Math.max(0, files.length - 30))) fs.rmSync(path.join(dir, f), { force: true });
    } catch (e) {
      this.log.error('Không backup được kho thoại cũ', e);
    }
    this.logChanges(changes, opts.source);
    return changes;
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
      extra: { 'audio-credits.json': path.join(audioDir(this.rootDir), 'credits.json') },
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
    this.updateCrowd();
    this.roster.tick(this.now());
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
