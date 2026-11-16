import { trackRadio } from './catalog';
import type { AnySnapshot } from '@/types';

export interface FriendMock {
  id: number;
  name: string;
  email: string;
  initial: string;
  tone: '' | 'g1' | 'g3';
  live: string | null;
  idle: string | null;
  watching: boolean;
  current_snapshot: AnySnapshot | null;
}

export const incomingRequest = {
  id: 9,
  name: 'Никита',
  initial: 'Н',
  tone: 'g1' as const,
};

export const mockFriends: FriendMock[] = [
  {
    id: 2,
    name: 'Аня',
    email: 'anya@mail.ru',
    initial: 'А',
    tone: '',
    live: 'Радиотишина · Sum 41',
    idle: null,
    watching: false,
    current_snapshot: trackRadio,
  },
  {
    id: 3,
    name: 'Илья',
    email: 'ilya@mail.ru',
    initial: 'И',
    tone: 'g1',
    live: null,
    idle: 'на паузе · Полковнику никто не пишет',
    watching: false,
    current_snapshot: null,
  },
  {
    id: 4,
    name: 'Макс',
    email: 'max@mail.ru',
    initial: 'М',
    tone: 'g1',
    live: 'Радиотишина',
    idle: null,
    watching: true,
    current_snapshot: trackRadio,
  },
  {
    id: 5,
    name: 'Катя',
    email: 'katya@mail.ru',
    initial: 'К',
    tone: 'g3',
    live: null,
    idle: 'ничего не слушает',
    watching: false,
    current_snapshot: null,
  },
];
