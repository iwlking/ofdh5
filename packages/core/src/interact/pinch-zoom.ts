export interface Point {
  x: number;
  y: number;
}

export interface PinchZoomOptions {
  minScale: number;
  maxScale: number;
  tapZoomFactor: number;
  enabled: boolean;
  /** 越界阻尼系数：0.35 表示超出部分只跟随 35%，松手后回弹 */
  damping?: number;
  onZoom?: (scale: number, origin: Point) => void;
  onZoomStart?: () => void;
  onZoomEnd?: (scale: number) => void;
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function center(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function pinchScale(startDistance: number, currentDistance: number, baseScale: number): number {
  if (startDistance <= 0) return baseScale;
  return (currentDistance / startDistance) * baseScale;
}

export class PinchZoom {
  private scaleValue = 1;
  private baseWidth = 0;
  private baseHeight = 0;
  /** 缩小到比视口小时，内容居中造成的偏移 */
  private offsetX = 0;
  private offsetY = 0;
  private startDistance = 0;
  private startScale = 1;
  private lastTapAt = 0;

  constructor(
    private readonly host: HTMLElement,
    private readonly target: HTMLElement,
    private readonly sizer: HTMLElement,
    private readonly options: PinchZoomOptions,
  ) {
    this.host.addEventListener('touchstart', this.handleStart, { passive: true });
    this.host.addEventListener('touchmove', this.handleMove, { passive: false });
    this.host.addEventListener('touchend', this.handleEnd);
  }

  get scale(): number {
    return this.scaleValue;
  }

  setBaseSize(width: number, height: number): void {
    this.baseWidth = width;
    this.baseHeight = height;
    // 固定缩放体的布局宽度：否则 sizer 变宽时块级 viewer 会被拉宽，
    // 页面因 margin:auto 重新居中，缩放锚点就跟着漂了（放大往一边跑）
    this.target.style.width = `${width}px`;
    this.render(this.scaleValue);
  }

  private handleStart = (event: TouchEvent): void => {
    if (!this.options.enabled) return;
    if (event.touches.length === 2) {
      this.startDistance = distance(this.pointOf(event.touches[0]), this.pointOf(event.touches[1]));
      this.startScale = this.scaleValue;
      this.options.onZoomStart?.();
      return;
    }
    if (event.touches.length === 1) {
      const now = Date.now();
      if (now - this.lastTapAt < 300) {
        this.lastTapAt = 0;
        const touch = event.touches[0];
        const next = this.scaleValue > this.options.minScale + 0.01
          ? this.options.minScale
          : clamp(this.options.tapZoomFactor, this.options.minScale, this.options.maxScale);
        this.zoomAt(next, touch.clientX, touch.clientY);
      } else {
        this.lastTapAt = now;
      }
    }
  };

  private handleMove = (event: TouchEvent): void => {
    if (!this.options.enabled || event.touches.length !== 2 || this.startDistance === 0) return;
    event.preventDefault();
    const currentDistance = distance(this.pointOf(event.touches[0]), this.pointOf(event.touches[1]));
    const raw = pinchScale(this.startDistance, currentDistance, this.startScale);
    const min = this.options.minScale;
    const max = this.options.maxScale;
    const damping = this.options.damping ?? 0.35;

    // 越界不做硬截断，按阻尼继续走一点，松手再回弹到边界
    let next = raw;
    if (raw < min) next = min - (min - raw) * damping;
    else if (raw > max) next = max + (raw - max) * damping;

    const mid = center(this.pointOf(event.touches[0]), this.pointOf(event.touches[1]));
    this.zoomAt(next, mid.x, mid.y, true);
  };

  private handleEnd = (): void => {
    if (this.startDistance === 0) return;
    this.startDistance = 0;
    const min = this.options.minScale;
    const max = this.options.maxScale;
    if (this.scaleValue < min - 0.001) this.springTo(min);
    else if (this.scaleValue > max + 0.001) this.springTo(max);
    else this.options.onZoomEnd?.(this.scaleValue);
  };

  /** 松手后弹回边界：以容器中心为锚点做 180ms 缓动 */
  private springTo(target: number): void {
    const rect = this.host.getBoundingClientRect();
    const anchorX = rect.left + rect.width / 2;
    const anchorY = rect.top + rect.height / 2;
    const from = this.scaleValue;
    const startedAt = performance.now();
    const duration = 180;
    const step = () => {
      const t = Math.min(1, (performance.now() - startedAt) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      this.zoomAt(from + (target - from) * eased, anchorX, anchorY, true);
      if (t < 1) this.raf(step);
      else this.options.onZoomEnd?.(this.scaleValue);
    };
    this.raf(step);
  }

  private raf(callback: () => void): void {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(callback);
    else setTimeout(callback, 16);
  }

  private pointOf(touch: Touch): Point {
    return { x: touch.clientX, y: touch.clientY };
  }

  /**
   * 以 (clientX, clientY) 为锚点缩放：按比例换算内容坐标后回填滚动位置，
   * 保证手指下方的点保持不动。
   */
  zoomAt(nextScale: number, clientX: number, clientY: number, allowOvershoot = false): void {
    const clamped = allowOvershoot
      ? nextScale
      : clamp(nextScale, this.options.minScale, this.options.maxScale);
    if (Math.abs(clamped - this.scaleValue) < 0.0005) return;

    const rect = this.host.getBoundingClientRect();
    const viewX = clientX - rect.left;
    const viewY = clientY - rect.top;

    // 换算回未缩放的基准坐标，缩放后回填滚动位置，手指下的点保持不动
    const baseX = (this.host.scrollLeft + viewX - this.offsetX) / this.scaleValue;
    const baseY = (this.host.scrollTop + viewY - this.offsetY) / this.scaleValue;

    this.render(clamped);

    this.host.scrollLeft = this.offsetX + baseX * clamped - viewX;
    this.host.scrollTop = this.offsetY + baseY * clamped - viewY;
    this.options.onZoom?.(clamped, { x: baseX * clamped, y: baseY * clamped });
  }

  setEnabled(enabled: boolean): void {
    (this.options as { enabled: boolean }).enabled = enabled;
  }

  setScale(nextScale: number): void {
    const rect = this.host.getBoundingClientRect();
    this.zoomAt(nextScale, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  /** 只做 CSS 变换与滚动容器尺寸同步，不改滚动位置 */
  private render(scale: number): void {
    this.scaleValue = scale;
    const scaledWidth = this.baseWidth * scale;
    const scaledHeight = this.baseHeight * scale;
    const hostWidth = this.host.clientWidth || scaledWidth;
    const hostHeight = this.host.clientHeight || scaledHeight;

    // 缩小到小于视口时居中，否则内容会贴左上角（pdfh5 用 margin auto 保持居中）
    this.offsetX = Math.max(0, (hostWidth - scaledWidth) / 2);
    this.offsetY = scaledHeight < hostHeight ? (hostHeight - scaledHeight) / 2 : 0;

    this.target.style.transformOrigin = '0 0';
    this.target.style.transform = `scale(${scale})`;
    this.target.style.marginLeft = `${this.offsetX}px`;
    this.target.style.marginTop = `${this.offsetY}px`;

    // 滚动容器尺寸不小于视口，保证放大后能滚到边缘、缩小后不出现空洞
    this.sizer.style.width = `${Math.round(Math.max(hostWidth, scaledWidth))}px`;
    this.sizer.style.height = `${Math.round(Math.max(hostHeight, scaledHeight))}px`;
  }

  reset(): void {
    this.render(1);
    this.host.scrollTop = 0;
    this.host.scrollLeft = 0;
    this.options.onZoom?.(1, { x: 0, y: 0 });
  }

  destroy(): void {
    this.host.removeEventListener('touchstart', this.handleStart);
    this.host.removeEventListener('touchmove', this.handleMove);
    this.host.removeEventListener('touchend', this.handleEnd);
  }
}
