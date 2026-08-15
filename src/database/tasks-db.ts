import { App } from 'obsidian';
import type {
  CachedBoard,
  CachedColumn,
  CachedProject,
  CachedSubtask,
  CachedTask,
  OfflineAction,
  TasksCacheData,
} from '../types/cache';
import type { YouGileTask, YouGileTaskFull, YouGileUser } from '../types/yougile';
import type SbeTasksPlugin from '../main';
import { errorMessage } from '../../../sbe-core/src/utils/errors';

const DATA_FILE = 'yourbase/sbe_tasks/tasks_cache.json';

/**
 * Локальный кэш задач и справочников sbe-tasks (порт LocalDatabase монолита).
 * Рендер списка идёт из кэша; данные тянутся через сервис sbe-yougile.
 */
export class TasksDatabase {
  private app: App;
  private plugin: SbeTasksPlugin;
  private data: TasksCacheData = {
    tasks: [],
    projects: [],
    boards: [],
    columns: [],
    users: [],
    lastSyncAt: 0,
    offlineQueue: [],
  };
  private initialized = false;
  private userMap = new Map<string, string>();

  constructor(app: App, plugin: SbeTasksPlugin) {
    this.app = app;
    this.plugin = plugin;
  }

  async init(): Promise<void> {
    try {
      const adapter = this.app.vault.adapter;
      const exists = await adapter.exists(DATA_FILE);
      if (exists) {
        const content = await adapter.read(DATA_FILE);
        const parsed = JSON.parse(content) as Partial<TasksCacheData>;
        this.data = {
          tasks: parsed.tasks ?? [],
          projects: parsed.projects ?? [],
          boards: parsed.boards ?? [],
          columns: parsed.columns ?? [],
          users: parsed.users ?? [],
          lastSyncAt: parsed.lastSyncAt ?? 0,
          offlineQueue: parsed.offlineQueue ?? [],
        };
        for (const u of this.data.users) {
          this.userMap.set(u.id, u.name || u.email || u.id);
        }
      }
      this.initialized = true;
    } catch (e: unknown) {
      console.error('Задачи: не удалось загрузить кэш:', errorMessage(e));
      this.initialized = true;
    }
  }

  /** Пишет кэш на диск. Никогда не отклоняет промис — ошибки логируются. */
  private async save(): Promise<void> {
    if (!this.initialized) return;
    try {
      await this.app.vault.adapter.write(DATA_FILE, JSON.stringify(this.data, null, 2));
    } catch (e: unknown) {
      console.error('Задачи: не удалось сохранить кэш:', errorMessage(e));
    }
  }

  getTasks(): CachedTask[] {
    return this.data.tasks;
  }

  getTask(id: string): CachedTask | undefined {
    return this.data.tasks.find(t => t.id === id);
  }

  getProjects(): CachedProject[] {
    return this.data.projects;
  }

  getBoards(): CachedBoard[] {
    return this.data.boards;
  }

  getColumns(): CachedColumn[] {
    return this.data.columns;
  }

  getUsers(): Array<{ id: string; name: string; email: string }> {
    return this.data.users;
  }

  getLastSyncAt(): number {
    return this.data.lastSyncAt;
  }

  getUserName(id: string): string {
    return this.userMap.get(id) ?? id;
  }

  getUniqueAssignees(): string[] {
    const set = new Set<string>();
    for (const t of this.data.tasks) {
      if (Array.isArray(t.assigned)) {
        for (const a of t.assigned) {
          if (a) set.add(a);
        }
      }
    }
    return [...set].map(id => this.getUserName(id));
  }

  getOfflineQueue(): OfflineAction[] {
    return this.data.offlineQueue;
  }

  addToOfflineQueue(action: Omit<OfflineAction, 'id' | 'createdAt' | 'synced'>): void {
    const entry: OfflineAction = {
      ...action,
      id: `offline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
      synced: false,
    };
    this.data.offlineQueue.push(entry);
    void this.save();
  }

  markOfflineSynced(id: string): void {
    const idx = this.data.offlineQueue.findIndex(a => a.id === id);
    if (idx !== -1) {
      this.data.offlineQueue[idx].synced = true;
      void this.save();
    }
  }

  removeOfflineAction(id: string): void {
    this.data.offlineQueue = this.data.offlineQueue.filter(a => a.id !== id);
    void this.save();
  }

  hasUnsynchronizedActions(): boolean {
    return this.data.offlineQueue.some(a => !a.synced);
  }

  private syncingPromise: Promise<void> | null = null;

  async sync(): Promise<void> {
    if (this.syncingPromise) return this.syncingPromise;
    const p = this.doSync();
    this.syncingPromise = p;
    try {
      await p;
    } finally {
      if (this.syncingPromise === p) this.syncingPromise = null;
    }
  }

  private async doSync(): Promise<void> {
    const yougile = this.plugin.yougile;
    if (!yougile.isAvailable()) return;

    try {
      let remoteUsers: YouGileUser[] = [];
      try {
        remoteUsers = await yougile.getUsers();
      } catch {
        // users endpoint may not be available
      }
      this.userMap.clear();
      this.data.users = remoteUsers.map(u => {
        const name = u.name || u.email || u.id;
        return { id: u.id, name, email: u.email || name };
      });
      for (const u of this.data.users) this.userMap.set(u.id, u.name);

      let remoteProjects: Array<{ id: string; title: string }> = [];
      try {
        remoteProjects = await yougile.getProjects();
      } catch (e: unknown) {
        console.warn('Задачи: не удалось загрузить проекты', errorMessage(e));
      }

      let allBoards: CachedBoard[] = [];
      try {
        const boards = await yougile.getBoards();
        allBoards = boards.map(b => ({ id: b.id, title: b.title, projectId: b.projectId }));
      } catch (e: unknown) {
        console.warn('Задачи: не удалось загрузить доски', errorMessage(e));
      }

      const remoteTasks = await yougile.getTasks();

      let allColumns: CachedColumn[] = [];
      try {
        const cols = await yougile.getColumns();
        allColumns = cols.map(col => ({ id: col.id, title: col.title, boardId: col.boardId }));
      } catch {
        // fallback: try per-board column fetch
        const columnIds = new Set<string>();
        for (const board of allBoards) {
          try {
            const boardCols = await yougile.getColumns(board.id);
            for (const col of boardCols) {
              if (!columnIds.has(col.id)) {
                columnIds.add(col.id);
                allColumns.push({ id: col.id, title: col.title, boardId: col.boardId });
              }
            }
          } catch {
            // per-board column fetch may fail
          }
        }
        if (allColumns.length === 0) {
          // ultimate fallback: collect columns from tasks
          for (const rt of remoteTasks) {
            if (rt.columnId) columnIds.add(rt.columnId);
          }
          for (const colId of columnIds) {
            try {
              const col = await yougile.getColumnById(colId);
              allColumns.push({ id: col.id, title: col.title, boardId: col.boardId });
            } catch {
              // individual column fetch may fail
            }
          }
        }
      }

      this.data.projects = remoteProjects.map(p => ({ id: p.id, title: p.title }));
      this.data.boards = allBoards;
      this.data.columns = allColumns;

      const now = Date.now();

      const taskMap = new Map(remoteTasks.map(t => [t.id, t]));
      const existingMap = new Map(this.data.tasks.map(t => [t.id, t]));

      const allSubtaskIds = new Set<string>();
      for (const rt of remoteTasks) {
        if (rt.subtasks) {
          for (const sid of rt.subtasks) {
            allSubtaskIds.add(sid);
          }
        }
      }
      const subtaskCache = new Map<string, string>();
      for (const sid of allSubtaskIds) {
        const known = taskMap.get(sid);
        const cachedTitle = known?.title ?? existingMap.get(sid)?.title;
        if (cachedTitle) {
          subtaskCache.set(sid, cachedTitle);
        } else {
          try {
            const st = await yougile.getTaskById(sid);
            subtaskCache.set(sid, st.title || sid);
          } catch {
            subtaskCache.set(sid, sid);
          }
        }
      }

      const boardMap = new Map(allBoards.map(b => [b.id, b]));
      const columnMap = new Map(allColumns.map(c => [c.id, c]));
      const projectMap = new Map(remoteProjects.map(p => [p.id, p.title]));

      const mergedTasks: CachedTask[] = [];
      const processedIds = new Set<string>();

      const buildCachedTask = (rt: YouGileTask, existing: CachedTask | undefined): CachedTask => {
        const colId = rt.columnId ?? '';
        const column = columnMap.get(colId);
        const board = column ? boardMap.get(column.boardId) : undefined;
        const projectTitle = board ? projectMap.get(board.projectId) ?? '' : '';
        return {
          id: rt.id,
          title: rt.title ?? '',
          description: rt.description ?? '',
          columnId: colId,
          columnTitle: column?.title ?? '',
          boardId: board?.id ?? '',
          boardTitle: board?.title ?? '',
          projectId: board?.projectId ?? '',
          projectTitle,
          completed: rt.completed ?? false,
          completeAt: this.normalizeCompleteAt(rt.completeAt ?? rt.completedTimestamp) ?? existing?.completeAt,
          assigned: (rt.assigned ?? []).map(id => this.getUserName(id)),
          subtasks: (rt.subtasks ?? []).map(sid => ({ id: sid, title: subtaskCache.get(sid) || sid })),
          timestamp: rt.timestamp ?? 0,
          cachedAt: now,
          updatedAt: rt.updatedAt ?? '',
          deadline: rt.deadline?.deadline,
        };
      };

      for (const rt of remoteTasks) {
        processedIds.add(rt.id);
        const existing = existingMap.get(rt.id);
        if (existing && existing.updatedAt === rt.updatedAt) {
          mergedTasks.push(existing);
        } else {
          mergedTasks.push(buildCachedTask(rt, existing));
        }
      }

      for (const sid of allSubtaskIds) {
        if (processedIds.has(sid)) continue;
        processedIds.add(sid);
        const existing = existingMap.get(sid);
        if (existing) {
          mergedTasks.push(existing);
        } else {
          let st: YouGileTaskFull;
          try {
            st = await yougile.getTaskById(sid);
          } catch {
            continue;
          }
          const colId = st.columnId ?? '';
          const column = columnMap.get(colId);
          const board = column ? boardMap.get(column.boardId) : undefined;
          const projectTitle = board ? projectMap.get(board.projectId) ?? '' : '';
          mergedTasks.push({
            id: st.id,
            title: st.title ?? '',
            description: st.description ?? '',
            columnId: colId,
            columnTitle: column?.title ?? '',
            boardId: board?.id ?? '',
            boardTitle: board?.title ?? '',
            projectId: board?.projectId ?? '',
            projectTitle,
            completed: st.completed ?? st.complete ?? false,
            completeAt: this.normalizeCompleteAt(st.completeAt ?? st.completedTimestamp),
            assigned: (st.assigned ?? []).map(id => this.getUserName(id)),
            subtasks: (st.subtasks ?? []).map(sst => ({ id: sst, title: subtaskCache.get(sst) || sst })),
            timestamp: st.timestamp ?? 0,
            cachedAt: now,
            updatedAt: st.updatedAt ?? '',
            deadline: st.deadline?.deadline,
          });
        }
      }

      this.data.tasks = mergedTasks;
      this.data.lastSyncAt = now;

      await this.save();
    } catch (e: unknown) {
      console.warn('Задачи: ошибка синхронизации —', errorMessage(e));
    }
  }

  private normalizeCompleteAt(value: string | number | undefined): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'number') return value;
    const ts = Date.parse(String(value).replace(' ', 'T'));
    return isNaN(ts) ? undefined : ts;
  }
}
