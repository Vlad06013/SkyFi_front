import { computed, defineComponent, ref, type PropType } from 'vue';
import { useToastStore } from '@/stores/toast';
import { visibilityOptions } from '@/components/PlaylistForm/PlaylistForm';
import type { Visibility } from '@/types';

export interface UploadDraft {
  title: string;
  artists: string;
  album: string;
  visibility: Visibility;
}

export default defineComponent({
  name: 'UploadForm',
  props: {
    initialTitle: { type: String, default: '' },
    initialArtists: { type: String, default: '' },
    initialAlbum: { type: String, default: '' },
    initialVisibility: { type: String as PropType<Visibility>, default: 'public' },
    submitLabel: { type: String, default: 'Загрузить' },
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

    const visibilityLabel = computed(
      () => visibilityOptions.find((option) => option.value === visibility.value)?.label ?? '',
    );

    function pickVisibility(value: Visibility) {
      visibility.value = value;
      visibilityOpen.value = false;
    }

    function pickFile() {
      toast.show('Выбор файла', 'появится с бэком · mp3, flac, wav, m4a');
    }

    function submit() {
      const name = title.value.trim();
      if (!name) {
        toast.show('Название', 'укажите, как называется трек');
        return;
      }
      emit('upload', {
        title: name,
        artists: artists.value,
        album: album.value,
        visibility: visibility.value,
      } satisfies UploadDraft);
      title.value = '';
      artists.value = '';
      album.value = '';
      visibility.value = 'public';
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
      pickVisibility,
      pickFile,
      submit,
    };
  },
});
