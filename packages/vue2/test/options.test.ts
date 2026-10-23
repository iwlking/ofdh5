import { describe, it, expect } from 'vitest';
import { toOptions } from '../src/options';

describe('toOptions', () => {
  it('只保留有值的 props', () => {
    const options = toOptions({
      url: './a.ofd',
      scale: 1.5,
      zoomEnable: undefined,
      loadingBar: true,
    });
    expect(options).toEqual({ url: './a.ofd', scale: 1.5, loadingBar: true });
  });

  it('data 优先于 url', () => {
    const data = new Uint8Array([1, 2, 3]);
    expect(toOptions({ url: './a.ofd', data })).toEqual({ url: './a.ofd', data });
  });

  it('过滤掉组件内部字段', () => {
    const options = toOptions({ url: './a.ofd', pageChange: () => {}, $emit: () => {} } as never);
    expect(Object.keys(options)).toEqual(['url']);
  });
});
