import { artistsLine } from '@/lib/cover';
import type { AnySnapshot } from '@/types';

/** Строка «сейчас играет» для списка друзей: «Название · Исполнитель»; видео — «· клип». */
export function liveLine(snapshot: AnySnapshot | null): string | null {
  if (!snapshot) return null;
  if (snapshot.type === 'video') return `${snapshot.title} · клип`;
  const artists = artistsLine(snapshot.artists);
  return artists ? `${snapshot.title} · ${artists}` : snapshot.title;
}

/** Первая буква имени для аватара-инициала. */
export function friendInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase();
}

/** Детерминированный тон градиента аватара из id — вместо мокового разнообразия. */
export function friendTone(id: number): '' | 'g1' | 'g3' {
  const rest = id % 3;
  if (rest === 1) return 'g1';
  if (rest === 2) return 'g3';
  return '';
}
