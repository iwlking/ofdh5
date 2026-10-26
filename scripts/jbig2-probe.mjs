#!/usr/bin/env node
// JBIG2 结构探针：解出 OFD 包内的 .jb2 并列出段结构，用于判断解码器要覆盖哪些段类型。
// 用法：node scripts/jbig2-probe.mjs <file.ofd|file.jb2> [zip-inner-path]
import { readFileSync } from 'node:fs';
import { unzipSync } from 'fflate';

// T.88 表 2 段类型（非连续编号）
const TYPE_NAMES = {
  0: 'symbol-dictionary',
  4: 'intermediate-text-region',
  6: 'immediate-text-region',
  7: 'immediate-lossless-text-region',
  16: 'pattern-dictionary',
  20: 'intermediate-halftone-region',
  22: 'immediate-halftone-region',
  23: 'immediate-lossless-halftone-region',
  36: 'intermediate-generic-region',
  38: 'immediate-generic-region',
  39: 'immediate-lossless-generic-region',
  40: 'intermediate-refinement-region',
  42: 'immediate-refinement-region',
  43: 'immediate-lossless-refinement-region',
  48: 'page-information',
  49: 'end-of-page',
  50: 'end-of-stripe',
  51: 'end-of-file',
  52: 'profiles',
  53: 'tables',
  62: 'extension',
};

function load(path, entry) {
  const raw = readFileSync(path);
  if (raw[0] === 0x50 && raw[1] === 0x4b) {
    const files = unzipSync(raw);
    const name =
      entry ||
      Object.keys(files).find((n) => /\.(jb2|jbig2)$/i.test(n)) ||
      Object.keys(files).find((n) => /jbig2|jb2/i.test(n));
    if (!name) throw new Error('压缩包内没有 .jb2 条目');
    return { name, data: files[name] };
  }
  return { name: path, data: raw };
}

const MAGIC = [0x97, 0x4a, 0x42, 0x32, 0x0d, 0x0a, 0x1a, 0x0a];

function readHeader(dv, p) {
  let q = p;
  const number = dv.getUint32(q); q += 4;
  const flags = dv.getUint8(q); q += 1;
  const type = flags & 0x3f;
  const pageAssocSize = (flags & 0x40) !== 0;
  const referred = dv.getUint8(q); q += 1;
  let count = (referred >> 5) & 7;
  if (referred === 7) {
    count = dv.getUint32(q - 1) & 0x1fffffff;
    q += 3 + ((count + 7) >> 3);
  }
  const numberSize = number <= 256 ? 1 : number <= 65536 ? 2 : 4;
  q += count * numberSize;
  const page = pageAssocSize ? dv.getUint32(q) : dv.getUint8(q);
  q += pageAssocSize ? 4 : 1;
  const length = dv.getUint32(q); q += 4;
  return { number, type, page, length, dataStart: q };
}

function describeGeneric(dv, start, extra = 0) {
  const width = dv.getUint32(start);
  const height = dv.getUint32(start + 4);
  const x = dv.getInt32(start + 8);
  const y = dv.getInt32(start + 12);
  const flags = dv.getUint8(start + 16 + extra);
  const mmr = (flags & 1) === 1;
  const template = (flags >> 1) & 3;
  const prediction = (flags & 8) !== 0;
  const at = [];
  const count = mmr ? 0 : template === 0 ? 4 : 1;
  for (let i = 0; i < count; i++) {
    at.push([dv.getInt8(start + 17 + extra + i * 2), dv.getInt8(start + 18 + extra + i * 2)]);
  }
  const causal = at.every(([x, y]) => y < 0 || (y === 0 && x < 0));
  return { width, height, x, y, coding: mmr ? 'MMR (T.6 G4)' : `arithmetic (template ${template})`, prediction, at, causal, headerExtra: extra };
}

const { name, data } = load(process.argv[2], process.argv[3]);
const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
const hasHeader = MAGIC.every((b, i) => data[i] === b);
console.log('file:', name, 'bytes:', data.length);
console.log('magic:', hasHeader ? 'JBIG2 file header present' : 'raw segment stream');
console.log('header:', [...data.subarray(0, Math.min(13, data.length))].map((b) => b.toString(16).padStart(2, '0')).join(' '));

// 段流起点：文件头之后，允许存在 1~4 字节非标准前缀
let offset = hasHeader ? 9 : 0;
for (; offset < Math.min((hasHeader ? 9 : 0) + 8, data.length); offset++) {
  try {
    const h = readHeader(dv, offset);
    if (h.type <= 62 && h.dataStart + h.length <= data.length) break;
  } catch {
    /* 继续探测 */
  }
}
console.log('segments start at: 0x' + offset.toString(16), '\n');

let count = 0;
while (offset < data.length) {
  const header = readHeader(dv, offset);
  const end = header.dataStart + header.length;
  if (end > data.length) {
    console.log(`  ! 段 ${header.number} 长度越界（${header.length}）`);
    break;
  }
  const typeName = TYPE_NAMES[header.type] ?? `unknown-${header.type}`;
  let extra = '';
  if (header.type >= 36 && header.type <= 39) {
    try {
      let info = describeGeneric(dv, header.dataStart);
      // 自适应模板像素指向未来像素 => 该段在标志字节前多写了 1 字节（见 render/jbig2.ts 的兼容分支）
      if (!info.mmr && !info.causal) info = describeGeneric(dv, header.dataStart, 1);
      extra = ' ' + JSON.stringify(info);
    } catch {
      extra = ' <段头被截断>';
    }
  }
  console.log(
    `  #${header.number} page=${header.page} type=${header.type} (${typeName}) len=${header.length}${extra}`,
  );
  count += 1;
  offset = end;
  if (header.type === 51) break;
}
console.log('\n段数:', count, '/ 已解析字节:', offset, '/', data.length);
