# План: слой вебсокетов

Рабочий план-чеклист фронт-агента. Контракт — `api.md` §17, типы
payload — `contracts.md` «Сокеты», правила клиента — `frontend.md` §10.
Отмечаем `[x]` по мере готовности. Порядок этапов согласован
2026-11-20: плеер — в последнюю очередь (нужна отдельная глубокая
схема применения состояния).

## Инвентарь сокетов

**Транспорт**: Laravel Reverb, auth sanctum — handshake
`/broadcasting/auth` тем же Bearer-токеном. Фронт: Echo-клиент
(зависимости уже в package.json, env `VITE_REVERB_*` в env_example).

**Каналы** (private):
- `App.Models.User.{id}` — личный канал пользователя.
- `friends.{id}` — канал пользователя, который слушают его друзья
  (подписаться может только друг; now-playing/очередь друга).

**Ивенты** (9):

| Ивент | Канал | Payload | Фронт |
|---|---|---|---|
| `playback.device.connected` | User.{id} | `{device, origin_device_id}` | обновить список устройств |
| `playback.device.changed` | User.{id} | `{device_id, origin_device_id}` | сменить активное устройство |
| `playback.device.disconnected` | User.{id} | `{device_id, device_name, origin_device_id, command_id}` | убрать устройство |
| `friendship.request.sent` | получателю | friendship целиком | upsert в incoming + бейдж |
| `friendship.request.accepted` | отправителю | friendship целиком | outgoing → friends |
| `friendship.request.declined`? | — | — | нет в контракте — не делаем |
| `friend.queue.item.added` | User.{id} очередника | `{added_by: {id,name}, item: {source_id,title,artists}}` | тост + рефетч очереди |
| `share.sent` | получателю | `{share_id, sender, snapshot}` | тост + список «поделились со мной» |
| `playback.state.updated` | User.{id} + friends.{id} | `{state, origin_device_id, command_id}` | плеер: version-gate + эхо |
| `playback.queue.updated` | User.{id} + friends.{id} | `{item: {title,artists}\|null, origin_device_id, command_id}` | тост + рефетч очереди |

## Общая семантика

- Эхо-глушение: `origin_device_id` = мой `data.id` устройства → не
  применять повторно (своя команда уже применена оптимистично).
- Дедуп: `command_id`, повторные доставки игнорируем.
- Плеер: state применяем только если `version` новее локального.
- Reconnect → `GET /player`, локальное состояние подменяем серверным.
- Офлайн-детект: состояние сокета — второй источник рядом с
  поллером `/health` (stores/online).

## Слой `src/realtime/`

Единый слой, изолирующий Echo/Pusher. Границы: UI о сокетах не знает;
слой **только пишет в Pinia-сторы** (devices/friends/notifications/
toast/player), команды по-прежнему идут через `api/`. Жизненный цикл
привязан к сессии: connect после bootstrap с токеном, disconnect при
logout (хуки в main.ts рядом со startPolling).

```
src/realtime/
  echo.ts        — инстанс Echo (Reverb из env, авторизатор через axios + Bearer)
  connection.ts  — start(userId)/stop(), статус соединения, reconnect-хук
  channels.ts    — менеджер подписок: свой User.{id}; friends.{friendId} — динамически
  router.ts      — карта «ивент → handler»: лог, эхо-фильтр, dedup по command_id
  handlers/
    devices.ts   — playback.device.*
    social.ts    — friendship.*, friend.queue.item.added, share.sent
    playback.ts  — playback.state/queue.updated, reconnect-рефетч (этап плеера)
src/types/realtime.ts — payload-типы из contracts.md
```

## Этапы

### Этап 1. Устройства (транспорт + presence) — ✅ готово 2026-11-20
- [x] `api/devices.ts`: регистрация (`POST /player/devices` с uuid,
      ответ `data.id`), heartbeat (`POST /player/devices/heartbeat`,
      api.md §4), activate (`PATCH /devices/{id}/activate`), список
      (`GET /player/devices` → `{devices: [...]}`, api.md §4),
      удаление (query-эхо).
- [x] Локальный uuid устройства: `lib/device.ts`, генерация при первом
      старте, хранение в Preferences (пара: uuid + серверный id).
- [x] `stores/devices.ts`: регистрация при auth+online, heartbeat 30 с
      (пауза в фоне на нативе), мутации списка (сокет + API), activate
      оптимистично с откатом, reset по logout.
- [x] Слой realtime: `echo.ts` (Reverb из env, авторизация каналов
      сырым axios на `/broadcasting/auth`), `index.ts` (start/stop по
      сессии, статус, reconnect-хук), `router.ts` (эхо-глушение,
      dedup по command_id), `handlers/devices.ts`.
- [x] Подписка на свой `App.Models.User.{id}`: `playback.device.*`.
- [x] Шит устройств: реальный presence-список, активация через API,
      «это устройство» по серверному id, состояния загрузки/пусто.
- [x] Юнит-тесты: 36 новых (api, lib/device, стор, router, хендлеры).
      Всего 248.

### Этап 2. Дружба (социал)
- [ ] Хендлеры `friendship.request.sent/accepted` → upsert в friends
      store (секции incoming/outgoing/friends) + уведомление.
- [ ] Хендлер `friend.queue.item.added` → тост + рефетч очереди.
- [ ] Хендлер `share.sent` → тост + обновление «поделились со мной».
- [ ] Панель уведомлений: заявки/шары из сторов вместо мока.
- [ ] Юнит-тесты хендлеров.

### Этап 3. Плеер (последним, отдельная схема)
- [ ] Схема применения состояния (version-gate, эхо, конфликты
      команд) — отдельная проработка перед кодом.
- [ ] `playback.state.updated` → player store.
- [ ] `playback.queue.updated` → тост + рефетч очереди.
- [ ] Reconnect → `GET /player` подмена состояния.
- [ ] Ленивая подписка `friends.{friendId}` для live now-playing
      на странице друга (замена поллинга).
