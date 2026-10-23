# ofdh5

移动端 OFD 预览库，API 对齐 [pdfh5](https://github.com/gjTool/pdfh5)，可直接替换原有 PDF 预览接入方式。

- 纯 canvas 渲染，内核零框架依赖
- 输入支持 URL、`ArrayBuffer`、`Uint8Array`、`Blob`
- 懒加载、双指缩放、双击缩放、滚动页码、回到顶部
- 内嵌字体注册（`FontFace`），失败自动降级
- 提供 Vue2 组件 `<ofd-viewer>`

## 运行环境

iOS Safari 13+、Android Chrome 80+、微信内置浏览器、PC Chrome / Edge。

依赖的浏览器能力：`DOMParser`、`Path2D`、`FontFace`、`createImageBitmap`（不可用时回退 `new Image()`）。不引入 polyfill。

## 安装

### npm

```bash
npm i @ofdh5/core
# Vue2 项目
npm i @ofdh5/vue2 vue@^2.6
```

### script 直引（UMD）

```html
<div id="demo" style="height: 100vh"></div>

<script src="./packages/core/dist/ofdh5.min.js"></script>
<script>
  var ofd = new Ofdh5(document.querySelector('#demo'), {
    url: './doc.ofd',
  });
  ofd.on('ready', function () {
    console.log('总页数：' + this.totalNum);
  });
</script>
```

UMD 文件名是 `ofdh5.min.js`，全局变量 `Ofdh5` 就是构造函数，可直接 `new Ofdh5(container, options)`；辅助 API 挂在它的静态属性上（`Ofdh5.OfdError`、`Ofdh5.parsePage`）。

也可使用 CDN：`https://unpkg.com/@ofdh5/core/dist/ofdh5.min.js`。

## 快速开始

```js
import { Ofdh5 } from '@ofdh5/core';

const ofd = new Ofdh5(document.querySelector('#demo'), {
  url: './doc.ofd',
  goto: 1,
  lazyLoad: true,
});

ofd.on('ready', function () {
  console.log('共 ' + this.totalNum + ' 页');
});

ofd.on('render', function (pageNum, pageTime, totalTime) {
  console.log('第 ' + pageNum + ' 页渲染完成', pageTime, totalTime);
});

ofd.on('error', function (msg) {
  console.error(msg);
});
```

容器需要有确定的宽高（例如 `height: 100vh`），内核会在容器内注入滚动容器、canvas 页面与 UI。

用内存数据加载：

```js
const buffer = await fetch('./doc.ofd').then((r) => r.arrayBuffer());
const ofd = new Ofdh5(document.querySelector('#demo'), { data: buffer });
```

## Vue2 用法

### 注册

全局注册：

```js
import Vue from 'vue';
import Ofdh5Vue2 from '@ofdh5/vue2';

Vue.use(Ofdh5Vue2); // 注册全局组件 <ofd-viewer>
```

按需引入：

```js
import { OfdViewer } from '@ofdh5/vue2';

export default {
  components: { OfdViewer },
};
```

### props 用法

```vue
<template>
  <div style="height: 100vh">
    <ofd-viewer
      ref="viewer"
      :url="url"
      :goto="1"
      :scale="1"
      @ready="onReady"
      @page-change="onPageChange"
      @error="onError"
    />
  </div>
</template>

<script>
export default {
  data() {
    return { url: './doc.ofd' };
  },
  methods: {
    onReady() {
      // ready 之后页码与页面节点已就绪
      this.$refs.viewer.goToPage(3);
    },
    onPageChange(pageNum) {
      console.log('当前页', pageNum);
    },
    onError(msg) {
      console.warn(msg);
    },
  },
};
</script>
```

组件根节点为 `height: 100%` 的 `div`，外层容器必须给出高度。

props 与内核 options 一一对应（未声明的 props 无法传入内核）：

| prop | 类型 | 说明 |
|---|---|---|
| `url` | String | OFD 地址，与 `data` 二选一 |
| `data` | ArrayBuffer / Uint8Array / Blob | 内存数据，优先于 `url` |
| `goto` | Number | 初始页码（1 起） |
| `scale` | Number | 渲染缩放，默认 1 |
| `zoomEnable` | Boolean | 是否允许手势缩放，默认 true |
| `scrollEnable` | Boolean | 是否允许滚动，默认 true |
| `lazyLoad` | Boolean | 是否只渲染可视页附近，默认 true |
| `loadingBar` | Boolean | 是否显示顶部加载条，默认 true |
| `pageNum` | Boolean | 是否显示页码浮层，默认 true |
| `backTop` | Boolean | 是否显示回到顶部按钮，默认 true |
| `maxZoom` | Number | 手势最大缩放，默认 4 |
| `minZoom` | Number | 手势最小缩放，默认 0.5 |

未传的 prop 使用内核默认值。布尔类要关闭请写绑定形式：`:zoom-enable="false"`。

`url` 或 `data` 变化时组件会销毁旧实例并自动重新加载。

### ref 调用

```js
this.$refs.viewer.goToPage(3);
this.$refs.viewer.nextPage();
this.$refs.viewer.prevPage();
this.$refs.viewer.zoomIn();
this.$refs.viewer.setScale(1.2);
const status = this.$refs.viewer.getStatus();
this.$refs.viewer.destroy();
```

组件通过 ref 暴露：`goToPage`、`nextPage`、`prevPage`、`zoomIn`、`zoomOut`、`setScale`、`getStatus`、`destroy`。需要完整内核 API 时可用组件实例上的 `instance`（`this.$refs.viewer.instance`）。

组件事件为内核事件的透传与映射：

| 事件 | 参数 | 来源 |
|---|---|---|
| `ready` | — | 内核 `ready` |
| `error` | `(msg, time)` | 内核 `error` |
| `complete` | `(status, msg, time)` | 内核 `complete` |
| `render` | `(pageNum, pageTime, totalTime)` | 内核 `render` |
| `zoom` | `(scale)` | 内核 `zoom` |
| `zoom-start` | — | 内核 `zoomStart` |
| `zoom-end` | `(scale)` | 内核 `zoomEnd` |
| `scroll` | `({ scrollTop, currentNum })` | 内核 `scroll` |
| `page-change` | `(pageNum)` | 内核 `scroll` 中 `currentNum` 变化时 |
| `back-top` | — | 内核 `backTop` |

## API

### new Ofdh5(container, options?)

| 参数 | 类型 | 说明 |
|---|---|---|
| `container` | HTMLElement | 挂载容器，需有确定尺寸 |
| `options` | Object | 见下方 options 表 |

实例属性：`version`、`totalNum`（总页数，`ready` 后可读）、`currentNum`（当前页，1 起）、`loaded`（加载结束的 Promise）。

### options

| 选项 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `url` | string | — | OFD 地址；与 `data` 二选一，同时存在时以 `data` 优先 |
| `pdfurl` | string | — | `url` 的兼容别名 |
| `data` | ArrayBuffer \| Uint8Array \| Blob | — | 内存中的 OFD 包 |
| `goto` | number | `0` | 初始跳到第几页（1 起），`0` 表示不跳 |
| `scale` | number | `1` | 渲染缩放系数（页面宽 = 容器可用宽 × scale） |
| `scrollEnable` | boolean | `true` | 是否允许滚动 |
| `zoomEnable` | boolean | `true` | 是否允许双指/双击缩放 |
| `resize` | boolean | `true` | 窗口尺寸变化时重建页面并重渲染 |
| `lazyLoad` | boolean | `true` | 只渲染当前页及相邻页，否则渲染全部页 |
| `loadingBar` | boolean | `true` | 顶部加载条，加载完成后隐藏 |
| `pageNum` | boolean | `true` | 左上角页码浮层 |
| `backTop` | boolean | `true` | 右下角回到顶部按钮 |
| `tapZoomFactor` | number | `2` | 双击放大的目标倍数 |
| `maxZoom` | number | `4` | 手势缩放上限 |
| `minZoom` | number | `0.5` | 手势缩放下限 |
| `maxCachedPages` | number | `6` | 位图缓存上限（见「已知限制」） |
| `maxDpr` | number | `2` | 渲染 DPR 上限 |
| `pageGap` | number | `8` | 页间距（px） |
| `backgroundColor` | string | `#fff` | 页面背景色 |
| `fontFallback` | string | `sans-serif` | 无内嵌字体时的字体栈 |
| `timeout` | number | `30000` | 下载超时（ms） |

与 pdfh5 的对应关系：

**保留（同名同义）**：`data`、`goto`、`scale`、`scrollEnable`、`zoomEnable`、`resize`、`loadingBar`、`pageNum`、`backTop`、`tapZoomFactor`、`zoomOutFactor`、`animationDuration`、`maxZoom`、`minZoom`、`dampingFactor`。

其中 `zoomOutFactor`、`animationDuration`、`dampingFactor` 当前版本未实现（TypeScript 类型中未声明），传入后不生效，缩放没有过渡动画。

**改名**：`pdfurl` → `url`（`pdfurl` 仍可作为别名传入）。

**语义调整**：`lazyLoad` 默认值由 `false` 改为 `true`。

**新增**：`maxCachedPages`、`maxDpr`、`pageGap`、`backgroundColor`、`fontFallback`、`timeout`。

**删除**：`password`、`cMapUrl`、`standardFontDataUrl`、`iccUrl`、`wasmUrl`、`workerSrc`、`textLayer`、`progressiveLoading`、`chunkSize`、`maxMemoryPages`、`maxImageSize`、`canvasMaxAreaInBytes`、`annotationEditorMode`、`editorParams`、`sandboxEnabled`、`sandboxOptions`、`enableHWA`。

### methods

| 方法 | 说明 |
|---|---|
| `on(type, callback)` | 注册事件，同一事件可注册多个回调 |
| `off(type)` | 移除该事件的**全部**回调 |
| `trigger(type, ...args)` | 手动触发事件 |
| `getPageCount()` | 总页数 |
| `getPageSize(n)` | 第 n 页尺寸 `{ width, height }`（mm，1 起）；该页未解析时返回文档默认页尺寸 |
| `getStatus()` | 运行状态快照，见下 |
| `getCacheStats()` | `{ rendered, cachedPages }`，当前均为已渲染页数 |
| `goToPage(n)` | 跳到第 n 页（1 起，越界自动夹取） |
| `nextPage()` / `prevPage()` | 上/下一页 |
| `scrollToTop()` | 回到顶部并触发 `backTop` |
| `zoomIn()` / `zoomOut()` | 手势层缩放 ±0.1 |
| `setScale(s)` | 调整渲染缩放并清空重渲染（不是手势缩放） |
| `isZooming()` | 手势缩放比例是否不等于 1 |
| `setZoomEnabled(flag)` / `isZoomEnabled()` | 开关手势缩放，切换时触发 `zoomEnabled` |
| `setScrollEnabled(flag)` / `isScrollEnabled()` | 开关滚动，切换时触发 `scrollEnabled` |
| `setZoomConstraints({ minScale, maxScale, step? })` / `getZoomConstraints()` | 读写缩放约束，见「已知限制」 |
| `show()` / `hide()` | 显示/隐藏容器，并触发同名事件 |
| `download(filename = 'document.ofd')` | 下载原始 OFD 包（需已加载） |
| `destroy()` | 销毁实例：解绑手势与 resize、清空缓存与 DOM、触发 `destroy` |

`getStatus()` 返回：

```ts
{
  status: 'init' | 'loading' | 'ready' | 'error' | 'destroyed';
  pageCount: number;
  currentPage: number;
  scale: number;
  renderedPages: number[];   // 1 起
  cachedPages: number;
  skippedObjects: number;    // 渲染时跳过（失败）的对象数
  lastError: { code: string; message: string } | null;
}
```

### events

回调以实例为 `this`。

| 事件 | 参数 | 触发时机 |
|---|---|---|
| `init` | — | 开始初始化 |
| `ready` | — | 元数据解析完成，可读 `totalNum` |
| `render` | `(pageNum, pageTime, totalTime)` | 每渲染完一页（ms） |
| `success` | `(msg, time)` | 首屏页面渲染完成 |
| `error` | `(msg, time)` | 致命错误，容器内显示错误占位 |
| `complete` | `(status: 'success' \| 'error', msg, time)` | 加载流程结束（无论成败） |
| `pageError` | `(pageNum, error: OfdError)` | 单页渲染失败，其他页不受影响 |
| `fontFallback` | `(pageNum, fontName)` | 内嵌字体注册失败，已降级 |
| `zoom` | `(scale)` | 缩放比例变化 |
| `zoomStart` | — | 双指缩放开始 |
| `zoomEnd` | `(scale)` | 双指缩放结束 |
| `scroll` | `({ scrollTop, currentNum })` | 滚动中，`currentNum` 为当前页 |
| `backTop` | — | 点击回到顶部（或调用 `scrollToTop()`） |
| `zoomEnabled` | `(flag)` | 缩放开关变化 |
| `scrollEnabled` | `(flag)` | 滚动开关变化 |
| `show` / `hide` | — | 显示/隐藏 |
| `destroy` | — | 销毁完成 |

时序：`init` → `ready` → 逐页 `render` → `success` → `complete`。

## 错误处理

失败时不会抛到 `window.onerror`，而是走事件 + 占位提示：

| 错误码 | 触发场景 | 级别 |
|---|---|---|
| `E_NETWORK` | 下载失败、超时、CORS | 致命 |
| `E_NOT_ZIP` | 文件不是 zip（魔数不是 `50 4B 03 04`） | 致命 |
| `E_NO_ENTRY` | 缺少 `OFD.xml` / `Document.xml` / `Pages` | 致命 |
| `E_PARSE_XML` | XML 结构非法或缺少必需属性 | 致命 |
| `E_ENCRYPTED` | 包含 `Encrypt.xml`（加密 OFD） | 致命 |
| `E_FONT` | 内嵌字体加载失败 | 降级 |
| `E_IMAGE` | 图片解码失败 | 跳过该对象 |
| `E_CANVAS` | canvas 创建失败或面积超限 | 单页 |
| `E_RENDER` | 单页绘制抛异常 | 单页 |

降级策略：

1. 致命错误：清空 UI，显示「加载失败（错误码）」，触发 `error` 与 `complete('error', ...)`。
2. 单页失败：该页显示灰底占位，触发 `pageError`，其余页正常。
3. 单对象失败：跳过并计入 `getStatus().skippedObjects`；字体缺失走 `fontFallback` 并触发 `fontFallback`。
4. 画布超限：按 `maxDpr` 降为 1 重试一次，仍失败按单页失败处理。

当前实现说明：`E_FONT`、`E_IMAGE` 已在错误码类型中定义，实际分别以 `fontFallback` 事件、跳过对象并计入 `skippedObjects` 的方式体现；画布超限自动降 DPR 重试尚未接入。

`OfdError` 与 `isOfdError` 从包入口导出，可用于判断错误码。

## 与 pdfh5 的差异

**数据格式**：处理 OFD 包，不再需要 pdf.js，与此相关的 worker / cmap / wasm / 字体数据源 / 密码等选项全部移除。

**删除的 options**：见上文 options 小节末尾列表。

**删除的 methods**：`searchText`、`clearSearch`、`findNext`、`findPrevious`、`printPDF`、`setAnnotationEditorMode` 及 `annotation*` 系列、`setProgressiveLoading`、`getProgressiveLoadingStatus`、`getMemoryUsage`。

**删除的 events**：`pageLoaded`、`pageCleaned`、`annotationAdded`、`annotationRemoved`、`annotationUpdated`、`annotationModeChanged`、`annotationSelected`。

**新增的 methods**：`getPageCount()`、`getPageSize(n)`、`download(filename)`、`getCacheStats()`。

**新增的 events**：`pageError`、`fontFallback`。

**行为差异**：

- `lazyLoad` 默认 `true`。
- 无文本层，文本不可选中、不可搜索。
- 不支持加密 OFD，遇到直接报 `E_ENCRYPTED`。
- 不支持打印、批注等 PDF 专有能力。

## 构建与产物

```bash
pnpm install
pnpm build
```

| 包 | 产物 |
|---|---|
| `@ofdh5/core` | `dist/ofdh5.esm.js`、`dist/ofdh5.umd.js`、`dist/ofdh5.min.js`（script 直引，全局 `Ofdh5` 为构造函数）、`dist/index.d.ts`（含类型声明树）、source map |
| `@ofdh5/vue2` | `dist/ofdh5-vue2.esm.js`、`dist/ofdh5-vue2.umd.js`、`dist/style.css` |

vue2 的 UMD 产物把 `vue`、`@ofdh5/core` 作为外部依赖，需要先引入 Vue2 与 `ofdh5.umd.js`，使用 `Ofdh5Vue2` 全局。

仓库脚本：

| 命令 | 作用 |
|---|---|
| `pnpm build` | 依次构建 core 与 vue2 |
| `pnpm test` | core 单元测试 |
| `pnpm test:vue2` | vue2 组件测试 |
| `pnpm test:e2e` | 演示工程端到端测试（需要 Node 20+） |
| `pnpm test:all` | 依次执行上面三套测试 |
| `pnpm fixtures` | 重新生成测试用 OFD 夹具 |

## 演示与 UMD 验证

演示工程（Vue2）：

```bash
cd examples/vue2-demo
pnpm dev          # http://127.0.0.1:5173
pnpm e2e          # Playwright 端到端测试
```

UMD 直引示例需要从仓库根目录起一个静态服务（页面用相对路径引用 `packages/core/dist/ofdh5.min.js`）：

```bash
python -m http.server 5190
# 或 npx serve . -l 5190
# 打开 http://127.0.0.1:5190/examples/umd-demo.html
```

## 已知限制

- 只解析第一个 `DocBody` / `DocRoot`，多文档包只显示第一个文档。
- 不支持加密 OFD（存在 `Encrypt.xml` 时直接报错）。
- `maxCachedPages` 目前只保留选项，页面 canvas 尚未按 LRU 回收；`getCacheStats()` 的 `cachedPages` 与 `rendered` 相同。
- `setZoomConstraints()` 只更新内部约束值，初始化时创建的缩放实例不受影响；请通过 `minZoom` / `maxZoom` 选项设置。
- 懒加载只渲染当前页及前后各 1 页。
- 图片解码交给浏览器，实际支持的图片格式取决于浏览器嗅探结果。
- 无文本层，文本不可选中，也不支持搜索。
