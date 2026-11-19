import { computed, defineComponent, ref, type PropType } from 'vue';
import { useToastStore } from '@/stores/toast';
import { visibilityOptions } from '@/components/PlaylistForm/PlaylistForm';
import type { Visibility } from '@/types';

export interface UploadDraft {
  title: string;
  artists: string;
  album: string;
  visibility: Visibility;
  /** null — файл не меняется (режим редактирования меты). */
  file: File | null;
}

export default defineComponent({
  name: 'UploadForm',
  props: {
    initialTitle: { type: String, default: '' },
    initialArtists: { type: String, default: '' },
    initialAlbum: { type: String, default: '' },
    initialVisibility: { type: String as PropType<Visibility>, default: 'public' },
    submitLabel: { type: String, default: 'Загрузить' },
    /** Редактирование меты: файл не требуем и не шлём. */
    requireFile: { type: Boolean, default: true },
  },
  emits: ['upload'],
  setup(props, { emit }) {
    const toast = useToastStore();
    const title = ref(props.initialTitle);
    const artists = ref(props.initialArtists);
    const album = ref(props.initialAlbum);
    const visibility = ref<Visibility>(props.initialVisibility);
    const visibilityOpen = ref(false);
    const titleFocus = ref(false);
    const artistFocus = ref(false);
    const albumFocus = ref(false);
    const fileInput = ref<HTMLInputElement | null>(null);
    const pickedFile = ref<File | null>(null);

    const fileName = computed(() => pickedFile.value?.name ?? '');

    const visibilityLabel = computed(
      () => visibilityOptions.find((option) => option.value === visibility.value)?.label ?? '',
    );

    function pickVisibility(value: Visibility) {
      visibility.value = value;
      visibilityOpen.value = false;
    }

    function pickFile() {
      fileInput.value?.click();
    }

    function onFilePicked(event: Event) {
      const input = event.target as HTMLInputElement;
      const file = input.files?.[0] ?? null;
      if (file) pickedFile.value = file;
      input.value = '';
    }

    function submit() {
      const name = title.value.trim();
      if (!name) {
        toast.show('Название', 'укажите, как называется трек');
        return;
      }
      if (props.requireFile && !pickedFile.value) {
        toast.show('Файл', 'выберите аудиофайл');
        return;
      }
      emit('upload', {
        title: name,
        artists: artists.value,
        album: album.value,
        visibility: visibility.value,
        file: pickedFile.value,
      } satisfies UploadDraft);
      title.value = '';
      artists.value = '';
      album.value = '';
      visibility.value = 'public';
      pickedFile.value = null;
    }

    return {
      title,
      artists,
      album,
      visibility,
      visibilityOpen,
      visibilityOptions,
      visibilityLabel,
      titleFocus,
      artistFocus,
      albumFocus,
      fileInput,
      pickedFile,
      fileName,
      pickVisibility,
      pickFile,
      onFilePicked,
      submit,
    };
  },
});
