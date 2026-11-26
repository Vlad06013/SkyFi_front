import { computed, defineComponent, ref, type PropType } from 'vue';
import { resolveUrl } from '@/lib/endpoints';
import type { Visibility } from '@/types';

export const visibilityOptions: { value: Visibility; label: string; hint: string }[] = [
  { value: 'private', label: 'Только я', hint: 'видите только вы' },
  { value: 'friends', label: 'Друзья', hint: 'видят ваши друзья' },
  { value: 'public', label: 'Все', hint: 'видят все пользователи' },
];

export interface PlaylistDraft {
  name: string;
  visibility: Visibility;
  cover: string | null;
}

export default defineComponent({
  name: 'PlaylistForm',
  props: {
    submitLabel: { type: String, required: true },
    initialName: { type: String, default: '' },
    initialVisibility: { type: String as PropType<Visibility>, default: 'private' },
    initialCover: { type: String, default: null },
  },
  emits: ['submit'],
  setup(props, { emit }) {
    const name = ref(props.initialName);
    const visibility = ref<Visibility>(props.initialVisibility);
    const cover = ref<string | null>(props.initialCover);
    const nameFocus = ref(false);
    const visibilityOpen = ref(false);
    const fileInput = ref<HTMLInputElement | null>(null);

    const visibilityLabel = computed(
      () => visibilityOptions.find((option) => option.value === visibility.value)?.label ?? '',
    );

    const coverStyle = computed(() => {
      // blob: из пикера проходит резолвер без изменений, ссылка бэка — с хостом.
      const url = resolveUrl(cover.value);
      return url ? { background: `var(--color-surface-2) center/cover url(${url})` } : undefined;
    });

    function pickCover() {
      fileInput.value?.click();
    }

    function onCoverPicked() {
      const file = fileInput.value?.files?.[0];
      if (!file) return;
      cover.value = URL.createObjectURL(file);
    }

    function pickVisibility(value: Visibility) {
      visibility.value = value;
      visibilityOpen.value = false;
    }

    function submit() {
      if (!name.value.trim()) return;
      emit('submit', {
        name: name.value.trim(),
        visibility: visibility.value,
        cover: cover.value,
      } satisfies PlaylistDraft);
    }

    return {
      name,
      visibility,
      visibilityOpen,
      visibilityOptions,
      visibilityLabel,
      coverStyle,
      fileInput,
      nameFocus,
      pickCover,
      onCoverPicked,
      pickVisibility,
      submit,
    };
  },
});
