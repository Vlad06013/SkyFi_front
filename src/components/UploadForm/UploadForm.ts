import { computed, defineComponent, ref, type PropType } from 'vue';
import { useToastStore } from '@/stores/toast';
import { visibilityOptions } from '@/components/PlaylistForm/PlaylistForm';
import type { Visibility } from '@/types';

export interface UploadDraft {
  title: string;
  artists: string;
  album: string;
  /** Пустая строка — текст не передаём. */
  lyrics: string;
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
    initialLyrics: { type: String, default: '' },
    initialVisibility: { type: String as PropType<Visibility>, default: 'public' },
    /** 0–100, пока файл уходит на сервер. null — загрузки нет. */
    progress: { type: Number as PropType<number | null>, default: null },
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
    const lyrics = ref(props.initialLyrics);
    const visibility = ref<Visibility>(props.initialVisibility);
    const visibilityOpen = ref(false);
    const titleFocus = ref(false);
    const artistFocus = ref(false);
    const albumFocus = ref(false);
    const lyricsFocus = ref(false);
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
      if (props.progress != null) return;
      const name = title.value.trim();
      if (!name) {
        toast.show('Название', 'укажите, как называется трек');
        return;
      }
      if (!album.value.trim()) {
        toast.show('Альбом', 'укажите альбом');
        return;
      }
      if (props.requireFile && !pickedFile.value) {
        toast.show('Файл', 'выберите аудиофайл');
        return;
      }
      // Поля не чистим: при ошибке загрузки их не придётся набирать заново.
      // Успех закрывает шит, форма монтируется пустой в следующий раз.
      emit('upload', {
        title: name,
        artists: artists.value,
        album: album.value,
        lyrics: lyrics.value,
        visibility: visibility.value,
        file: pickedFile.value,
      } satisfies UploadDraft);
    }

    return {
      title,
      artists,
      album,
      lyrics,
      visibility,
      visibilityOpen,
      visibilityOptions,
      visibilityLabel,
      titleFocus,
      artistFocus,
      albumFocus,
      lyricsFocus,
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
