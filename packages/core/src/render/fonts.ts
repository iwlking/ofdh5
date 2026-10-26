export interface FontRegistry {
  /** data 为内嵌字体字节；不传则按 fontBaseUrl 动态拉取，仍失败则用系统字体栈 */
  register(id: string, data: Uint8Array | null, familyHint?: string): Promise<boolean>;
  family(id: string, familyHint?: string): string;
  has(id: string): boolean;
}

const SUBSTITUTES: Record<string, string[]> = {
  宋体: ['SimSun', 'Songti SC', 'STSong', 'Noto Serif CJK SC', 'serif'],
  simsun: ['SimSun', 'Songti SC', 'STSong', 'Noto Serif CJK SC', 'serif'],
  新宋体: ['NSimSun', 'Songti SC', 'serif'],
  楷体: ['KaiTi', 'Kaiti SC', 'STKaiti', 'Noto Serif CJK SC', 'serif'],
  kaiti: ['KaiTi', 'Kaiti SC', 'STKaiti', 'Noto Serif CJK SC', 'serif'],
  '楷体_gb2312': ['KaiTi_GB2312', 'KaiTi', 'Kaiti SC', 'serif'],
  黑体: ['SimHei', 'Heiti SC', 'STHeiti', 'Noto Sans CJK SC', 'sans-serif'],
  simhei: ['SimHei', 'Heiti SC', 'STHeiti', 'Noto Sans CJK SC', 'sans-serif'],
  微软雅黑: ['Microsoft YaHei', 'PingFang SC', 'Noto Sans CJK SC', 'sans-serif'],
  'microsoft yahei': ['Microsoft YaHei', 'PingFang SC', 'Noto Sans CJK SC', 'sans-serif'],
  仿宋: ['FangSong', 'STFangsong', 'Noto Serif CJK SC', 'serif'],
  fangsong: ['FangSong', 'STFangsong', 'Noto Serif CJK SC', 'serif'],
  '仿宋_gb2312': ['FangSong_GB2312', 'FangSong', 'STFangsong', 'serif'],
  等线: ['DengXian', 'PingFang SC', 'Noto Sans CJK SC', 'sans-serif'],
  'courier new': ['Courier New', 'Courier', 'monospace'],
  courier: ['Courier New', 'Courier', 'monospace'],
  arial: ['Arial', 'Helvetica', 'sans-serif'],
  helvetica: ['Helvetica', 'Arial', 'sans-serif'],
  'times new roman': ['Times New Roman', 'Times', 'serif'],
  monospace: ['Courier New', 'Courier', 'monospace'],
  serif: ['Times New Roman', 'SimSun', 'serif'],
  'sans-serif': ['Arial', 'SimHei', 'sans-serif'],
};

function quote(name: string): string {
  return `"${name}"`;
}

/** OFD 的 FontName/FamilyName → 可直接赋给 ctx.font 的字体栈 */
export function fontStackFor(name: string | undefined, fallback = 'sans-serif', custom?: Record<string, string>): string {
  const raw = (name ?? '').trim();
  if (!raw) return fallback;

  if (custom) {
    const hit = custom[raw] ?? custom[raw.toLowerCase()];
    // 映射值是文件名时只用于远程加载，不能当 family 名
    if (hit && !isFileName(hit)) return `${quote(hit)}, ${fallback}`;
  }

  const candidates = SUBSTITUTES[raw] ?? SUBSTITUTES[raw.toLowerCase()];
  if (candidates && candidates.length > 0) {
    const tail = candidates[candidates.length - 1];
    const head = candidates.slice(0, -1).map(quote).join(', ');
    return head ? `${head}, ${tail === fallback ? fallback : tail}` : fallback;
  }

  return `${quote(raw)}, ${fallback}`;
}

export interface FontRegistryOptions {
  /** 自定义映射：{ "楷体": "MyKai" }（webfont family）或 { "楷体": "simkai.ttf" }（字体文件名） */
  fontMap?: Record<string, string>;
  /** 字体文件基地址，类似 pdfh5 的 standardFontDataUrl；缺省不发起网络请求 */
  fontBaseUrl?: string;
}

function isFileName(value: string): boolean {
  return /\.(ttf|otf|woff2?|ttc)$/i.test(value);
}

function joinUrl(base: string, name: string): string {
  const clean = base.replace(/\/$/, '');
  return `${clean}/${encodeURIComponent(name)}`;
}

export function createFontRegistry(fallback = 'sans-serif', options: FontRegistryOptions = {}): FontRegistry {
  const families = new Map<string, string>();
  const custom = options.fontMap;
  const baseUrl = options.fontBaseUrl;

  function remoteNameFor(name: string): string | null {
    const hit = custom?.[name] ?? custom?.[name.toLowerCase()];
    if (hit && isFileName(hit)) return hit;
    if (!name) return null;
    return `${name}.ttf`;
  }

  async function loadFace(family: string, source: BufferSource): Promise<boolean> {
    if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) return false;
    const face = new FontFace(family, source);
    await face.load();
    document.fonts.add(face);
    return true;
  }

  return {
    async register(id, data, familyHint) {
      if (families.has(id)) return true;
      const name = (familyHint ?? '').trim();
      const failFamily = fontStackFor(name, fallback, custom);
      const family = `ofdh5-${id}`;

      if (data && data.length > 0) {
        try {
          if (await loadFace(family, data.slice().buffer)) {
            families.set(id, `"${family}"`);
            return true;
          }
        } catch {
          /* 落到下面的动态加载/替换 */
        }
      }

      if (baseUrl && name) {
        const fileName = remoteNameFor(name);
        if (fileName) {
          try {
            const response = await fetch(joinUrl(baseUrl, fileName));
            if (response.ok) {
              const buffer = await response.arrayBuffer();
              if (await loadFace(family, buffer)) {
                families.set(id, `"${family}"`);
                return true;
              }
            }
          } catch {
            /* 网络失败走替换表 */
          }
        }
      }

      families.set(id, failFamily);
      return false;
    },

    family(id, familyHint) {
      return families.get(id) ?? fontStackFor(familyHint, fallback, custom);
    },

    has(id) {
      return families.has(id);
    },
  };
}
