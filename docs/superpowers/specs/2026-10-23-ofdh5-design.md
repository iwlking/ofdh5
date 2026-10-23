# ofdh5 设计规格

日期：2026-10-23
状态：待评审

## 1. 背景与目标

参考 `pdfh5`（https://github.com/gjTool/pdfh5，v3.0.0）开发 OFD 版本：`ofdh5`。

pdfh5 是基于 pdf.js 的移动端 H5/PDF 预览插件，提供手势缩放、按页懒渲染、页码/进度条/回到顶部、事件系统等能力。OFD（GB/T 33190-2016）是国内版式文档标准，目前 JS 生态只有 `ofd.js` 一类维护停滞的实现，缺少同等体验的移动端预览库。

目标：

1. 提供与 pdfh5 同等交互体验的 OFD 预览内核，API 命名与事件语义对齐（精简对齐，见第 5 节）。
2. 第一步交付 Vue2 组件包。
3. 内核与框架解耦，后续接入 Vue3 / React 只需新增适配包。

## 2. 非目标（v1 明确不做）

- 文本层（可选中、可复制）与全文搜索
- 电子签章 / 印章渲染与验签
- 加密 OFD（`Encrypt.xml`）
- 注释编辑器
- HTTP Range 分段加载
- 打印导出（保留原始文件下载）

## 3. 现状调研结论

`ofd.js` 0.2.6（DLTech21/ofd.js，Apache-2.0）能力盘点：

| 能力 | 结论 |
|---|---|
| 手势缩放 | 无。仅 `setPageScal/getPageScal` 全局比例，改比例后整页重渲染 |
| 懒加载 / 虚拟滚动 | 无。`renderOfd` 一次性渲染所有页，`renderOfdByIndex` 需手动单页 |
| UI（页码/进度条/回到顶部） | 无 |
| 字体处理 | 仅用 SVG `font-family` 交给系统字体，**不解析 OFD 内嵌字体** |
| 依赖 | jszip、x2js（整份 XML→JSON）、jsrsasign、sm-crypto、asn1js、js-sha1、js-md5、axios、web-streams-polyfill |
| 工程形态 | vue-cli 工程，源码使用 `@/` 别名，二次开发需 fork |

结论：**自研内核**。ofd.js 仅作为渲染规则对照（坐标变换、路径指令、颜色处理），不引入其代码或依赖。

## 4. 架构

### 4.1 包结构

pnpm workspace：

```
packages/core            @ofdh5/core    零框架依赖，产物 ESM + UMD + .d.ts
  src/
    zip/          fflate 封装：解压、按 entry 取文件、路径归一化
    parser/       OFD.xml / Document.xml / Content.xml → IR
    ir/           Page / TextItem / PathItem / ImageItem 类型与工具
    render/       viewport、canvas 绘制、图片解码缓存、位图 LRU
    interact/     PinchZoom（移植 pdfh5 的 MIT 实现）+ 滚动 + 当前页判定
    ui/           loadingBar / pageNum / backTop
    events.ts     事件总线
    ofdh5.ts      门面 new Ofdh5(dom, options)
    types.ts      公开类型
packages/vue2            @ofdh5/vue2    <ofd-viewer> 组件
examples/vue2-demo       演示与手工验收
docs/superpowers/specs/  设计文档
```

工具链：TypeScript + rollup（core）、Vite lib mode + `@vitejs/plugin-vue2`（vue2 包）、vitest（单测）、Playwright（视觉回归与 E2E）。

### 4.2 数据流

```
url | data
  → fetch → ArrayBuffer
  → unzip(fflate)
  → 包目录（OFD.xml → DocBody → DocRoot）
  → 文档元数据（页数、每页 mm 尺寸、页面列表）
  → 逐页解析 Content.xml → Page(IR)，按页缓存
  → 可视页 + viewport 变换
  → canvas 绘制
  → 交互层接管手势/滚动
```

### 4.3 模块契约

| 模块 | 输入 | 输出 | 依赖 |
|---|---|---|---|
| `zip` | ArrayBuffer | `{ read(path): Uint8Array \| null, list(): string[] }` | fflate |
| `parser` | zip + 页码 | `Page`（IR） | zip、DOMParser |
| `ir` | — | 纯数据结构与类型守卫 | 无 |
| `render` | `Page` + viewport | 绘制到指定 canvas | IR、字体注册表 |
| `interact` | 容器 DOM + 回调 | 手势事件（zoom/scroll） | 无 |
| `ofdh5` | `dom` + options | 编排以上模块，暴露 API 与事件 | 全部 |

硬约束：**parser 不认识 canvas，render 不认识 zip**。IR 可直接做快照测试，渲染可用构造好的 IR 测。

### 4.4 坐标系统

- OFD 内容坐标单位为毫米，页面原点为 `PhysicalBox` 左上角。
- 统一换算：`1mm = 96 / 25.4 = 3.779527559 px`。
- 渲染宽度 = 容器可用宽度 × `scale`；viewport 比例 = renderWidthPx / pageWidthMm / 3.779527559。
- 缩放只改 viewport 比例，不改 IR 中的原始坐标。

### 4.5 IR 结构

```ts
interface Page {
  index: number;            // 0-based
  width: number;            // mm
  height: number;           // mm
  items: PageItem[];
}

type PageItem = TextItem | PathItem | ImageItem;

interface BaseItem {
  boundary: [number, number, number, number]; // x y w h, mm
  ctm?: number[];           // 6 位变换矩阵
  clipPath?: string;        // 裁剪路径（AbbreviatedData）
  alpha?: number;
}

interface TextItem extends BaseItem {
  kind: 'text';
  fontRef: string;          // 字体资源 ID
  size: number;             // mm
  fill?: RgbColor;
  stroke?: RgbColor;
  hScale?: number;
  glyphs: GlyphGlyph[];     // 逐字定位数据
  text?: string;            // 便于调试/后续文本层
}

interface GlyphGlyph { x: number; y: number; deltaX?: number; deltaY?: number; code: number; }

interface PathItem extends BaseItem {
  kind: 'path';
  d: string;                // 归一化的 AbbreviatedData
  lineWidth?: number;
  stroke?: RgbColor;
  fill?: RgbColor;
  rule?: 'nonzero' | 'evenodd';
}

interface ImageItem extends BaseItem {
  kind: 'image';
  resId: string;
  mime: string;
  data: Uint8Array;         // 原始图片字节
  width: number;            // 像素
  height: number;
}
```

### 4.6 字体策略（成败关键）

1. 优先从 `Res/Font_*.ttf|otf` 解出字体字节，`new FontFace(name, buffer)` → `document.fonts.add` → `ctx.font` 使用该名字。
2. 无内嵌字体时按 `FontName` / `FamilyName` 尝试系统字体，兜底 `fontFallback`（默认 `sans-serif`）。
3. 字距使用 Glyphs 的 `X/Y/DeltaX` 逐字推进，**不依赖 `ctx.measureText`**，避免累积漂移。
4. 字体加载失败或降级时触发 `fontFallback` 事件，参数为 `(pageNum, fontName)`。

### 4.7 加载与内存

- 整包下载后全量解压到内存，只保留目录与资源索引，Content.xml 按页解析并缓存 IR。
- 可视区 ±2 页做 canvas 渲染，离屏页位图按 LRU 回收，上限 `maxCachedPages`（默认 6）。
- 渲染 DPR 上限 `maxDpr`（默认 2）；单页画布面积超限时自动降至 DPR 1 重试一次。

## 5. API 设计

### 5.1 实例化

```js
const ofd = new Ofdh5(document.querySelector('#demo'), { url: './doc.ofd' });
```

### 5.2 options

保留（与 pdfh5 同名同义）：
`data`、`goto`、`scale`、`scrollEnable`、`zoomEnable`、`resize`、`loadingBar`、`pageNum`、`backTop`、`tapZoomFactor`、`zoomOutFactor`、`animationDuration`、`maxZoom`、`minZoom`、`dampingFactor`

改名：

| pdfh5 | ofdh5 | 说明 |
|---|---|---|
| `pdfurl` | `url` | 主用 `url`，同时接受 `pdfurl` 别名 |

语义调整：
`lazyLoad` 默认值由 `false` 改为 `true`。

删除（OFD 无对应或 v1 不做）：
`password`、`cMapUrl`、`standardFontDataUrl`、`iccUrl`、`wasmUrl`、`workerSrc`、`textLayer`、`progressiveLoading`、`chunkSize`、`maxMemoryPages`、`maxImageSize`、`canvasMaxAreaInBytes`、`annotationEditorMode`、`editorParams`、`sandboxEnabled`、`sandboxOptions`、`enableHWA`

新增：

| 名称 | 类型 | 默认值 | 作用 |
|---|---|---|---|
| `maxCachedPages` | number | 6 | 位图 LRU 上限 |
| `maxDpr` | number | 2 | 渲染 DPR 上限 |
| `pageGap` | number | 8 | 页间距（px） |
| `backgroundColor` | string | `#fff` | 页面背景色 |
| `fontFallback` | string | `sans-serif` | 无内嵌字体时的字体栈 |
| `timeout` | number | 30000 | 下载超时（ms） |

### 5.3 methods

| 保留 | 删除 | 新增 |
|---|---|---|
| `show` `hide` `destroy` `on` `off` `trigger` `getStatus` `goToPage` `nextPage` `prevPage` `scrollToTop` `zoomIn` `zoomOut` `setScale` `isZooming` `setZoomEnabled` `isZoomEnabled` `setScrollEnabled` `isScrollEnabled` `setZoomConstraints` `getZoomConstraints` | `searchText` `clearSearch` `findNext` `findPrevious` `printPDF` `setAnnotationEditorMode` 及 `annotation*` 系列 `setProgressiveLoading` `getProgressiveLoadingStatus` `getMemoryUsage` | `getPageCount()` `getPageSize(n)` → `{width, height}`(mm) `download(filename)` `getCacheStats()` |

### 5.4 events

| 保留（同名同参） | 删除 | 新增 |
|---|---|---|
| `init` `ready` `error` `success` `complete` `render` `zoom` `zoomStart` `zoomEnd` `scroll` `backTop` `zoomEnabled` `scrollEnabled` `show` `hide` `destroy` | `pageLoaded` `pageCleaned` `annotationAdded` `annotationRemoved` `annotationUpdated` `annotationModeChanged` `annotationSelected` | `pageError(pageNum, error)` `fontFallback(pageNum, fontName)` |

事件回调统一以实例为 `this`，与 pdfh5 一致。

### 5.5 getStatus() 返回

```ts
{
  status: 'init' | 'loading' | 'ready' | 'error' | 'destroyed';
  pageCount: number;
  currentPage: number;
  scale: number;
  renderedPages: number[];
  cachedPages: number;
  skippedObjects: number;
  lastError: { code: string; message: string } | null;
}
```

### 5.6 Vue2 组件

```vue
<ofd-viewer
  ref="viewer"
  :url="url"
  :scale="1"
  :goto="1"
  @ready="onReady"
  @page-change="onPageChange"
  @error="onError"
/>
```

- props 与内核 options 一一对应；`url`/`data` 变化时自动重载。
- 通过 `ref` 暴露内核实例的方法：`this.$refs.viewer.goToPage(3)`。
- 组件 `beforeDestroy` 时调用内核 `destroy()`。
- `peerDependencies: vue ^2.6.0`；提供 `install` 支持 `Vue.use`。

## 6. 错误处理

### 6.1 错误码

| 码 | 触发 | 级别 |
|---|---|---|
| `E_NETWORK` | 下载失败 / 超时 / CORS | 致命 |
| `E_NOT_ZIP` | 魔数不是 `50 4B 03 04` | 致命 |
| `E_NO_ENTRY` | 缺 `OFD.xml` / `Document.xml` / `Pages` | 致命 |
| `E_PARSE_XML` | XML 结构非法、缺必需属性 | 致命 |
| `E_ENCRYPTED` | 存在 `Encrypt.xml` | 致命 |
| `E_FONT` | 内嵌字体加载失败 | 降级 |
| `E_IMAGE` | 图片解码失败 | 跳过 |
| `E_CANVAS` | canvas 创建失败 / 面积超限 | 单页 |
| `E_RENDER` | 单页绘制抛异常 | 单页 |

### 6.2 四级降级

1. **致命**：清空 UI → 显示错误占位（图标 + 错误码 + 重试）→ `trigger('error', msg, time)` → `complete('error', msg, time)`。
2. **单页失败**：该页绘制灰底占位（页码 + 重试），`trigger('pageError', pageNum, error)`，其他页正常。
3. **单对象失败**：跳过该对象，`console.warn` 一次，计入 `getStatus().skippedObjects`；字体缺失走 `fontFallback` 并触发事件。
4. **画布超限**：单页 DPR 从 `maxDpr` 降为 1 重试一次，仍失败按第 2 级处理。

### 6.3 异步兜底

`loadPDF`、渲染循环、字体加载全部包在 try-catch 与 Promise catch 中，禁止 rejection 冒泡到 `window.onerror`。

## 7. 测试策略

| 层 | 工具 | 覆盖 | 判定 |
|---|---|---|---|
| 单元 | vitest（jsdom 提供 DOMParser） | parser（zip→IR）、IR 结构、viewport 数学、手势纯函数、错误分支 | 语句覆盖 ≥ 80%；每个错误码有用例 |
| 视觉回归 | Playwright + canvas 截图 | 4 个 fixture 的关键页 | 与基线图逐像素比对，差异阈值 0.1% |
| 端到端 | Playwright（驱动 vue2-demo） | 打开 → 滚动 → 缩放 → 页码 → 销毁 | 零 console error；`getStatus()` 状态流转正确 |

### 7.1 Fixtures

| 文件 | 内容 | 用途 |
|---|---|---|
| `single-text.ofd` | 单页纯文本，含内嵌 TTF | 文本渲染基线 |
| `multi-page.ofd` | 12 页图文混排 | 懒渲染与页码 |
| `vector-form.ofd` | 表格线、矢量路径、透明度 | 图形渲染 |
| `broken.ofd` | 缺 `Document.xml`、被截断 | 错误码 |

单测重点：`AbbreviatedData` 六种指令（M/L/B/Q/A/C）与负数、科学计数法；mm→px 与缩放锚点可逆性；字体三条分支；LRU 回收顺序与重渲染一致性。

不做：不测浏览器原生行为（Canvas/DOMParser/FontFace），不追求 100% 覆盖。

## 8. 里程碑

| 里程碑 | 内容 | 通过标准 |
|---|---|---|
| M0 脚手架 | pnpm workspace、TS、vitest、core rollup 双产物、vue2 vite lib 构建 | `pnpm build` 产出 ESM/UMD，`pnpm test` 空套件通过 |
| M1 解析打通 | zip → OFD.xml → Document.xml → 页面列表与 mm 尺寸 | 4 个 fixture 页数与尺寸正确；错误码全部命中 |
| M2 文本渲染 | 内嵌字体 FontFace、TextObject 逐字定位、填充色 | `single-text.ofd` 视觉比对通过；无内嵌字体走降级并触发事件 |
| M3 图形与图像 | PathObject、ImageObject、裁剪、透明度 | `vector-form.ofd` 视觉比对通过 |
| M4 交互与 UI | PinchZoom 移植、滚动监听、当前页判定、进度条、页码、回到顶部 | 移动端手势验收清单全过；事件参数与 pdfh5 一致 |
| M5 懒渲染 + LRU | 可视区 ±2 页渲染、离屏回收 | `multi-page.ofd` 滚动全程 `cachedPages ≤ maxCachedPages`，无白屏闪烁 |
| M6 Vue2 包 | `<ofd-viewer>` + ref 暴露内核 + demo | props 驱动与 ref 调用两条路跑通；销毁时内核同步销毁 |
| M7 收尾 | 视觉回归入库、错误处理补齐、文档、UMD 直引验证 | 三层测试全绿；`<script>` 直引 demo 可用 |

## 9. 风险与预案

| 风险 | 影响 | 预案 |
|---|---|---|
| 内嵌字体为 CID/子集字体，字符编码非 Unicode | 文字乱码或错位 | M2 优先验证；必要时按 Glyphs 索引 + glyf 轮廓直接绘制 |
| 签章对象被当作普通 ImageObject 丢失 | 公文缺章 | v1 明确不渲染并在文档中说明；M3 确认其被跳过而非报错 |
| 移动端 canvas 面积上限 | 大页面白屏 | DPR 降级重试机制 |
| 缺少真实公文样例 | 测不出真实问题 | 先用自造 fixture，M2 后补充 2-3 个脱敏真实文件 |

## 10. 待确认事项

1. npm 包名与 scope（暂定 `@ofdh5/core`、`@ofdh5/vue2`）。
2. 是否发布到私有 registry。
3. 真实脱敏 OFD 样例的提供方与时间。
