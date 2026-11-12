// Âm thanh trên overlay (mục 10A, giai đoạn 5b), dùng Howler.js (đóng gói cục bộ).
// - Hiệu ứng: mỗi nhóm nhiều biến thể, chọn shuffle / sequential / random, lệch cao độ ±5%; giới hạn chống ồn theo chế độ độ
//   đông (SoundGate: số âm cùng lúc, âm thi công mỗi giây, tim, ưu tiên). Tải sẵn khi mở overlay.
// - Nhạc nền: playlist theo tình huống (chế độ độ đông, giờ hoàng đạo, khánh thành); bài kế tiếp do server chọn (nhớ vị trí);
//   đổi chế độ độ đông thì đổi playlist ở cuối bài đang phát; chuyển bài / đổi playlist mờ chéo 2–3 giây; nhạc phát dạng stream.
//   Đoạn nhạc lễ, lễ hội, khánh thành hạng mục lớn phát đè lên nhạc đang chạy. Ducking: nhạc nền hạ xuống ~30% khi có quà lớn,
//   lễ, múa lân, thông báo quan trọng rồi lên lại mượt.
// - Âm thanh môi trường: gió, chuông gió, công trường xa (to dần theo độ đông, tắt ở phòng vắng), côn trùng ban đêm (giờ Việt Nam),
//   chim hót thưa thớt ban ngày.
// - Thiếu file: im lặng, không lỗi. Trình duyệt chặn tự phát: hiện nút "Bật âm thanh" (OBS thì không cần).

import { Howl, Howler } from 'howler';
import {
  emptyOrder,
  isNight,
  nextInOrder,
  SFX_GROUPS,
  SoundGate,
  tierLimits,
  type AudioSettings,
  type OrderState,
} from '../../../shared/audio.js';
import type { CrowdTier } from '../../../shared/protocol.js';

export interface AudioLibrary {
  music: Record<string, string[]>;
  sfx: Record<string, string[]>;
  ambient: Record<string, string[]>;
}

export interface SoundLog {
  t: number;
  group: string;
  ok: boolean;
  why: string;
}

const EMPTY: AudioLibrary = { music: {}, sfx: {}, ambient: {} };
const url = (file: string) => `/assets/audio/${file.split('/').map(encodeURIComponent).join('/')}`;
const nowMs = () => performance.now();

/** Phút trong ngày theo giờ Việt Nam (UTC+7). */
export function vnMinutes(d = new Date()): number {
  return (d.getUTCHours() * 60 + d.getUTCMinutes() + 7 * 60) % (24 * 60);
}

interface Track {
  howl: Howl;
  playlist: string;
  file: string;
  /** Độ to riêng (mờ vào / mờ ra) 0–1 và đích. */
  gain: number;
  target: number;
  /** Tốc độ đổi gain mỗi giây. */
  rate: number;
  ending: boolean;
  /** Bị hạ khi ducking (bài nền đang mờ ra); đoạn nhạc lễ thì không. */
  duckable: boolean;
}

interface Loop {
  howl: Howl;
  file: string;
  gain: number;
}

export class AudioEngine {
  private settings: AudioSettings | null = null;
  private lib: AudioLibrary = EMPTY;
  private version = '';
  private loadingVersion: string | null = null;
  private tier: CrowdTier = 'vua';
  private readonly gate = new SoundGate();
  private readonly orders = new Map<string, OrderState>();
  private readonly howls = new Map<string, Howl>();
  private readonly live = new Map<number, { howl: Howl; sid: number }>();
  private seq = 0;
  private readonly logList: SoundLog[] = [];
  // Nhạc nền
  private main: Track | null = null;
  private clips: Track[] = [];
  private wantPlaylist = '';
  private golden = false;
  private finale = false;
  private paused = false;
  private fetching = false;
  private duckUntil = 0;
  private duck = 1;
  // Môi trường
  private readonly loops = new Map<string, Loop>();
  private birdsAt = 0;
  /** Trình duyệt đang chặn tự phát (hiện nút "Bật âm thanh"). */
  blocked = false;

  constructor() {
    Howler.autoUnlock = true;
  }

  /** Nhật ký quyết định gần đây (phát / không phát và lý do), cho kiểm tra tự động. */
  log(): SoundLog[] {
    return [...this.logList];
  }

  private note(group: string, ok: boolean, why: string): void {
    this.logList.push({ t: Math.round(nowMs()), group, ok, why });
    if (this.logList.length > 200) this.logList.shift();
  }

  /** Cấu hình từ server (config/audio.json); version đổi thì tải lại danh sách file. */
  setSettings(s: AudioSettings, version: string): void {
    this.settings = s;
    if (version !== this.version && version !== this.loadingVersion) {
      this.loadingVersion = version;
      fetch('/api/audio/library', { cache: 'no-store' })
        .then((r) => r.json() as Promise<{ version: string; library: AudioLibrary }>)
        .then((r) => this.setLibrary(r.library, r.version))
        .catch(() => (this.loadingVersion = null));
    }
  }

  private setLibrary(lib: AudioLibrary, version: string): void {
    this.lib = lib;
    this.version = version;
    this.loadingVersion = null;
    // Bỏ âm không còn trong thư viện; tải sẵn hiệu ứng mới.
    const keep = new Set([...Object.values(lib.sfx).flat(), ...Object.values(lib.ambient).flat()]);
    for (const [f, h] of this.howls) {
      if (keep.has(f)) continue;
      h.unload();
      this.howls.delete(f);
    }
    for (const f of Object.values(lib.sfx).flat()) this.howl(f);
    for (const [g, l] of this.loops) {
      if (keep.has(l.file)) continue;
      l.howl.stop();
      this.loops.delete(g);
    }
    // Playlist đang phát hết bài (vừa thêm nhạc): thử phát.
    if (!this.main) this.wantPlaylist = '';
  }

  private howl(file: string, opts: { loop?: boolean } = {}): Howl {
    let h = this.howls.get(file);
    if (!h) {
      h = new Howl({
        src: [url(file)],
        preload: true,
        loop: opts.loop ?? false,
        onplayerror: () => {
          this.blocked = true;
        },
      });
      this.howls.set(file, h);
    }
    return h;
  }

  setTier(t: CrowdTier): void {
    this.tier = t;
  }

  private vol(channel: keyof AudioSettings['channels'], group = 1): number {
    const s = this.settings;
    if (!s || s.muted) return 0;
    return s.channels.master * s.channels[channel] * group;
  }

  /** Phát một nhóm hiệu ứng (qua giới hạn chống ồn). Trả về true nếu phát. */
  play(group: string): boolean {
    const s = this.settings;
    const info = SFX_GROUPS[group];
    if (!s || !info) return false;
    // Bước chân người mới vào chỉ ở phòng vắng, phòng vừa.
    if (group === 'footsteps' && this.tier !== 'vang' && this.tier !== 'vua') {
      this.note(group, false, 'không dùng ở chế độ này');
      return false;
    }
    const g = s.groups[group];
    if (!g) return false;
    const now = nowMs();
    const r = this.gate.request(group, info, g, tierLimits(s, this.tier), now);
    if (!r.ok) {
      this.note(group, false, r.reason);
      return false;
    }
    const files = this.lib.sfx[group] ?? [];
    const pick = nextInOrder(this.orders.get(group) ?? emptyOrder(), files.length, g.mode, Math.random);
    if (!pick) {
      this.note(group, false, 'chưa có file');
      return false;
    }
    this.orders.set(group, pick.state);
    const file = files[pick.index]!;
    const howl = this.howl(file);
    const id = ++this.seq;
    if (r.evict !== null) {
      const ev = this.live.get(r.evict);
      if (ev) ev.howl.stop(ev.sid);
      this.live.delete(r.evict);
    }
    const sid = howl.play();
    howl.volume(this.vol(info.channel, g.volume), sid);
    howl.rate(1 + (Math.random() * 2 - 1) * s.pitchJitter, sid);
    const dur = howl.duration(sid) || 1.5;
    this.gate.commit({ id, group, priority: info.priority, until: now + dur * 1000 }, info.kind, now, r.evict);
    this.live.set(id, { howl, sid });
    howl.once('end', () => {
      this.gate.ended(id);
      this.live.delete(id);
    }, sid);
    this.note(group, true, file);
    return true;
  }

  /** Hạ nhạc nền trong `sec` giây (quà lớn, lễ, múa lân, thông báo quan trọng). */
  duckFor(sec: number): void {
    this.duckUntil = Math.max(this.duckUntil, nowMs() + sec * 1000);
  }

  setGolden(on: boolean): void {
    if (on === this.golden) return;
    this.golden = on;
    this.wantPlaylist = '';
  }

  setFinale(on: boolean): void {
    if (on === this.finale) return;
    this.finale = on;
    this.wantPlaylist = '';
  }

  /** Playlist nền theo tình huống: khánh thành > giờ hoàng đạo > chế độ độ đông. */
  private mainPlaylist(): string {
    const sit = this.settings?.music.situations ?? {};
    if (this.finale) return sit.finale ?? 'finale';
    if (this.golden && (this.lib.music[sit.golden_hour ?? ''] ?? []).length) return sit.golden_hour!;
    return sit[this.tier] ?? '';
  }

  /** Đoạn nhạc lễ / lễ hội / khánh thành phát đè lên nhạc đang chạy (tình huống ceremony, milestone, festival). */
  clip(situation: 'ceremony' | 'milestone' | 'festival'): void {
    const playlist = this.settings?.music.situations[situation];
    if (!playlist || !(this.lib.music[playlist] ?? []).length) return;
    void this.nextFile(playlist).then((file) => {
      if (!file) return;
      const howl = new Howl({ src: [url(file)], html5: true, volume: 0 });
      const t: Track = { howl, playlist, file, gain: 0, target: 1, rate: 2, ending: false, duckable: false };
      howl.once('end', () => (t.ending = true));
      howl.play();
      this.clips.push(t);
      this.note(`clip:${situation}`, true, file);
      this.duckFor(Math.max(4, howl.duration() || 15));
    });
  }

  private async nextFile(playlist: string): Promise<string | null> {
    try {
      const r = (await (await fetch(`/api/audio/next?playlist=${encodeURIComponent(playlist)}`, { cache: 'no-store' })).json()) as { file: string | null };
      return r.file;
    } catch {
      return null;
    }
  }

  private report(): void {
    const m = this.main;
    void fetch('/api/audio/nowplaying', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playlist: m?.playlist ?? this.mainPlaylist(), file: m?.file ?? null, paused: this.paused }),
    }).catch(() => {});
  }

  /** Bắt đầu bài kế tiếp của playlist nền, mờ chéo với bài đang phát. */
  private startMain(playlist: string): void {
    if (this.fetching) return;
    this.fetching = true;
    void this.nextFile(playlist).then((file) => {
      this.fetching = false;
      const old = this.main;
      if (!file) {
        if (old) old.target = 0;
        this.main = null;
        this.wantPlaylist = playlist;
        this.report();
        return;
      }
      const cross = Math.max(0.1, this.settings?.music.crossfadeSec ?? 2.5);
      if (old) {
        old.target = 0;
        old.rate = 1 / cross;
        old.ending = true;
        this.clips.push(old); // mờ dần rồi bỏ
      }
      const howl = new Howl({
        src: [url(file)],
        html5: true,
        volume: 0,
        onplayerror: () => {
          this.blocked = true;
          howl.once('unlock', () => howl.play());
        },
      });
      const t: Track = { howl, playlist, file, gain: 0, target: 1, rate: 1 / cross, ending: false, duckable: true };
      // Hết bài: bài kế tiếp (playlist có thể đã đổi theo chế độ độ đông: đổi ở cuối bài, không cắt ngang).
      howl.once('end', () => {
        if (this.main === t) {
          this.main = null;
          this.wantPlaylist = '';
        }
      });
      if (!this.paused) howl.play();
      this.main = t;
      this.wantPlaylist = playlist;
      this.report();
    });
  }

  /** Lệnh từ admin. */
  command(cmd: 'next' | 'pause' | 'resume'): void {
    if (cmd === 'next') {
      this.paused = false;
      this.startMain(this.mainPlaylist());
    } else if (cmd === 'pause') {
      this.paused = true;
      this.main?.howl.pause();
      this.report();
    } else {
      this.paused = false;
      if (this.main) this.main.howl.play();
      else this.wantPlaylist = '';
      this.report();
    }
  }

  /** Người dùng bấm "Bật âm thanh". */
  unlock(): void {
    void Howler.ctx?.resume?.();
    this.blocked = false;
    if (this.main && !this.paused && !this.main.howl.playing()) this.main.howl.play();
  }

  tick(dt: number): void {
    const s = this.settings;
    if (!s) return;
    if (Howler.ctx && Howler.ctx.state === 'suspended' && Object.values(this.lib.sfx).flat().length + Object.values(this.lib.music).flat().length > 0) this.blocked = true;
    else if (Howler.ctx?.state === 'running' && this.main?.howl.playing()) this.blocked = false;
    // Nhạc nền: đúng playlist chưa? Đổi chế độ độ đông chỉ đổi ở cuối bài; giờ hoàng đạo, khánh thành đổi ngay (mờ chéo).
    const want = this.mainPlaylist();
    if (!this.paused && want) {
      if (!this.main && this.wantPlaylist !== want) this.startMain(want);
      else if (this.main && this.main.playlist !== want) {
        const urgent = this.finale || want === s.music.situations.golden_hour || this.main.playlist === s.music.situations.golden_hour || this.main.playlist === s.music.situations.finale;
        if (urgent) this.startMain(want);
      }
    }
    // Ducking: hạ nhanh, lên lại mượt.
    const now = nowMs();
    const target = now < this.duckUntil ? s.music.duckTo : 1;
    const speed = target < this.duck ? 3 : 1 / Math.max(0.1, s.music.duckReleaseSec);
    this.duck = target < this.duck ? Math.max(target, this.duck - speed * dt) : Math.min(target, this.duck + speed * dt);
    const mv = this.vol('music');
    if (this.main) {
      const m = this.main;
      m.gain = m.gain < m.target ? Math.min(m.target, m.gain + m.rate * dt) : Math.max(m.target, m.gain - m.rate * dt);
      m.howl.volume(mv * m.gain * this.duck);
    }
    for (let i = this.clips.length - 1; i >= 0; i--) {
      const c = this.clips[i]!;
      if (c.ending) c.target = 0;
      c.gain = c.gain < c.target ? Math.min(c.target, c.gain + c.rate * dt) : Math.max(c.target, c.gain - c.rate * dt);
      // Đoạn nhạc lễ không bị hạ (chính nó là âm chính lúc đó); bài nền cũ đang mờ ra thì theo duck.
      c.howl.volume(mv * c.gain * (c.duckable ? this.duck : 1));
      if (c.ending && c.gain <= 0.001) {
        c.howl.unload();
        this.clips.splice(i, 1);
      }
    }
    this.tickAmbient(dt, s);
  }

  private tickAmbient(dt: number, s: AudioSettings): void {
    const night = isNight(vnMinutes(), s.night.from, s.night.to);
    const want: Record<string, number> = {
      wind: 1,
      wind_chime: 1,
      site_murmur: s.siteMurmur[this.tier],
      night: night ? 1 : 0,
    };
    for (const g of Object.keys(want)) {
      const files = this.lib.ambient[g] ?? [];
      const cfg = s.ambient[g];
      const level = cfg?.enabled ? want[g]! * cfg.volume : 0;
      let l = this.loops.get(g);
      if (!l && files.length && level > 0) {
        const file = files[Math.floor(Math.random() * files.length)]!;
        const howl = new Howl({ src: [url(file)], loop: true, volume: 0, html5: false });
        howl.play();
        l = { howl, file, gain: 0 };
        this.loops.set(g, l);
      }
      if (!l) continue;
      // Mờ dần theo mức mong muốn (đổi chế độ độ đông, ngày / đêm).
      l.gain += (level - l.gain) * Math.min(1, dt * 0.5);
      l.howl.volume(this.vol('ambient', l.gain));
      if (level <= 0 && l.gain < 0.002) {
        l.howl.stop();
        l.howl.unload();
        this.loops.delete(g);
      }
    }
    // Chim hót thưa thớt ban ngày.
    const birds = this.lib.ambient.birds ?? [];
    const bc = s.ambient.birds;
    if (!night && birds.length && bc?.enabled) {
      const now = nowMs();
      if (!this.birdsAt) this.birdsAt = now + 5000;
      if (now >= this.birdsAt) {
        const [a, b] = s.birdsEverySec;
        this.birdsAt = now + (a + Math.random() * Math.max(0, b - a)) * 1000;
        const h = this.howl(birds[Math.floor(Math.random() * birds.length)]!);
        const sid = h.play();
        h.volume(this.vol('ambient', bc.volume), sid);
        h.rate(1 + (Math.random() * 2 - 1) * s.pitchJitter, sid);
      }
    }
  }

  /** Đang phát gì (cho kiểm tra tự động). */
  status(): { main: string | null; playlist: string; clips: number; loops: string[]; duck: number; blocked: boolean } {
    return {
      main: this.main?.file ?? null,
      playlist: this.mainPlaylist(),
      clips: this.clips.length,
      loops: [...this.loops.keys()],
      duck: Math.round(this.duck * 100) / 100,
      blocked: this.blocked,
    };
  }
}

