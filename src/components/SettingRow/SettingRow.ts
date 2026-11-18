import { defineComponent } from 'vue';

export default defineComponent({
  name: 'SettingRow',
  props: {
    title: { type: String, required: true },
    idle: { type: String, default: '' },
    on: { type: Boolean, default: false },
    clickable: { type: Boolean, default: false },
  },
  emits: ['open'],
  setup(props, { emit }) {
    return { emit };
  },
});
