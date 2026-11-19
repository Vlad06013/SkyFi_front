# SkyFi API — контракт для фронта

Три документа — одна система: `api.md` (контракт),
`contracts.md` (TypeScript-типы и мок-фикстуры 1:1),
`frontend.md` (требования к фронту). Правило дрейфа:
сначала api.md, потом contracts.md, потом фронт.

Единственный источник правды о бэкенде. После этого документа
в код бэка лазить не нужно. Бэк: Laravel, все ответы в единой
обёртке, сущности на проводе — только снапшоты.

- Актуальность: синхронизирован с кодом вручную, при изменении
  API сначала правится этот документ.
- Базовый URL: `/api/v1/skyfy`
- Окружения: dev — `http://<хост>:<порт>` (см. compose), prod — тот
  же домен, что и вебсокеты (см. «Сокеты»).

## 1. Общие конвенции

### 1.1. Обёртка ответа

Каждый JSON-ответ:

```json
{ "errors": null, "data": {}, "pagination": null }
```

- `errors: null` — успех. Иначе строка или объект ошибок
  (`{"поле": ["сообщение"]}` при 422).
- `data` — полезная нагрузка (объект, массив или null).
- `pagination` — объект пагинации или null:
  `{ current_page, last_page, per_page, total }` (номерная,
  параметры `page` / `limit`).

Коды: 200 ок, 201 создано, 401 нет/просрочен токен, 404 нет
сущности (сообщение в `errors`), 422 валидация (ошибки полей
в `errors`), 429 троттлинг, 5xx бэк/внешние сервисы
(502/503 с человекочитаемым сообщением).

### 1.2. Авторизация

Sanctum Bearer-токен: `Authorization: Bearer <token>`.
Токен выдаётся при register/login/QR-входе (`token`,
`plainTextToken` внутри `data`). Все роуты требуют токен,
кроме: register, login, forgot/reset-password, qr-login
(store/show), health.

### 1.3. Троттлинг

Чувствительные роуты ограничены (указано у каждого). При 429 —
показать тост и не ретраить мгновенно.

### 1.4. Health (без авторизации)

`GET /health` (под базовым префиксом, фактически
`/api/v1/skyfy/health` — уточнено curl'ом, голый `/health`
отдаёт 404) → `{ status: "ok", server_time }`. Служит
офлайн-детекту: неуспешный запрос = бэк недоступен (сеть есть —
иначе fetch не ушёл бы; токен не при чём, auth тут нет).

### 1.5. Словарь платформы

- **snapshot** — любая сущность на проводе; дискриминатор
  `type`; идентичность — пара `source_type` + `source_id`.
- **item** — элемент смешанных списков (очередь, плейлист,
  избранное): snapshot любого типа.
- **track** — только аудио; **video** — видео (клипы, фильмы).
- Источники `source_type`: `yandex_music`, `upload`, `vk`,
  `skyfi` (свой каталог), `mock` (временный мок видео).

### 1.6. Эхо-поля команд

Каждый мутирующий роут плеера/очереди/устройств принимает:

- `origin_device_id` — id строки устройства-инициатора
  (`POST /player/devices`, ответ `data.id`); int или строка в
  query-параметрах DELETE. Устройство-инициатор глушит эхо
  своих же команд по этому полю.
- `command_id` — uuid команды, генерирует клиент на каждую
  команду; дедупликация повторных доставок.

Исключение — команды по чужой очереди
(`POST /friends/{id}/queue`, reorder друга): эхо-полей нет,
инициатор — другой пользователь.

## 2. Снапшоты

Общий конверт (все типы): `type`, `source_type`, `source_id`,
`title`, `artists: [{name, source_id?}]` (исполнители/авторы,
может быть `[]`).

- **track**: + `duration_ms|null`, `album {title?, year?,
  cover_url?, source_id?}|null`, `lyrics|null` (на проводе не
  приходит — отдельный роут), `stream_url|null` (постоянная
  ссылка, только у источников со стабильными URL; у Яндекса
  всегда null), `sort|null`.
- **video**: + `duration_ms|null`, `cover_url|null` (постер),
  `watch_url|null` (постоянная страница в источнике — кнопка
  «оригинал», шаринг; не для воспроизведения), `sort|null`.
- **album**: + `year|null`, `cover_url|null`, `track_count|null`.
- **artist**: + `cover_url|null`.
- **playlist**: + `owner_name|null`, `cover_url|null`,
  `item_count|null`.

Правила: ссылки на потоки (audio/video) с TTL в снапшоты не
входят — выдаются отдельными роутами по паре
`(source_type, source_id)`. `type` ∈ `track|video|album|
playlist|artist`.

## 3. Авторизация и профиль

| Метод/путь | Тело → Ответ |
|---|---|
| `POST /register` (6/мин) | `{name, email, password, password_confirmation}` → `user, token` |
| `POST /login` (6/мин) | `{email, password}` → `user, token` |
| `POST /forgot-password` (6/мин) | `{email}` → сообщение; письмо с кодом |
| `POST /reset-password` (12/мин) | `{email, code, password, password_confirmation}` |
| `GET /user` | → `user` (профиль текущего) |
| `POST /logout` | → сообщение; токен отзывается |
| `PATCH /profile` | `{name?}` |
| `PUT /profile/avatar` | multipart `avatar` (image) |
| `DELETE /profile/avatar` | → дефолтный аватар |

Форма `user` в register/login/`GET /user` (проверено curl'ом):
`{id, name, email, avatar_url}`. QR-поллинг при confirmed
отдаёт полную модель (лишние поля `email_verified_at`,
`avatar`, `created_at`, `updated_at`) — фронту нужны те же
`id/name/email/avatar_url`.

**QR-вход** (для ТВ/магнитолы), формы проверены curl'ом:
- `POST /qr-login` → `data: {code, expires_at, qr_svg}` —
  код, абсолютный срок (ISO 8601 UTC, ~15 мин) и готовый
  QR в SVG. Фронт рендерит `qr_svg` как есть, сам QR
  не генерирует.
- ТВ поллит `GET /qr-login/{code}` → `data: {status,
  token, user}`: `pending` — `token`/`user` null;
  `confirmed` — полные `token` + `user`, ими и логинимся;
  нет кода — 404 «QR-код не найден.».
- Телефон (auth): `POST /qr-login/confirm` `{code}` → 200
  `{status: "confirmed"}`; без токена — 401 «Не авторизован.».

**Яндекс Музыка (аккаунт)**, формы проверены curl'ом:
- `POST /yandex-music/auth/device/start` (12/мин) →
  `data: {session_id, status: "pending", verification_url,
  user_code}` — старт device flow (пользователь вводит код на
  странице Яндекса). Идемпотентен: при активной сессии
  возвращает её (тот же код/ссылку). Сервис Яндекса может
  отдать `verification_url`/`user_code` = null — тогда код и
  ссылку подхватывает поллинг статуса.
- `GET /yandex-music/auth/device/status` (30/мин) — одновременно
  поллинг сессии и проверка «подключён ли аккаунт»:
  `data: {status, connected, verification_url?, user_code?,
  message?}`. `status`: `not_started` (сессии нет; `connected` —
  сохранён ли токен), `pending` (сессия жива, поля кода/ссылки
  заполнены), `connected` (токен одноразово забран и сохранён
  только на сервере; сессия удалена), иначе (`expired`/`failed`/
  `consumed`/др.) — сессия умерла без подключения и удалена.
- `DELETE /yandex-music/auth` → `data: {connected: false,
  message}` — отключить аккаунт (токен и сессия удаляются).
  Не подключён → волна/импорт недоступны (эндпоинты отдадут
  4xx с сообщением).

## 4. Устройства (`/player/devices`)

Приложение при старте регистрирует устройство и дальше ссылается
на `data.id` как на `origin_device_id`. Presence: устройство
«живо», пока шлёт heartbeat чаще порога онлайна; активное
устройство плеера (`active_device_id`) обнуляется, если оно
перестало отмечаться.

| Метод/путь | Тело → Ответ |
|---|---|
| `GET /` | → список устройств `{id, name, type, is_active, last_seen_at, ...}` (только онлайн; presence-модель) |
| `POST /` (30/мин) | `{name, type: phone\|computer\|car\|tv, origin_device_id: uuid, command_id}` → устройство; повторная регистрация по тому же uuid обновляет профиль |
| `PATCH /{device}/activate` (30/мин) | `{origin_device_id, command_id}` → это устройство — активное (играет) |
| `POST /heartbeat` (120/мин) | `{device_uuid}` → продлить presence |
| `DELETE /{device}` | query `?origin_device_id&command_id` → удалить |

## 5. Плеер (`/player`)

Модель: сервер — источник истины. Любая команда с любого
устройства → сервер → бродкаст → остальные устройства
применяют; инициатор глушит эхо (см. «Сокеты»).

**Состояние** (`GET /player`):
`{ state: { id, current_snapshot|null, position_seconds,
is_playing, repeat_mode: off|one|all, shuffle_enabled, version,
play_source, previous_play_source, previous_play_source_snapshot|
null, wave_anchor|null, active_device_id|null, devices[] },
queue: QueueItem[] }`.

`QueueItem`: `{id, player_state_id, added_by_user_id, position,
status: pending|playing_now|played|skipped, snapshot|null}`.

`version` растёт с каждым изменением: устройство применяет
апдейт только если `version` новее локального — отсекает
устаревшие/дубли (в дополнение к `command_id`).

| Метод/путь | Тело → Ответ |
|---|---|
| `POST /play` | `{snapshot: {<конверт любого типа>}, playback_source: single\|favorites\|search\|playlist\|uploads\|yandex_wave, origin_device_id, command_id, wave_anchor?}` → новое состояние; позиция 0, is_playing=true |
| `POST /pause` | `{origin_device_id, command_id}` |
| `POST /resume` | `{origin_device_id, command_id}` |
| `POST /seek` | `{position_seconds, origin_device_id, command_id}` |
| `PATCH /options` | `{options: {repeat_mode?, shuffle_enabled?}, origin_device_id, command_id}` |

Все команды возвращают состояние целиком и диспатчат
`playback.state.updated`.

## 6. Очередь (`/player/queue`)

Серверная очередь — приоритетная: фронт врезает её в текущий
контекст (см. frontend.md, «Модель плеера»). Потреблённые
элементы удаляются.

| Метод/путь | Тело → Ответ |
|---|---|
| `GET /` | → очередь целиком |
| `POST /` (60/мин) | snapshot (плоский конверт любого типа) + `origin_device_id?`, `command_id?` → очередь целиком; бродкаст с item `{title, artists}` |
| `DELETE /{queueItem}` | query `?origin_device_id&command_id` → очередь; бродкаст item=null |
| `PATCH /reorder` (60/мин) | `{items: [id...] (перестановка id ожидающих), origin_device_id?, command_id?}` → очередь; бродкаст item=null |
| `PATCH /{queueItem}/status` (120/мин) | `{status}` — плеер помечает playing_now/played/skipped; бродкаста нет |

## 7. Аудио-потоки (`/audio`)

| Метод/путь | Тело → Ответ |
|---|---|
| `POST /get-url` | track-снапшот → `{url, ttlSec}` — временная ссылка на поток (Яндекс), ссылку не хранить: запросить заново по снапшоту. Клиент кеширует URL до истечения TTL. |
| `POST /file` | track-снапшот → mp3-файл целиком (прокси с нужными Referer). Это эндпоинт **скачивания для офлайна**. |
| `POST /lyrics` | track-снапшот → `{lyrics: [{text, time_ms|null}]|null, source_url?}` |

## 8. Видео (`/videos`)

| Метод/путь | Тело → Ответ |
|---|---|
| `POST /resolve` (60/мин) | track-снапшот → `{video: VideoSnapshot, streams: [{quality, url}], ttl_sec}` — режим клипов: матчинг «трек → видео» на бэке. Мок: всегда каталог. |
| `POST /get-url` (120/мин) | video-снапшот → `{streams, ttl_sec}` — свежие потоки по видео. |

## 9. Поиск (`GET /search?q=&limit=&page=`, 30/мин)

`q` (2–100 символов; может быть **ссылкой** на сущность Яндекса —
бэк сам разберёт и вернёт одноэлементную страницу), `limit`
(≤50, размер страницы треков), `page` с 1.

Ответ — страница секциями (все секции всегда на месте):

```json
{ "query": "...", "page": 1, "best": {...}|null,
  "tracks":    { "items": [TrackSnapshot & {is_favorite}], "total": n, "has_more": b },
  "albums":    { "items": [...], "total": n, "has_more": b },
  "artists":   { "items": [...], "total": n, "has_more": b },
  "playlists": { "items": [...], "total": n, "has_more": b },
  "videos":    { "items": [VideoSnapshot & {is_favorite}], "total": n, "has_more": b } }
```

- `is_favorite` — пометка избранного текущего пользователя
  (всегда bool, только в поиске).
- `best` — необязательное «лучшее совпадение» (форма у
  источника; может не быть полной тройки идентичности — тогда
  `is_favorite` внутри него false).
- Сейчас видео-источник — мок: секция `videos` всегда содержит
  2 ролика на любом запросе (реальные потоки через
  `/videos/get-url`). Аудио-источники секцию отдают пустой.

## 10. Избранное (`/favorites`)

Лайк = upsert по тройке `(type, source_type, source_id)`.

| Метод/путь | Тело → Ответ |
|---|---|
| `GET /?type=` | без type — все вкладки `{tracks: [...], albums: [...], artists: [...], playlists: [...]}` (снапшоты, отсортированы); с type — одна секция |
| `POST /` | snapshot → запись; повтор — no-op |
| `DELETE /` | snapshot → удалить |
| `POST /check` | snapshot → `{is_favorite}` |
| `PATCH /sort` | `{type, items: [{source_type, source_id, sort}]}` — новый порядок вкладки |

## 11. Плейлисты (`/playlists`)

Сущность адресуется **снапшотом в теле**, не id БД. Свой
каталог — `source_type: "skyfi"`. Внешний плейлист при первой
записи материализуется локальной строкой — править можно любой.

| Метод/путь | Тело → Ответ |
|---|---|
| `GET /` | → список `{snapshot, name, cover_url, visibility, item_count}` |
| `POST /` | `{name, visibility?}` → 201 `{playlist, snapshots: []}` |
| `POST /show` | playlist-снапшот → `{playlist, snapshots: [Snapshot]}` (состав в порядке индекса) |
| `PATCH /` | `{<конверт playlist>, name?, visibility?}` |
| `DELETE /` | `{<конверт playlist>}` |
| `PUT /cover` | multipart `cover` + поля `playlist.*` |
| `POST /items` | `{<конверт playlist>, item: {<snapshot track\|video>}}` → 201 `{playlist, snapshots}` |
| `DELETE /items` | `{<конверт playlist>, index}` |
| `PATCH /items/reorder` | `{<конверт playlist>, order: [index...]}` |

## 12. Друзья (`/friends`)

| Метод/путь | Тело → Ответ |
|---|---|
| `POST /request` (20/мин) | `{user_id}` → заявка |
| `POST /requests/{friendship}/accept` | → дружба |
| `DELETE /{friendship}` | → отклонить/удалить |
| `GET /` | → друзья |
| `GET /search-users?q=` | → пользователи + статус заявки |
| `GET /requests/incoming`, `/outgoing` | → заявки |
| `GET /{user}` | → профиль друга |
| `GET /{user}/now-playing` | → `{is_playing, snapshot\|null}` |
| `GET /{user}/favorites` | → вкладки избранного друга |
| `GET /{user}/queue` | → очередь друга (ожидающие) |
| `PATCH /{user}/queue/reorder` | `{items: [id...]}` |
| `POST /{user}/queue` (30/мин) | snapshot → добавить другу в очередь (друг получает `friend.queue.item.added`) |
| `POST /{user}/share` (30/мин) | snapshot → шара другу (`share.sent`) |

`sender` / `receiver` каждой дружбы содержат `current_snapshot` —
текущий снапшот плеера этого пользователя (null, если состояния
плеера нет). Отдаётся всегда, независимо от is_playing: на странице
друзей берём сторону, которая не я. То же поле приходит в
websocket-ивентах `friendship.request.sent` / `friendship.request.accepted`.

## 13. Шары и ссылки

| Метод/путь | Тело → Ответ |
|---|---|
| `GET /shares` | → список «поделились со мной» |
| `DELETE /shares/{share}` | → убрать из входящих |
| `POST /share-url` (30/мин) | snapshot → `{url}` — публичная ссылка источника (у видео — `watch_url`, если есть) |

## 14. Волна (`/wave`)

Только с подключённым Яндексом (иначе 4xx + сообщение).

| Метод/путь | Тело → Ответ |
|---|---|
| `GET /wave` | → `{batch_id, tracks: [TrackSnapshot]}` — порция ротации; продолжение по `wave_anchor` из плеера |
| `POST /wave/feedback` | `{track_id, type: like\|dislike\|skip\|trackStarted\|trackFinished\|radioStarted}` — реакции ротации |

## 15. Загрузки (`/uploads`)

Свои файлы: `POST /` multipart `{audio (mp3/flac/...), title,
artist_names: [..]}` → upload; `GET /` — список; `PATCH /{id}`
— мета (title, artist_names, album_title, lyrics, visibility);
`DELETE /{id}`; `GET /{id}/stream` — поток файла (постоянная
ссылка, качается и для офлайна).

## 16. Импорт из Яндекса (`/import/yandex-music`)

`GET /summary` — что будет импортировано; `POST /` (12/мин) —
старт (job); `GET /` — прогресс `{status: pending|running|
completed|failed, counters}`; `DELETE /` — отмена. Лайки Яндекса
приезжают в избранное с `import_source: "yandex"`.

## 17. Сокеты

**Транспорт**: Laravel Reverb (WebSocket), драйвер в конфиге
бэка. Аутентификация каналов — sanctum (тот же токен,
handshake `/broadcasting/auth`). Фронт: официальный Echo-клиент.

**Каналы** (private):
- `App.Models.User.{id}` — личный канал пользователя (только
  владелец).
- `friends.{id}` — канал пользователя для друзей (подписаться
  может только друг; слушается для now-playing/очереди друга).

**Ивенты** (имена = `broadcastAs`, payload = `broadcastWith`):

| Ивент | Каналы | Payload | Когда |
|---|---|---|---|
| `playback.state.updated` | User.{id}, friends.{id} | `{state, origin_device_id, command_id}` | любая команда плеера; `state` — тот же JSON, что `GET /player` |
| `playback.queue.updated` | User.{id}, friends.{id} | `{item: {title, artists}\|null, origin_device_id, command_id}` | add (item заполнен — тост «добавлено»), remove/reorder (null) |
| `friend.queue.item.added` | User.{id} очередника | `{added_by: {id, name}, item: {source_id, title, artists}}` | друг добавил в мою очередь |
| `playback.device.connected` | User.{id} | `{device, origin_device_id}` | регистрация устройства |
| `playback.device.changed` | User.{id} | `{device_id, origin_device_id}` | смена активного устройства |
| `playback.device.disconnected` | User.{id} | `{device_id, device_name, origin_device_id, command_id}` | удаление устройства |
| `friendship.request.sent` | получатель | дружба целиком `{id, sender{...}, receiver{...}, status}` | заявка |
| `friendship.request.accepted` | отправитель | то же | принята |
| `share.sent` | получатель | `{share_id, sender: {id, name}, snapshot}` | шара |

**Семантика эхо**: устройство-инициатор сравнивает
`origin_device_id` со своим `data.id` устройства — совпало,
значит эта команда его же: применять локально повторно не надо
(он уже применил оптимистично). `command_id` — дополнительная
дедупликация. Playback-ивенты на канале `friends.{id}` —
для экранов друга; эхо-поля там игнорируются.

**Reconnect**: при восстановлении соединения фронт делает
`GET /player` и подменяет локальное состояние серверным
(сервер — источник истины), сокет-дельты дальше накатываются
по `version`.

## 18. Коды ошибок, которые фронт обрабатывает явно

- 401 → на выход из сессии (на ТВ — на экран QR).
- 422 → показ полей из `errors`.
- 429 → тост «слишком часто».
- 404/403 с сообщением в `errors` → тост сообщением.
- 502/503 → тост «внешний сервис недоступен» (Яндекс
  не отвечает / не подключён).
