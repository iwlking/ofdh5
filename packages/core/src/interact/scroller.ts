export function pageAtOffset(
  offsets: number[],
  heights: number[],
  scrollTop: number,
  viewportHeight: number,
): number {
  if (offsets.length === 0) return 0;
  // 以视口中线为探针：滚动超过约半屏即判定为下一页
  const probe = scrollTop + viewportHeight / 2;
  let result = 0;
  for (let i = 0; i < offsets.length; i++) {
    if (probe >= offsets[i]) result = i;
    else break;
  }
  const last = offsets.length - 1;
  return Math.max(0, Math.min(last, result));
}

const schedule: (cb: () => void) => number = typeof requestAnimationFrame === 'function'
  ? (cb) => requestAnimationFrame(cb)
  : (cb) => setTimeout(cb, 16) as unknown as number;

const unschedule: (id: number) => void = typeof cancelAnimationFrame === 'function'
  ? (id) => cancelAnimationFrame(id)
  : (id) => clearTimeout(id);

export class ScrollWatcher {
  private rafId = 0;
  private readonly handler = () => {
    if (this.rafId) return;
    this.rafId = schedule(() => {
      this.rafId = 0;
      this.onScroll(this.host.scrollTop);
    });
  };

  constructor(private readonly host: HTMLElement, private readonly onScroll: (scrollTop: number) => void) {
    this.host.addEventListener('scroll', this.handler, { passive: true });
  }

  destroy(): void {
    unschedule(this.rafId);
    this.host.removeEventListener('scroll', this.handler);
  }
}
