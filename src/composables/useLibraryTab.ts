import { ref } from 'vue';

export type LibraryTab =
  | 'tracks'
  | 'playlists'
  | 'albums'
  | 'artists'
  | 'videos'
  | 'uploads'
  | 'downloaded';

// Таб живёт на уровне модуля: «назад» из деталки альбома/плейлиста/артиста
// возвращает на тот же таб, а не сбрасывает на «Треки».
const tab = ref<LibraryTab>('tracks');

export function useLibraryTab() {
  return { tab };
}
