// Khuôn kiểm tra config bằng zod (mục 1 SPEC). Thông báo lỗi bằng tiếng Việt.
// Các giai đoạn sau sẽ bổ sung khóa mới; giá trị mặc định nằm trong config/defaults/.

import { z } from 'zod';
import { GROUND_LOOKS, ITEM_SIZES, PIECE_LOOKS, projectProblems, type ProjectFile } from '../../shared/project.js';
import { PART_KEYS } from '../../shared/parts.js';
import { GIFT_EFFECTS } from '../../shared/characters.js';
import { DIALOGUE_VARS, varsOf } from '../dialogue/rules.js';

z.config(z.locales.vi());

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Giờ phải có dạng HH:MM, ví dụ 20:00');
const monthDay = z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|30|31)$/, 'Ngày phải có dạng MM-DD, ví dụ 01-15');
const lunarBound = z
  .string()
  .regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|30|last)$/, 'Ngày âm lịch phải có dạng MM-DD hoặc MM-last');
const int = (min = 0) => z.number().int().min(min);
const weekdays = z.array(z.number().int().min(0).max(6)).min(1);
/** Một số theo từng chế độ độ đông (mục 9A); 0 = không tự động. */
const perCrowd = (max: number) =>
  z.strictObject({ vang: z.number().min(0).max(max), vua: z.number().min(0).max(max), dong: z.number().min(0).max(max), ratdong: z.number().min(0).max(max) });

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
    boardRotateSec: z.number().min(3).max(300),
    // Bố cục giao diện (mục 8, 14.13): vị trí bảng xếp hạng, bản đồ thu nhỏ, độ đậm nền từng khung.
    boardPosition: z.enum(['auto', 'leftMiddle', 'rightMiddle', 'leftTop']),
    minimap: z.enum(['overview', 'always', 'off']),
    opacity: z.strictObject({
      progress: z.number().min(0).max(1),
      board: z.number().min(0).max(1),
      events: z.number().min(0).max(1),
      disclaimer: z.number().min(0).max(1),
    }),
  }),
  // Camera (mục 8): zoom tối đa, tỉ lệ công trình trong khung, các chế độ overview / tour / ceremony, rung khi quà lớn.
  camera: z.strictObject({
    maxZoom: z.number().min(1).max(3),
    siteWidth: z.number().min(0.2).max(0.9),
    overviewEverySec: perCrowd(24 * 3600),
    overviewSec: z.number().min(3).max(60),
    tourEverySec: perCrowd(24 * 3600),
    tourSec: z.number().min(5).max(120),
    ceremonySec: z.number().min(1).max(60),
    ceremonyZoom: z.number().min(1).max(2),
    shakeMinCoins: int(1),
  }),
  // Chế độ độ đông (mục 9A): ngưỡng trên của vang, vua, dong theo người xem và người tương tác trong cửa sổ trượt.
  crowd: z
    .strictObject({
      viewers: z.tuple([int(0), int(0), int(0)]),
      interactors: z.tuple([int(0), int(0), int(0)]),
      windowSec: z.number().min(10).max(3600),
      hysteresisSec: z.number().min(0).max(3600),
      burstEvents: int(1),
      burstWindowSec: z.number().min(1).max(600),
    })
    .refine((c) => c.viewers[0] < c.viewers[1] && c.viewers[1] < c.viewers[2] && c.interactors[0] < c.interactors[1] && c.interactors[1] < c.interactors[2], {
      message: 'Ngưỡng độ đông phải tăng dần: vắng < vừa < đông',
    }),
  // Mức quà theo số xu một lần tặng (mục 9, 14.6): tên vật phẩm hiện trong {gift}, nhóm thoại cảm ơn.
  gifts: z.strictObject({
    tiers: z
      .array(
        z.strictObject({
          minCoins: int(0),
          name: z.string().min(1),
          dialogue: z.string().regex(/^gift_[a-z0-9_]+$/, 'Nhóm thoại cảm ơn quà phải bắt đầu bằng gift_'),
          /** Ảnh vật phẩm trong thông báo quà, ví dụ "items/brick" (thiếu thì bỏ qua). */
          icon: z.string().optional(),
          /** Hiệu ứng trên bản đồ (mục 9). Bỏ trống thì suy từ ảnh vật phẩm. */
          effect: z.enum(GIFT_EFFECTS).optional(),
        }),
      )
      .min(1)
      .refine((t) => t[0]!.minCoins === 0 && t.every((x, i) => i === 0 || x.minCoins > t[i - 1]!.minCoins), {
        message: 'Mức quà phải bắt đầu từ 0 xu và tăng dần',
      }),
    /** Tên tiếng Việt của quà gốc theo giftId (tùy chọn): có thì {gift} nhắc thêm tên quà. */
    displayNames: z.record(z.string(), z.string().min(1)),
  }),
  // Thông báo quà lớn (mục 8, bảng 9A): thời gian hiện, gộp quà nhỏ liên tiếp, ngưỡng theo chế độ.
  toast: z.strictObject({
    sec: z.number().min(1).max(20),
    mergeSec: z.number().min(0).max(60),
    smallMaxCoins: int(0),
    dongMinCoins: int(0),
    ratdongMinCoins: int(0),
    ratdongTopPercent: z.number().min(1).max(100),
    windowSec: z.number().min(10).max(3600),
  }),
  // Mục tiêu tim của phiên (bảng 9A): các nấc theo chế độ, phần thưởng (múa lân) dài bao lâu.
  heartGoal: z.strictObject({
    targets: z.strictObject({
      vang: z.array(int(1)).min(1),
      vua: z.array(int(1)).min(1),
      dong: z.array(int(1)).min(1),
      ratdong: z.array(int(1)).min(1),
    }),
    reward: z.string().min(1),
    festivalSec: z.number().min(3).max(120),
  }),
  // Trụ trì (mục 9, 9A, 9C): nhịp thoại tự do theo chế độ, ngưỡng vẫy chào / cúi chào, gộp chào và cảm ơn.
  abbot: z.strictObject({
    idleSec: z.strictObject({
      vang: z.tuple([z.number().min(0), z.number().min(0)]),
      vua: z.tuple([z.number().min(0), z.number().min(0)]),
      dong: z.tuple([z.number().min(0), z.number().min(0)]),
      ratdong: z.tuple([z.number().min(0), z.number().min(0)]),
    }),
    waveMinCoins: int(1),
    bowMinCoins: int(1),
    greetGroupSec: z.number().min(1).max(600),
    thanksGroupSec: z.number().min(1).max(600),
    maxQueue: int(1).max(50),
    progressMarks: z.array(z.number().min(1).max(99)),
  }),
  // Nhân vật trên bản đồ (mục 9, 9A): cao bao nhiêu đơn vị bản đồ (khoảng 1/8 chiều cao gác chuông), tối đa bao nhiêu người,
  // khi nào sinh nhân vật cho người xem, bao lâu không tương tác thì rời màn hình (theo chế độ độ đông).
  characters: z.strictObject({
    heightMap: z.number().min(10).max(300),
    maxCharacters: int(1).max(200),
    /** Sinh nhân vật khi: vào phòng (onJoin), đủ số tim / số comment trong phiên (0 = không sinh theo cách đó). Quà luôn sinh. */
    spawn: z.strictObject(
      Object.fromEntries(
        (['vang', 'vua', 'dong', 'ratdong'] as const).map((t) => [t, z.strictObject({ onJoin: z.boolean(), likes: int(0), comments: int(0) })]),
      ) as Record<'vang' | 'vua' | 'dong' | 'ratdong', z.ZodObject<{ onJoin: z.ZodBoolean; likes: z.ZodNumber; comments: z.ZodNumber }>>,
    ),
    /** Không tương tác quá bao nhiêu phút thì đi ra khỏi màn hình. */
    idleMin: perCrowd(24 * 60),
    /** Phòng rất đông: người tặng từ bigGiverCoins xu (trong phiên) được ở lại bigGiverIdleMin phút. */
    bigGiverCoins: int(1),
    bigGiverIdleMin: z.number().min(0).max(24 * 60),
    /** "Gần đây" khi xét người tặng nhiều nhất để giữ chỗ (phòng rất đông), giây. */
    topWindowSec: z.number().min(10).max(24 * 3600),
    /** Mỗi bao nhiêu giây cho một người hết giờ đi ra (rời dần, không biến mất cùng lúc). */
    leaveGapSec: z.number().min(0).max(60),
    /** Thả tim / bình luận: nhân vật làm nhanh hơn trong bao nhiêu giây. */
    boostSec: z.number().min(0).max(60),
    /** Số xe trâu, voi chạy cùng lúc tối đa (thừa thì chờ lượt). */
    maxVehicles: int(1).max(20),
  }),
  // Ô ghi danh (tượng võ tướng đá, mục 9): nhiều tượng hơn số ô thì mỗi bao nhiêu giây đổi sang lượt tượng khác.
  honor: z.strictObject({
    rotateSec: z.number().min(3).max(3600),
  }),
  // Lọc tên (mục 8): tên chứa từ cấm hiện labels.anonymousName.
  nameFilter: z.strictObject({
    bannedWords: z.array(z.string().min(1)),
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
    // Ô sự kiện (mục 8): {name}, {multiplier}; {time} là đồng hồ đếm ngược giờ vàng.
    // Mục tiêu tim: {count} tim đã có, {target}, {goal} = câu goal_text trong kho thoại, {reward}.
    events: z.strictObject({
      goldenHour: z.string().min(1),
      event: z.string().min(1),
      total: z.string().min(1),
      heartGoal: z.string().min(1),
      heartGoalDone: z.string().min(1),
    }),
    // Phòng đông: quà nhỏ chỉ hiện "+công" kèm tên: {points}, {unit}, {name}.
    plusPoints: z.string().min(1),
    // Chữ bay lên trên đầu nhân vật khi thả tim, bình luận được tính công (mục 9): {points}, {unit}.
    actorPlus: z.string().min(1),
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
export const dialoguesFileSchema = z
  .strictObject({
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
  })
  .superRefine((f, ctx) => {
    // Biến không hợp lệ trong câu (ví dụ {ten}) thì báo lỗi ngay, không để chữ "{ten}" hiện lên live (mục 9C).
    for (const [g, group] of Object.entries(f.groups)) {
      group.lines.forEach((l, i) => {
        for (const v of varsOf(l.text)) {
          if (!(DIALOGUE_VARS as readonly string[]).includes(v)) {
            ctx.addIssue({ code: 'custom', path: ['groups', g, 'lines', i, 'text'], message: `Biến {${v}} không hợp lệ. Dùng được: ${DIALOGUE_VARS.map((x) => `{${x}}`).join(' ')}` });
          }
        }
      });
    }
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
