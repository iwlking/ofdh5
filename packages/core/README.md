# @ofdh5/core

OFD（GB/T 33190-2016）移动端预览内核：纯前端解析 + Canvas 渲染，API 与 pdfh5 对齐。

- 零框架依赖，运行时只依赖 `fflate`
- 解析 → IR → 绘制三层解耦，支持按页懒渲染与手势缩放
- 内嵌字体走 `FontFace` 注册，避免中文字体错位
- 产物：ESM / UMD / 独立 UMD（`ofdh5.min.js`，全局即构造函数）

## 安装

```bash
npm i @ofdh5/core
```

## 使用

```js
import { Ofdh5 } from '@ofdh5/core';

const ofd = new Ofdh5(document.querySelector('#demo'), { url: './doc.ofd' });
ofd.on('ready', function () {
  console.log('总页数：' + this.totalNum);
});
```

```html
<script src="https://unpkg.com/@ofdh5/core/dist/ofdh5.min.js"></script>
<script>
  var ofd = new Ofdh5(document.querySelector('#demo'), { url: './doc.ofd' });
</script>
```

完整 API、事件、错误码见仓库根目录 README。

MIT License.
