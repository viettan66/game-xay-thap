// Đọc, kiểm tra, lưu config. Áp dụng ngay khi lưu, không cần khởi động lại.
// - config/defaults/*.json: bản mặc định (có trên git).
// - config/*.json: bản đang dùng, tạo từ bản mặc định ở lần chạy đầu (không đưa lên git).
// config.json được trộn với bản mặc định, nên khóa mới ở phiên bản sau tự có giá trị mặc định.

import fs from 'node:fs';
import path from 'node:path';
import type { ZodType } from 'zod';
import type { GameEventDef } from '../../shared/events.js';
import { configSchema, eventsFileSchema, formatZodError, type EventsFile, type GameConfig } from './schema.js';

export const CONFIG_FILE = 'config.json';
export const EVENTS_FILE = 'events.json';

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
  private listeners: ConfigListener[] = [];

  constructor(readonly configDir: string) {}

  get defaultsDir(): string {
    return path.join(this.configDir, 'defaults');
  }

  /** Đọc config. Tạo file từ bản mặc định nếu chưa có. Trả về tên các file vừa tạo. */
  load(): string[] {
    const created: string[] = [];
    for (const name of [CONFIG_FILE, EVENTS_FILE]) {
      const target = path.join(this.configDir, name);
      if (!fs.existsSync(target)) {
        fs.copyFileSync(path.join(this.defaultsDir, name), target);
        created.push(name);
      }
    }
    this.config = this.validateConfig(readJson(path.join(this.configDir, CONFIG_FILE)));
    this.eventsFile = validate(eventsFileSchema, readJson(path.join(this.configDir, EVENTS_FILE)), EVENTS_FILE);
    return created;
  }

  /** Kiểm tra một config (đã trộn với bản mặc định). Lỗi thì ném ConfigError. */
  validateConfig(raw: unknown): GameConfig {
    const defaults = readJson(path.join(this.defaultsDir, CONFIG_FILE));
    return validate(configSchema, deepMerge(defaults, raw), CONFIG_FILE);
  }

  get(): GameConfig {
    if (!this.config) throw new Error('Chưa đọc config (gọi load() trước)');
    return this.config;
  }

  getEvents(): GameEventDef[] {
    if (!this.eventsFile) throw new Error('Chưa đọc config (gọi load() trước)');
    return this.eventsFile.events;
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

  onChange(listener: ConfigListener): void {
    this.listeners.push(listener);
  }

  private emit(): void {
    for (const l of this.listeners) l(this.get(), this.getEvents());
  }
}
