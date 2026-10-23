export interface Point {
  x: number;
  y: number;
}

export interface PinchZoomOptions {
  minScale: number;
  maxScale: number;
  tapZoomFactor: number;
  enabled: boolean;
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
    const next = clamp(
      pinchScale(this.startDistance, currentDistance, this.startScale),
      this.options.minScale,
      this.options.maxScale,
    );
    const mid = center(this.pointOf(event.touches[0]), this.pointOf(event.touches[1]));
    this.zoomAt(next, mid.x, mid.y);
  };

  private handleEnd = (): void => {
    if (this.startDistance === 0) return;
    this.startDistance = 0;
    this.options.onZoomEnd?.(this.scaleValue);
  };

  private pointOf(touch: Touch): Point {
    return { x: touch.clientX, y: touch.clientY };
  }

  /**
   * 以 (clientX, clientY) 为锚点缩放：按比例换算内容坐标后回填滚动位置，
   * 保证手指下方的点保持不动。
   */
  zoomAt(nextScale: number, clientX: number, clientY: number): void {
    const clamped = clamp(nextScale, this.options.minScale, this.options.maxScale);
    const ratio = clamped / this.scaleValue;
    if (Math.abs(ratio - 1) < 0.0005) return;

    const rect = this.host.getBoundingClientRect();
    const offsetX = clientX - rect.left;
    const offsetY = clientY - rect.top;
    const contentX = this.host.scrollLeft + offsetX;
    const contentY = this.host.scrollTop + offsetY;

    this.render(clamped);
    this.host.scrollLeft = contentX * ratio - offsetX;
    this.host.scrollTop = contentY * ratio - offsetY;
    this.options.onZoom?.(clamped, { x: contentX * ratio, y: contentY * ratio });
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
    this.target.style.transformOrigin = '0 0';
    this.target.style.transform = `scale(${scale})`;
    this.sizer.style.width = `${Math.round(this.baseWidth * scale)}px`;
    this.sizer.style.height = `${Math.round(this.baseHeight * scale)}px`;
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
