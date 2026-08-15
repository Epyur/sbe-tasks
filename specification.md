# specification.md — sbe-tasks (Задачи)

## 1. Назначение

SBE-плагин «Задачи» — вынос модуля «Задачи» из монолита `yougile-tntn`.
Потребитель сервиса `sbe-yougile`. Вход — кнопка «Открыть» в ЦУП СБЕ ПМиПИР
(`hasView`, публикует `SbeTasksApi extends SbeOpenableApi`).

## 2. Потребление sbe-yougile

`YougileConsumer` (ленивый `getService('sbe-yougile')`):

- `isAvailable()` — сервис опубликован и `getStatus().authenticated`.
- `getStatus()` → `{ authenticated, companyId?, login? }` (подпись, ссылка в YouGile).
- `getUsers`, `getProjects`, `getBoards`, `getColumns(boardId?)`, `getColumnById`,
  `getTasks`, `getTaskById`, `createTask`, `updateTask`, `getGroupChats`,
  `getChatMessages`, `sendChatMessage`, `getTaskChatSubscribers`,
  `uploadFile(name, data) → fullUrl`.

При недоступности/неавторизованности — Notice «Настройте авторизацию YouGile...».

## 3. Данные и хранение

- Кэш: `yourbase/sbe_tasks/tasks_cache.json`
  `{ tasks, projects, boards, columns, users, lastSyncAt, offlineQueue }`.
- Настройки (`data.json`): `selectedProjectId` (фильтр по умолчанию).

## 4. Офлайн-очередь

Типы действий: `create-task`, `add-info`, `toggle-completed`, `send-message`,
`upload-file`. Промывка в начале `sync()`; сетевые ошибки оставляют действие.
Индикатор «⚠ Не синхронизировано».

## 5. Ошибки

`catch(e: unknown)` + `errorMessage()` (sbe-core). Сетевые ошибки определяются
`isNetworkError()` (regex на fetch/offline/HTTP 0 и т.п.).

## 6. Проверка

- `npx tsc --noEmit` EXIT=0.
- `npm run build` → `main.js` + `styles.css` (tokens+components sbe-core
  склеиваются через `build.onEnd`).
