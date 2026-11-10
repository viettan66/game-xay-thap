// Khuôn kiểm tra config bằng zod (mục 1 SPEC). Thông báo lỗi bằng tiếng Việt.
// Các giai đoạn sau sẽ bổ sung khóa mới; giá trị mặc định nằm trong config/defaults/.

import { z } from 'zod';

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
  tower: z
    .strictObject({
      totalFloors: int(1).max(1000),
      foundationCost: int(1),
      baseFloorCost: int(1),
      tierSize: int(1),
      tierIncreasePct: z.number().min(0).max(1000),
      costRoundTo: int(1),
      stageRatios: z.array(z.number().positive()).length(5),
      floorCostOverrides: z.record(z.string().regex(/^\d+$/, 'Số tầng phải là số'), int(1)),
    })
    .refine(
      (t) => Object.keys(t.floorCostOverrides).every((k) => Number(k) <= t.totalFloors),
      { message: 'floorCostOverrides có tầng lớn hơn totalFloors', path: ['floorCostOverrides'] },
    ),
  session: z.strictObject({
    autoEndOfflineMin: z.number().min(1).max(24 * 60),
  }),
  backup: z.strictObject({
    keep: int(1).max(1000),
    dailyTime: hhmm,
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
    foundationName: z.string().min(1),
    floorName: z.string().includes('{floor}', { message: 'Phải chứa {floor}' }),
    foundationStages: z.array(z.string().min(1)).length(5),
    floorStages: z.array(z.string().min(1)).length(5),
    boards: z.strictObject({
      sessionTop: z.string().min(1),
      totalTop: z.string().min(1),
      floorTop: z.string().min(1),
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

/** Đổi lỗi zod thành danh sách dòng dễ đọc: "tower.baseFloorCost: …". */
export function formatZodError(err: z.ZodError): string[] {
  return err.issues.map((i) => {
    const path = i.path.map(String).join('.');
    return path ? `${path}: ${i.message}` : i.message;
  });
}
