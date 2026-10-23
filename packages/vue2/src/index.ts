import OfdViewer from './OfdViewer.vue';

export { OfdViewer };
export { toOptions } from './options';
export { Ofdh5 } from '@ofdh5/core';
export type { Ofdh5Options, OfdStatus } from '@ofdh5/core';

export default {
  install(Vue: { component: (name: string, comp: unknown) => void }) {
    Vue.component('OfdViewer', OfdViewer);
  },
};
