import type { PlayerStatePayload } from '@/types';
import { trackRadio } from './catalog';

export const mockPlayerState: PlayerStatePayload = {
  state: {
    id: 1,
    current_snapshot: trackRadio,
    position_seconds: 72,
    is_playing: true,
    repeat_mode: 'all',
    shuffle_enabled: false,
    version: 7,
    play_source: 'yandex_wave',
    previous_play_source: 'favorites',
    previous_play_source_snapshot: null,
    wave_anchor: 'wave-1',
    active_device_id: 1,
    devices: [
      {
        id: 1,
        name: 'Pixel 7',
        type: 'phone',
        is_active: true,
        last_seen_at: new Date().toISOString(),
      },
      {
        id: 2,
        name: 'Teyes',
        type: 'car',
        is_active: false,
        last_seen_at: new Date().toISOString(),
      },
      {
        id: 3,
        name: 'Гостиная',
        type: 'tv',
        is_active: false,
        last_seen_at: new Date().toISOString(),
      },
    ],
  },
  queue: [],
};
