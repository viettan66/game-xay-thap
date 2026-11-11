// Khuôn kiểm tra config bằng zod (mục 1 SPEC). Thông báo lỗi bằng tiếng Việt.
// Các giai đoạn sau sẽ bổ sung khóa mới; giá trị mặc định nằm trong config/defaults/.

import { z } from 'zod';
import { GROUND_LOOKS, ITEM_SIZES, PIECE_LOOKS, projectProblems, type ProjectFile } from '../../shared/project.js';
import { PART_KEYS } from '../../shared/parts.js';

z.config(z.locales.vi());

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Giờ phải có dạng HH:MM, ví dụ 20:00');
const monthDay = z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|30|31)$/, 'Ngày phải có dạng MM-DD, ví dụ 01-15');
const lunarBound = z
  .string()
  .regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|30|last)$/, 'Ngày âm lịch phải có dạng MM-DD hoặc MM-last');
const int = (min = 0) => z.number().int().min(min);
const weekdays = z.array(z.number().int().min(0).max(6)).min(1);

export const configSchema = z.strictObject({
  liveSource: z.enum(['tiktok-connector', 'simulator', 'euler-ws', 'tikfinity']),
  channelUsername: z.string(),
  server: z.strictObject({
    port: z.number().int().min(1024).max(65535),
  }),
  points: z.strictObject({
    giftPointsPerCoin: int(0),
    likePoints: int(0),
    commentPoints: int(0),
    commentCooldownSec: int(0),
    dailyLikeCommentCap: int(0),
  }),
  multipliers: z.strictObject({
    maxTotalMultiplier: z.number().min(1).max(100),
    eventCombine: z.enum(['max', 'multiply']),
    goldenHourCombine: z.enum(['multiply', 'max']),
  }),
  goldenHour: z.strictObject({
    multiplier: z.number().min(1).max(20),
    schedule: z.array(z.strictObject({ weekdays, from: hhmm, to: hhmm })),
  }),
  session: z.strictObject({
    autoEndOfflineMin: z.number().min(1).max(24 * 60),
  }),
  backup: z.strictObject({
    keep: int(1).max(1000),
    dailyTime: hhmm,
  }),
  overlay: z.strictObject({
    safeArea: z.strictObject({ top: int(0).max(960), bottom: int(0).max(960), right: int(0).max(540) }),
    // Thông số tháp cũ: chỉ trang /tools/assets còn dùng; bỏ khi dọn code tháp sau R4.
    floor1WidthPx: int(100).max(1000),
    towerTaper: z.number().min(0.9).max(1),
    towerCenterX: int(0).max(1080),
    towerBaseY: int(0).max(1920),
    boardRotateSec: z.number().min(3).max(300),
  }),
  // Xây từng mảnh (mục 7): cỡ mảnh theo vùng, tốc độ theo chế độ độ đông, tên vật liệu trong nhãn piece_burst.
  pieces: z.strictObject({
    size: z.strictObject(Object.fromEntries(PART_KEYS.map((k) => [k, z.tuple([int(0).max(200), int(1).max(200)])])) as Record<(typeof PART_KEYS)[number], z.ZodTuple<[z.ZodNumber, z.ZodNumber]>>),
    maxPerSec: z.strictObject({ vang: z.number().min(1).max(120), vua: z.number().min(1).max(120), dong: z.number().min(1).max(120), ratdong: z.number().min(1).max(120) }),
    materials: z.strictObject(Object.fromEntries([...PART_KEYS, 'coc', 'dao', 'dong'].map((k) => [k, z.string().min(1)])) as Record<string, z.ZodString>),
    burstSec: z.number().min(0.5).max(20),
  }),
  titles: z.array(z.strictObject({ minPoints: int(0), label: z.string().min(1) })).min(1),
  labels: z.strictObject({
    pointUnitLabel: z.string().min(1),
    disclaimer: z.string().min(1),
    goldenHour: z.string().min(1),
    abbotName: z.string().min(1),
    anonymousName: z.string().min(1),
    testBadge: z.string().min(1),
    rehearsalBadge: z.string().min(1),
    progress: z.strictObject({
      item: z.string().min(1),
      stage: z.string().min(1),
      project: z.string().min(1),
      completed: z.string().min(1),
    }),
    boards: z.strictObject({
      sessionTop: z.string().min(1),
      totalTop: z.string().min(1),
      itemTop: z.string().min(1),
    }),
  }),
});

export type GameConfig = z.infer<typeof configSchema>;

const eventDefSchema = z
  .strictObject({
    key: z.string().regex(/^[a-z0-9_]+$/, 'key chỉ gồm chữ thường không dấu, số và dấu _'),
    name: z.string().min(1),
    enabled: z.boolean(),
    priority: z.number().int(),
    multiplier: z.number().min(0).max(20),
    solar: monthDay.optional(),
    lunar: monthDay.optional(),
    lunarMonthlyDay: z.number().int().min(1).max(30).optional(),
    lunarRange: z.strictObject({ from: lunarBound, to: lunarBound }).optional(),
    weekdays: weekdays.optional(),
    time: z.strictObject({ from: hhmm, to: hhmm }).optional(),
    theme: z.array(z.string()).optional(),
    playlist: z.string().optional(),
  })
  .refine(
    (e) =>
      [e.solar, e.lunar, e.lunarMonthlyDay, e.lunarRange, e.weekdays].filter((v) => v !== undefined).length === 1,
    { message: 'Mỗi sự kiện phải có đúng MỘT kiểu ngày: solar, lunar, lunarMonthlyDay, lunarRange hoặc weekdays' },
  );

export const eventsFileSchema = z
  .strictObject({ events: z.array(eventDefSchema) })
  .refine((f) => new Set(f.events.map((e) => e.key)).size === f.events.length, {
    message: 'Có hai sự kiện trùng key',
    path: ['events'],
  });

export type EventsFile = z.infer<typeof eventsFileSchema>;

// ---- config/dialogues.json: kho thoại (mục 9C) ----

const TIERS = ['vang', 'vua', 'dong', 'ratdong'] as const;
export const dialoguesFileSchema = z.strictObject({
  _ghi_chu: z.string().optional(),
  groups: z.record(
    z.string().regex(/^[a-z0-9_]+$/, 'Tên nhóm chỉ gồm chữ thường không dấu, số và dấu _'),
    z.strictObject({
      mode: z.enum(['shuffle', 'sequential', 'random']),
      cooldownSec: z.number().min(0),
      lines: z.array(
        z.strictObject({
          text: z.string().min(1),
          tiers: z.array(z.enum(TIERS)),
          weight: z.number().positive(),
          enabled: z.boolean(),
          verified: z.boolean(),
        }),
      ),
    }),
  ),
});

export type DialoguesFile = z.infer<typeof dialoguesFileSchema>;

// ---- config/project.json: danh sách hạng mục, mẫu giai đoạn, giá (mục 5) ----

const slug = (what: string) => z.string().regex(/^[a-z0-9_]+$/, `${what} chỉ gồm chữ thường không dấu, số và dấu _`);

const stageDefSchema = z.strictObject({
  name: z.string().min(1),
  weight: z.number().positive().optional(),
  ritual: z.string().min(1).optional(),
  // Xây từng mảnh (mục 5, 7): vùng nào, hiện ra sao, dải chiều cao nào. Kết hợp sai được projectProblems báo.
  build: z
    .strictObject({
      part: z.union([z.enum(PART_KEYS), z.literal('matdat'), z.array(z.enum(PART_KEYS)).min(1)]),
      look: z.enum([...PIECE_LOOKS, ...GROUND_LOOKS]),
      band: z.tuple([z.number(), z.number()]).optional(),
    })
    .optional(),
});

const itemDefSchema = z.strictObject({
  id: slug('id hạng mục'),
  name: z.string().min(1),
  cost: int(1),
  size: z.enum(ITEM_SIZES),
  area: slug('area'),
  template: z.string().min(1).optional(),
  stages: z.array(stageDefSchema).min(1).optional(),
  stagesBefore: z.array(stageDefSchema).optional(),
  stagesAfter: z.array(stageDefSchema).optional(),
});

export const projectFileSchema = z
  .strictObject({
    name: z.string().min(1),
    baseUnit: int(1),
    costRoundTo: int(1),
    stageTemplates: z.record(slug('Tên mẫu giai đoạn'), z.array(stageDefSchema).min(1)),
    items: z.array(itemDefSchema).min(1),
  })
  .superRefine((p, ctx) => {
    for (const message of projectProblems(p)) ctx.addIssue({ code: 'custom', message, path: ['items'] });
  });

// Kiểu suy ra từ zod phải khớp kiểu dùng trong shared/project.ts.
export type ProjectFileInput = z.infer<typeof projectFileSchema>;
const _projectTypeCheck = (p: ProjectFileInput): ProjectFile => p;
void _projectTypeCheck;

/** Đổi lỗi zod thành danh sách dòng dễ đọc: "points.likePoints: …". */
export function formatZodError(err: z.ZodError): string[] {
  return err.issues.map((i) => {
    const path = i.path.map(String).join('.');
    return path ? `${path}: ${i.message}` : i.message;
  });
}
