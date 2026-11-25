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
| `playback.device.connected` | User.{id} | `{device, origin_device_id}` | обновить список устройств; незнакомый uuid (после сида) — тост «новое устройство в сети» |
| `playback.device.changed` | User.{id} | `{device_id, origin_device_id}` | сменить активное устройство (список + `active_device_id` в стейте плеера) |
| `playback.device.disconnected` | User.{id} | `{device_id, device_name, origin_device_id, command_id}` | убрать устройство; было активным — `active_device_id` → null |
| `friendship.request.sent` | получателю | friendship целиком | upsert в incoming + бейдж |
| `friendship.request.accepted` | отправителю | friendship целиком | outgoing → friends |
| `friendship.request.declined`? | — | — | нет в контракте — не делаем |
| `friend.queue.item.added` | User.{id} очередника | `{added_by: {id,name}, item: {source_id,title,artists}}` | тост + рефетч очереди |
| `share.sent` | получателю | `{share_id, sender, snapshot}` | тост + список «поделились со мной» |
| `playback.state.updated` | User.{id} + friends.{id} | `{state, origin_device_id, command_id}` | плеер: version-gate + эхо |
| `playback.queue.updated` | User.{id} + friends.{id} | `{item: {title,artists}\|null, origin_device_id, command_id}` | тост + рефетч очереди |

## На сверку бэк-агенту (провод 2026-11-20, smoke-скриптом)

1. `playback.device.connected.origin_device_id` = uuid регистрации;
   в `changed`/`disconnected` — серверный int id. api.md §17 не
   различает; фронт глушит эхо по обоим. Лучше унифицировать на бэке
   или явно зафиксировать различие.
2. `friendship.request.sent/accepted`: payload обёрнут в
   `{friendship: {...}}`, api.md §17 рисует дружбу «целиком» без
   ключа — дописать обёртку в доку.
3. Панель уведомлений до сих пор на моке: заявки/шары прилетают в
   сторы и тосты, но бейджи панели — отдельная UI-задача (вне этапа).

## Сверка 2026-11-25 (кросс-девайс) — ЗАКРЫТА бэком

Бэк-фиксы подтверждены пробником №2/№3 (pusher-js + curl,
свежий юзер после migrate:fresh):

1. **`version` монотонна** — инкремент в `PlayerService::saveState`,
   регистрация устройства тоже бампит (devices[] — часть состояния).
   Пробник: версии 1→6 по командам, GET /player совпадает.
   Фронт вернул строгий гейт `<=`.
2. **Бродкаст — ресурс `GET /player`**: uuid в `active_device_id`,
   `devices[]` на месте, сырых полей нет; очередь — соседний ключ
   `{state, queue, origin_device_id, command_id}`. Фронт снял
   `normalizeWireState`, очередь применяет из пейлоада (sameQueue
   по содержимому id+position+status против перерисовок).
3. **`is_active` у устройства удалён** — активное определяется
   только `state.active_device_id`. Фронт убрал поле из типа,
   `activeUuid`/`applyChanged` из devices store; шит читает
   активное из стейта плеера.
4. **`POST /pause`: `position_seconds` опционален** — фронт шлёт
   всегда, совместимо.
5. **Семантика активации (пробник №3)**: `/play` и `/resume` от
   неактивного НЕ перехватывают активное, пока оно онлайн (пульт
   сохранён); когда активного нет — бэк сам активирует origin.
   Дополняет фронт-автоактивацию (она покрывает stale-случай
   «active_device_id указывает на мёртвое» по `state.devices`).
6. **Presence-таймаут**: планировщик ежеминутно обнуляет
   `active_device_id` у мёртвых и вещает `state.updated` с null и
   свежей версией — пульты узнают сами.
7. `device.connected` диспатчится при каждой (пере)регистрации —
   фронтовый known-фильтр тоста «новое устройство» корректен.
8. Инвариант `position_updated_at` покрыт тестом бэка (пауза без
   позиции штамп не двигает) — экстраполяция пультов валидна.

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

### Этап 2. Дружба (социал) — ✅ готово 2026-11-20
- [x] Хендлеры `friendship.request.sent/accepted` → upsert в friends
      store (incoming / outgoing→friends), payload на проводе обёрнут
      в `{friendship}` (curl 2026-11-20) — зафиксировано в
      `types/realtime.ts`, на сверку api.md.
- [x] Хендлер `friend.queue.item.added` → тост «{name} добавил в
      очередь» + форс-рефетч очереди (player store `refreshQueue`).
- [x] Хендлер `share.sent` → шара в панель уведомлений (непрочитанная) +
      тост «{name} поделился»; экран входящих шаров с кнопками
      «в плейлист/избранное» — отдельная задача, пока панель.
- [x] Панель уведомлений без моков: заявки — из friends incoming
      (принять/отклонить прямо в панели), шары — `GET /shares` +
      `prependShare` по сокету; бейдж = заявки + непрочитанные шары;
      «прочитать все» гасит шары.
- [x] Тосты по ивентам дружбы: заявка/принята/в очередь/шара —
      глобальный AppToast, 5 с.
- [x] Эхо-глушение расширено: `playback.device.connected` несёт
      origin_device_id = uuid, остальные — серверный id (провод
      2026-11-20); сравниваем с обоими.
- [x] Сокет-аутз проверена живьём end-to-end (pusher-js: login →
      `/broadcasting/auth` → private-App.Models.User.{id} → все
      ивенты этапов 1–2 доходят, скрипт-пробник в /tmp).
- [x] Юнит-тесты: роутер (uuid-эхо), social-хендлеры. Всего 257.

### Этап 3. Плеер (последним, отдельная схема)
- [x] Схема применения состояния (version-gate, эхо, конфликты
      команд) — роли «пульт-зеркало / активное-истина»,
      reconnect-слияние по владению, экстраполяция позиции по
      `position_updated_at` (2026-11-25, frontend.md §5).
- [x] `playback.state.updated` → player store.
- [x] `playback.queue.updated` → тост + рефетч очереди.
- [x] Reconnect → `GET /player` подмена состояния (пульт) /
      слияние по владению (активное).
- [ ] Ленивая подписка `friends.{friendId}` для live now-playing
      на странице друга (замена поллинга).
