import { ArithmeticDecoder } from './arith';

export interface Bitmap {
  width: number;
  height: number;
  /** 1 = 前景（黑），0 = 背景 */
  data: Uint8Array;
}

export interface GenericRegionOptions {
  width: number;
  height: number;
  /** 模板号 0-3（T.88 6.2.5.3） */
  template: number;
  /** 是否使用典型预测（TPGDON） */
  prediction: boolean;
  /** 自适应模板像素：模板 0 需 4 组，其余模板 1 组 */
  at: ReadonlyArray<readonly [number, number]>;
}

/**
 * T.88 图 8-11 的模板固定像素（相对当前像素的偏移）。
 * 解码时会把自适应模板像素追加在末尾，再按 (y, x) 排序，从最高位开始依次占用比特。
 */
const TEMPLATES: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [
    [-1, -2], [0, -2], [1, -2],
    [-2, -1], [-1, -1], [0, -1], [1, -1], [2, -1],
    [-4, 0], [-3, 0], [-2, 0], [-1, 0],
  ],
  [
    [-1, -2], [0, -2], [1, -2], [2, -2],
    [-2, -1], [-1, -1], [0, -1], [1, -1], [2, -1],
    [-3, 0], [-2, 0], [-1, 0],
  ],
  [
    [-1, -2], [0, -2], [1, -2],
    [-2, -1], [-1, -1], [0, -1], [1, -1],
    [-2, 0], [-1, 0],
  ],
  [
    [-3, -1], [-2, -1], [-1, -1], [0, -1], [1, -1],
    [-4, 0], [-3, 0], [-2, 0], [-1, 0],
  ],
];

/** T.88 6.2.5.7：典型预测用的伪像素上下文 */
const PREDICTION_CONTEXT = [0x9b25, 0x0795, 0x00e5, 0x0195];

export function decodeGenericRegion(data: Uint8Array, opts: GenericRegionOptions): Bitmap {
  const { width, height } = opts;
  const template = TEMPLATES[opts.template];
  if (!template) throw new Error(`未知的通用区域模板：${opts.template}`);

  const offsets = template
    .concat(opts.at as ReadonlyArray<readonly [number, number]>)
    .map(([x, y]) => ({ x, y }))
    .sort((a, b) => a.y - b.y || a.x - b.x);

  const bits = offsets.length;
  const contexts = new Uint8Array(1 << 16);
  const decoder = new ArithmeticDecoder(data);
  const rows: Uint8Array[] = [];
  let ltp = 0;

  for (let y = 0; y < height; y++) {
    const row = new Uint8Array(width);
    rows.push(row);

    if (opts.prediction) {
      ltp ^= decoder.readBit(contexts, PREDICTION_CONTEXT[opts.template]);
      if (ltp) {
        // 整行与上一行相同（首行视为全 0）
        if (y > 0) row.set(rows[y - 1]);
        continue;
      }
    }

    for (let x = 0; x < width; x++) {
      let label = 0;
      for (let k = 0; k < bits; k++) {
        const px = x + offsets[k].x;
        const py = y + offsets[k].y;
        // 当前行已经解出的像素（x 更小者）参与上下文，未来行则视为 0
        if (px < 0 || px >= width || py < 0 || py > y) continue;
        if (rows[py][px]) label |= 1 << (bits - 1 - k);
      }
      row[x] = decoder.readBit(contexts, label);
    }
  }

  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) out.set(rows[y], y * width);
  return { width, height, data: out };
}
