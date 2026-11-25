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
    play_source: 'favorites',
    previous_play_source: 'favorites',
    previous_play_source_snapshot: null,
    context_ref: null,
    clips_enabled: false,
    shuffle_seed: null,
    position_updated_at: new Date().toISOString(),
    active_device_id: '9f1c7a2e-4b3d-4c8a-9e5f-2d6b0a1c4f77',
    devices: [
      {
        device_uuid: '9f1c7a2e-4b3d-4c8a-9e5f-2d6b0a1c4f77',
        name: 'Pixel 7',
        type: 'phone',
        last_seen_at: new Date().toISOString(),
      },
      {
        device_uuid: '2a8e1b3c-7d4f-4a6b-8c1d-5e9f3b2a6d44',
        name: 'Teyes',
        type: 'car',
        last_seen_at: new Date().toISOString(),
      },
      {
        device_uuid: '7c3d5a9e-1f2b-4e8a-9b4c-6d8a2e5f1c33',
        name: 'Гостиная',
        type: 'tv',
        last_seen_at: new Date().toISOString(),
      },
    ],
  },
  queue: [],
};
