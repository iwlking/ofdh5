/**
 * JBIG2 QM 算术解码器。
 *
 * 状态机与概率估计表依据 ITU-T T.88 (JBIG2) Annex E、ISO/IEC 15444-1 Annex C：
 * 每个上下文用 1 字节保存「状态索引 << 1 | MPS」，由调用方分配并按上下文标号索引。
 */

/** T.88 表 C.2：Qe 值（47 个状态） */
const QE = new Uint16Array([
  0x5601, 0x3401, 0x1801, 0x0ac1, 0x0521, 0x0221, 0x5601, 0x5401, 0x4801, 0x3801, 0x3001, 0x2401,
  0x1c01, 0x1601, 0x5601, 0x5401, 0x5101, 0x4801, 0x3801, 0x3401, 0x3001, 0x2801, 0x2401, 0x2201,
  0x1c01, 0x1801, 0x1601, 0x1401, 0x1201, 0x1101, 0x0ac1, 0x09c1, 0x08a1, 0x0521, 0x0441, 0x02a1,
  0x0221, 0x0141, 0x0111, 0x0085, 0x0049, 0x0025, 0x0015, 0x0009, 0x0005, 0x0001, 0x5601,
]);

/** 判定为 MPS 后的下一状态 */
const NMPS = new Uint8Array([
  1, 2, 3, 4, 5, 38, 7, 8, 9, 10, 11, 12, 13, 29, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
  25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 45, 46,
]);

/** 判定为 LPS 后的下一状态 */
const NLPS = new Uint8Array([
  1, 6, 9, 12, 29, 33, 6, 14, 14, 14, 17, 18, 20, 21, 14, 14, 15, 16, 17, 18, 19, 19, 20, 21,
  22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 46,
]);

/** 判定为 LPS 后是否交换 MPS */
const SWITCH = new Uint8Array(47);
SWITCH[0] = 1;
SWITCH[6] = 1;
SWITCH[14] = 1;

export class ArithmeticDecoder {
  private readonly data: Uint8Array;
  private readonly end: number;
  private bp: number;
  /** C 的高 16 位 */
  private chigh = 0;
  /** C 的低 16 位 */
  private clow = 0;
  /** 有效位数计数器 */
  private ct = 0;
  /** 当前区间宽度 */
  private a = 0x8000;

  constructor(data: Uint8Array, start = 0, end = data.length) {
    this.data = data;
    this.end = Math.min(end, data.length);
    this.bp = start;
    this.chigh = start < this.end ? data[start] : 0xff;
    this.clow = 0;
    this.byteIn();
    // INITDEC
    this.chigh = ((this.chigh << 7) & 0xffff) | ((this.clow >> 9) & 0x7f);
    this.clow = (this.clow << 7) & 0xffff;
    this.ct -= 7;
  }

  /** BYTEIN：0xFF 之后的下一字节只贡献 7 个有效位 */
  private byteIn(): void {
    const data = this.data;
    if (data[this.bp] === 0xff) {
      if (data[this.bp + 1] > 0x8f) {
        // 标记位，填充 0xFF00 并保留 8 位
        this.clow += 0xff00;
        this.ct = 8;
      } else {
        this.bp += 1;
        this.clow += data[this.bp] << 9;
        this.ct = 7;
      }
    } else {
      this.bp += 1;
      this.clow += this.bp < this.end ? data[this.bp] << 8 : 0xff00;
      this.ct = 8;
    }
    if (this.clow > 0xffff) {
      this.chigh += this.clow >> 16;
      this.clow &= 0xffff;
    }
  }

  /**
   * 解码一个判决位。
   * @param contexts 上下文表（1 字节 / 上下文）
   * @param cx 上下文标号
   */
  readBit(contexts: Uint8Array, cx: number): number {
    let index = contexts[cx] >> 1;
    let mps = contexts[cx] & 1;

    const qe = QE[index];
    let a = this.a - qe;
    let decided: number;

    if (this.chigh < qe) {
      // LPS 子区间：条件交换
      if (a < qe) {
        a = qe;
        decided = mps;
        index = NMPS[index];
      } else {
        a = qe;
        decided = 1 ^ mps;
        if (SWITCH[index]) mps = decided;
        index = NLPS[index];
      }
    } else {
      this.chigh -= qe;
      if ((a & 0x8000) !== 0) {
        this.a = a;
        return mps;
      }
      // MPS 子区间：条件交换
      if (a < qe) {
        decided = 1 ^ mps;
        if (SWITCH[index]) mps = decided;
        index = NLPS[index];
      } else {
        decided = mps;
        index = NMPS[index];
      }
    }

    // RENORMD
    do {
      if (this.ct === 0) this.byteIn();
      a <<= 1;
      this.chigh = ((this.chigh << 1) & 0xffff) | ((this.clow >> 15) & 1);
      this.clow = (this.clow << 1) & 0xffff;
      this.ct -= 1;
    } while ((a & 0x8000) === 0);

    this.a = a;
    contexts[cx] = (index << 1) | mps;
    return decided;
  }
}
