/** Доля трека, после которой непрослушанный заход считается лайком. */
export const WAVE_LIKE_RATIO = 0.7;

/**
 * Одно прослушивание трека волны. Фидбек только если на входе
 * трек был played=false: по уже звучавшим можно листать без реакций.
 */
export interface WaveListen {
  unplayed: boolean;
  /** Лайк в этом заходе. */
  liked: boolean;
  /** Дизлайк в этом заходе (убрали из избранного). */
  disliked: boolean;
  sent: 'like' | 'skip' | null;
  /** Звук реально шёл на этом устройстве. Серверный is_playing не считается. */
  heard: boolean;
  /** Прогресс (0..1) в момент, когда звук впервые пошёл. */
  heardRatio: number;
}

/** Лайк по сердечку или скип по дизлайку. Повтор того же типа не шлём. */
export function feedbackOnFavorite(listen: WaveListen, added: boolean): 'like' | 'skip' | null {
  if (!listen.unplayed) return null;
  if (added) return listen.sent === 'like' ? null : 'like';
  return listen.sent === 'skip' ? null : 'skip';
}

/**
 * Порог 70%, пока звук реально идёт и на старте звука порог ещё не был пройден.
 * Позиция из серверного «play» без нашего прослушивания лайк не шлёт.
 */
export function feedbackOnProgress(listen: WaveListen, ratio: number): 'like' | null {
  if (!listen.heard || !listen.unplayed || listen.sent || listen.disliked) return null;
  if (listen.heardRatio > WAVE_LIKE_RATIO) return null;
  return ratio > WAVE_LIKE_RATIO ? 'like' : null;
}

/**
 * Уход с трека. Уже отправленная реакция не дублируется.
 * Иначе лайк (сердечко или больше 70%), иначе скип (дизлайк или короче 70%).
 */
export function feedbackOnLeave(listen: WaveListen, ratio: number): 'like' | 'skip' | null {
  if (!listen.heard || !listen.unplayed || listen.sent) return null;
  if (listen.disliked) return 'skip';
  if (listen.liked || ratio > WAVE_LIKE_RATIO) return 'like';
  return 'skip';
}
