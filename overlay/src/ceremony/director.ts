// Điều phối lễ trên overlay (mục 10, 14.4, 14.12). Nhận tin "ceremony" từ server, xếp hàng (queue.ts), diễn khi mảnh cuối
// của giai đoạn đã đặt xong, theo kịch bản từng loại:
// - stage_minor (2–3 giây, dồn thì ~1 giây): vòng bụi ở chân công trình, chữ giai đoạn mới hiện ngắn.
// - stage_ritual (~10 giây, dồn thì ~4 giây): camera đẩy vào, công trường tạm dừng, bia top người góp của giai đoạn.
//   (Trụ trì dang tay, nói nhóm stage_ritual: server lo.)
// - item_complete (nhỏ 8, vừa 15, lớn 25 giây): camera đẩy vào, đèn lồng sáng, bia của hạng mục; hạng mục lớn thêm múa lân,
//   pháo hoa, hoa đăng trên hồ sen (cuối lễ camera hạ xuống hồ). Giàn giáo đã tháo dần ở giai đoạn cuối (builder).
// - project_complete (≥ 60 giây): toàn cảnh, bia toàn công trình, đèn lồng các công trình, múa lân, pháo hoa, hoa đăng, rồi lia
//   giới thiệu; xong thì chuyển sang cảnh khánh thành lặp: camera lia chậm qua quần thể, credit cuộn chậm.
// - replay (admin chiếu lại bia): camera đẩy vào, bia.

import { Container } from 'pixi.js';
import type { MapRect } from '../../../shared/map.js';
import type { CameraMode, CeremonyInfo, CreditsInfo, CrowdTier } from '../../../shared/protocol.js';
import type { Art } from '../art.js';
import type { HudRects } from '../hudLayout.js';
import { CreditsView } from './credits.js';
import { DustRings, Fireworks, Lanterns, LotusLanterns, StageBanner } from './fx.js';
import { steleBox } from './layout.js';
import { CeremonyQueue, type Started } from './queue.js';
import { SteleView } from './stele.js';

/** Những gì bộ điều phối cần từ bản đồ, camera, công trường (MapView và main.ts cung cấp). */
export interface CeremonyHost {
  itemRect(itemId: string): MapRect | null;
  complexRect(): MapRect;
  /** Khung các công trình đứng đã xong (treo đèn lồng ngày khánh thành). */
  doneObjectRects(): MapRect[];
  /** Mặt nước hồ sen (đã xây xong) để thả hoa đăng; chưa có thì rỗng. */
  pondWaters(): MapRect[];
  isPast(itemId: string, stageIndex: number | null): boolean;
  camera(mode: Exclude<CameraMode, 'site'>, focus: MapRect | null, sec: number, force?: boolean): void;
  cameraMode(): CameraMode;
  cameraRelease(): void;
  pauseBuilder(on: boolean): void;
  setFinale(on: boolean): void;
  toScreen(x: number, y: number): { x: number; y: number };
  heightMap(): number;
  crowd(): CrowdTier;
  /** Múa lân (dùng chung với phần thưởng mục tiêu tim). */
  festival(sec: number): void;
  /** Âm thanh (mục 10A): phát nhóm hiệu ứng, hạ nhạc nền, đoạn nhạc lễ phát đè. */
  sound(group: string): void;
  duck(sec: number): void;
  clip(situation: 'ceremony' | 'milestone' | 'festival'): void;
}

interface Running {
  s: Started;
  t: number;
  actions: { at: number; run: () => void; done?: boolean }[];
  pauses: boolean;
}

export class CeremonyDirector {
  /** Lớp màn hình: bia, pháo hoa, chữ giai đoạn, credit. */
  readonly screen = new Container();
  /** Lớp bản đồ: đèn lồng, hoa đăng, vòng bụi. */
  readonly world = new Container();
  readonly queue = new CeremonyQueue();
  private readonly stele = new SteleView();
  private readonly fireworks = new Fireworks();
  private readonly lanterns = new Lanterns();
  private readonly lotus = new LotusLanterns();
  private readonly banner = new StageBanner();
  private readonly dust = new DustRings();
  private readonly credits = new CreditsView();
  private cur: Running | null = null;
  private rects: HudRects | null = null;
  private completed = false;
  private finale = false;
  private creditsSpeed = 45;
  private creditsLoading = false;

  constructor(private readonly host: CeremonyHost) {
    this.world.addChild(this.lotus.g, this.lanterns.g, this.dust.g);
    this.screen.addChild(this.credits.container, this.fireworks.g, this.stele.container, this.banner.container);
  }

  setArt(art: Art): void {
    this.stele.setArt(art);
  }

  setRects(r: HudRects): void {
    this.rects = r;
    const v = r.view;
    const w = Math.min(720, v.right - v.left - 80);
    const top = r.events.y + r.events.h + 16;
    this.credits.setRect({ x: (v.left + v.right) / 2 - w / 2, y: top, w, h: r.disclaimer.y - 16 - top });
  }

  /** Tin "ceremony" từ server. */
  push(c: CeremonyInfo): void {
    this.queue.push(c);
  }

  /** Mảnh cuối của giai đoạn vừa đặt xong (Builder). */
  stageDone(itemId: string, stageIndex: number, itemDone: boolean): void {
    this.queue.stageDone(itemId, stageIndex, itemDone);
  }

  /** Trạng thái công trình từ server: toàn công trình đã xong thì sau lễ khánh thành là cảnh khánh thành lặp + credit. */
  setCompleted(completed: boolean, creditsSpeed: number): void {
    this.creditsSpeed = creditsSpeed;
    if (completed !== this.completed) {
      this.completed = completed;
      if (!completed) this.setFinale(false);
    }
  }

  /** Lễ đang diễn (cho trang thử, test). */
  get current(): CeremonyInfo | null {
    return this.cur?.s.c ?? null;
  }

  /** Bia đang hiện (0–1). */
  get steleShown(): number {
    return this.stele.shown;
  }

  /** Độ đậm của các khung giao diện: mờ đi khi bia đang dựng (bia che giữa màn hình) và trong cảnh khánh thành. */
  get hudDim(): number {
    const s = this.stele.shown;
    return Math.min(1 - 0.75 * s, this.finale ? 0.25 : 1);
  }

  private setFinale(on: boolean): void {
    if (on === this.finale) return;
    this.finale = on;
    this.credits.on = on;
    this.host.setFinale(on);
    if (on && !this.credits.hasData && !this.creditsLoading) {
      this.creditsLoading = true;
      fetch('/api/credits', { cache: 'no-store' })
        .then((r) => r.json() as Promise<CreditsInfo>)
        .then((c) => this.credits.setData(c))
        .catch(() => {})
        .finally(() => (this.creditsLoading = false));
    }
  }

  private steleArea(): { left: number; right: number; top: number; bottom: number } {
    const r = this.rects;
    if (!r) return { left: 0, right: 930, top: 200, bottom: 1280 };
    return { left: r.view.left, right: r.view.right, top: r.view.top + 16, bottom: r.disclaimer.y - 4 };
  }

  private begin(s: Started): void {
    const c = s.c;
    const dur = s.durationSec;
    const h = this.host;
    const rect = c.itemId ? h.itemRect(c.itemId) : h.complexRect();
    const actions: Running['actions'] = [];
    const at = (t: number, run: () => void) => actions.push({ at: Math.max(0, Math.min(t, dur)), run });
    const steleOn = (from: number, to: number) => {
      if (!c.stele || to - from < 1.5) return;
      at(from, () => {
        this.stele.show(c.stele!, steleBox(this.steleArea()), to - from);
        h.sound('stele_rise');
      });
    };
    const lionDance = (sec: number) => {
      h.festival(sec);
      h.sound('lion_dance');
      h.clip('festival');
      h.duck(sec);
    };
    let pauses = false;
    this.fireworks.sparksPerBurst = h.crowd() === 'ratdong' ? 20 : h.crowd() === 'dong' ? 32 : 46;
    switch (c.kind) {
      case 'stage_minor': {
        at(0, () => h.sound('stage_complete'));
        if (rect) {
          at(0, () => this.dust.burst(rect.x + rect.w / 2, rect.y + rect.h, rect.w));
          if (c.banner) {
            const p = h.toScreen(rect.x + rect.w / 2, rect.y);
            const area = this.steleArea();
            at(0.1, () => this.banner.show(c.banner!, (area.left + area.right) / 2, Math.max(area.top + 260, Math.min(area.bottom - 260, p.y - 40)), Math.max(0.8, dur - 0.1)));
          }
        }
        break;
      }
      case 'stage_ritual': {
        pauses = true;
        at(0, () => {
          h.camera('ceremony', rect, dur);
          h.sound('milestone_bell');
          h.duck(dur);
          if (dur >= 6) h.clip('ceremony');
        });
        // Vài giây đầu ngắm công trình, rồi bia trồi lên (bia che giữa màn hình), thu bia trước khi hết lễ.
        steleOn(dur < 6 ? 0.5 : Math.min(2, dur * 0.2), dur < 6 ? dur : dur - 0.8);
        break;
      }
      case 'item_complete': {
        pauses = true;
        const pond = c.festival ? h.pondWaters() : [];
        const pondEnd = pond.length && dur >= 14 ? 6 : 0;
        at(0, () => {
          h.camera('ceremony', rect, dur - pondEnd);
          h.sound('item_complete');
          h.sound('scaffold_remove');
          h.duck(dur);
          if (c.festival) h.sound('milestone_bell');
          if (dur >= 6) h.clip(c.festival ? 'milestone' : 'ceremony');
        });
        if (rect) at(0.3, () => this.lanterns.hang(rect, dur + 1.5, h.heightMap()));
        steleOn(dur < 6 ? 0.5 : 3, dur - pondEnd - (dur < 6 ? 0 : 2));
        if (c.festival) {
          at(2, () => lionDance(Math.min(14, dur - 4)));
          at(1, () => this.fireworks.start(Math.max(2, dur - 4)));
          if (pond.length) {
            at(3, () => {
              this.lotus.release(pond, 18, 40, h.heightMap());
              h.sound('lantern_release');
            });
            // Cuối lễ: camera hạ xuống hồ sen ngắm hoa đăng.
            if (pondEnd) at(dur - pondEnd, () => h.camera('ceremony', boundsOf(pond), pondEnd));
          }
        }
        break;
      }
      case 'project_complete': {
        pauses = true;
        const tourAt = Math.min(18, dur * 0.3);
        at(0, () => {
          h.camera('ceremony', h.complexRect(), tourAt);
          h.sound('project_complete');
          h.sound('milestone_bell');
          h.duck(dur);
          h.clip('milestone');
        });
        at(0.5, () => {
          for (const r of h.doneObjectRects()) this.lanterns.hang(r, dur, h.heightMap());
        });
        steleOn(1.5, tourAt - 0.5);
        at(1, () => this.fireworks.start(dur - 5));
        at(3, () => lionDance(14));
        at(2, () => {
          this.lotus.release(h.pondWaters(), 24, 50, h.heightMap());
          h.sound('lantern_release');
        });
        // Lia giới thiệu toàn quần thể (từ trời xuống cổng tam quan).
        at(tourAt, () => h.camera('tour', null, dur - tourAt, true));
        break;
      }
      case 'replay': {
        at(0, () => h.camera('ceremony', rect ?? h.complexRect(), dur));
        steleOn(0.6, dur);
        break;
      }
    }
    if (pauses) h.pauseBuilder(true);
    this.cur = { s, t: 0, actions, pauses };
  }

  private end(): void {
    const r = this.cur;
    if (!r) return;
    this.cur = null;
    if (r.pauses) this.host.pauseBuilder(false);
    const m = this.host.cameraMode();
    if (r.s.c.kind !== 'stage_minor' && (m === 'ceremony' || (m === 'tour' && r.s.c.kind === 'project_complete'))) this.host.cameraRelease();
  }

  tick(dt: number): void {
    const view = this.rects?.view ?? { left: 0, right: 930, top: 180, bottom: 1320 };
    this.queue.update(dt, (id, st) => this.host.isPast(id, st));
    if (!this.cur) {
      const s = this.queue.next();
      if (s) this.begin(s);
    }
    const r = this.cur;
    if (r) {
      r.t += dt;
      for (const a of r.actions) {
        if (a.done || a.at > r.t) continue;
        a.done = true;
        a.run();
      }
      if (r.t >= r.s.durationSec) this.end();
    }
    // Toàn công trình đã xong và không còn lễ đang diễn / đang chờ: cảnh khánh thành lặp, credit.
    this.setFinale(this.completed && !this.cur && this.queue.length === 0);
    this.stele.tick(dt);
    this.fireworks.tick(dt, view);
    this.lanterns.tick(dt);
    this.lotus.tick(dt);
    this.banner.tick(dt);
    this.dust.tick(dt);
    this.credits.tick(dt, this.creditsSpeed);
  }

  /** Bỏ mọi hiệu ứng (đổi ảnh bản đồ). Hàng đợi lễ giữ nguyên. */
  clearFx(): void {
    if (this.cur?.pauses) this.host.pauseBuilder(false);
    this.cur = null;
    this.stele.clear();
    this.fireworks.clear();
    this.lanterns.clear();
    this.lotus.clear();
    this.dust.clear();
  }
}

function boundsOf(rs: MapRect[]): MapRect {
  const x0 = Math.min(...rs.map((r) => r.x));
  const y0 = Math.min(...rs.map((r) => r.y));
  const x1 = Math.max(...rs.map((r) => r.x + r.w));
  const y1 = Math.max(...rs.map((r) => r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
