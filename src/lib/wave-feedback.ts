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
}

/** Лайк по сердечку или скип по дизлайку. Повтор того же типа не шлём. */
export function feedbackOnFavorite(listen: WaveListen, added: boolean): 'like' | 'skip' | null {
  if (!listen.unplayed) return null;
  if (added) return listen.sent === 'like' ? null : 'like';
  return listen.sent === 'skip' ? null : 'skip';
}

/** Порог 70% на ещё не закрытом непрослушанном заходе — лайк, если не дизлайкнули. */
export function feedbackOnProgress(listen: WaveListen, ratio: number): 'like' | null {
  if (!listen.unplayed || listen.sent || listen.disliked) return null;
  return ratio > WAVE_LIKE_RATIO ? 'like' : null;
}

/**
 * Уход с трека. Уже отправленная реакция не дублируется.
 * Иначе лайк (сердечко или больше 70%), иначе скип (дизлайк или короче 70%).
 */
export function feedbackOnLeave(listen: WaveListen, ratio: number): 'like' | 'skip' | null {
  if (!listen.unplayed || listen.sent) return null;
  if (listen.disliked) return 'skip';
  if (listen.liked || ratio > WAVE_LIKE_RATIO) return 'like';
  return 'skip';
}
