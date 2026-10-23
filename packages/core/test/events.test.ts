import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../src/events';
import { OfdError, isOfdError } from '../src/errors';

describe('EventBus', () => {
  it('触发回调并把实例作为 this', () => {
    const ctx = { name: 'ofd' };
    const bus = new EventBus<{ ping: (n: number) => void }>(ctx);
    let received = 0;
    let self: unknown = null;
    bus.on('ping', function (this: unknown, n: number) {
      received = n;
      self = this;
    });
    bus.trigger('ping', 7);
    expect(received).toBe(7);
    expect(self).toBe(ctx);
  });

  it('支持同一事件多个回调', () => {
    const bus = new EventBus<{ ping: () => void }>();
    const a = vi.fn();
    const b = vi.fn();
    bus.on('ping', a);
    bus.on('ping', b);
    bus.trigger('ping');
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it('off 移除指定事件的全部回调', () => {
    const bus = new EventBus<{ ping: () => void }>();
    const fn = vi.fn();
    bus.on('ping', fn);
    bus.off('ping');
    bus.trigger('ping');
    expect(fn).not.toHaveBeenCalled();
  });

  it('回调抛错不影响其他回调', () => {
    const bus = new EventBus<{ ping: () => void }>();
    const ok = vi.fn();
    bus.on('ping', () => { throw new Error('boom'); });
    bus.on('ping', ok);
    bus.trigger('ping');
    expect(ok).toHaveBeenCalledOnce();
  });
});

describe('OfdError', () => {
  it('携带错误码并可识别', () => {
    const err = new OfdError('E_NOT_ZIP', 'bad');
    expect(err.code).toBe('E_NOT_ZIP');
    expect(err.message).toBe('bad');
    expect(isOfdError(err)).toBe(true);
    expect(isOfdError(new Error('x'))).toBe(false);
  });
});
