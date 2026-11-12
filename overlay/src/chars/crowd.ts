// Đám đông vô danh ở phòng rất đông (bảng 9A): nhóm hình người nhỏ không tên ở hậu cảnh, kèm bộ đếm "N người đang góp sức"
// (N = số người tương tác 5 phút, chữ lấy từ kho thoại nhóm crowd_counter). Không tính vào maxCharacters, không đi lại:
// đứng làm việc tại chỗ dọc lối đi quanh công trường, ưu tiên phía sau công trình (hậu cảnh).

import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { VIEWER_LOOKS, hash32 } from '../../../shared/characters.js';
import type { MapRect } from '../../../shared/map.js';
import type { MapPath } from '../../../shared/paths.js';
import type { AnonCrowd } from '../../../shared/protocol.js';
import { C, FONT_BODY } from '../theme.js';
import type { CharArt } from './charArt.js';
import { loopFrame } from './sprites.js';
import { crowdSpots, loiterPoints, type Pt } from './spots.js';

/** Cỡ hình người của đám đông so với nhân vật thường. */
export const CROWD_SCALE = 0.8;

interface Member {
  sprite: Sprite;
  look: (typeof VIEWER_LOOKS)[number];
  action: string | null;
  phase: number;
  alpha: number;
  leaving: boolean;
}

export class AnonCrowdView {
  private members: Member[] = [];
  private readonly counter = new Container();
  private readonly counterBg = new Graphics();
  private readonly counterText = new Text({ text: '', style: { fontFamily: FONT_BODY, fontSize: 18, fontWeight: '700', fill: C.goldLight, stroke: { color: 0x2a170b, width: 4 } } });
  private state: AnonCrowd | null = null;
  private spotsKey = '';
  private spots: Pt[] = [];
  private t = 0;
  private art: CharArt | null = null;

  constructor(
    private readonly depth: Container,
    screen: Container,
  ) {
    this.counterText.anchor.set(0.5);
    this.counter.addChild(this.counterBg, this.counterText);
    this.counter.visible = false;
    screen.addChild(this.counter);
  }

  setArt(art: CharArt): void {
    this.clear();
    this.art = art;
  }

  set(c: AnonCrowd | null): void {
    this.state = c;
    if (c && c.text !== this.counterText.text) {
      this.counterText.text = c.text;
      const w = this.counterText.width + 22;
      this.counterBg.clear().roundRect(-w / 2, -15, w, 30, 15).fill({ color: 0x2a170b, alpha: 0.6 }).stroke({ width: 1.5, color: C.gold, alpha: 0.8 });
    }
  }

  get count(): number {
    return this.members.filter((m) => !m.leaving).length;
  }

  tick(
    dt: number,
    ctx: {
      paths: MapPath[];
      site: { key: string; rect: MapRect; baseY: number } | null;
      view: MapRect;
      toScreen: (x: number, y: number) => Pt;
      heightMap: number;
      hidden: (p: Pt) => boolean;
    },
  ): void {
    this.t += dt;
    const want = this.state?.sprites ?? 0;
    const alive = this.members.filter((m) => !m.leaving);
    // Đổi công trường hoặc đổi số người: tính lại chỗ đứng.
    const key = `${ctx.site?.key ?? ''}:${want}`;
    if (key !== this.spotsKey && want > 0) {
      this.spotsKey = key;
      const v = ctx.view;
      // Chỉ phần giữa khung hình (trên cùng là thanh tiến độ, bảng xếp hạng; dưới cùng sát khu comment).
      const cands = loiterPoints(ctx.paths, { x: v.x + v.w * 0.08, y: v.y + v.h * 0.3, w: v.w * 0.84, h: v.h * 0.62 }, 22);
      this.spots = crowdSpots(cands, ctx.site, want, ctx.hidden);
    }
    if (alive.length < Math.min(want, this.spots.length)) {
      const i = this.members.length;
      const look = VIEWER_LOOKS[hash32(`crowd:${i}`) % VIEWER_LOOKS.length]!;
      const work = this.art?.frames.get(look)?.work;
      const acts = work ? [...work.keys()].filter((a) => ['rope', 'tile', 'hoe', 'lay', 'saw', 'sand', 'trowel', 'hammer'].includes(a)) : [];
      const s = new Sprite();
      this.depth.addChild(s);
      this.members.push({ sprite: s, look, action: acts.length ? acts[hash32(`act:${i}`) % acts.length]! : null, phase: (hash32(`ph:${i}`) % 1000) / 1000, alpha: 0, leaving: false });
    } else if (alive.length > want) alive[alive.length - 1]!.leaving = true;
    const h = ctx.heightMap * CROWD_SCALE;
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let shown = 0;
    let k = 0;
    for (let i = this.members.length - 1; i >= 0; i--) {
      const m = this.members[i]!;
      m.alpha = m.leaving ? Math.max(0, m.alpha - dt * 1.5) : Math.min(0.92, m.alpha + dt * 1.5);
      if (m.leaving && m.alpha <= 0) {
        m.sprite.destroy();
        this.members.splice(i, 1);
      }
    }
    for (const m of this.members) {
      const p = this.spots[k++ % Math.max(1, this.spots.length)];
      if (!p) {
        m.sprite.visible = false;
        continue;
      }
      const f = this.art?.frames.get(m.look);
      const frames = m.action ? (f?.work.get(m.action) ?? []) : (f?.walk.down.slice(0, 1) ?? []);
      const key2 = loopFrame(frames, this.t + m.phase * 3, 2) ?? f?.walk.down[0] ?? null;
      const ok = this.art?.apply(m.sprite, key2, h, m.phase > 0.5) ?? false;
      m.sprite.visible = ok;
      m.sprite.position.set(p.x, p.y);
      m.sprite.zIndex = p.y;
      m.sprite.alpha = m.alpha;
      if (!ok || m.leaving) continue;
      shown++;
      x0 = Math.min(x0, p.x);
      x1 = Math.max(x1, p.x);
      y0 = Math.min(y0, p.y - h);
    }
    // Bộ đếm ở trên nhóm người, không ra ngoài khung hình.
    this.counter.visible = !!this.state && shown > 0 && !!this.state.text;
    if (this.counter.visible) {
      const s = ctx.toScreen((x0 + x1) / 2, y0);
      const top = ctx.toScreen(ctx.view.x, ctx.view.y);
      const w = this.counterText.width + 22;
      this.counter.position.set(Math.max(w / 2 + 8, Math.min(1080 - 150 - w / 2, s.x)), Math.max(top.y + 20, s.y - 22));
    }
  }

  clear(): void {
    for (const m of this.members) m.sprite.destroy();
    this.members = [];
    this.spotsKey = '';
  }
}
