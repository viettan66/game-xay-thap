// Đọc, kiểm tra, lưu config. Áp dụng ngay khi lưu, không cần khởi động lại.
// - config/defaults/*.json: bản mặc định (có trên git).
// - config/*.json: bản đang dùng, tạo từ bản mặc định ở lần chạy đầu (không đưa lên git).
// config.json và project.json được trộn với bản mặc định, nên khóa mới ở phiên bản sau tự có giá trị mặc định.

import fs from 'node:fs';
import path from 'node:path';
import type { ZodType } from 'zod';
import type { GameEventDef } from '../../shared/events.js';
import type { ProjectFile } from '../../shared/project.js';
import {
  configSchema,
  dialoguesFileSchema,
  eventsFileSchema,
  formatZodError,
  projectFileSchema,
  type DialoguesFile,
  type EventsFile,
  type GameConfig,
} from './schema.js';

export const CONFIG_FILE = 'config.json';
export const EVENTS_FILE = 'events.json';
export const PROJECT_FILE = 'project.json';
export const DIALOGUES_FILE = 'dialogues.json';

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

/**
 * Chuy\u1EC3n project.json t\u1EA1o tr\u01B0\u1EDBc R3b (giai \u0111o\u1EA1n c\u00F3 `visual`) sang c\u00E1ch x\u00E2y t\u1EEBng m\u1EA3nh (`build`, m\u1EE5c 5, 7):
 * b\u1ECF `visual`; giai \u0111o\u1EA1n ch\u01B0a c\u00F3 `build` th\u00EC l\u1EA5y `build` c\u1EE7a b\u1EA3n m\u1EB7c \u0111\u1ECBnh \u1EDF c\u00F9ng ch\u1ED7 n\u1EBFu tr\u00F9ng t\u00EAn giai \u0111o\u1EA1n
 * (m\u1EABu c\u00F9ng t\u00EAn, ho\u1EB7c h\u1EA1ng m\u1EE5c c\u00F9ng m\u00E3). Giai \u0111o\u1EA1n m\u00ECnh t\u1EF1 th\u00EAm th\u00EC \u0111\u1EC3 tr\u1ED1ng (game x\u00E2y ph\u1EA7n c\u00F2n l\u1EA1i).
 * Tr\u1EA3 v\u1EC1 file \u0111\u00E3 chuy\u1EC3n v\u00E0 s\u1ED1 giai \u0111o\u1EA1n \u0111\u00E3 s\u1EEDa.
 */
export function upgradeLegacyProject(raw: unknown, defaults: unknown): { value: unknown; changed: number } {
  if (!isPlain(raw)) return { value: raw, changed: 0 };
  const value = structuredClone(raw);
  const def = isPlain(defaults) ? defaults : {};
  let changed = 0;
  const fix = (stages: unknown, defStages: unknown) => {
    if (!Array.isArray(stages)) return;
    stages.forEach((s, k) => {
      if (!isPlain(s) || !('visual' in s)) return;
      delete s.visual;
      changed++;
      const d = Array.isArray(defStages) ? defStages[k] : undefined;
      if (!('build' in s) && isPlain(d) && d.name === s.name && d.build !== undefined) s.build = structuredClone(d.build);
    });
  };
  const defTemplates = isPlain(def.stageTemplates) ? def.stageTemplates : {};
  if (isPlain(value.stageTemplates)) for (const [key, stages] of Object.entries(value.stageTemplates)) fix(stages, defTemplates[key]);
  const defItems = Array.isArray(def.items) ? def.items.filter(isPlain) : [];
  if (Array.isArray(value.items)) {
    for (const it of value.items) {
      if (!isPlain(it)) continue;
      const d = defItems.find((x) => x.id === it.id);
      for (const key of ['stages', 'stagesBefore', 'stagesAfter']) fix(it[key], d?.[key]);
    }
  }
  return { value, changed };
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
  private dialogues: DialoguesFile | null = null;
  private listeners: ConfigListener[] = [];
  /** Các khóa cũ (bản tháp) vừa được dọn khỏi config.json ở lần đọc gần nhất. */
  upgradedKeys: string[] = [];
  /** Số giai đoạn trong project.json vừa được chuyển từ `visual` sang `build` ở lần đọc gần nhất. */
  upgradedProjectStages = 0;

  constructor(readonly configDir: string) {}

  get defaultsDir(): string {
    return path.join(this.configDir, 'defaults');
  }

  /** Đọc config. Tạo file từ bản mặc định nếu chưa có. Trả về tên các file vừa tạo. */
  load(): string[] {
    const created: string[] = [];
    for (const name of [CONFIG_FILE, EVENTS_FILE, PROJECT_FILE, DIALOGUES_FILE]) {
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
    const projectPath = path.join(this.configDir, PROJECT_FILE);
    const project = upgradeLegacyProject(readJson(projectPath), readJson(path.join(this.defaultsDir, PROJECT_FILE)));
    this.project = this.validateProject(project.value);
    this.upgradedProjectStages = project.changed;
    if (project.changed > 0) writeJsonAtomic(projectPath, project.value);
    const dialoguesDefaults = readJson(path.join(this.defaultsDir, DIALOGUES_FILE));
    this.dialogues = validate(dialoguesFileSchema, deepMerge(dialoguesDefaults, readJson(path.join(this.configDir, DIALOGUES_FILE))), DIALOGUES_FILE);
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

  getDialogues(): DialoguesFile {
    if (!this.dialogues) throw new Error('Chưa đọc config (gọi load() trước)');
    return this.dialogues;
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
