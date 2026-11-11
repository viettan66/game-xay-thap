// So bố cục với ảnh chụp màn hình live thật (R4, mục 15: "Kiểm tra với ảnh chụp màn hình live thật").
// Chỉ dùng khi bật khung debug (phím D), không bao giờ hiện khi live:
// - Kéo thả ảnh chụp màn hình điện thoại vào cửa sổ overlay: ảnh phủ mờ lên trên để so vùng an toàn.
// - Phím F: đổi cách khớp ảnh (vừa chiều cao / vừa chiều ngang / kéo giãn). [ ]: mờ hơn / đậm hơn. X: bỏ ảnh.
// Ảnh chỉ nằm trong trình duyệt, không gửi đi đâu.

type Fit = 'height' | 'width' | 'stretch';
const FIT_TEXT: Record<Fit, string> = { height: 'vừa chiều cao', width: 'vừa chiều ngang', stretch: 'kéo giãn' };

export class ScreenshotCompare {
  private readonly box = document.createElement('div');
  private readonly img = document.createElement('img');
  private readonly hint = document.createElement('div');
  private fit: Fit = 'height';
  private opacity = 0.5;
  private url: string | null = null;
  private on = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    Object.assign(this.box.style, { position: 'fixed', overflow: 'hidden', pointerEvents: 'none', zIndex: '5', display: 'none' });
    Object.assign(this.img.style, { position: 'absolute', display: 'block', maxWidth: 'none' });
    Object.assign(this.hint.style, {
      position: 'fixed', left: '8px', bottom: '8px', zIndex: '6', padding: '6px 10px', borderRadius: '6px',
      background: '#000c', color: '#fff', font: '13px "Segoe UI", sans-serif', pointerEvents: 'none', display: 'none',
    });
    this.box.appendChild(this.img);
    document.body.append(this.box, this.hint);
    this.img.addEventListener('load', () => this.layout());
    window.addEventListener('resize', () => this.layout());
    window.addEventListener('dragover', (e) => {
      if (this.on) e.preventDefault();
    });
    window.addEventListener('drop', (e) => {
      if (!this.on) return;
      e.preventDefault();
      const file = [...(e.dataTransfer?.files ?? [])].find((f) => f.type.startsWith('image/'));
      if (!file) return;
      if (this.url) URL.revokeObjectURL(this.url);
      this.url = URL.createObjectURL(file);
      this.img.src = this.url;
      this.refresh();
    });
    window.addEventListener('keydown', (e) => {
      if (!this.on || !this.url) return;
      const k = e.key.toLowerCase();
      if (k === 'f') this.fit = this.fit === 'height' ? 'width' : this.fit === 'width' ? 'stretch' : 'height';
      else if (e.key === '[') this.opacity = Math.max(0.1, this.opacity - 0.1);
      else if (e.key === ']') this.opacity = Math.min(1, this.opacity + 0.1);
      else if (k === 'x') {
        URL.revokeObjectURL(this.url);
        this.url = null;
        this.img.removeAttribute('src');
      } else return;
      this.refresh();
    });
  }

  set enabled(v: boolean) {
    this.on = v;
    this.refresh();
  }

  private refresh(): void {
    this.box.style.display = this.on && this.url ? 'block' : 'none';
    this.hint.style.display = this.on ? 'block' : 'none';
    this.hint.textContent = this.url
      ? `Ảnh live: ${FIT_TEXT[this.fit]}, đậm ${Math.round(this.opacity * 100)}%. F: đổi cách khớp · [ ]: mờ / đậm · X: bỏ ảnh`
      : 'Kéo thả ảnh chụp màn hình live (điện thoại) vào đây để so vùng an toàn.';
    this.img.style.opacity = String(this.opacity);
    this.layout();
  }

  private layout(): void {
    const r = this.canvas.getBoundingClientRect();
    Object.assign(this.box.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    const iw = this.img.naturalWidth || 1;
    const ih = this.img.naturalHeight || 1;
    let w = r.width;
    let h = r.height;
    if (this.fit === 'height') w = (iw / ih) * r.height;
    else if (this.fit === 'width') h = (ih / iw) * r.width;
    Object.assign(this.img.style, { width: `${w}px`, height: `${h}px`, left: `${(r.width - w) / 2}px`, top: `${(r.height - h) / 2}px` });
  }
}
