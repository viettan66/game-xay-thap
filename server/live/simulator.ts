// Nguồn sự kiện GIẢ LẬP (mục 3 SPEC). CHỈ chạy ở hồ sơ test; overlay luôn hiện nhãn "CHẾ ĐỘ THỬ".
// Sinh người xem giả tên tiếng Việt, tốc độ chỉnh được, 4 kịch bản phòng vắng / vừa / đông / rất đông
// (kể cả số người xem) để thử mục 9A, và các nút bắn từng loại sự kiện.

import type { LiveEvent, LiveUser } from '../../shared/types.js';
import { BaseAdapter } from './adapter.js';

export type ScenarioKey = 'vang' | 'vua' | 'dong' | 'ratdong';

export interface ScenarioDef {
  label: string;
  /** Số người xem đồng thời (dao động trong khoảng này). */
  viewers: [number, number];
  /** Số người có tương tác (tim, comment, quà). */
  interactors: number;
  /** Số sự kiện mỗi phút ở tốc độ ×1. */
  perMinute: { join: number; like: number; comment: number; gift: number };
  likeBatch: [number, number];
}

// Con số chọn để nằm gọn trong ngưỡng mặc định của mục 9A.
export const SCENARIOS: Record<ScenarioKey, ScenarioDef> = {
  vang: {
    label: 'Phòng vắng',
    viewers: [2, 5],
    interactors: 3,
    perMinute: { join: 0.5, like: 2, comment: 1.5, gift: 0.2 },
    likeBatch: [1, 15],
  },
  vua: {
    label: 'Phòng vừa',
    viewers: [10, 45],
    interactors: 15,
    perMinute: { join: 4, like: 12, comment: 6, gift: 1 },
    likeBatch: [1, 30],
  },
  dong: {
    label: 'Phòng đông',
    viewers: [70, 280],
    interactors: 80,
    perMinute: { join: 20, like: 60, comment: 30, gift: 6 },
    likeBatch: [5, 60],
  },
  ratdong: {
    label: 'Phòng rất đông',
    viewers: [400, 1500],
    interactors: 300,
    perMinute: { join: 60, like: 300, comment: 120, gift: 30 },
    likeBatch: [10, 100],
  },
};

export const SCENARIO_KEYS = Object.keys(SCENARIOS) as ScenarioKey[];

// Nút bắn quà theo từng mức hiệu ứng (mục 9): gạch (1 xu), bó gỗ (30), xe trâu (100), voi (500), chuông (1.000), tượng (5.000).
export const FIRE_KINDS = ['gift_small', 'gift_logs', 'gift_medium', 'gift_elephant', 'gift_large', 'gift_statue', 'like_1000', 'comment', 'join', 'burst'] as const;
export type FireKind = (typeof FIRE_KINDS)[number];

interface GiftDef {
  id: string;
  name: string;
  coins: number;
  weight: number;
  combo: boolean;
}

// Quà ngẫu nhiên tối đa 1.000 xu để công trình không nhảy quá xa khi thử. Quà rất lớn bắn bằng nút.
const GIFTS: GiftDef[] = [
  { id: 'rose', name: 'Rose', coins: 1, weight: 40, combo: true },
  { id: 'finger_heart', name: 'Finger Heart', coins: 5, weight: 20, combo: true },
  { id: 'doughnut', name: 'Doughnut', coins: 30, weight: 12, combo: false },
  { id: 'hand_hearts', name: 'Hand Hearts', coins: 100, weight: 8, combo: false },
  { id: 'corgi', name: 'Corgi', coins: 299, weight: 4, combo: false },
  { id: 'money_gun', name: 'Money Gun', coins: 500, weight: 3, combo: false },
  { id: 'galaxy', name: 'Galaxy', coins: 1000, weight: 2, combo: false },
  // Chỉ bắn bằng nút (không có trong quà ngẫu nhiên).
  { id: 'castle', name: 'Castle', coins: 5000, weight: 0, combo: false },
];

const COMMENTS = [
  'Chào thầy ạ',
  'Xây nhanh lên nào!',
  'Đang xây tới đâu rồi mọi người?',
  'Mình mới vào',
  'Đẹp quá',
  'Cố lên công trường ơi',
  'Chùa đẹp dần rồi kìa',
  'Góp một viên gạch nè',
  'Hello cả nhà',
  'hạng',
];

// Mulberry32: số ngẫu nhiên có hạt giống, để test lặp lại được.
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HO = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý'];
const DEM = ['Văn', 'Thị', 'Minh', 'Thu', 'Ngọc', 'Hoàng', 'Thanh', 'Gia', 'Bảo', 'Khánh', 'Đức', 'Quỳnh'];
const TEN = [
  'An', 'Bình', 'Châu', 'Dũng', 'Giang', 'Hà', 'Hải', 'Hạnh', 'Hiếu', 'Hoa', 'Hùng', 'Hương', 'Khoa', 'Lan', 'Linh',
  'Long', 'Mai', 'Minh', 'My', 'Nam', 'Nga', 'Ngân', 'Nhung', 'Phong', 'Phúc', 'Phương', 'Quân', 'Quang', 'Sơn',
  'Tâm', 'Thảo', 'Thắng', 'Trang', 'Trung', 'Tú', 'Tuấn', 'Vy', 'Yến',
];

const ascii = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

/** Tên giả cố định theo số thứ tự (cùng người luôn cùng tên). Có đủ kiểu: tên đầy đủ, tên dài, không dấu, có emoji. */
export function fakeName(index: number): string {
  const r = seededRng(index * 7919 + 17);
  const pick = <T>(arr: T[]) => arr[Math.floor(r() * arr.length)]!;
  const style = Math.floor(r() * 10);
  const ten = pick(TEN);
  switch (style) {
    case 0:
    case 1:
    case 2:
      return `${pick(HO)} ${pick(DEM)} ${ten}`;
    case 3:
    case 4:
      return `${ten} ${pick(TEN)}`;
    case 5:
      return `${ascii(ten)}${ascii(pick(TEN))}${10 + Math.floor(r() * 90)}`;
    case 6:
      return `${pick(['Bé', 'Cô', 'Anh', 'Chị', 'Bác'])} ${ten}`;
    case 7:
      return `${pick(HO)} ${pick(DEM)} ${pick(DEM)} ${ten} ${pick(TEN)}`;
    case 8:
      return `${ten} ${pick(['🌸', '🌻', '⭐', '🍀'])}`;
    default:
      return `${ten} ${pick(['Sài Gòn', 'Hà Nội', 'Huế', 'Cần Thơ', 'Đà Nẵng'])}`;
  }
}

export function fakeUser(index: number): LiveUser {
  return { platformId: `sim-${index}`, uniqueId: `sim_user_${index}`, nickname: fakeName(index) };
}

export interface SimulatorOptions {
  scenario: ScenarioKey;
  speed: number;
  now?: () => number;
  seed?: number;
  /** Tự chạy bằng đồng hồ thật (mặc định có). Test tắt đi rồi gọi advance(). */
  useTimer?: boolean;
  tickMs?: number;
}

export const SPEED_MIN = 0.25;
export const SPEED_MAX = 10;
const VIEWERS_EVERY_MS = 10_000;
const BURST_SIZE = 150;

export class SimulatorAdapter extends BaseAdapter {
  readonly source = 'simulator' as const;
  private scenarioKey: ScenarioKey;
  private speedValue: number;
  private readonly now: () => number;
  private readonly rng: () => number;
  private readonly useTimer: boolean;
  private readonly tickMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTick = 0;
  private sinceViewers = 0;
  private carry = { join: 0, like: 0, comment: 0, gift: 0 };
  private viewers = 0;
  private seq = 0;
  private readonly idPrefix: string;
  private isRunning = false;

  constructor(o: SimulatorOptions) {
    super();
    this.scenarioKey = o.scenario;
    this.speedValue = clampSpeed(o.speed);
    this.now = o.now ?? Date.now;
    this.rng = seededRng(o.seed ?? Date.now());
    this.useTimer = o.useTimer ?? true;
    this.tickMs = o.tickMs ?? 250;
    this.idPrefix = `sim-${this.now().toString(36)}`;
    this.resetViewers();
    this.setStatus({ state: 'offline' });
  }

  get scenario(): ScenarioKey {
    return this.scenarioKey;
  }

  get speed(): number {
    return this.speedValue;
  }

  get running(): boolean {
    return this.isRunning;
  }

  get viewerCount(): number {
    return this.viewers;
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTick = this.now();
    this.setStatus({ state: 'connected' });
    this.emitViewers();
    if (this.useTimer) {
      this.timer = setInterval(() => {
        const t = this.now();
        this.advance(t - this.lastTick);
      }, this.tickMs);
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (!this.isRunning) return;
    this.isRunning = false;
    this.setStatus({ state: 'offline' });
  }

  setScenario(key: ScenarioKey): void {
    this.scenarioKey = key;
    this.resetViewers();
    if (this.isRunning) this.emitViewers();
  }

  setSpeed(speed: number): void {
    this.speedValue = clampSpeed(speed);
  }

  /** Sinh sự kiện cho khoảng thời gian dtMs vừa trôi qua (đồng hồ thật hoặc test gọi trực tiếp). */
  advance(dtMs: number): void {
    if (!this.isRunning || dtMs <= 0) return;
    this.lastTick += dtMs;
    const def = SCENARIOS[this.scenarioKey];
    const minutes = (dtMs * this.speedValue) / 60_000;
    for (const kind of ['join', 'like', 'comment', 'gift'] as const) {
      // Thêm chút ngẫu nhiên (±50%) để nhịp sự kiện không đều đặn máy móc.
      this.carry[kind] += def.perMinute[kind] * minutes * (0.5 + this.rng());
      while (this.carry[kind] >= 1) {
        this.carry[kind] -= 1;
        this.emitRandom(kind);
      }
    }
    this.sinceViewers += dtMs;
    while (this.sinceViewers >= VIEWERS_EVERY_MS) {
      this.sinceViewers -= VIEWERS_EVERY_MS;
      this.walkViewers();
      this.emitViewers();
    }
  }

  /** Nút bắn thử trên admin. */
  fire(kind: FireKind): void {
    const user = this.randomInteractor();
    switch (kind) {
      case 'gift_small':
        return this.emitGift(user, GIFTS[0]!, 1 + Math.floor(this.rng() * 5));
      case 'gift_logs':
        return this.emitGift(user, GIFTS[2]!, 1);
      case 'gift_medium':
        return this.emitGift(user, GIFTS[3]!, 1);
      case 'gift_elephant':
        return this.emitGift(user, GIFTS[5]!, 1);
      case 'gift_large':
        return this.emitGift(user, GIFTS[6]!, 1);
      case 'gift_statue':
        return this.emitGift(user, GIFTS[7]!, 1);
      case 'like_1000':
        return this.emitEvent({ type: 'like', user, count: 1000, ts: this.now() });
      case 'comment':
        return this.emitRandom('comment');
      case 'join':
        return this.emitEvent({ type: 'join', user: fakeUser(this.randomInt(0, 2000)), ts: this.now() });
      case 'burst':
        for (let i = 0; i < BURST_SIZE; i++) {
          const r = this.rng();
          this.emitRandom(r < 0.6 ? 'like' : r < 0.9 ? 'comment' : 'gift');
        }
        return;
    }
  }

  private emitRandom(kind: 'join' | 'like' | 'comment' | 'gift'): void {
    const def = SCENARIOS[this.scenarioKey];
    const ts = this.now();
    if (kind === 'join') {
      // Người vào phòng có thể là người chỉ xem, không tương tác.
      this.emitEvent({ type: 'join', user: fakeUser(this.randomInt(0, def.viewers[1] - 1)), ts });
      return;
    }
    const user = this.randomInteractor();
    if (kind === 'like') {
      this.emitEvent({ type: 'like', user, count: this.randomInt(def.likeBatch[0], def.likeBatch[1]), ts });
    } else if (kind === 'comment') {
      this.emitEvent({ type: 'comment', user, text: COMMENTS[this.randomInt(0, COMMENTS.length - 1)]!, ts });
    } else {
      const gift = this.pickGift();
      this.emitGift(user, gift, gift.combo ? this.randomInt(1, 10) : 1);
    }
  }

  private emitGift(user: LiveUser, gift: GiftDef, count: number): void {
    // Quà combo chỉ gửi một sự kiện khi combo kết thúc, giống TikTok (repeatEnd).
    this.emitEvent({
      type: 'gift',
      user,
      giftId: gift.id,
      giftName: gift.name,
      coinValueEach: gift.coins,
      count,
      ts: this.now(),
    });
  }

  private emitEvent(ev: LiveEvent): void {
    this.seq += 1;
    this.emit({ ...ev, eventId: `${this.idPrefix}-${this.seq}` });
  }

  private emitViewers(): void {
    this.emitEvent({ type: 'viewers', count: this.viewers, ts: this.now() });
  }

  private randomInteractor(): LiveUser {
    return fakeUser(this.randomInt(0, SCENARIOS[this.scenarioKey].interactors - 1));
  }

  private pickGift(): GiftDef {
    const total = GIFTS.reduce((a, g) => a + g.weight, 0);
    let r = this.rng() * total;
    for (const g of GIFTS) {
      r -= g.weight;
      if (r < 0) return g;
    }
    return GIFTS[0]!;
  }

  private resetViewers(): void {
    const [lo, hi] = SCENARIOS[this.scenarioKey].viewers;
    this.viewers = Math.round((lo + hi) / 2);
  }

  private walkViewers(): void {
    const [lo, hi] = SCENARIOS[this.scenarioKey].viewers;
    const step = Math.max(1, Math.round((hi - lo) * 0.1));
    this.viewers = Math.min(hi, Math.max(lo, this.viewers + this.randomInt(-step, step)));
  }

  private randomInt(lo: number, hi: number): number {
    return lo + Math.floor(this.rng() * (hi - lo + 1));
  }
}

export function clampSpeed(x: number): number {
  if (!Number.isFinite(x)) return 1;
  return Math.min(SPEED_MAX, Math.max(SPEED_MIN, x));
}
