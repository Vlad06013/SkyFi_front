import { defineComponent, ref } from 'vue';
import { useToastStore } from '@/stores/toast';

export interface UploadDraft {
  title: string;
  artists: string;
  album: string;
}

export default defineComponent({
  name: 'UploadForm',
  emits: ['upload'],
  setup(props, { emit }) {
    const toast = useToastStore();
    const title = ref('');
    const artists = ref('');
    const album = ref('');
    const titleFocus = ref(false);
    const artistFocus = ref(false);
    const albumFocus = ref(false);

    function pickFile() {
      toast.show('Выбор файла', 'появится с бэком · mp3, flac, wav, m4a');
    }

    function submit() {
      const name = title.value.trim();
      if (!name) {
        toast.show('Название', 'укажите, как называется трек');
        return;
      }
      emit('upload', { title: name, artists: artists.value, album: album.value });
      title.value = '';
      artists.value = '';
      album.value = '';
    }

    return { title, artists, album, titleFocus, artistFocus, albumFocus, pickFile, submit };
  },
});
