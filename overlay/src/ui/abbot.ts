// Trụ trì trên overlay (mục 9 SPEC): vẽ trong không gian màn hình, không theo camera.
// - Đứng góc trái phía trên vùng comment; tự né sang phải nếu che hạng mục đang xây (main.ts chọn bên).
// - Dáng: chắp tay (mặc định), vẫy chào, cúi chào, dang tay. Server gửi tin "say" (dáng + câu + thời gian).
// - Bong bóng thoại hiện 4–6 giây. Câu chưa duyệt (chỉ có ở giả lập) có viền cam để dễ nhận ra.
// - Thiếu ảnh trụ trì thì vẽ dáng tạm, không crash.

import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import type { AbbotPose, ServerMessage } from '../../../shared/protocol.js';
import type { Art } from '../art.js';
import type { AbbotSide } from '../hudLayout.js';
import type { Rect } from '../layout.js';
import { C, FONT_BODY } from '../theme.js';

const POSES: AbbotPose[] = ['pray', 'wave', 'bow', 'welcome'];
const BUBBLE_MAX_W = 430;
const UNVERIFIED = 0xff8c1a;

export class AbbotView {
  readonly container = new Container();
  private readonly figure = new Container();
  private readonly sprite = new Sprite();
  private readonly placeholder = new Graphics();
  private readonly bubble = new Container();
  private readonly bubbleBg = new Graphics();
  private readonly text = new Text({
    text: '',
    style: { fontFamily: FONT_BODY, fontSize: 22, fontWeight: '600', fill: C.ink, wordWrap: true, wordWrapWidth: BUBBLE_MAX_W - 32, lineHeight: 30 },
  });
  private textures = new Map<AbbotPose, Texture>();
  private pose: AbbotPose = 'pray';
  private poseLeft = 0;
  private bubbleLeft = 0;
  private bubbleAlpha = 0;
  private verified = true;
  private side: AbbotSide = 'left';
  private wantSide: AbbotSide = 'left';
  private moveFade = 1;
  private pop = 0;
  private t = 0;

  constructor(private spots: Record<AbbotSide, Rect>) {
    this.sprite.anchor.set(0.5, 1);
    this.figure.addChild(this.placeholder, this.sprite);
    this.bubble.addChild(this.bubbleBg, this.text);
    this.bubble.alpha = 0;
    this.container.addChild(this.figure, this.bubble);
    this.place();
  }

  setArt(art: Art): void {
    this.textures.clear();
    for (const p of POSES) {
      const t = art.textures.get(`abbot/abbot_${p}`);
      if (t) this.textures.set(p, t);
    }
    this.applyPose();
  }

  setSpots(spots: Record<AbbotSide, Rect>): void {
    this.spots = spots;
    this.place();
  }

  /** Chọn bên đứng (mờ đi, đổi bên, hiện lại). */
  setSide(side: AbbotSide): void {
    this.wantSide = side;
  }

  private place(): void {
    const r = this.spots[this.side];
    this.figure.position.set(r.x + r.w / 2, r.y + r.h);
    this.layoutBubble();
  }

  private applyPose(): void {
    const tex = this.textures.get(this.pose) ?? this.textures.get('pray') ?? null;
    const r = this.spots[this.side];
    this.placeholder.clear();
    if (tex) {
      this.sprite.texture = tex;
      this.sprite.visible = true;
      this.sprite.scale.set(r.h / tex.height);
    } else {
      // Thiếu ảnh: dáng tạm (thân áo nâu, đầu tròn).
      this.sprite.visible = false;
      this.placeholder
        .roundRect(-r.w * 0.3, -r.h * 0.72, r.w * 0.6, r.h * 0.72, 30)
        .fill(0x8a5a2e)
        .circle(0, -r.h * 0.82, r.w * 0.16)
        .fill(0xf0c8a0);
    }
  }

  say(msg: Extract<ServerMessage, { type: 'say' }>): void {
    this.pose = msg.pose;
    this.poseLeft = msg.durationMs / 1000;
    this.pop = 1;
    this.applyPose();
    if (msg.text) {
      this.text.text = msg.text;
      this.verified = msg.verified;
      this.bubbleLeft = msg.durationMs / 1000;
      this.layoutBubble();
    }
  }

  private layoutBubble(): void {
    const r = this.spots[this.side];
    const w = Math.min(BUBBLE_MAX_W, Math.max(120, this.text.width + 32));
    const h = this.text.height + 24;
    // Bong bóng ở phía trên đầu, chìa về phía giữa màn hình; đuôi chỉ xuống đầu trụ trì.
    const headX = r.x + r.w / 2;
    const x = this.side === 'left' ? r.x + 24 : r.x + r.w - 24 - w;
    const y = r.y - h + 34;
    this.bubble.position.set(x, y);
    this.text.position.set(16, 12);
    const tipX = Math.max(24, Math.min(w - 24, headX - x));
    const border = this.verified ? { width: 2.5, color: C.brown } : { width: 4, color: UNVERIFIED };
    this.bubbleBg
      .clear()
      .roundRect(0, 0, w, h, 16)
      .fill({ color: 0xfffaf0, alpha: 0.96 })
      .stroke(border)
      .poly([tipX - 12, h - 1, tipX + 12, h - 1, tipX, h + 18])
      .fill({ color: 0xfffaf0, alpha: 0.96 });
  }

  tick(dt: number): void {
    this.t += dt;
    if (this.poseLeft > 0) {
      this.poseLeft -= dt;
      if (this.poseLeft <= 0 && this.pose !== 'pray') {
        this.pose = 'pray';
        this.applyPose();
      }
    }
    if (this.bubbleLeft > 0) this.bubbleLeft -= dt;
    const want = this.bubbleLeft > 0 ? 1 : 0;
    this.bubbleAlpha += (want - this.bubbleAlpha) * Math.min(1, dt * (want ? 8 : 4));
    // Đổi bên: mờ đi, dời, hiện lại.
    if (this.wantSide !== this.side) {
      this.moveFade -= dt * 3;
      if (this.moveFade <= 0) {
        this.moveFade = 0;
        this.side = this.wantSide;
        this.applyPose();
        this.place();
      }
    } else if (this.moveFade < 1) this.moveFade = Math.min(1, this.moveFade + dt * 3);
    this.bubble.alpha = this.bubbleAlpha * this.moveFade;
    this.bubble.visible = this.bubble.alpha > 0.01;
    this.figure.alpha = this.moveFade;
    // Thở nhẹ; đổi dáng thì nhún một chút.
    this.pop = Math.max(0, this.pop - dt * 4);
    this.figure.scale.set(1 + 0.04 * this.pop, 1 + 0.008 * Math.sin(this.t * 2) - 0.03 * this.pop);
  }

  /** Khung trụ trì đang đứng (để không đặt thứ khác đè lên). */
  get rect(): Rect {
    return this.spots[this.side];
  }
}
