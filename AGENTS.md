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
- `src/ui/tasks-view.ts` — порт `ui/tasks-view.ts` монолита: вкладки «Задачи»/«Чаты»,
  фильтры, дерево, детали с чатом, create/edit.
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
