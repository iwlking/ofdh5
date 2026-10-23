import { unzipSync } from 'fflate';
import { OfdError } from '../errors';

export function isZip(buffer: Uint8Array): boolean {
  return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
}

export function normalizePath(path: string): string {
  const parts: string[] = [];
  for (const segment of path.replace(/\\/g, '/').split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') parts.pop();
    else parts.push(segment);
  }
  return parts.join('/');
}

export function resolvePath(base: string, relative: string): string {
  if (relative.startsWith('/')) return normalizePath(relative);
  const dir = base.includes('/') ? base.slice(0, base.lastIndexOf('/')) : '';
  return normalizePath(dir ? `${dir}/${relative}` : relative);
}

export class OfdZip {
  // key 为归一化后的小写路径（OFD 包内路径大小写不敏感），value 保留原始名与内容
  private readonly files = new Map<string, { name: string; data: Uint8Array }>();

  private static key(path: string): string {
    return normalizePath(path).toLowerCase();
  }

  constructor(buffer: Uint8Array) {
    if (!isZip(buffer)) {
      throw new OfdError('E_NOT_ZIP', '文件不是合法的 OFD 包（zip 魔数不匹配）');
    }
    let entries: Record<string, Uint8Array>;
    try {
      entries = unzipSync(buffer);
    } catch (error) {
      throw new OfdError('E_NOT_ZIP', `zip 解压失败：${(error as Error).message}`);
    }
    for (const [name, data] of Object.entries(entries)) {
      const normalized = normalizePath(name);
      if (!normalized) continue;
      this.files.set(normalized.toLowerCase(), { name: normalized, data });
    }
  }

  has(path: string): boolean {
    return this.files.has(OfdZip.key(path));
  }

  read(path: string): Uint8Array | null {
    return this.files.get(OfdZip.key(path))?.data ?? null;
  }

  readText(path: string): string {
    const data = this.read(path);
    if (!data) throw new OfdError('E_NO_ENTRY', `缺少文件：${path}`);
    return new TextDecoder('utf-8').decode(data);
  }

  list(): string[] {
    return [...this.files.values()].map((entry) => entry.name);
  }
}
