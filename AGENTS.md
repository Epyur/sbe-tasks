# AGENTS.md — sbe-tasks (Задачи)

Модуль «Задачи» YouGile, вынесенный из монолита `yougile-tntn` как SBE-плагин.
Потребляет сервис `sbe-yougile` через мост `window.SBE`. Данные — отдельно от
монолита: `yourbase/sbe_tasks/tasks_cache.json`.

## Структура

- `src/main.ts` — `SbeTasksPlugin`: БД, registerView, publishService (`sbe-tasks`, `SbeTasksApi`).
- `src/services/yougile-consumer.ts` — типизированный потребитель `sbe-yougile`
  (`getService('sbe-yougile')` лениво; `isAvailable()` = опубликован + `getStatus().authenticated`).
- `src/database/tasks-db.ts` — `TasksDatabase`: кэш + офлайн-очередь + `sync()`
  (порт `LocalDatabase` монолита; без LPI-исключения и backfill `completeAt`).
- `src/ui/tasks-view.ts` — фасад «LogicTEAM.Задачи» (топбар + сайдбар + контент, как
  sbe-mailer/sbe-documents): сайдбар — группа «Задачи» (пункты «Все задачи»/«Чаты», раньше —
  вкладки-кнопки над контентом) и группа «Фильтры» (проект/доска/колонка/исполнитель/статус/
  «без дедлайна», раньше — строка селектов над списком). Список задач — карточками
  (`tn-task-card`, было уже до фасада) с деревом подзадач, детали с чатом, create/edit —
  без изменений в логике.
- `src/ui/assignee-selector.ts`, `src/ui/settings-tab.ts` — компонент исполнителей
  и настройки (`selectedProjectId`).
- `src/styles.css` — классы `tn-task-*` (перенос `mailer-yougile-*`).

## Ключевые решения

- Потребление sbe-yougile — только через `YougileConsumer` (типизированные обёртки
  над `SbeYougileApi`). Логин/companyId для подписи и ссылки «Открыть в YouGile» —
  из `getStatus()`.
- Офлайн-очередь (create-task/add-info/toggle-completed/send-message/upload-file)
  промывается при синке; модуль всегда `tasks`. Журнала SyncLogger и модалки нет —
  только индикатор «⚠ Не синхронизировано».
- Переключатель «Мероприятия» убран (завязан на календарь монолита).
- Инлайн-стили UI сохранены из монолита (как sbe-presentations); чекбоксы
  AssigneeSelector — намеренно.
- sbe-core расширен в этом релизе: `SbeYougileApi.client` получил
  `getColumns(boardId?)`, `getColumnById`, `getTaskChatSubscribers`; добавлен
  `SbeTasksApi` в `SbeServiceMap`.

## Правила версионирования

- **По умолчанию** версия поднимается на **+0.0.1** относительно текущего уровня
  (например `0.1.0` → `0.1.1`, `1.2.3` → `1.2.4`).
- **При значительных архитектурных перестройках** (как в случае с плагином
  презентаций, v0.2.1 → v0.3.0) возможно поднятие сразу на **+0.1 до ближайшего
  `0.х.0`** — только по явному решению при согласовании с пользователем.
- Версия меняется в `manifest.json` и `package.json` одновременно; после правок —
  пересборка `main.js`.

## История работ

### 2026-08-20 — v0.1.9 (пересборка за sbe-core: SbeContactsApi)
- `sbe-core`: добавлены `SbeContactsApi` и `'sbe-contacts'` в `SbeServiceMap` — пересборка `main.js`, исходники плагина не менялись. Версия 0.1.8 → **0.1.9** (manifest + package.json).
- `npx tsc --noEmit` EXIT=0; `npm run build` OK.

### 2026-08-19 — v0.1.8 (фасад «LogicTEAM.Задачи»)
- `tasks-view.ts` переоформлен в фасад (топбар + сайдбар + контент), как у
  sbe-mailer/sbe-documents/sbe-calendar/sbe-presentations: старые вкладки-кнопки
  «📋 Задачи»/«💬 Чаты» (переключение через ручное изменение `style.fontWeight`) заменены
  пунктами сайдбара с `active`-классом; строка фильтров (проект/доска/колонка/исполнитель/
  статус/«без дедлайна») перенесена из горизонтального ряда над списком в группу «Фильтры»
  сайдбара. Кнопки «➕ Добавить задачу»/«📅 Добавить мероприятие» — в топбаре. Кнопка
  синхронизации — в нижней панели сайдбара.
- Список задач уже был карточками (`tn-task-card`, с деревом подзадач) до этой правки —
  не менялся. Детали задачи с чатом, create/edit форм, офлайн-очередь, вкладка «Чаты» —
  логика не менялась, только контейнер рендера (`containerElContent`) теперь указывает на
  контентную область фасада вместо корня вьюхи.
- Версия 0.1.7 → **0.1.8** (manifest + package.json). `npx tsc --noEmit` EXIT=0;
  `npm run build` OK.

### 2026-08-18 — v0.1.7 (пересборка за sbe-core: sbe-lims в service-map)
- `sbe-core`: добавлены `SbeLimsApi` и `'sbe-lims'` в `SbeServiceMap` — пересборка `main.js`,
  исходники плагина не менялись. Версия 0.1.6 → **0.1.7** (manifest + package.json).
- `npx tsc --noEmit` EXIT=0; `npm run build` OK. Коммит и пуш сделаны.

### 2026-08-18 — v0.1.6 (пересборка за sbe-core: SbeEknApi)
- `sbe-core`: добавлены `SbeEknApi` и `'sbe-ekn'` в `SbeServiceMap` — пересборка `main.js`,
  исходники не менялись. Версия 0.1.5 → **0.1.6** (manifest + package.json).

### 2026-08-17 — v0.1.5 (источник реестра)
- `sbe-core`: `DEFAULT_REGISTRY_URL` → `https://epyur.fvds.ru/registry.json`
  (raw.githubusercontent.com отдавал 429). Пересборка `main.js`, исходники не менялись.
- Версия 0.1.4 → **0.1.5** (manifest + package.json).
- `npx tsc --noEmit` EXIT=0; `npm run build` OK.

### 2026-08-15 — v0.1.4 (мероприятия + настройки проектов)
- Вторая сущность **«📅 Добавить мероприятие»**: форма портирована из
  `schedule-view.ts` монолита (название, место, целевая аудитория, дата, время
  начала/окончания, «Направление мероприятия» = колонка доски мероприятий,
  ответственный, дополнительная информация). Создаёт задачу в проекте мероприятий
  с JSON-description и дедлайном (дата + время окончания) — автоматически попадает
  в sbe-calendar через `pushEventsToCalendar()`. Офлайн — очередь `create-task`.
- Настройки: блок **«Проекты»** в `settings-tab.ts` — «Проект по умолчанию
  (задачи)», «Проект мероприятий» (`eventsProjectId`), «Доска мероприятий»
  (`eventsBoardId`).
- Кнопка создания переименована: «➕ Новая задача» → «➕ Добавить задачу».
- Версия 0.1.3 → **0.1.4** (manifest + package.json).
- `npx tsc --noEmit` EXIT=0; `npm run build` OK.

### 2026-08-15 — v0.1.3 (первичная загрузка календаря)
- Исправлена передача событий в sbe-calendar: инкрементальный diff по изменённым
  задачам работал, но существующие задачи при пересинхронизации не менялись —
  календарь не получал сведений о них. В `pushEventsToCalendar()`
  (`src/database/tasks-db.ts`) добавлена первичная загрузка: если в календаре ещё
  нет источника `sbe-tasks` (`calendar.getSources()`), отправляется полный снимок
  всех задач с дедлайном; далее — инкрементальный режим.
- `npx tsc --noEmit` EXIT=0; `npm run build` OK.
- Версия 0.1.2 → **0.1.3** (manifest + package.json).

### 2026-08-15 — v0.1.2 (чистка сирот + таблица свойств задачи)
- **Чистка «сирот»**: 258 задач с пустым `projectId` оказались подзадачами (в YouGile подзадача не имеет своей колонки/проекта; `GET /tasks` возвращает их без `columnId`). 33 из них были «сиротами» — подзадачами, чьи родители не попали в кэш; они показывались как самостоятельные карточки и давали 404 при открытии (`getTaskById` удалённого/осиротевшего id).
  В `doSync()` (`src/database/tasks-db.ts`) добавлена каскадная чистка: задачи без `columnId`, не являющиеся чьей-то подзадачей (и их вложенные подзадачи), не сохраняются в кэш. Текущий кэш очищен вручную: 530 → 460 задач (удалено 70 = 33 сироты + их подзадачи).
- **Детали задачи как таблица**: `renderTaskDetailContent` в `src/ui/tasks-view.ts` переоформлен — метаданные задачи выводятся таблицей «Поле | Значение» в стиле `tn-table` (как «Установленные плагины» в apstore): ID, Общий ID, Тип, Проект, Доска, Колонка, Статус, Исполнители, Создатель, Подписчики чата, Дедлайн, Учёт времени, Цвет, Таймеры. Описание, чек-листы, подзадачи, чат и формы не тронуты.
- `npx tsc --noEmit` EXIT=0; `npm run build` OK.
- Версия 0.1.1 → **0.1.2** (manifest + package.json).

### 2026-08-15 — v0.1.1 (фикс офлайн-кэша)
- Исправлена запись кэша `yourbase/sbe_tasks/tasks_cache.json`: `adapter.write()`
  не создаёт промежуточные папки, поэтому файл не сохранялся (молчаливый `ENOENT`
  в `save()`). Добавлен `ensureDataDir()` (`src/database/tasks-db.ts`), вызывается
  перед каждой записью.
- Результат: офлайн-архив задач теперь реально пишется на диск; после перезапуска
  Obsidian список восстанавливается из кэша, а не тянется с сервера заново.
- `npx tsc --noEmit` EXIT=0; `npm run build` OK.
- Версия 0.1.0 → **0.1.1** (manifest + package.json).

### 2026-08-15 — v0.1.0 (создание)
- Создан по дизайну `docs/superpowers/specs/2026-08-15-sbe-tasks-design.md`.
- Полный перенос модуля «Задачи» из монолита; потребление `sbe-yougile`.
- sbe-core: `SbeYougileApi.client` расширен (`getColumns(boardId?)`, `getColumnById`,
  `getTaskChatSubscribers`), добавлен `SbeTasksApi`. Пересобраны
  sbe-apstore/sbe-llm/sbe-presentations/sbe-yougile.
- `npx tsc --noEmit` EXIT=0; `npm run build` OK (`main.js` 48KB + `styles.css`).
- Реестр: добавлена запись `sbe-tasks` (hasView).
- Репозиторий `Epyur/sbe-tasks` создан, инициирующий коммит запушен.

## Статистика ошибок и отступлений

- Инлайн-стили `.style.*`/`cssText` — **26 мест** (20 в `src/ui/tasks-view.ts`,
  6 в `src/ui/assignee-selector.ts`). Сохранены из монолита намеренно (паттерн
  sbe-presentations; чекбоксы AssigneeSelector — намеренное решение монолита).
- `as unknown as` — 1 место (`tasks-view.ts:243`, граница `OfflineAction.payload`
  → `CreateTaskPayload`). Остальные касты — необходимые граничные
  (`unknown[]`/`unknown` из `SbeYougileApi`, `e.target as HTMLElement`);
  избыточных `as` нет.
- Прочих нарушений (`any`, `fetch`, bare `setTimeout`, `catch` без `unknown`,
  инлайн-извлечение сообщений) нет.
- Сборка и типы: `npm run build` OK (`main.js` 48KB + `styles.css`);
  `npx tsc --noEmit` EXIT=0. Ошибок и предупреждений нет.

## Правила

- `catch(e: unknown)` + `errorMessage()`; `getService()`/`requestUrl()` вместо `fetch`;
  `window.setTimeout()/setInterval()`; без `any`; классы `tn-*`; UI на русском;
  автор — Полищук Евгений (polishchuk@tn.ru).
- Коммиты/пуши — только по прямому указанию пользователя (инициирующий коммит
  нового плагина — автоматически).
