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
    expect(store.load()).toEqual(['config.json', 'events.json', 'project.json', 'dialogues.json']);
    expect(store.getDialogues().groups.piece_burst!.lines.map((l) => l.text)).toEqual(['{name} vừa xây {n} {material}', '+{n} {material} từ {name}']);
    expect(store.get().points.giftPointsPerCoin).toBe(100);
    expect(store.getProject().items).toHaveLength(23);
    expect(store.getEvents().length).toBeGreaterThan(0);
    expect(new ConfigStore(configDir()).load()).toEqual([]);
  });

  it('config thiếu khóa thì lấy giá trị mặc định (để bản cập nhật sau thêm khóa mới không bị lỗi)', () => {
    fs.writeFileSync(path.join(configDir(), 'config.json'), JSON.stringify({ points: { likePoints: 3 } }));
    const store = new ConfigStore(configDir());
    store.load();
    expect(store.get().points.likePoints).toBe(3);
    expect(store.get().points.commentPoints).toBe(5);
  });

  it('config sai thì báo lỗi tiếng Việt, chỉ rõ chỗ sai', () => {
    fs.writeFileSync(
      path.join(configDir(), 'config.json'),
      JSON.stringify({ points: { likePoints: -5 }, labels: { progress: { item: '' } }, khoaLa: 1 }),
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
    expect(text).toContain('points.likePoints');
    expect(text).toContain('labels.progress.item');
    expect(text).toContain('khoaLa');
    expect(text).toMatch(/không|phải/i);
  });

  it('file JSON sai cú pháp thì báo lỗi dễ hiểu', () => {
    fs.writeFileSync(path.join(configDir(), 'config.json'), '{ "points": ');
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

describe('config.json của bản tháp cũ', () => {
  it('tự bỏ các khóa tháp không còn dùng, giữ phần mình đã chỉnh, đổi dải miễn trừ cũ sang câu mới', () => {
    const old = {
      tower: { totalFloors: 100, baseFloorCost: 20_000 },
      points: { likePoints: 2 },
      labels: {
        disclaimer: 'Trò chơi mô phỏng xây tháp – không phải quyên góp tôn giáo',
        foundationName: 'Nền móng',
        floorName: 'Tầng {floor}',
        foundationStages: ['a', 'b', 'c', 'd', 'e'],
        floorStages: ['a', 'b', 'c', 'd', 'e'],
        boards: { totalTop: 'Bảng vàng', floorTop: 'Bia ghi danh tầng {floor}' },
      },
    };
    fs.writeFileSync(path.join(configDir(), 'config.json'), JSON.stringify(old));
    const store = new ConfigStore(configDir());
    store.load();
    expect(store.upgradedKeys).toEqual([
      'tower',
      'labels.foundationName',
      'labels.floorName',
      'labels.foundationStages',
      'labels.floorStages',
      'labels.boards.floorTop',
      'labels.disclaimer',
    ]);
    expect(store.get().points.likePoints).toBe(2);
    expect(store.get().labels.boards).toEqual({ sessionTop: 'Top phiên này', totalTop: 'Bảng vàng', itemTop: 'Bia ghi danh – {item}' });
    expect(store.get().labels.disclaimer).toBe('Trò chơi mô phỏng xây chùa – không phải quyên góp tôn giáo');
    expect(readCfg()).toEqual({ points: { likePoints: 2 }, labels: { boards: { totalTop: 'Bảng vàng' } } });
    // Lần đọc sau không còn gì phải dọn.
    const again = new ConfigStore(configDir());
    again.load();
    expect(again.upgradedKeys).toEqual([]);
  });

  it('dải miễn trừ do mình tự viết thì giữ nguyên', () => {
    fs.writeFileSync(path.join(configDir(), 'config.json'), JSON.stringify({ labels: { disclaimer: 'Game mô phỏng' } }));
    const store = new ConfigStore(configDir());
    store.load();
    expect(store.get().labels.disclaimer).toBe('Game mô phỏng');
  });
});

describe('project.json', () => {
  const writeProject = (p: unknown) => fs.writeFileSync(path.join(configDir(), 'project.json'), JSON.stringify(p));
  const defaults = () => JSON.parse(fs.readFileSync(path.join(configDir(), 'defaults', 'project.json'), 'utf8'));
  const loadError = (): string => {
    try {
      new ConfigStore(configDir()).load();
    } catch (e) {
      return (e as ConfigError).problems.join('\n');
    }
    return '';
  };

  it('báo lỗi tiếng Việt khi hạng mục sai', () => {
    const p = defaults();
    p.items[1].id = 'san_nen';
    p.items[3].template = 'khong_co';
    writeProject(p);
    const text = loadError();
    expect(text).toContain('Có hai hạng mục trùng id "san_nen"');
    expect(text).toContain('Hạng mục "tam_quan": không có mẫu giai đoạn "khong_co"');
  });

  it('chỉ rõ khóa sai kiểu', () => {
    const p = defaults();
    p.items[4].size = 'to';
    writeProject(p);
    expect(loadError()).toMatch(/items\.4\.size: .*"nho"\|"vua"\|"lon"/);
  });

  it('id phải là chữ không dấu', () => {
    const p = defaults();
    p.items[0].id = 'Sân nền';
    writeProject(p);
    expect(loadError()).toMatch(/items\.0\.id: id hạng mục chỉ gồm chữ thường không dấu/);
  });
});

describe('kho thoại (mục 9C)', () => {
  it('nhóm piece_burst giống nhóm gift_*: không chứa từ ngữ tôn giáo', () => {
    const d = JSON.parse(fs.readFileSync(path.join(configDir(), 'defaults', 'dialogues.json'), 'utf8'));
    const banned = ['phật', 'a di đà', 'công đức', 'phước', 'tùy hỷ', 'tích phúc', 'hồi hướng', 'cầu an'];
    for (const line of d.groups.piece_burst.lines) {
      for (const w of banned) expect(line.text.toLowerCase(), line.text).not.toContain(w);
      expect(line.text).toMatch(/\{n\}/);
      expect(line.text).toMatch(/\{material\}/);
    }
  });

  it('nhóm thoại sai cấu trúc thì báo lỗi rõ', () => {
    fs.writeFileSync(path.join(configDir(), 'dialogues.json'), JSON.stringify({ groups: { piece_burst: { mode: 'lan_luot', cooldownSec: 0, lines: [] } } }));
    expect(() => new ConfigStore(configDir()).load()).toThrow(/dialogues\.json[\s\S]*groups\.piece_burst\.mode/);
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
