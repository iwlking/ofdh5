<template>
  <div class="app">
    <div class="bar">
      <button @click="$refs.viewer.prevPage()">上一页</button>
      <button @click="$refs.viewer.nextPage()">下一页</button>
      <button @click="$refs.viewer.zoomIn()">放大</button>
      <button @click="$refs.viewer.zoomOut()">缩小</button>
      <span class="hint">{{ page }} / {{ total }}</span>
    </div>
    <div class="stage">
      <ofd-viewer
        ref="viewer"
        :url="url"
        @ready="onReady"
        @page-change="onPageChange"
        @error="onError"
      />
    </div>
  </div>
</template>

<script>
import OfdViewer from 'ofdh5-vue2/src/OfdViewer.vue';

export default {
  components: { OfdViewer },
  data() {
    return { url: '/fixtures/multi-page.ofd', page: 1, total: 0 };
  },
  methods: {
    onReady() {
      const status = this.$refs.viewer.getStatus();
      this.total = status ? status.pageCount : 0;
    },
    onPageChange(n) {
      this.page = n;
    },
    onError(msg) {
      console.error('[demo] error', msg);
    },
  },
};
</script>

<style>
.app { display: flex; flex-direction: column; height: 100%; }
.bar { flex: none; display: flex; gap: 8px; align-items: center; padding: 8px; background: #fff; border-bottom: 1px solid #eee; font: 14px/1.4 sans-serif; }
.hint { margin-left: auto; color: #999; }
.stage { flex: 1; min-height: 0; }
</style>
