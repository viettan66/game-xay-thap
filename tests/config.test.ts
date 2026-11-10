import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigError, ConfigStore, deepMerge, diffValues } from '../server/config/store.js';
import { vnTs } from '../shared/time.js';
import { FakeClock, makeTempRoot, openTestCore, removeTempRoot } from './helpers.js';

let root: string;
beforeEach(() => {
  root = makeTempRoot();
});
afterEach(() => {
  removeTempRoot(root);
});

const configDir = () => path.join(root, 'config');
const readCfg = () => JSON.parse(fs.readFileSync(path.join(configDir(), 'config.json'), 'utf8'));

describe('đọc config', () => {
  it('lần chạy đầu tạo config.json và events.json từ bản mặc định', () => {
    const store = new ConfigStore(configDir());
    expect(store.load()).toEqual(['config.json', 'events.json']);
    expect(store.get().tower.baseFloorCost).toBe(20_000);
    expect(store.getEvents().length).toBeGreaterThan(0);
    expect(new ConfigStore(configDir()).load()).toEqual([]);
  });

  it('config thiếu khóa thì lấy giá trị mặc định (để bản cập nhật sau thêm khóa mới không bị lỗi)', () => {
    fs.writeFileSync(path.join(configDir(), 'config.json'), JSON.stringify({ tower: { baseFloorCost: 30_000 } }));
    const store = new ConfigStore(configDir());
    store.load();
    expect(store.get().tower.baseFloorCost).toBe(30_000);
    expect(store.get().tower.foundationCost).toBe(10_000);
  });

  it('config sai thì báo lỗi tiếng Việt, chỉ rõ chỗ sai', () => {
    fs.writeFileSync(
      path.join(configDir(), 'config.json'),
      JSON.stringify({ tower: { baseFloorCost: -5, stageRatios: [50, 50] }, khoaLa: 1 }),
    );
    const store = new ConfigStore(configDir());
    let err: ConfigError | null = null;
    try {
      store.load();
    } catch (e) {
      err = e as ConfigError;
    }
    expect(err).toBeInstanceOf(ConfigError);
    const text = err!.problems.join('\n');
    expect(text).toContain('tower.baseFloorCost');
    expect(text).toContain('tower.stageRatios');
    expect(text).toContain('khoaLa');
    expect(text).toMatch(/không|phải/i);
  });

  it('file JSON sai cú pháp thì báo lỗi dễ hiểu', () => {
    fs.writeFileSync(path.join(configDir(), 'config.json'), '{ "tower": ');
    expect(() => new ConfigStore(configDir()).load()).toThrow(/Sai cú pháp JSON/);
  });

  it('đọc được file có BOM (lưu bằng Notepad)', () => {
    fs.writeFileSync(path.join(configDir(), 'config.json'), '﻿{}');
    expect(() => new ConfigStore(configDir()).load()).not.toThrow();
  });

  it('sự kiện phải có đúng một kiểu ngày', () => {
    fs.writeFileSync(
      path.join(configDir(), 'events.json'),
      JSON.stringify({
        events: [{ key: 'x', name: 'X', enabled: true, priority: 1, multiplier: 2, solar: '01-01', lunar: '01-01' }],
      }),
    );
    expect(() => new ConfigStore(configDir()).load()).toThrow(/đúng MỘT kiểu ngày/);
  });
});

describe('so sánh config', () => {
  it('deepMerge trộn object, thay hẳn mảng', () => {
    expect(deepMerge({ a: { b: 1, c: 2 }, l: [1, 2] }, { a: { c: 3 }, l: [9] })).toEqual({ a: { b: 1, c: 3 }, l: [9] });
  });

  it('diffValues liệt kê từng khóa thay đổi', () => {
    expect(diffValues({ a: { b: 1, c: 2 }, d: [1] }, { a: { b: 1, c: 5 }, d: [1, 2] })).toEqual([
      { path: 'a.c', oldValue: 2, newValue: 5 },
      { path: 'd', oldValue: [1], newValue: [1, 2] },
    ]);
  });
});

describe('lưu config và nhật ký thay đổi (14.10)', () => {
  it('ghi thời gian, giá trị cũ, giá trị mới vào bảng config_changes', async () => {
    const clock = new FakeClock(vnTs(2026, 3, 10, 9));
    const core = openTestCore(root, clock);
    const next = structuredClone(core.config);
    next.points.likePoints = 2;
    next.labels.goldenHour = 'Giờ vui';
    const r = core.saveConfig(next, { source: 'admin' });
    expect(r.status).toBe('saved');
    const rows = core.db.prepare('SELECT ts, file, path, old_json, new_json, source FROM config_changes ORDER BY path').all();
    expect(rows).toEqual([
      { ts: clock.t, file: 'config.json', path: 'labels.goldenHour', old_json: '"Giờ vàng"', new_json: '"Giờ vui"', source: 'admin' },
      { ts: clock.t, file: 'config.json', path: 'points.likePoints', old_json: '1', new_json: '2', source: 'admin' },
    ]);
    expect(readCfg().points.likePoints).toBe(2); // đã ghi ra file
    expect(core.config.points.likePoints).toBe(2); // áp dụng ngay
    await core.close();
  });

  it('config mới sai thì không lưu, giữ nguyên config cũ', async () => {
    const core = openTestCore(root, new FakeClock(0));
    const next = structuredClone(core.config) as unknown as Record<string, Record<string, unknown>>;
    next.points!.likePoints = 'nhiều';
    expect(() => core.saveConfig(next, { source: 'admin' })).toThrow(ConfigError);
    expect(core.config.points.likePoints).toBe(1);
    expect(readCfg().points.likePoints).toBe(1);
    await core.close();
  });

  it('lưu lịch sự kiện cũng được ghi nhật ký', async () => {
    const core = openTestCore(root, new FakeClock(0));
    const events = structuredClone(core.configStore.getEvents());
    events[0]!.multiplier = 1.2;
    const changes = core.saveEvents({ events }, { source: 'admin' });
    expect(changes).toHaveLength(1);
    expect(changes[0]!.file).toBe('events.json');
    await core.close();
  });
});
