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
`/api/v1/skyfy/health` — голый `/health` отдаёт 404) →
`{ status: "ok", server_time }`. Служит
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

- `origin_device_id` — постоянный UUID устройства-инициатора
  (`device_uuid`: клиент генерирует при первой регистрации
  устройства, `POST /player/devices`; совпадает с
  `devices[].device_uuid`). Устройство-инициатор глушит эхо
  своих же команд по этому полю. Эхо-поля всегда телом команды,
  включая DELETE.
- `command_id` — uuid команды, генерирует клиент на каждую
  команду; дедупликация повторных доставок.

Исключение — команды по чужой очереди
(`POST /friends/{id}/queue`, reorder друга): эхо-полей нет,
инициатор — другой пользователь.

## 2. Снапшоты

Общий конверт (все типы): `type`, `source_type`, `source_id`,
`title`, `artists: [{name, source_id?}]` (исполнители/авторы,
может быть `[]`). Проверено: у artist-снапшотов поле `artists`
не приходит (ни в поиске, ни в избранном) — фронт от него не
зависит, подзаголовок строки артиста фиксированный.

- **track**: + `duration_ms|null`, `album {title?, year?,
  cover_url?, source_id?}|null`, `cover_url|null` (собственная
  обложка трека; null — фолбэк на `album.cover_url`), `lyrics|null`
  (на проводе не приходит — отдельный роут), `stream_url|null`
  (постоянная ссылка, только у источников со стабильными URL; у
  Яндекса всегда null), `sort|null` (вес позиции: больше = выше
  во вкладке).
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

Форма `user` в register/login/`GET /user`: `{id, name, email,
avatar_url}`. QR-поллинг при confirmed отдаёт полную модель
(лишние поля `email_verified_at`, `avatar`, `created_at`,
`updated_at`) — фронту нужны те же `id/name/email/avatar_url`.

**QR-вход** (для ТВ/магнитолы):
- `POST /qr-login` → `data: {code, expires_at, qr_svg}` — код,
  абсолютный срок (ISO 8601 UTC, ~15 мин) и готовый QR в SVG.
  Фронт рендерит `qr_svg` как есть, сам QR не генерирует.
- ТВ поллит `GET /qr-login/{code}` → `data: {status, token, user}`:
  `pending` — `token`/`user` null; `confirmed` — полные `token` +
  `user`, ими и логинимся; нет кода — 404 «QR-код не найден.».
- Телефон (auth): `POST /qr-login/confirm` `{code}` → 200
  `{status: "confirmed"}`; без токена — 401 «Не авторизован.».

**Яндекс Музыка (аккаунт)**:
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

Приложение при старте регистрирует устройство со своим
`device_uuid` (постоянный UUID клиента) и дальше адресуется
только по нему: `{device}` в путях, `origin_device_id` в телах
команд и `active_device_id` в состоянии плеера — это всегда
`device_uuid`, int-id устройств на провод не уходит. Presence:
устройство «живо», пока шлёт heartbeat чаще порога онлайна;
активное устройство плеера (`active_device_id`) обнуляется,
если оно перестало отмечаться.

| Метод/путь | Тело → Ответ |
|---|---|
| `GET /` | → `{devices: [{device_uuid, name, type, is_active, last_seen_at}]}` (только онлайн; presence-модель) |
| `POST /` (30/мин) | `{name, type: phone\|computer\|car\|tv, origin_device_id: uuid, command_id}` → устройство; повторная регистрация по тому же uuid обновляет профиль |
| `PATCH /{device}/activate` (30/мин) | `{origin_device_id, command_id}` → это устройство — активное (играет); `{device}` в пути — `device_uuid` |
| `POST /player/devices/heartbeat` (120/мин) | `{origin_device_id: uuid}` → `{message: "ok"}` — продлить presence; неизвестный uuid — 404 |
| `DELETE /{device}` | тело `{origin_device_id, command_id}` → удалить; `{device}` в пути — `device_uuid` |

## 5. Плеер (`/player`)

Модель: сервер — источник истины. Любая команда с любого
устройства → сервер → бродкаст → остальные устройства
применяют; инициатор глушит эхо (см. «Сокеты»).

**Состояние** (`GET /player`):
`{ state: { id, current_snapshot|null, position_seconds,
is_playing, repeat_mode: off|one|all, shuffle_enabled, version,
play_source, previous_play_source, previous_play_source_snapshot|
null, context_ref|null, shuffle_seed|null, position_updated_at|
null (ISO 8601, свежесть замера позиции), active_device_id|null
(device_uuid активного устройства), devices[] }, queue: QueueItem[] }`.

`QueueItem`: `{id, player_state_id, added_by_user_id, position,
status: pending|playing_now|played|skipped, snapshot|null}`.

`version` растёт с каждым изменением: устройство применяет
апдейт только если `version` новее локального — отсекает
устаревшие/дубли (в дополнение к `command_id`).

| Метод/путь | Тело → Ответ |
|---|---|
| `POST /play` | `{snapshot: {<конверт любого типа>}, playback_source: single\|queue\|favorites\|search\|playlist\|uploads\|wave, origin_device_id, command_id, context_ref?, shuffle_seed?}` → новое состояние; позиция 0, is_playing=true |
| `POST /pause` | `{origin_device_id, command_id}` |
| `POST /resume` | `{origin_device_id, command_id}` |
| `POST /seek` | `{position_seconds, origin_device_id, command_id}` |
| `PATCH /options` | `{options: {repeat_mode?, shuffle_enabled?}, origin_device_id, command_id, shuffle_seed?}` |

`context_ref` и `shuffle_seed` — непрозрачные строки клиента,
бэк не парсит: поле передали (даже null) — перезаписали, не
передали — не трогаем. `shuffle_seed` доезжает до остальных
устройств и через `PATCH /options` (переключение shuffle без
смены трека).

Жизненный цикл очереди: `POST /play` с `playback_source=queue`
потребляет элемент — ожидающий элемент с тем же снапшотом
становится playing_now, прежний playing_now помечается played
и удаляется.

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
| `DELETE /{queueItem}` | тело `origin_device_id?`, `command_id?` → очередь; бродкаст item=null |
| `PATCH /reorder` (60/мин) | `{items: [id...] (перестановка id ожидающих), origin_device_id?, command_id?}` → очередь; бродкаст item=null |
| `PATCH /{queueItem}/status` (120/мин) | `{status}` — плеер помечает playing_now/played/skipped; бродкаста нет |

## 7. Аудио-потоки (`/audio`)

| Метод/путь | Тело → Ответ |
|---|---|
| `POST /get-url` | track-снапшот → `{url, ttlSec}` — временная ссылка на поток (Яндекс), ссылку не хранить: запросить заново по снапшоту. Клиент кеширует URL до истечения TTL. |
| `POST /file` | track-снапшот → mp3-файл целиком (прокси с нужными Referer). Это эндпоинт **скачивания для офлайна**. |
| `POST /lyrics` | track-снапшот → `[{text, time_ms|null}]` \| null — строки текста; `time_ms` null — без таймкодов; `text: ""` — разделитель строф (рисуем пустую строку) |

## 8. Видео (`/videos`)

Источники видео: Дзен и YouTube (потоки — relay-ссылки с нашего
хоста, VPN клиенту не нужен). Резолв идёт по приоритету
YouTube → Дзен; get-url диспатчит по `source_type` снапшота.

| Метод/путь | Тело → Ответ |
|---|---|
| `POST /resolve` (60/мин) | track-снапшот → `{video: VideoSnapshot, streams: [{quality, url}], ttl_sec}` — режим клипов: матчинг «трек → видео» на бэке (YouTube → Дзен). |
| `POST /get-url` (120/мин) | video-снапшот → `{streams, ttl_sec}` — свежие потоки по видео (source-независимый контракт). |
| `GET /youtube-cookies` | → `{has_cookies: bool, updated_at: string\|null}` — статус привязки персональных cookies YouTube. |
| `POST /youtube-cookies` (30/мин) | multipart, поле `cookies` (Netscape .txt, «Get cookies.txt LOCALLY» с youtube.com) → 201. Файл хранится зашифрованным и подставляется в YouTube-запросы пользователя (обход «Sign in to confirm you're not a bot»). Добровольно: без него запросы идут без куки (деградация качества/стабильности). Relay-ссылки потоков несут sha256-префикс файла (параметр `ch`) — браузеру заголовок не прикрепить. |
| `DELETE /youtube-cookies` | → 200 — отвязать файл. |

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
- `best` — необязательное «лучшее совпадение» в общей
  снапшотной форме + `is_favorite` (как item секций); невалидный
  best от источника отдаётся как null. При поиске по ссылке
  (q = URL) best — разрешённая сущность. У artist в best поле
  `artists` не приходит — как и в секциях.
- Видео-источники (Дзен и YouTube) склеивают секцию `videos`
  вместе (`merge`); пагинации у обоих нет — `has_more` для
  видео всегда честный `false`, кнопки «ещё» не показываем.
  Аудио-источники секцию отдают пустой.

## 10. Избранное (`/favorites`)

Лайк = upsert по тройке `(type, source_type, source_id)`.

| Метод/путь | Тело → Ответ |
|---|---|
| `GET /?type=` | без type — все вкладки `{tracks: [...], videos: [...], albums: [...], artists: [...], playlists: [...]}` (снапшоты, отсортированы; `videos` всегда на месте, у аудио-источников пусто); с type — одна секция |
| `POST /` | snapshot → `{message, is_favorite: true}`; запись; повтор — no-op |
| `DELETE /` | snapshot в теле → удалить; сообщение |
| `POST /check` | snapshot → `{is_favorite}` |
| `PATCH /sort` | `{type, items: [{source_type, source_id, sort}]}` — новый порядок вкладки. Только `type: "track"`; `sort` — вес позиции (больше = выше во вкладке), хранится и отдаётся как есть, выдача по убыванию |

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

### Детали сущностей: `POST /details`

Единая выдача деталей для `type` ∈ `album|artist|playlist`.
Тело — конверт снапшота (`type`, `source_type`, `source_id`;
`title` необязателен — бэк резолвит сущность по паре источника)
+ `page`/`limit` (пагинация треков, как в поиске).

Ответ — `{entity, tracks, albums}`:

- `entity` — снапшот запрошенной сущности (полный: у album
  `artists/year/track_count`, у playlist `owner_name/item_count`,
  у artist `cover_url`);
- `tracks` — `{items: [TrackSnapshot], total, has_more}`;
- `albums` — `{items: [AlbumSnapshot], total, has_more}`
  (наполнена у artist, у album/playlist пустая).

## 12. Друзья (`/friends`)

| Метод/путь | Тело → Ответ |
|---|---|
| `POST /request` (20/мин) | `{user_id}` → заявка |
| `POST /{user}/accept` | → дружба (принять входящую заявку от пользователя) |
| `DELETE /{user}` | → снять связь: отклонить входящую / отменить исходящую / удалить из друзей |
| `GET /?section=&q=` | → `{friends, incoming, outgoing}` — секции дружбы одним запросом (без фильтра — все три; `section` ∈ friends\|incoming\|outgoing оставляет одну, остальные пустые; `q` фильтрует по имени собеседника) |
| `GET /search-users?q=` | → `[{user_id, name, email, avatar_url, friendship_id, friendship_status}]` — `user_id` — id пользователя, `friendship_id` — id заявки; `avatar_url` полный URL (как в профиле) |
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
Во всех пользовательских формах аватар — поле `avatar_url` (полный
URL, null без аватара). Дружба адресуется по id пользователя — id
записи дружбы на провод не уходит (в т.ч. accept/удаление).

## 13. Шары и ссылки

| Метод/путь | Тело → Ответ |
|---|---|
| `GET /shares` | → список «поделились со мной» |
| `DELETE /shares/{share}` | → убрать из входящих |
| `POST /share-url` (30/мин) | snapshot → `{url}` — публичная ссылка источника (у видео — `watch_url`, если есть) |

## 14. Волна (`/wave`)

Сервер — источник истины ротации: он хранит окно волны, сам
догружает его у источника (Яндекс-ротор) порциями и чистит
от прослушанного. Клиент синхронизирует окно целиком: ответ
всегда полное окно, никогда пустой; «окно не выросло» —
догрузки сейчас нет. batch_id и якоря на провод не уходят;
реальное изменение окна рассылается как `playback.wave.updated`.

Только с подключённым Яндексом (иначе 422 + сообщение).
Отключение Яндекса (`DELETE /yandex-music/auth`, §16) чистит
окна волны этого источника.

| Метод/путь | Тело → Ответ |
|---|---|
| `GET /wave` (60/мин) | query `?origin_device_id&command_id` (опционально) → `{snapshots: [Snapshot]}` — полное окно ротации в порядке следования |
| `POST /wave/feedback` | `{track_id, type: like\|dislike\|skip\|trackStarted\|trackFinished\|radioStarted, total_played_seconds?}` — реакции ротации; batch_id бэк подставляет сам из сохранённого окна |

## 15. Загрузки (`/uploads`)

Свои файлы: `POST /` multipart `{audio (mp3/flac/...), title,
artist_names: [..]}` → upload; `GET /` — список; `PATCH /{id}`
— мета (title, artist_names, album_title, lyrics, visibility);
`DELETE /{id}`; `GET /{id}/stream` — поток файла (постоянная
ссылка, качается и для офлайна).

## 16. Импорт из Яндекса (`/import/yandex-music`)

Без подключённого Яндекса summary/start — 422 «Яндекс Музыка
не подключена.».

- `GET /summary` → `data: {<type>: {total, existing}}` по ключам
  `tracks`/`albums`/`artists`/`playlists`: `total` — сколько
  лайкнуто в Яндексе, `existing` — сколько уже перенесено в SkyFi
  (маркер `import_source: "yandex"`).
- `POST /` (12/мин) → прогресс созданной задачи (старая запись
  пользователя удаляется). Джоба уходит в очередь.
- `GET /` → прогресс активной (или последней) задачи, `data:
  null` — импорт ни разу не запускался. Форма: `{job_id, status,
  total, processed, imported, skipped, failed, progress (0–100,
  completed = 100), message, started_at, finished_at}`.
  `status`: `queued` | `running` | `completed` | `failed` |
  `cancelled`.
- `DELETE /` → отмена: активной/висящей ставит `cancelled`
  (джоба завершит текущую страницу и выйдет), отвечает прогрессом;
  записи нет — `data: null`.

Лайки Яндекса приезжают в избранное с `import_source: "yandex"`.

## 17. Сокеты

**Транспорт**: Laravel Reverb (WebSocket), драйвер в конфиге
бэка. Аутентификация каналов — sanctum (тот же токен,
handshake `POST /broadcasting/auth` — путь на корне origin, вне
префикса `/api/v1/skyfy`; ответ без обёртки, сырой
`{auth: "..."}` от Reverb, не наш `errors/data`). Фронт:
официальный Echo-клиент.

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
| `playback.wave.updated` | User.{id} | `{origin_device_id, command_id}` | окно волны изменилось (холодный старт, догрузка): клиент инвалидирует локальную копию и делает `GET /wave` |
| `friend.queue.item.added` | User.{id} очередника | `{added_by: {id, name}, item: {source_id, title, artists}}` | друг добавил в мою очередь |
| `playback.device.connected` | User.{id} | `{device, origin_device_id}` | регистрация устройства |
| `playback.device.changed` | User.{id} | `{device_uuid, origin_device_id}` | смена активного устройства |
| `playback.device.disconnected` | User.{id} | `{device_uuid, device_name, origin_device_id, command_id}` | удаление устройства |
| `friendship.request.sent` | получатель | дружба целиком `{id, sender{...}, receiver{...}, status}` | заявка |
| `friendship.request.accepted` | отправитель | то же | принята |
| `share.sent` | получатель | `{share_id, sender: {id, name}, snapshot}` | шара |

**Семантика эхо**: устройство-инициатор сравнивает
`origin_device_id` со своим `device_uuid` — совпало,
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
