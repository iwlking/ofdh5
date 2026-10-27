# ofdh5-vue2

[![npm](https://img.shields.io/npm/v/ofdh5-vue2.svg)](https://www.npmjs.com/package/ofdh5-vue2)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

`ofdh5` 的 Vue 2 组件封装。

```bash
npm i ofdh5 ofdh5-vue2
```

```vue
<template>
  <ofd-viewer ref="viewer" :url="url" @ready="onReady" @page-change="onPageChange" />
</template>

<script>
import OfdViewer from 'ofdh5-vue2/dist/ofdh5-vue2.esm.js';
export default { components: { OfdViewer } };
</script>
```

- props 与内核 options 一一对应
- 通过 `this.$refs.viewer.goToPage(3)` 调用内核方法
- 组件销毁时自动 `destroy()`

MIT License.
