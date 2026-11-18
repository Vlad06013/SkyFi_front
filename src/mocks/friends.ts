import { mockVideo, trackColonel, trackFatLip, trackRadio, trackSea } from './catalog';
import type { AnySnapshot, TrackSnapshot } from '@/types';

export interface FriendMock {
  id: number;
  name: string;
  email: string;
  initial: string;
  tone: '' | 'g1' | 'g3';
  live: string | null;
  watching: boolean;
  current_snapshot: AnySnapshot | null;
}

export const incomingRequest = {
  id: 9,
  name: 'Никита',
  initial: 'Н',
  tone: 'g1' as const,
};

export const outgoingRequest = {
  id: 5,
  name: 'Катя',
  email: 'katya@mail.ru',
  initial: 'К',
  tone: 'g3' as const,
};

export const mockFriends: FriendMock[] = [
  {
    id: 2,
    name: 'Аня',
    email: 'anya@mail.ru',
    initial: 'А',
    tone: '',
    live: 'Радиотишина · Sum 41',
    watching: false,
    current_snapshot: trackRadio,
  },
  {
    id: 3,
    name: 'Илья',
    email: 'ilya@mail.ru',
    initial: 'И',
    tone: 'g1',
    live: 'Морская · Мумий Тролль',
    watching: false,
    current_snapshot: trackSea,
  },
  {
    id: 4,
    name: 'Макс',
    email: 'max@mail.ru',
    initial: 'М',
    tone: 'g1',
    live: 'Радиотишина · клип',
    watching: true,
    current_snapshot: mockVideo,
  },
];

export const friendQueue: TrackSnapshot[] = [trackFatLip, trackColonel, trackSea];
