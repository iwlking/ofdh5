<template>
  <div ref="container" class="ofd-viewer"></div>
</template>

<script>
import { Ofdh5 } from 'ofdh5';
import { toOptions } from './options';

const EVENTS = ['init', 'ready', 'error', 'success', 'complete', 'render', 'zoom', 'zoomStart', 'zoomEnd', 'scroll', 'backTop'];

export default {
  name: 'OfdViewer',
  props: {
    url: { type: String, default: undefined },
    data: { type: [ArrayBuffer, Uint8Array, Blob], default: undefined },
    goto: { type: Number, default: undefined },
    scale: { type: Number, default: undefined },
    zoomEnable: { type: Boolean, default: undefined },
    scrollEnable: { type: Boolean, default: undefined },
    lazyLoad: { type: Boolean, default: undefined },
    loadingBar: { type: Boolean, default: undefined },
    pageNum: { type: Boolean, default: undefined },
    backTop: { type: Boolean, default: undefined },
    maxZoom: { type: Number, default: undefined },
    minZoom: { type: Number, default: undefined },
    textLayer: { type: Boolean, default: undefined },
  },
  data() {
    return { instance: null, lastPage: 1 };
  },
  mounted() {
    this.create();
  },
  beforeDestroy() {
    this.destroy();
  },
  watch: {
    url() {
      this.create();
    },
    data() {
      this.create();
    },
  },
  methods: {
    create() {
      this.destroy();
      this.instance = new Ofdh5(this.$refs.container, toOptions(this.$props));
      this.instance.on('ready', (...args) => this.$emit('ready', ...args));
      this.instance.on('error', (...args) => this.$emit('error', ...args));
      this.instance.on('complete', (...args) => this.$emit('complete', ...args));
      this.instance.on('render', (...args) => this.$emit('render', ...args));
      this.instance.on('zoom', (...args) => this.$emit('zoom', ...args));
      this.instance.on('zoomStart', (...args) => this.$emit('zoom-start', ...args));
      this.instance.on('zoomEnd', (...args) => this.$emit('zoom-end', ...args));
      this.instance.on('scroll', (payload) => {
        this.$emit('scroll', payload);
        if (payload.currentNum !== this.lastPage) {
          this.lastPage = payload.currentNum;
          this.$emit('page-change', payload.currentNum);
        }
      });
      this.instance.on('backTop', () => this.$emit('back-top'));
      this.instance.on('search', (keyword, matches) => this.$emit('search', keyword, matches));
    },
    destroy() {
      if (this.instance) {
        this.instance.destroy();
        this.instance = null;
      }
    },
    goToPage(n) { this.instance && this.instance.goToPage(n); },
    nextPage() { this.instance && this.instance.nextPage(); },
    prevPage() { this.instance && this.instance.prevPage(); },
    zoomIn() { this.instance && this.instance.zoomIn(); },
    zoomOut() { this.instance && this.instance.zoomOut(); },
    setScale(s) { this.instance && this.instance.setScale(s); },
    searchText(keyword) { return this.instance ? this.instance.searchText(keyword) : []; },
    findNext() { return this.instance ? this.instance.findNext() : null; },
    findPrevious() { return this.instance ? this.instance.findPrevious() : null; },
    clearSearch() { this.instance && this.instance.clearSearch(); },
    getStatus() { return this.instance ? this.instance.getStatus() : null; },
  },
};
</script>

<style scoped>
.ofd-viewer {
  width: 100%;
  height: 100%;
}
</style>
