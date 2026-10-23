type HandlerMap = Record<string, (...args: any[]) => void>;

export class EventBus<T extends HandlerMap> {
  private handlers: Partial<Record<keyof T, Array<(...args: any[]) => void>>> = {};

  /** @param context 回调执行时的 this，通常是持有事件总线的实例 */
  constructor(private readonly context?: unknown) {}

  on<K extends keyof T>(type: K, callback: T[K]): void {
    (this.handlers[type] ||= []).push(callback);
  }

  off<K extends keyof T>(type: K): void {
    delete this.handlers[type];
  }

  trigger<K extends keyof T>(type: K, ...args: Parameters<T[K]>): void {
    const list = this.handlers[type];
    if (!list) return;
    for (const fn of [...list]) {
      try {
        fn.apply((this.context as object | undefined) ?? this, args);
      } catch (error) {
        console.warn('[ofdh5] 事件回调异常:', type, error);
      }
    }
  }

  clear(): void {
    this.handlers = {};
  }
}
