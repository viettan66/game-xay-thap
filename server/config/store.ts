// Đọc, kiểm tra, lưu config. Áp dụng ngay khi lưu, không cần khởi động lại.
// - config/defaults/*.json: bản mặc định (có trên git).
// - config/*.json: bản đang dùng, tạo từ bản mặc định ở lần chạy đầu (không đưa lên git).
// config.json và project.json được trộn với bản mặc định, nên khóa mới ở phiên bản sau tự có giá trị mặc định.

import fs from 'node:fs';
import path from 'node:path';
import type { ZodType } from 'zod';
import type { GameEventDef } from '../../shared/events.js';
import type { ProjectFile } from '../../shared/project.js';
import { configSchema, eventsFileSchema, formatZodError, projectFileSchema, type EventsFile, type GameConfig } from './schema.js';

export const CONFIG_FILE = 'config.json';
export const EVENTS_FILE = 'events.json';
export const PROJECT_FILE = 'project.json';

export class ConfigError extends Error {
  constructor(
    readonly file: string,
    readonly problems: string[],
  ) {
    super(`File ${file} có lỗi:\n- ${problems.join('\n- ')}`);
    this.name = 'ConfigError';
  }
}

export interface ConfigChange {
  file: string;
  path: string;
  oldValue: unknown;
  newValue: unknown;
}

type Plain = Record<string, unknown>;
const isPlain = (v: unknown): v is Plain => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Trộn override lên base: object trộn từng khóa, mảng và giá trị đơn thì thay hẳn. */
export function deepMerge(base: unknown, override: unknown): unknown {
  if (isPlain(base) && isPlain(override)) {
    const out: Plain = { ...base };
    for (const [k, v] of Object.entries(override)) out[k] = k in base ? deepMerge(base[k], v) : v;
    return out;
  }
  return override === undefined ? base : override;
}

/** Liệt kê các chỗ khác nhau giữa hai config, theo đường dẫn khóa (ví dụ "tower.baseFloorCost"). */
export function diffValues(a: unknown, b: unknown, prefix = ''): { path: string; oldValue: unknown; newValue: unknown }[] {
  if (isPlain(a) && isPlain(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].sort().flatMap((k) => diffValues(a[k], b[k], prefix ? `${prefix}.${k}` : k));
  }
  return JSON.stringify(a) === JSON.stringify(b) ? [] : [{ path: prefix || '(toàn bộ)', oldValue: a, newValue: b }];
}

/** Dải miễn trừ mặc định của bản tháp cũ: gặp đúng câu này thì thay bằng câu mặc định mới. */
const OLD_DISCLAIMER = 'Trò chơi mô phỏng xây tháp – không phải quyên góp tôn giáo';

/**
 * Dọn config.json của bản tháp 100 tầng (trước khi đổi sang quần thể chùa): bỏ các khóa không còn dùng,
 * để file cũ trên máy chủ dự án vẫn đọc được. Trả về config đã dọn và danh sách khóa đã bỏ.
 */
export function upgradeLegacyConfig(raw: unknown): { value: unknown; removed: string[] } {
  if (!isPlain(raw)) return { value: raw, removed: [] };
  const value = structuredClone(raw);
  const removed: string[] = [];
  const drop = (obj: unknown, key: string, label: string) => {
    if (isPlain(obj) && key in obj) {
      delete obj[key];
      removed.push(label);
    }
  };
  drop(value, 'tower', 'tower');
  const labels = value.labels;
  for (const k of ['foundationName', 'floorName', 'foundationStages', 'floorStages']) drop(labels, k, `labels.${k}`);
  if (isPlain(labels)) {
    drop(labels.boards, 'floorTop', 'labels.boards.floorTop');
    if (labels.disclaimer === OLD_DISCLAIMER) drop(labels, 'disclaimer', 'labels.disclaimer');
  }
  return { value, removed };
}

function readJson(file: string): unknown {
  const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new ConfigError(path.basename(file), [`Sai cú pháp JSON: ${(e as Error).message}`]);
  }
}

function writeJsonAtomic(file: string, value: unknown): void {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}

function validate<T>(schema: ZodType<T>, raw: unknown, fileName: string): T {
  const r = schema.safeParse(raw);
  if (!r.success) throw new ConfigError(fileName, formatZodError(r.error));
  return r.data;
}

export type ConfigListener = (config: GameConfig, events: GameEventDef[]) => void;

export class ConfigStore {
  private config: GameConfig | null = null;
  private eventsFile: EventsFile | null = null;
  private project: ProjectFile | null = null;
  private listeners: ConfigListener[] = [];
  /** Các khóa cũ (bản tháp) vừa được dọn khỏi config.json ở lần đọc gần nhất. */
  upgradedKeys: string[] = [];

  constructor(readonly configDir: string) {}

  get defaultsDir(): string {
    return path.join(this.configDir, 'defaults');
  }

  /** Đọc config. Tạo file từ bản mặc định nếu chưa có. Trả về tên các file vừa tạo. */
  load(): string[] {
    const created: string[] = [];
    for (const name of [CONFIG_FILE, EVENTS_FILE, PROJECT_FILE]) {
      const target = path.join(this.configDir, name);
      if (!fs.existsSync(target)) {
        fs.copyFileSync(path.join(this.defaultsDir, name), target);
        created.push(name);
      }
    }
    const configPath = path.join(this.configDir, CONFIG_FILE);
    const upgraded = upgradeLegacyConfig(readJson(configPath));
    this.config = this.validateConfig(upgraded.value);
    this.upgradedKeys = upgraded.removed;
    if (upgraded.removed.length > 0) writeJsonAtomic(configPath, upgraded.value);
    this.eventsFile = validate(eventsFileSchema, readJson(path.join(this.configDir, EVENTS_FILE)), EVENTS_FILE);
    this.project = this.validateProject(readJson(path.join(this.configDir, PROJECT_FILE)));
    return created;
  }

  /** Kiểm tra một config (đã trộn với bản mặc định). Lỗi thì ném ConfigError. */
  validateConfig(raw: unknown): GameConfig {
    const defaults = readJson(path.join(this.defaultsDir, CONFIG_FILE));
    return validate(configSchema, deepMerge(defaults, raw), CONFIG_FILE);
  }

  /** Kiểm tra project.json (đã trộn với bản mặc định). Lỗi thì ném ConfigError. */
  validateProject(raw: unknown): ProjectFile {
    const defaults = readJson(path.join(this.defaultsDir, PROJECT_FILE));
    return validate(projectFileSchema, deepMerge(defaults, raw), PROJECT_FILE);
  }

  get(): GameConfig {
    if (!this.config) throw new Error('Chưa đọc config (gọi load() trước)');
    return this.config;
  }

  getEvents(): GameEventDef[] {
    if (!this.eventsFile) throw new Error('Chưa đọc config (gọi load() trước)');
    return this.eventsFile.events;
  }

  getProject(): ProjectFile {
    if (!this.project) throw new Error('Chưa đọc config (gọi load() trước)');
    return this.project;
  }

  /** Lưu config mới: kiểm tra, ghi file, áp dụng ngay. Trả về danh sách thay đổi để ghi nhật ký. */
  saveConfig(next: unknown): ConfigChange[] {
    const valid = this.validateConfig(next);
    const changes = diffValues(this.get(), valid).map((c) => ({ file: CONFIG_FILE, ...c }));
    if (changes.length === 0) return [];
    writeJsonAtomic(path.join(this.configDir, CONFIG_FILE), valid);
    this.config = valid;
    this.emit();
    return changes;
  }

  saveEvents(next: unknown): ConfigChange[] {
    const valid = validate(eventsFileSchema, next, EVENTS_FILE);
    const changes = diffValues(this.eventsFile, valid).map((c) => ({ file: EVENTS_FILE, ...c }));
    if (changes.length === 0) return [];
    writeJsonAtomic(path.join(this.configDir, EVENTS_FILE), valid);
    this.eventsFile = valid;
    this.emit();
    return changes;
  }

  /** Lưu project.json. Gọi qua GameCore.saveProject để được kiểm tra với tiến độ đã xây. */
  saveProject(next: unknown): ConfigChange[] {
    const valid = this.validateProject(next);
    const changes = diffValues(this.project, valid).map((c) => ({ file: PROJECT_FILE, ...c }));
    if (changes.length === 0) return [];
    writeJsonAtomic(path.join(this.configDir, PROJECT_FILE), valid);
    this.project = valid;
    this.emit();
    return changes;
  }

  onChange(listener: ConfigListener): void {
    this.listeners.push(listener);
  }

  private emit(): void {
    for (const l of this.listeners) l(this.get(), this.getEvents());
  }
}
