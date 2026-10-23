const ARG_COUNT: Record<string, number> = { M: 2, L: 2, B: 6, Q: 4, A: 7, C: 0, S: 2 };
const SVG_OP: Record<string, string> = { M: 'M', L: 'L', B: 'C', Q: 'Q', A: 'A', C: 'Z', S: 'M' };

/**
 * OFD AbbreviatedData → SVG path 字符串（可直接 new Path2D(d)）
 * M/L/C 与 SVG 同名，B(三次贝塞尔)→C，Q(二次)→Q，A(弧)→A，C(闭合)→Z，S 按 M 处理。
 */
export function abbreviatedToSvgPath(source: string): string {
  const tokens = source.trim().split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const op = tokens[i];
    const svgOp = SVG_OP[op];
    if (!svgOp) {
      i += 1;
      continue;
    }
    const argc = ARG_COUNT[op] ?? 0;
    out.push(svgOp);
    for (let k = 0; k < argc; k++) {
      const token = tokens[i + 1 + k];
      if (token === undefined || SVG_OP[token]) break;
      out.push(token);
    }
    i += 1 + argc;
  }
  return out.join(' ');
}
