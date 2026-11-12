// Âm thanh (mục 10A SPEC, giai đoạn 5b). Hàm thuần, có test; server và overlay dùng chung.
// - Danh mục nhóm: playlist nhạc nền (assets/audio/music/<playlist>), nhóm hiệu ứng (assets/audio/sfx/<nhóm>),
//   âm thanh môi trường (assets/audio/ambient/<nhóm>). Chủ dự án chỉ cần thả file .ogg / .mp3 vào đúng thư mục.
// - Bộ chọn biến thể / bài: shuffle (hết vòng mới lặp, bài cuối vòng cũ không mở đầu vòng mới), sequential, random (tránh lặp).
// - Giới hạn chống ồn theo chế độ độ đông: số âm cùng lúc, âm thi công mỗi giây, tim, quà; ưu tiên lễ > quà lớn > giao diện
//   > quà nhỏ > thi công > tim.

import type { CrowdTier } from './protocol.js';

export type AudioChannel = 'master' | 'music' | 'sfx_construction' | 'sfx_gift' | 'sfx_ui' | 'sfx_ceremony' | 'ambient';
export const AUDIO_CHANNELS: AudioChannel[] = ['master', 'music', 'sfx_construction', 'sfx_gift', 'sfx_ui', 'sfx_ceremony', 'ambient'];

/** Độ ưu tiên khi quá giới hạn (bỏ âm ưu tiên thấp trước): lễ, mốc > quà lớn > giao diện > quà nhỏ > thi công > tim. */
export const PRIORITY = { like: 0, construction: 1, smallGift: 2, ui: 3, bigGift: 4, ceremony: 5 } as const;

export type SfxKind = 'construction' | 'like' | 'gift' | 'other';

export interface SfxGroupInfo {
  channel: AudioChannel;
  priority: number;
  kind: SfxKind;
  /** Mô tả cho README.txt trong thư mục và trang Âm thanh. */
  desc: string;
}

const C = (desc: string): SfxGroupInfo => ({ channel: 'sfx_construction', priority: PRIORITY.construction, kind: 'construction', desc });
const G = (desc: string, big = false): SfxGroupInfo => ({ channel: 'sfx_gift', priority: big ? PRIORITY.bigGift : PRIORITY.smallGift, kind: 'gift', desc });
const U = (desc: string): SfxGroupInfo => ({ channel: 'sfx_ui', priority: PRIORITY.ui, kind: 'other', desc });
const E = (desc: string): SfxGroupInfo => ({ channel: 'sfx_ceremony', priority: PRIORITY.ceremony, kind: 'other', desc });

/** Nhóm hiệu ứng (mục 10A, 14.14). */
export const SFX_GROUPS: Record<string, SfxGroupInfo> = {
  dig_shovel: C('Cuốc xẻng đào đất: đào móng, đào hồ, cắm mốc.'),
  stone_chisel: C('Đục, đập đá: nền móng, đá kê chân cột, thợ đục đá.'),
  wood_saw: C('Cưa xẻ gỗ (thợ mộc, dân phu cưa gỗ).'),
  wood_hammer: C('Đóng gỗ, dựng cột, ghép khung (tiếng vồ gỗ).'),
  nail_hammer: C('Đóng đinh (búa thợ mộc).'),
  brick_lay: C('Đặt gạch, trát vữa (xây tường, lát nền).'),
  pulley_rope: C('Ròng rọc, kéo dây khi dựng cột hoặc kéo vật liệu lên cao.'),
  tile_place: C('Lợp ngói: tiếng viên ngói đặt xuống.'),
  carry_drop: C('Đặt vật liệu xuống đống (gạch, gỗ, quang gánh).'),
  scaffold_remove: E('Tháo giàn giáo tre khi xong hạng mục.'),
  footsteps: C('Tiếng bước chân khi nhân vật mới đi vào (chỉ phòng vắng, phòng vừa).'),
  gift_small: G('Quà dưới 10 xu: tiếng nhẹ, vui (một viên gạch).'),
  gift_logs: G('Quà 10–99 xu: tiếng bó gỗ đặt xuống.'),
  gift_buffalo: G('Quà 100–499 xu: xe trâu (bánh xe lăn, tiếng trâu).', true),
  gift_elephant: G('Quà 500–999 xu: voi (tiếng voi, bước chân nặng).', true),
  gift_huge: G('Quà 1.000–4.999 xu, đúc đại hồng chung: tiếng kim loại, chuông đồng ngân ngắn.', true),
  gift_guardian: G('Quà từ 5.000 xu, đặt tượng võ tướng đá: tiếng đá nặng, trống.', true),
  like_pop: { channel: 'sfx_gift', priority: PRIORITY.like, kind: 'like', desc: 'Thả tim: tiếng rất nhỏ, nhẹ (bị giới hạn chặt).' },
  comment_tick: { channel: 'sfx_gift', priority: PRIORITY.smallGift, kind: 'other', desc: 'Bình luận được tính công: rất nhẹ. Mặc định TẮT.' },
  rank_up: { channel: 'sfx_gift', priority: PRIORITY.ui, kind: 'other', desc: 'Người xem lên danh hiệu mới.' },
  top_change: { channel: 'sfx_gift', priority: PRIORITY.ui, kind: 'other', desc: 'Có người mới vào top 3 bảng góp công.' },
  toast_in: U('Thông báo quà lớn hiện ra.'),
  abbot_speak: U('Bong bóng thoại trụ trì hiện ra (tiếng chuông gió nhẹ).'),
  golden_hour_start: U('Bắt đầu giờ hoàng đạo (tiếng cồng).'),
  golden_hour_end: U('Kết thúc giờ hoàng đạo (tiếng cồng).'),
  session_start: U('Mở phiên live.'),
  session_end: U('Kết phiên live.'),
  stage_complete: E('Xong một giai đoạn.'),
  item_complete: E('Xong một hạng mục.'),
  stele_rise: E('Bia đá trồi lên.'),
  milestone_bell: E('Lễ giai đoạn đặc biệt và khánh thành hạng mục lớn: chuông chùa ngân (chỉ dùng ở các mốc này).'),
  lion_dance: E('Múa lân: trống lân, chiêng, chập chả.'),
  lantern_release: E('Thả hoa đăng.'),
  goal_reached: E('Đạt mục tiêu tim của phiên.'),
  project_complete: E('Khánh thành toàn công trình.'),
  thunder: E('Sấm (thời tiết dông bão, dùng từ giai đoạn 5c).'),
};

/** Playlist nhạc nền (mục 10A): thư mục con trong assets/audio/music. */
export const MUSIC_PLAYLISTS: Record<string, string> = {
  calm: 'Phòng vắng: chậm, thư thái (nhạc cụ dân tộc không lời).',
  normal: 'Phòng vừa.',
  lively: 'Phòng đông, rất đông: nhịp nhanh, có trống.',
  golden_hour: 'Giờ hoàng đạo.',
  ceremony: 'Lễ giai đoạn đặc biệt, xong hạng mục: đoạn ngắn 10–20 giây, phát đè lên nhạc đang chạy.',
  milestone: 'Khánh thành hạng mục lớn (phát đè lên nhạc đang chạy).',
  festival: 'Lễ hội mở khóa khi đủ mục tiêu tim (múa lân).',
  finale: 'Khánh thành toàn công trình và credit.',
};

/** Tình huống → playlist (mặc định, sửa trên trang Âm thanh). */
export const MUSIC_SITUATIONS = ['vang', 'vua', 'dong', 'ratdong', 'golden_hour', 'ceremony', 'milestone', 'festival', 'finale'] as const;
export type MusicSituation = (typeof MUSIC_SITUATIONS)[number];

/** Âm thanh môi trường (mục 10A, 14.14): chạy lặp liên tục. */
export const AMBIENT_GROUPS: Record<string, string> = {
  wind: 'Gió nhẹ, chạy lặp liên tục.',
  birds: 'Chim hót, phát ngẫu nhiên thưa thớt (ban ngày).',
  wind_chime: 'Chuông gió xa, rất nhỏ.',
  site_murmur: 'Tiếng công trường xa (người nói lao xao, lách cách). To dần theo độ đông, tắt ở phòng vắng.',
  night: 'Ban đêm: côn trùng (theo giờ Việt Nam).',
  rain_light: 'Mưa nhỏ (dùng từ giai đoạn 5c).',
  rain_heavy: 'Mưa to (dùng từ giai đoạn 5c).',
  storm_wind: 'Gió bão (dùng từ giai đoạn 5c).',
};

/** Đuôi file âm thanh được nhận. */
export const AUDIO_EXT = ['.ogg', '.mp3'];

export type OrderMode = 'shuffle' | 'sequential' | 'random';

/** Vị trí trong vòng phát của một nhóm / playlist (lưu được). */
export interface OrderState {
  order: number[];
  position: number;
  last: number | null;
}

export const emptyOrder = (): OrderState => ({ order: [], position: 0, last: null });

function shuffled(n: number, rand: () => number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * Chọn phần tử kế tiếp (chỉ số 0..n-1) theo chế độ; trả về chỉ số và trạng thái mới. n = 0 thì null.
 * shuffle: hết vòng thì xáo vòng mới, phần tử cuối vòng cũ không đứng đầu vòng mới. random: tránh lặp lại ngay.
 */
export function nextInOrder(st: OrderState, n: number, mode: OrderMode, rand: () => number): { index: number; state: OrderState } | null {
  if (n <= 0) return null;
  if (mode === 'random') {
    let i = Math.floor(rand() * n);
    if (n > 1 && i === st.last) i = (i + 1 + Math.floor(rand() * (n - 1))) % n;
    return { index: i, state: { ...st, last: i } };
  }
  if (mode === 'sequential') {
    const i = st.position % n;
    return { index: i, state: { order: [], position: i + 1, last: i } };
  }
  let order = st.order.length === n ? st.order : [];
  let pos = order.length ? st.position : 0;
  if (pos >= order.length) {
    order = shuffled(n, rand);
    if (n > 1 && order[0] === st.last) [order[0], order[1]] = [order[1]!, order[0]!];
    pos = 0;
  }
  const i = order[pos]!;
  return { index: i, state: { order, position: pos + 1, last: i } };
}

// ---------- Giới hạn chống ồn ----------

export interface GroupLimits {
  enabled: boolean;
  cooldownMs: number;
  maxConcurrent: number;
}

export interface TierLimits {
  /** Số âm hiệu ứng phát cùng lúc tối đa. */
  maxConcurrent: number;
  /** Âm thi công mỗi giây tối đa (0 = không giới hạn). */
  constructionPerSec: number;
  /** Tim: tối thiểu bao nhiêu giây giữa hai lần (0 = mỗi lô tim một lần, âm = tắt). */
  likeGapSec: number;
}

export interface Playing {
  id: number;
  group: string;
  priority: number;
  until: number;
}

export type GateResult = { ok: true; evict: number | null } | { ok: false; reason: string };

/** Quyết định có phát một âm hay không (mục 10A "Giới hạn chống ồn"). Thuần, thời gian tính bằng ms. */
export class SoundGate {
  private playing: Playing[] = [];
  private readonly lastAt = new Map<string, number>();
  private tokens = 0;
  private tokensAt = 0;
  private lastLike = -Infinity;

  /** Các âm đang phát (sau khi bỏ âm đã hết). */
  active(now: number): Playing[] {
    this.playing = this.playing.filter((p) => p.until > now);
    return this.playing;
  }

  request(group: string, info: { priority: number; kind: SfxKind }, g: GroupLimits, t: TierLimits, now: number): GateResult {
    if (!g.enabled) return { ok: false, reason: 'tắt' };
    const last = this.lastAt.get(group) ?? -Infinity;
    if (now - last < g.cooldownMs) return { ok: false, reason: 'đang nghỉ' };
    const act = this.active(now);
    if (act.filter((p) => p.group === group).length >= g.maxConcurrent) return { ok: false, reason: 'nhóm đủ số âm' };
    if (info.kind === 'like') {
      if (t.likeGapSec < 0) return { ok: false, reason: 'tim tắt ở chế độ này' };
      if (now - this.lastLike < t.likeGapSec * 1000) return { ok: false, reason: 'tim quá dày' };
    }
    if (info.kind === 'construction' && t.constructionPerSec > 0) {
      // Thùng token: chứa tối đa 1 giây (ít nhất 1 token: rất đông 0,2 âm/giây = thi thoảng 1 âm nổi bật), mỗi âm thi công tốn 1 token.
      const cap = Math.max(1, t.constructionPerSec);
      this.tokens = Math.min(cap, this.tokens + ((now - this.tokensAt) / 1000) * t.constructionPerSec);
      this.tokensAt = now;
      if (this.tokens < 1) return { ok: false, reason: 'thi công quá dày' };
    }
    let evict: number | null = null;
    if (act.length >= t.maxConcurrent) {
      // Đầy: bỏ âm có ưu tiên thấp nhất (cũ nhất) nếu thấp hơn âm mới; không thì không phát âm mới.
      const low = [...act].sort((a, b) => a.priority - b.priority || a.until - b.until)[0]!;
      if (low.priority >= info.priority) return { ok: false, reason: 'quá nhiều âm cùng lúc' };
      evict = low.id;
    }
    return { ok: true, evict };
  }

  /** Ghi nhận đã phát (sau khi request ok). */
  commit(p: Playing, kind: SfxKind, now: number, evict: number | null): void {
    if (evict !== null) this.playing = this.playing.filter((x) => x.id !== evict);
    this.playing.push(p);
    this.lastAt.set(p.group, now);
    if (kind === 'like') this.lastLike = now;
    if (kind === 'construction') this.tokens -= 1;
  }

  /** Âm đã dừng sớm (bị bỏ, hết file). */
  ended(id: number): void {
    this.playing = this.playing.filter((p) => p.id !== id);
  }
}

/**
 * Quà này có phát âm quà không (bảng "Giới hạn chống ồn"): vắng, vừa mọi quà; đông quà từ giftMinCoins (10) xu;
 * rất đông theo cùng ngưỡng thông báo quà lớn (bigToast).
 */
export function giftSoundAllowed(tier: CrowdTier, coins: number, bigToast: boolean, dongMinCoins: number): boolean {
  if (tier === 'vang' || tier === 'vua') return true;
  if (tier === 'dong') return coins >= dongMinCoins;
  return bigToast;
}

/** Nhóm âm quà theo hiệu ứng quà (mục 9). */
export function giftSoundGroup(effect: string | null): string {
  switch (effect) {
    case 'logs':
      return 'gift_logs';
    case 'cart':
      return 'gift_buffalo';
    case 'elephant':
      return 'gift_elephant';
    case 'bell':
      return 'gift_huge';
    case 'statue':
      return 'gift_guardian';
    default:
      return 'gift_small';
  }
}

/** Âm khi mảnh vật liệu khớp vào chỗ, theo loại vật liệu của giai đoạn (props). */
export function pieceSoundGroup(prop: string): string {
  return prop === 'ngoi' ? 'tile_place' : prop === 'go' ? 'wood_hammer' : prop === 'da' ? 'stone_chisel' : prop === 'cat' ? 'dig_shovel' : 'brick_lay';
}

/** Âm theo động tác làm việc của nhân vật (tên ảnh động tác). Không có thì null. */
export function workSoundGroup(action: string | null): string | null {
  switch (action) {
    case 'hoe':
    case 'sand':
      return 'dig_shovel';
    case 'saw':
      return 'wood_saw';
    case 'hammer':
    case 'carve':
      return 'nail_hammer';
    case 'chisel':
    case 'stone':
      return 'stone_chisel';
    case 'lay':
    case 'trowel':
      return 'brick_lay';
    case 'rope':
      return 'pulley_rope';
    case 'tile':
      return 'tile_place';
    default:
      return null;
  }
}

/** Ban đêm theo giờ Việt Nam (from > to nghĩa là qua nửa đêm), "HH:MM". */
export function isNight(minutesOfDay: number, from: string, to: string): boolean {
  const m = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const a = m(from);
  const b = m(to);
  return a > b ? minutesOfDay >= a || minutesOfDay < b : minutesOfDay >= a && minutesOfDay < b;
}

// ---------- Cấu hình âm thanh (config/audio.json) gửi xuống overlay ----------

export interface AudioGroupSettings {
  volume: number;
  enabled: boolean;
  mode: OrderMode;
  cooldownMs: number;
  maxConcurrent: number;
}

type PerTier = { vang: number; vua: number; dong: number; ratdong: number };

export interface AudioSettings {
  muted: boolean;
  channels: Record<AudioChannel, number>;
  music: {
    situations: Record<string, string>;
    modes: Record<string, OrderMode>;
    crossfadeSec: number;
    duckTo: number;
    duckReleaseSec: number;
  };
  groups: Record<string, AudioGroupSettings>;
  ambient: Record<string, { volume: number; enabled: boolean }>;
  limits: {
    maxConcurrent: PerTier;
    constructionPerSec: PerTier;
    likeGapSec: PerTier;
    giftDongMinCoins: number;
    giftMergeSec: number;
  };
  pitchJitter: number;
  siteMurmur: PerTier;
  birdsEverySec: [number, number];
  night: { from: string; to: string };
}

/** Giới hạn của chế độ độ đông hiện tại. */
export function tierLimits(s: AudioSettings, tier: CrowdTier): TierLimits {
  return { maxConcurrent: s.limits.maxConcurrent[tier], constructionPerSec: s.limits.constructionPerSec[tier], likeGapSec: s.limits.likeGapSec[tier] };
}
