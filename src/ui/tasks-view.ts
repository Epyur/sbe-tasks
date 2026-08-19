import { ItemView, Notice, WorkspaceLeaf } from 'obsidian';
import type SbeTasksPlugin from '../main';
import type { CachedTask } from '../types/cache';
import type { CreateTaskPayload, YouGileChatMessage, YouGileTaskFull } from '../types/yougile';
import { AssigneeSelector } from './assignee-selector';
import { errorMessage } from '../../../sbe-core/src/utils/errors';
import type { YougileStatus } from '../services/yougile-consumer';

function stripHtml(html: string): string {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el.textContent || el.innerText || '';
}

function isNetworkError(e: unknown): boolean {
  if (e instanceof TypeError && e.message === 'Failed to fetch') return true;
  if (e instanceof Error && /network|fetch|offline|econnrefused|enotfound|dns|timeout|HTTP 0|status 0/i.test(e.message)) return true;
  return false;
}

export const SBE_TASKS_VIEW_TYPE = 'sbe-tasks-view';

export class TasksView extends ItemView {
  plugin: SbeTasksPlugin;
  private rootEl!: HTMLElement;
  private navEl!: HTMLElement;
  private crumbEl!: HTMLElement;
  private collapseLabel!: HTMLElement;
  private collapsed = false;
  private containerElContent!: HTMLElement;
  private selectProject!: HTMLSelectElement;
  private selectBoard!: HTMLSelectElement;
  private selectColumn!: HTMLSelectElement;
  private selectAssignee!: HTMLSelectElement;
  private selectStatus!: HTMLSelectElement;
  private currentTab: 'tasks' | 'chats' = 'tasks';

  private detailViewActive = false;
  private detailTaskId = '';
  private createViewActive = false;
  private searchInput!: HTMLInputElement;
  private noDeadlineOnly = false;
  private noDeadlineCb!: HTMLInputElement;

  constructor(leaf: WorkspaceLeaf, plugin: SbeTasksPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return SBE_TASKS_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'LogicTEAM.Задачи';
  }

  getIcon(): string {
    return 'list-todo';
  }

  async onOpen(): Promise<void> {
    const container = this.contentEl;
    container.addClass('tn-task-container');
    this.rootEl = container.createDiv({ cls: 'tn-task-app' });

    this.buildShell();
    this.populateFilters();
    this.renderFromCache();

    this.registerInterval(window.setInterval(() => this.syncAndRender(), 5 * 60 * 1000));
  }

  // ---- Каркас ----

  private buildShell(): void {
    const topbar = this.rootEl.createDiv({ cls: 'tn-task-topbar' });
    topbar.createDiv({ cls: 'tn-task-module-title', text: 'LogicTEAM.Задачи' });
    this.crumbEl = topbar.createDiv({ cls: 'tn-task-crumb', text: 'Задачи' });
    topbar.createDiv({ cls: 'tn-task-spacer' });
    const eventBtn = topbar.createEl('button', { text: '📅 Мероприятие', cls: 'tn-btn tn-btn-ghost' });
    eventBtn.addEventListener('click', () => this.showEventCreateForm());
    const createBtn = topbar.createEl('button', { text: '＋ Добавить задачу', cls: 'tn-task-create' });
    createBtn.addEventListener('click', () => this.showCreateForm());

    const main = this.rootEl.createDiv({ cls: 'tn-task-main' });
    const sidebar = main.createDiv({ cls: 'tn-task-sidebar' });

    const collapseBtn = sidebar.createDiv({ cls: 'tn-task-collapse' });
    collapseBtn.createSpan({ text: '▧' });
    this.collapseLabel = collapseBtn.createSpan({ cls: 'tn-task-collapse-lbl', text: 'Свернуть' });
    collapseBtn.addEventListener('click', () => this.toggleCollapse());

    this.navEl = sidebar.createDiv({ cls: 'tn-task-nav' });
    this.buildNav();

    const actions = sidebar.createDiv({ cls: 'tn-task-sidebar-actions' });
    const syncBtn = actions.createEl('button', { cls: 'tn-task-nav-action' });
    syncBtn.createSpan({ text: '🔄' });
    syncBtn.createSpan({ cls: 'tn-task-nav-lbl', text: 'Синхронизация' });
    syncBtn.addEventListener('click', () => this.syncAndRender());

    const content = main.createDiv({ cls: 'tn-task-content' });
    this.searchInput = content.createEl('input', {
      attr: { type: 'text', placeholder: '🔍 Поиск по задачам...' },
      cls: 'tn-task-input tn-task-mb-8',
    });
    this.searchInput.addEventListener('input', () => this.renderFromCache());
    this.containerElContent = content.createDiv();
  }

  private buildNav(): void {
    this.navEl.empty();

    const tasksGroup = this.navEl.createEl('button', { cls: 'tn-task-grp' });
    tasksGroup.createSpan({ cls: 'tn-task-grp-ico', text: '📋' });
    tasksGroup.createSpan({ cls: 'tn-task-grp-lbl', text: 'Задачи' });
    tasksGroup.createSpan({ cls: 'tn-task-grp-chev', text: '▶' });
    tasksGroup.addEventListener('click', () => tasksGroup.classList.toggle('open'));
    const tasksSubmenu = this.navEl.createDiv({ cls: 'tn-task-submenu' });
    const tabs: Array<{ id: 'tasks' | 'chats'; label: string }> = [
      { id: 'tasks', label: 'Все задачи' },
      { id: 'chats', label: 'Чаты' },
    ];
    for (const t of tabs) {
      const item = tasksSubmenu.createEl('a', { cls: 'tn-task-nav-item', attr: { href: '#' } });
      item.createSpan({ cls: 'tn-task-nav-lbl', text: t.label });
      item.dataset.key = t.id;
      item.addEventListener('click', (ev) => {
        ev.preventDefault();
        this.switchTab(t.id);
      });
    }
    tasksGroup.classList.add('open', 'active');

    const filterGroup = this.navEl.createEl('button', { cls: 'tn-task-grp' });
    filterGroup.createSpan({ cls: 'tn-task-grp-ico', text: '🔍' });
    filterGroup.createSpan({ cls: 'tn-task-grp-lbl', text: 'Фильтры' });
    filterGroup.createSpan({ cls: 'tn-task-grp-chev', text: '▶' });
    filterGroup.addEventListener('click', () => filterGroup.classList.toggle('open'));
    const filtersEl = this.navEl.createDiv({ cls: 'tn-task-submenu tn-task-filters-nav' });
    filterGroup.classList.add('open');
    this.buildFilterControls(filtersEl);

    this.syncNavActive();
  }

  /** Фильтры списка задач — перенесены из горизонтальной строки над списком в сайдбар. */
  private buildFilterControls(container: HTMLElement): void {
    container.createDiv({ cls: 'tn-task-filter-label', text: 'Проект' });
    this.selectProject = container.createEl('select', { cls: 'dropdown tn-task-filter-select' });
    this.selectProject.addEventListener('change', () => {
      this.plugin.settings.selectedProjectId = this.selectProject.value;
      void this.plugin.saveSettings();
      this.populateFilters();
      this.renderFromCache();
    });

    container.createDiv({ cls: 'tn-task-filter-label', text: 'Доска' });
    this.selectBoard = container.createEl('select', { cls: 'dropdown tn-task-filter-select' });
    this.selectBoard.addEventListener('change', () => {
      this.populateFilters();
      this.renderFromCache();
    });

    container.createDiv({ cls: 'tn-task-filter-label', text: 'Колонка' });
    this.selectColumn = container.createEl('select', { cls: 'dropdown tn-task-filter-select' });
    this.selectColumn.addEventListener('change', () => this.renderFromCache());

    container.createDiv({ cls: 'tn-task-filter-label', text: 'Исполнитель' });
    this.selectAssignee = container.createEl('select', { cls: 'dropdown tn-task-filter-select' });
    this.selectAssignee.addEventListener('change', () => this.renderFromCache());

    container.createDiv({ cls: 'tn-task-filter-label', text: 'Статус' });
    this.selectStatus = container.createEl('select', { cls: 'dropdown tn-task-filter-select' });
    this.selectStatus.createEl('option', { value: 'active', text: 'Только активные' });
    this.selectStatus.createEl('option', { value: 'all', text: 'Все' });
    this.selectStatus.createEl('option', { value: 'completed', text: 'Только завершённые' });
    this.selectStatus.value = 'active';
    this.selectStatus.addEventListener('change', () => this.renderFromCache());

    const noDeadlineLabel = container.createEl('label', { cls: 'tn-task-no-deadline-filter tn-task-sidebar-filter' });
    this.noDeadlineCb = noDeadlineLabel.createEl('input', { attr: { type: 'checkbox' }, cls: 'tn-task-cb' });
    noDeadlineLabel.createSpan({ text: 'Задачи без дедлайна' });
    this.noDeadlineCb.addEventListener('change', () => {
      this.noDeadlineOnly = this.noDeadlineCb.checked;
      this.renderFromCache();
    });
  }

  private syncNavActive(): void {
    this.navEl.querySelectorAll('.tn-task-nav-item').forEach((el) => {
      const navEl = el as HTMLElement;
      navEl.classList.toggle('active', navEl.dataset.key === this.currentTab);
    });
  }

  private toggleCollapse(): void {
    this.collapsed = !this.collapsed;
    this.rootEl.classList.toggle('collapsed', this.collapsed);
    if (this.collapseLabel) {
      this.collapseLabel.setText(this.collapsed ? 'Развернуть' : 'Свернуть');
    }
  }

  private switchTab(tab: 'tasks' | 'chats'): void {
    this.currentTab = tab;
    this.crumbEl.setText(tab === 'tasks' ? 'Задачи' : 'Чаты');
    this.syncNavActive();
    this.detailViewActive = false;
    this.createViewActive = false;
    if (tab === 'tasks') {
      this.renderFromCache();
    } else {
      void this.renderChats();
    }
  }

  private populateFilters(): void {
    const savedProject = this.selectProject.value;
    const savedBoard = this.selectBoard.value;
    const savedColumn = this.selectColumn.value;
    const savedAssignee = this.selectAssignee.value;
    const savedStatus = this.selectStatus.value;

    const projects = this.plugin.tasksDb.getProjects();
    const selP = this.selectProject;
    selP.empty();
    selP.createEl('option', { value: '', text: 'Все проекты' });
    for (const p of projects) {
      selP.createEl('option', { value: p.id, text: p.title });
    }
    selP.value = savedProject || this.plugin.settings.selectedProjectId;

    const selectedProjectId = this.selectProject.value;
    const boards = this.plugin.tasksDb.getBoards().filter(b => !selectedProjectId || b.projectId === selectedProjectId);
    const selB = this.selectBoard;
    selB.empty();
    selB.createEl('option', { value: '', text: 'Все доски' });
    for (const b of boards) {
      selB.createEl('option', { value: b.id, text: b.title });
    }
    selB.value = savedBoard;

    const selectedBoardId = this.selectBoard.value;
    let columns = this.plugin.tasksDb.getColumns();
    if (selectedBoardId) {
      columns = columns.filter(c => c.boardId === selectedBoardId);
    }
    const uniqueCols = new Map<string, string[]>();
    for (const c of columns) {
      const ids = uniqueCols.get(c.title) || [];
      ids.push(c.id);
      uniqueCols.set(c.title, ids);
    }
    const sortedCols = [...uniqueCols.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const selC = this.selectColumn;
    selC.empty();
    selC.createEl('option', { value: '', text: 'Все колонки' });
    for (const [title] of sortedCols) {
      selC.createEl('option', { value: uniqueCols.get(title)!.join(','), text: title });
    }
    selC.value = savedColumn;

    const assignees = this.plugin.tasksDb.getUniqueAssignees();
    const selA = this.selectAssignee;
    selA.empty();
    selA.createEl('option', { value: '', text: 'Все исполнители' });
    for (const a of assignees) {
      selA.createEl('option', { value: a, text: a });
    }
    selA.value = savedAssignee;

    this.selectStatus.value = savedStatus;
  }

  private async syncAndRender(): Promise<void> {
    if (!this.plugin.yougile.isAvailable()) {
      this.containerElContent.empty();
      this.containerElContent.createDiv({
        text: 'Настройте авторизацию YouGile: включите плагин SBE YouGile и выполните вход (кнопка «Получить ключ»).',
        cls: 'tn-task-empty',
      });
      return;
    }
    this.containerElContent.empty();
    this.containerElContent.createDiv({ text: 'Синхронизация...', cls: 'tn-task-loading' });
    try {
      await this.flushOfflineQueue();
      await this.plugin.tasksDb.sync();
      this.populateFilters();
      if (this.currentTab === 'tasks') {
        if (this.detailViewActive) {
          await this.renderTaskDetail(this.detailTaskId);
        } else if (this.createViewActive) {
          this.renderCreateForm();
        } else {
          this.renderFromCache();
        }
      } else {
        await this.renderChats();
      }
    } catch (e: unknown) {
      const msg = errorMessage(e);
      new Notice(`Задачи: Ошибка синхронизации — ${msg}`);
      if (this.currentTab === 'tasks') {
        if (this.detailViewActive) {
          await this.renderTaskDetail(this.detailTaskId);
        } else {
          this.renderFromCache();
        }
      }
    }
  }

  private async flushOfflineQueue(): Promise<void> {
    const queue = this.plugin.tasksDb.getOfflineQueue();
    for (const action of queue) {
      if (action.synced) continue;
      if (action.type === 'upload-file') {
        this.plugin.tasksDb.markOfflineSynced(action.id);
        continue;
      }
      const itemTitle = (action.payload.title as string) || (action.payload.taskId as string) || '';
      try {
        switch (action.type) {
          case 'create-task': {
            const created = await this.plugin.yougile.createTask(action.payload as unknown as CreateTaskPayload);
            if (action.payload.completed) {
              await this.plugin.yougile.updateTask(created.id, { completed: true });
            }
            break;
          }
          case 'add-info':
          case 'toggle-completed':
            await this.plugin.yougile.updateTask(action.payload.taskId as string, action.payload);
            break;
          case 'send-message':
            await this.plugin.yougile.sendChatMessage(action.payload.chatId as string, action.payload.text as string);
            break;
        }
        this.plugin.tasksDb.removeOfflineAction(action.id);
        new Notice(`Задачи: Офлайн-действие "${action.type}" синхронизировано (${itemTitle || '—'})`);
      } catch (e: unknown) {
        if (isNetworkError(e)) {
          new Notice('Задачи: Нет сети — офлайн-действие отложено');
          break;
        }
        this.plugin.tasksDb.removeOfflineAction(action.id);
        new Notice(`Задачи: Ошибка офлайн-действия "${action.type}" — ${errorMessage(e)}`);
      }
    }
  }

  private getDeadlineIndicator(task: CachedTask): { color: string; symbol: string } {
    if (!task.deadline) return { color: '', symbol: '' };
    const now = Date.now();
    const diff = task.deadline - now;
    const twoWeeks = 14 * 24 * 60 * 60 * 1000;
    if (diff < 0 && !task.completed) {
      return { color: '#e74c3c', symbol: '🔴' };
    } else if (diff < twoWeeks && !task.completed) {
      return { color: '#f39c12', symbol: '🟠' };
    } else if (!task.completed) {
      return { color: '#2ecc71', symbol: '🟢' };
    }
    return { color: '', symbol: '' };
  }

  private getSyncStatusText(): string {
    return this.plugin.tasksDb.hasUnsynchronizedActions() ? '⚠ Не синхронизировано' : '✅ Синхронизировано';
  }

  // --- Вкладка Задачи ---

  private renderFromCache(): void {
    const container = this.containerElContent;
    container.empty();

    let tasks = this.plugin.tasksDb.getTasks();

    const projectId = this.selectProject.value;
    const boardId = this.selectBoard.value;
    const columnId = this.selectColumn.value;
    const assigneeId = this.selectAssignee.value;
    const statusFilter = this.selectStatus.value;

    if (projectId) tasks = tasks.filter(t => t.projectId === projectId);
    if (boardId) tasks = tasks.filter(t => t.boardId === boardId);
    if (columnId) {
      const colIds = columnId.split(',');
      tasks = tasks.filter(t => colIds.includes(t.columnId));
    }
    if (assigneeId) tasks = tasks.filter(t => t.assigned.indexOf(assigneeId) !== -1);
    if (statusFilter === 'active') tasks = tasks.filter(t => !t.completed);
    if (statusFilter === 'completed') tasks = tasks.filter(t => t.completed);

    if (this.noDeadlineOnly) {
      tasks = tasks.filter(t => !t.deadline);
    }

    const query = this.searchInput?.value?.toLowerCase().trim() || '';
    if (query) {
      tasks = tasks.filter(t =>
        t.title.toLowerCase().includes(query) ||
        t.description.toLowerCase().includes(query) ||
        t.projectTitle.toLowerCase().includes(query) ||
        t.columnTitle.toLowerCase().includes(query) ||
        t.assigned.some(a => a.toLowerCase().includes(query))
      );
    }

    // Сортировка: сначала просроченные, затем по приближению к дедлайну;
    // задачи без дедлайна — в конце (сначала старые, потом новые).
    tasks.sort((a, b) => {
      const aHas = a.deadline != null;
      const bHas = b.deadline != null;
      if (aHas && bHas) return a.deadline! - b.deadline!;
      if (aHas) return -1;
      if (bHas) return 1;
      return a.timestamp - b.timestamp;
    });

    if (tasks.length === 0) {
      container.createDiv({ text: 'Нет задач', cls: 'tn-task-empty' });
      return;
    }

    container.createDiv({ cls: 'tn-task-meta', text: this.getSyncStatusText() });

    const lastSync = this.plugin.tasksDb.getLastSyncAt();
    if (lastSync > 0) {
      container.createDiv({ text: `Синхр: ${new Date(lastSync).toLocaleTimeString()} · Задач: ${tasks.length}`, cls: 'tn-task-meta' });
    }

    const allTasks = this.plugin.tasksDb.getTasks();
    const taskMap = new Map(allTasks.map(t => [t.id, t]));

    const openDetail = (id: string): void => {
      this.detailTaskId = id;
      this.detailViewActive = true;
      void this.renderTaskDetail(id);
    };

    const renderSubtaskList = (parent: CachedTask, host: HTMLElement): void => {
      if (!parent.subtasks || parent.subtasks.length === 0) return;
      const list = host.createDiv({ cls: 'tn-task-subtask-list' });
      for (const sub of parent.subtasks) {
        const subTask = taskMap.get(sub.id);
        const item = list.createDiv({ cls: 'tn-task-subtask-item' });
        const indi = subTask ? this.getDeadlineIndicator(subTask) : { color: '', symbol: '' };
        if (indi.symbol) item.createSpan({ text: indi.symbol });
        item.createSpan({ text: sub.title || sub.id });
        if (subTask?.completed) item.addClass('completed');
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          openDetail(sub.id);
        });
        if (subTask) renderSubtaskList(subTask, item);
      }
    };

    const renderCard = (task: CachedTask): void => {
      const card = container.createDiv({ cls: 'tn-task-card' });
      const head = card.createDiv({ cls: 'tn-task-card-head' });
      const titleEl = head.createEl('h4', { text: task.title || 'Без названия' });
      titleEl.addClass('tn-task-title');
      if (task.completed) titleEl.addClass('completed');

      const indi = this.getDeadlineIndicator(task);
      if (indi.symbol) {
        head.createSpan({ cls: 'tn-task-deadline-chip', text: indi.symbol });
      }

      const metaParts: string[] = [];
      if (task.projectTitle) metaParts.push(task.projectTitle);
      if (task.columnTitle) metaParts.push(task.columnTitle);
      if (Array.isArray(task.assigned) && task.assigned.length > 0) metaParts.push(`👤 ${task.assigned.join(', ')}`);
      if (metaParts.length > 0) card.createDiv({ cls: 'tn-task-card-meta', text: metaParts.join(' → ') });

      if (task.deadline) {
        const dl = new Date(task.deadline);
        card.createDiv({ cls: 'tn-task-deadline-line', text: `📅 ${dl.toLocaleDateString()}` });
      }

      renderSubtaskList(task, card);

      card.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).tagName === 'INPUT') return;
        openDetail(task.id);
      });
    };

    // «Основные» задачи — те, которые сами не являются чьей-то подзадачей.
    const subtaskIds = new Set<string>();
    for (const t of tasks) {
      for (const s of t.subtasks) subtaskIds.add(s.id);
    }
    const topLevel = tasks.filter(t => !subtaskIds.has(t.id));
    for (const t of topLevel) {
      renderCard(t);
    }
  }

  public openTaskDetail(taskId: string): void {
    this.detailTaskId = taskId;
    this.detailViewActive = true;
    void this.renderTaskDetail(taskId);
  }

  private async renderTaskDetail(taskId: string): Promise<void> {
    const container = this.containerElContent;
    container.empty();
    this.detailViewActive = true;
    this.detailTaskId = taskId;

    const backBtn = container.createEl('button', { text: '← Назад к списку', cls: 'tn-task-btn' });
    backBtn.addEventListener('click', () => {
      this.detailViewActive = false;
      this.renderFromCache();
    });

    container.createDiv({ cls: 'tn-task-meta', text: this.getSyncStatusText() });

    container.createDiv({ text: 'Загрузка...', cls: 'tn-task-loading' });

    try {
      let task: YouGileTaskFull;
      try {
        task = await this.plugin.yougile.getTaskById(taskId);
      } catch (e: unknown) {
        const cached = this.plugin.tasksDb.getTask(taskId);
        if (!cached) throw e;
        task = this.buildTaskFromCache(cached);
        new Notice('Задачи: нет данных с сервера, показана сохранённая копия');
      }

      const [subscribers, messages, status] = await Promise.all([
        this.plugin.yougile.getTaskChatSubscribers(taskId).catch(() => []),
        this.plugin.yougile.getChatMessages(taskId).catch(() => []),
        this.plugin.yougile.getStatus().catch((): YougileStatus => ({ authenticated: false, companyId: '', login: '' })),
      ]);
      container.empty();

      const backBtn2 = container.createEl('button', { text: '← Назад к списку', cls: 'tn-task-btn' });
      backBtn2.addEventListener('click', () => {
        this.detailViewActive = false;
        this.renderFromCache();
      });

      container.createDiv({ cls: 'tn-task-meta', text: this.getSyncStatusText() });

      this.renderTaskDetailContent(container, task, subscribers, messages, status);
    } catch (e: unknown) {
      container.empty();
      const msg = errorMessage(e);
      container.createDiv({ text: `Ошибка: ${msg}`, cls: 'tn-task-error' });
      new Notice(`Задачи: ${msg}`);
    }
  }

  private buildTaskFromCache(cached: CachedTask): YouGileTaskFull {
    return {
      id: cached.id,
      title: cached.title,
      timestamp: cached.timestamp,
      columnId: cached.columnId,
      boardId: cached.boardId,
      projectId: cached.projectId,
      description: cached.description,
      completed: cached.completed,
      completeAt: cached.completeAt ? String(cached.completeAt) : undefined,
      assigned: cached.assigned,
      subtasks: cached.subtasks.map(s => s.id),
      deadline: cached.deadline ? { deadline: cached.deadline } : undefined,
      updatedAt: cached.updatedAt,
    };
  }

  private renderTaskDetailContent(
    container: HTMLElement,
    task: YouGileTaskFull,
    subscribers: string[],
    messages: YouGileChatMessage[],
    status: YougileStatus,
  ): void {
    const titleRow = container.createDiv({ cls: 'tn-task-header' });
    titleRow.createEl('h3', { text: task.title || 'Без названия' });

    const cached = this.plugin.tasksDb.getTask(task.id);

    const linkRow = container.createDiv({ cls: 'tn-task-flex-row tn-task-flex-wrap' });
    linkRow.style.gap = '8px';
    linkRow.style.marginBottom = '8px';
    const webBtn = linkRow.createEl('button', { text: '🌐 Открыть в YouGile', cls: 'tn-task-btn' });
    webBtn.addEventListener('click', () => {
      const companyId = status.companyId || '';
      const teamPart = companyId ? companyId.split('-').pop() : '';
      const number = task.idTaskProject || task.id;
      const url = `https://ru.yougile.com/team/${teamPart}/#${number}`;
      window.open(url, '_blank');
    });

    // --- Таблица свойств задачи (аналогично таблице установленных плагинов) ---
    const rows: Array<[string, string]> = [];
    if (task.idTaskProject) rows.push(['ID', task.idTaskProject]);
    if (task.idTaskCommon) rows.push(['Общий ID', task.idTaskCommon]);
    if (task.type) rows.push(['Тип', task.type]);
    if (cached?.projectTitle) rows.push(['Проект', cached.projectTitle]);
    if (cached?.boardTitle) rows.push(['Доска', cached.boardTitle]);
    if (task.columnId) rows.push(['Колонка', cached?.columnTitle || task.columnId]);

    const statusParts: string[] = [];
    if (task.completed) statusParts.push('✅ Выполнена');
    else statusParts.push('❌ Не выполнена');
    if (task.archived) statusParts.push('📦 В архиве');
    rows.push(['Статус', statusParts.join(' · ')]);

    if (task.assigned && task.assigned.length > 0) {
      rows.push(['Исполнители', task.assigned.map(id => this.plugin.tasksDb.getUserName(id)).join(', ')]);
    }
    if (task.createdBy) {
      rows.push(['Создатель', this.plugin.tasksDb.getUserName(task.createdBy)]);
    }
    if (subscribers.length > 0) {
      rows.push(['Подписчики чата', subscribers.map(id => this.plugin.tasksDb.getUserName(id)).join(', ')]);
    }
    if (task.deadline) {
      const dl = task.deadline;
      const parts: string[] = [];
      if (dl.deadline) parts.push(`до ${new Date(dl.deadline).toLocaleString()}`);
      if (dl.startDate) parts.push(`с ${new Date(dl.startDate).toLocaleString()}`);
      if (parts.length) rows.push(['Дедлайн', parts.join(' ')]);
    }
    if (task.timeTracking) {
      const tt = task.timeTracking;
      rows.push(['Учёт времени', `План: ${tt.plan ?? 0}ч · Факт: ${tt.work ?? 0}ч`]);
    }
    if (task.color && task.color !== 'task-primary') {
      rows.push(['Цвет', task.color]);
    }
    if (task.timer?.running) rows.push(['Таймер', '⏱ Таймер запущен']);
    if (task.stopwatch?.running) rows.push(['Секундомер', '⏱ Секундомер запущен']);

    if (rows.length > 0) {
      const wrap = container.createDiv({ cls: 'tn-table-wrap' });
      const table = wrap.createEl('table', { cls: 'tn-table' });
      const headRow = table.createEl('thead').createEl('tr');
      for (const th of ['Поле', 'Значение']) {
        headRow.createEl('th', { text: th });
      }
      const tbody = table.createEl('tbody');
      for (const [k, v] of rows) {
        const row = tbody.createEl('tr');
        row.createEl('td', { text: k });
        row.createEl('td', { text: v });
      }
    }

    if (task.description) {
      container.createEl('h4', { text: 'Описание' });
      container.createDiv({ text: stripHtml(task.description) });
    }

    if (task.checklists && task.checklists.length > 0) {
      container.createEl('h4', { text: 'Чек-листы' });
      for (const cl of task.checklists) {
        const clEl = container.createDiv();
        clEl.createEl('strong', { text: cl.title });
        for (const item of cl.items) {
          clEl.createDiv({ text: `${item.isCompleted ? '✅' : '⬜'} ${item.title}` });
        }
      }
    }

    if (task.stickers && Object.keys(task.stickers).length > 0) {
      container.createEl('h4', { text: 'Стикеры' });
      const keys = Object.keys(task.stickers);
      for (let i = 0; i < keys.length; i++) {
        const stickerId = keys[i];
        const state = task.stickers[stickerId];
        container.createDiv({ text: `${stickerId}: ${state}` });
      }
    }

    if (task.subtasks && task.subtasks.length > 0) {
      container.createEl('h4', { text: 'Подзадачи' });
      const ul = container.createEl('ul', { cls: 'tn-task-subtask-list' });
      ul.style.margin = '4px 0';
      ul.style.paddingLeft = '20px';
      for (const sub of task.subtasks) {
        const subId = sub;
        const subTitle = this.plugin.tasksDb.getTask(subId)?.title || subId;
        const li = ul.createEl('li');
        li.style.listStyle = 'disc';
        li.style.marginBottom = '2px';
        const linkEl = li.createEl('a', {
          text: subTitle,
          href: '#',
          cls: 'tn-task-link',
        });
        linkEl.addEventListener('click', (e) => {
          e.preventDefault();
          this.detailTaskId = subId;
          void this.renderTaskDetail(subId);
        });
      }
    }

    // --- Add info section: always visible, above buttons ---
    container.createEl('h4', { text: 'Дополнить описание' });
    const addInfoRow = container.createDiv({ cls: 'tn-task-fullwidth' });
    const infoInput = addInfoRow.createEl('textarea', {
      attr: { placeholder: 'Введите текст дополнения...', rows: '3' },
    });
    infoInput.addClass('tn-task-textarea');
    const addInfoSubmitBtn = addInfoRow.createEl('button', { text: 'Добавить информацию', cls: 'tn-task-btn' });
    addInfoSubmitBtn.addEventListener('click', async () => {
      const text = infoInput.value.trim();
      if (!text) return;
      addInfoSubmitBtn.setText('⏳');
      addInfoSubmitBtn.setAttr('disabled', 'true');
      try {
        const login = status.login || '';
        const stamp = `${login} ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;
        await this.plugin.yougile.updateTask(this.detailTaskId, {
          description: task.description
            ? `${task.description}<br><p>${text} (${stamp})</p>`
            : `<p>${text} (${stamp})</p>`,
        });
        new Notice('Задачи: Информация добавлена');
        await this.renderTaskDetail(this.detailTaskId);
      } catch (e: unknown) {
        if (isNetworkError(e)) {
          this.plugin.tasksDb.addToOfflineQueue({
            type: 'add-info',
            payload: { taskId: this.detailTaskId, text, description: task.description ?? '' },
          });
          new Notice('Задачи: Нет соединения. Изменение сохранено локально.');
          await this.renderTaskDetail(this.detailTaskId);
        } else {
          new Notice(`Задачи: Ошибка — ${errorMessage(e)}`);
          addInfoSubmitBtn.setText('Добавить информацию');
          addInfoSubmitBtn.removeAttribute('disabled');
        }
      }
    });

    // --- Button row ---
    const btnRow = container.createDiv({ cls: 'tn-task-header' });

    const setCompleted = async (completed: boolean): Promise<void> => {
      try {
        await this.plugin.yougile.updateTask(this.detailTaskId, { completed });
        new Notice(completed ? 'Задачи: Задача завершена' : 'Задачи: Задача возобновлена');
        await this.renderTaskDetail(this.detailTaskId);
      } catch (e: unknown) {
        if (isNetworkError(e)) {
          this.plugin.tasksDb.addToOfflineQueue({
            type: 'toggle-completed',
            payload: { taskId: this.detailTaskId, completed },
          });
          new Notice('Задачи: Нет соединения. Изменение сохранено локально.');
          await this.renderTaskDetail(this.detailTaskId);
        } else {
          new Notice(`Задачи: Ошибка — ${errorMessage(e)}`);
        }
      }
    };

    if (task.completed) {
      const reopenBtn = btnRow.createEl('button', {
        text: '🔄 Возобновить',
        cls: 'tn-task-btn',
      });
      reopenBtn.addEventListener('click', () => setCompleted(false));
    } else {
      const completeBtn = btnRow.createEl('button', {
        text: 'Завершить',
        cls: 'tn-task-btn',
      });
      completeBtn.addEventListener('click', () => setCompleted(true));
    }

    const editBtn = btnRow.createEl('button', { text: '✏️ Редактировать', cls: 'tn-task-btn' });
    editBtn.addEventListener('click', () => this.renderEditForm(task));

    const fileBtn = btnRow.createEl('button', { text: '📎 Прикрепить файл', cls: 'tn-task-btn' });
    const fileInput = container.createEl('input', { attr: { type: 'file', hidden: 'true' } });
    fileBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      fileBtn.setText('⏳ Загрузка...');
      fileBtn.setAttr('disabled', 'true');
      try {
        const buffer = await file.arrayBuffer();
        const fullUrl = await this.plugin.yougile.uploadFile(file.name, buffer);
        const now = new Date();
        const login = status.login || '';
        const stamp = `${login} ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
        const updatedDesc = task.description
          ? `${task.description}<br><p><a href="${fullUrl}">Файл от ${login}</a> (${stamp})</p>`
          : `<p><a href="${fullUrl}">Файл от ${login}</a> (${stamp})</p>`;
        await this.plugin.yougile.updateTask(this.detailTaskId, { description: updatedDesc });
        new Notice('Задачи: Файл прикреплён');
        await this.renderTaskDetail(this.detailTaskId);
      } catch (e: unknown) {
        if (isNetworkError(e)) {
          this.plugin.tasksDb.addToOfflineQueue({
            type: 'upload-file',
            payload: { taskId: this.detailTaskId, fileName: file.name, fileSize: file.size },
          });
          new Notice('Задачи: Нет соединения. Файл будет загружен позже.');
          fileBtn.setText('📎 Прикрепить файл');
          fileBtn.removeAttribute('disabled');
          await this.renderTaskDetail(this.detailTaskId);
        } else {
          new Notice(`Задачи: Ошибка — ${errorMessage(e)}`);
          fileBtn.setText('📎 Прикрепить файл');
          fileBtn.removeAttribute('disabled');
        }
      }
    });

    // --- Чат задачи ---
    container.createEl('hr');
    container.createEl('h4', { text: '💬 Чат задачи' });

    const msgContainer = container.createDiv();
    msgContainer.style.maxHeight = '400px';
    msgContainer.style.overflowY = 'auto';
    msgContainer.style.marginBottom = '8px';

    if (messages.length === 0) {
      msgContainer.createDiv({ text: 'Нет сообщений', cls: 'tn-task-empty' });
    } else {
      for (const msg of messages) {
        const msgEl = msgContainer.createDiv({ cls: 'tn-task-item' });
        msgEl.createDiv({ cls: 'tn-task-meta', text: this.plugin.tasksDb.getUserName(msg.fromUserId) });
        const textDiv = msgEl.createDiv({ cls: 'tn-task-title' });
        textDiv.innerHTML = msg.text;
        if (msg.label) msgEl.createDiv({ cls: 'tn-task-meta', text: `🏷 ${msg.label}` });
      }
    }

    const inputRow = container.createDiv({ cls: 'tn-task-flex-row tn-task-flex-wrap' });
    inputRow.style.gap = '4px';
    inputRow.style.alignItems = 'start';
    const inputEl = inputRow.createEl('textarea', { attr: { placeholder: 'Сообщение...', rows: '2' } });
    inputEl.style.flex = '1';
    inputEl.addClass('tn-task-textarea');

    let pendingAttachment = '';

    const attachBtn = inputRow.createEl('button', { text: '📎', cls: 'tn-task-btn' });
    attachBtn.style.fontSize = '18px';
    attachBtn.style.lineHeight = '1';
    attachBtn.style.padding = '4px 8px';
    const chatFileInput = container.createEl('input', { attr: { type: 'file', hidden: 'true' } });
    attachBtn.addEventListener('click', () => chatFileInput.click());
    chatFileInput.addEventListener('change', async () => {
      const file = chatFileInput.files?.[0];
      if (!file) return;
      attachBtn.setText('⏳');
      attachBtn.setAttr('disabled', 'true');
      try {
        const buffer = await file.arrayBuffer();
        const fullUrl = await this.plugin.yougile.uploadFile(file.name, buffer);
        const isImage = /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(file.name);
        if (isImage) {
          pendingAttachment = `<br><img src="${fullUrl}" alt="${file.name}" style="max-width:100%">`;
        } else {
          pendingAttachment = `<br><a href="${fullUrl}">${file.name}</a>`;
        }
        new Notice('Задачи: Файл загружен');
      } catch (e: unknown) {
        new Notice(`Задачи: Ошибка загрузки — ${errorMessage(e)}`);
      }
      attachBtn.setText('📎');
      attachBtn.removeAttribute('disabled');
    });

    const sendBtn = inputRow.createEl('button', { text: 'Отправить', cls: 'tn-task-btn' });
    sendBtn.addEventListener('click', async () => {
      let text = inputEl.value.trim();
      if (!text && !pendingAttachment) return;
      if (pendingAttachment) {
        text = text + pendingAttachment;
        pendingAttachment = '';
      }
      sendBtn.setText('⏳');
      sendBtn.setAttr('disabled', 'true');
      try {
        await this.plugin.yougile.sendChatMessage(task.id, text);
        inputEl.value = '';
        await this.renderTaskDetail(this.detailTaskId);
      } catch (e: unknown) {
        const msg = errorMessage(e);
        new Notice(`Задачи: Ошибка — ${msg}`);
        sendBtn.setText('Отправить');
        sendBtn.removeAttribute('disabled');
      }
    });
  }

  // --- Вкладка Создание задачи ---

  showCreateForm(): void {
    this.createViewActive = true;
    this.detailViewActive = false;
    this.renderCreateForm();
  }

  private renderCreateForm(): void {
    const container = this.containerElContent;
    container.empty();
    this.createViewActive = true;

    const backBtn = container.createEl('button', { text: '← Назад к списку', cls: 'tn-task-btn' });
    backBtn.addEventListener('click', () => {
      this.createViewActive = false;
      this.renderFromCache();
    });

    container.createEl('h3', { text: 'Новая задача YouGile' });

    const nameLabel = container.createEl('label', { text: 'Название задачи' });
    const nameInput = container.createEl('input', { attr: { type: 'text', placeholder: 'Введите название' } });
    nameInput.addClass('tn-task-input');

    const descLabel = container.createEl('label', { text: 'Описание' });
    const descInput = container.createEl('textarea', { attr: { placeholder: 'Описание задачи (опционально)', rows: '3' } });
    descInput.addClass('tn-task-textarea');

    const projects = this.plugin.tasksDb.getProjects();
    const projectLabel = container.createEl('label', { text: 'Проект' });
    const projectSelect = container.createEl('select');
    projectSelect.addClass('tn-task-select');
    projectSelect.createEl('option', { value: '', text: '— выберите проект —' });
    for (const p of projects) {
      projectSelect.createEl('option', { value: p.id, text: p.title });
    }

    let selectedBoardId = '';
    let selectedColumnId = '';

    const boardLabel = container.createEl('label', { text: 'Доска' });
    const boardSelect = container.createEl('select');
    boardSelect.addClass('tn-task-select');
    boardSelect.createEl('option', { value: '', text: '— выберите доску —' });

    const columnLabel = container.createEl('label', { text: 'Колонка' });
    const columnSelect = container.createEl('select');
    columnSelect.addClass('tn-task-select');
    columnSelect.createEl('option', { value: '', text: '— выберите колонку —' });

    projectSelect.addEventListener('change', () => {
      const pid = projectSelect.value;
      selectedBoardId = '';
      selectedColumnId = '';
      boardSelect.empty();
      boardSelect.createEl('option', { value: '', text: '— выберите доску —' });
      columnSelect.empty();
      columnSelect.createEl('option', { value: '', text: '— выберите колонку —' });
      if (!pid) return;
      const boards = this.plugin.tasksDb.getBoards().filter(b => b.projectId === pid);
      for (const b of boards) {
        boardSelect.createEl('option', { value: b.id, text: b.title });
      }
    });

    boardSelect.addEventListener('change', () => {
      const bid = boardSelect.value;
      selectedBoardId = bid;
      selectedColumnId = '';
      columnSelect.empty();
      columnSelect.createEl('option', { value: '', text: '— выберите колонку —' });
      if (!bid) return;
      const columns = this.plugin.tasksDb.getColumns().filter(c => c.boardId === bid);
      for (const c of columns) {
        columnSelect.createEl('option', { value: c.id, text: c.title });
      }
    });

    columnSelect.addEventListener('change', () => {
      selectedColumnId = columnSelect.value;
    });

    const assigneeSelector = new AssigneeSelector(container, 'Исполнители', () => this.plugin.tasksDb.getUsers());

    const deadlineLabel = container.createEl('label', { text: 'Дедлайн (дата, опционально)' });
    const deadlineInput = container.createEl('input', { attr: { type: 'date' } });
    deadlineInput.addClass('tn-task-input');

    const btnRow = container.createDiv({ cls: 'tn-task-header' });

    const submitBtn = btnRow.createEl('button', { text: 'Создать', cls: 'tn-task-btn' });
    submitBtn.addEventListener('click', async () => {
      const title = nameInput.value.trim();
      if (!title) {
        new Notice('Задачи: Название задачи обязательно');
        return;
      }
      const deadlineVal = deadlineInput.value;
      submitBtn.setText('⏳');
      submitBtn.setAttr('disabled', 'true');
      try {
        const assigned = assigneeSelector.getSelectedIds();
        const payload: CreateTaskPayload = {
          title,
          description: descInput.value.trim() || undefined,
          columnId: selectedColumnId || undefined,
          assigned: assigned.length > 0 ? assigned : undefined,
        };
        if (deadlineVal) {
          payload.deadline = { deadline: new Date(deadlineVal).getTime(), withTime: false };
        }
        await this.plugin.yougile.createTask(payload);
        new Notice('Задача создана');
        this.createViewActive = false;
        void this.syncAndRender();
      } catch (e: unknown) {
        if (isNetworkError(e)) {
          this.plugin.tasksDb.addToOfflineQueue({
            type: 'create-task',
            payload: {
              title,
              description: descInput.value.trim() || undefined,
              columnId: selectedColumnId || undefined,
              deadline: deadlineVal ? { deadline: new Date(deadlineVal).getTime(), withTime: false } : undefined,
            },
          });
          new Notice('Задачи: Нет соединения. Задача будет создана позже.');
          this.createViewActive = false;
          this.renderFromCache();
        } else {
          new Notice(`Задачи: Ошибка — ${errorMessage(e)}`);
          submitBtn.setText('Создать');
          submitBtn.removeAttribute('disabled');
        }
      }
    });

    const cancelBtn = btnRow.createEl('button', { text: 'Отмена', cls: 'tn-task-btn' });
    cancelBtn.addEventListener('click', () => {
      this.createViewActive = false;
      this.renderFromCache();
    });
  }

  // --- Вкладка Создание мероприятия ---

  showEventCreateForm(): void {
    this.createViewActive = true;
    this.detailViewActive = false;
    this.renderEventCreateForm();
  }

  private renderEventCreateForm(): void {
    const container = this.containerElContent;
    container.empty();
    this.createViewActive = true;

    const backBtn = container.createEl('button', { text: '← Назад к списку', cls: 'tn-task-btn' });
    backBtn.addEventListener('click', () => {
      this.createViewActive = false;
      this.renderFromCache();
    });

    container.createEl('h3', { text: 'Новое мероприятие' });

    const eventsProjectId = this.plugin.settings.eventsProjectId;
    const eventsBoardId = this.plugin.settings.eventsBoardId;

    const columnsInfo = container.createDiv({ cls: 'tn-task-meta' });
    const pTitle = this.plugin.tasksDb.getProjects().find(p => p.id === eventsProjectId)?.title || '—';
    const bTitle = this.plugin.tasksDb.getBoards().find(b => b.id === eventsBoardId)?.title || '—';
    columnsInfo.setText(`Проект: ${pTitle} · Доска: ${bTitle}`);

    const columnLabel = container.createEl('label', { text: 'Направление мероприятия' });
    const columnSelect = container.createEl('select');
    columnSelect.addClass('tn-task-select');
    let boardColumns = this.plugin.tasksDb.getColumns();
    if (eventsBoardId) boardColumns = boardColumns.filter(c => c.boardId === eventsBoardId);
    boardColumns.sort((a, b) => a.title.localeCompare(b.title));
    for (const col of boardColumns) {
      columnSelect.createEl('option', { value: col.id, text: col.title });
    }

    const fields: Array<{ label: string; key: string; type: string; placeholder?: string }> = [
      { label: 'Название мероприятия', key: 'title', type: 'text', placeholder: 'Введите название' },
      { label: 'Место проведения', key: 'place', type: 'text', placeholder: 'Адрес или место' },
      { label: 'Целевая аудитория', key: 'targetAudience', type: 'text', placeholder: 'Кому предназначено' },
      { label: 'Дата проведения', key: 'date', type: 'date' },
      { label: 'Время начала', key: 'startTime', type: 'time' },
      { label: 'Время окончания', key: 'endTime', type: 'time' },
    ];

    const inputs: Record<string, HTMLInputElement> = {};
    for (const f of fields) {
      const label = container.createEl('label', { text: f.label });
      const input = container.createEl('input', { attr: { type: f.type, placeholder: f.placeholder || '' } });
      input.addClass('tn-task-input');
      inputs[f.key] = input;
      if (f.key === 'date' && !input.value) {
        input.value = new Date().toISOString().slice(0, 10);
      }
    }

    const assigneeSelector = new AssigneeSelector(container, 'Ответственный', () => this.plugin.tasksDb.getUsers());

    const additionalLabel = container.createEl('label', { text: 'Дополнительная информация и описание' });
    const additionalTextarea = container.createEl('textarea', {
      attr: { placeholder: 'Любая дополнительная информация о мероприятии', rows: '3' },
    });
    additionalTextarea.addClass('tn-task-textarea');

    const btnRow = container.createDiv({ cls: 'tn-task-header' });

    const submitBtn = btnRow.createEl('button', { text: 'Создать', cls: 'tn-task-btn' });
    const cancelBtn = btnRow.createEl('button', { text: 'Отмена', cls: 'tn-task-btn' });
    cancelBtn.addEventListener('click', () => {
      this.createViewActive = false;
      this.renderFromCache();
    });

    submitBtn.addEventListener('click', async () => {
      const title = inputs.title.value.trim();
      if (!title) {
        new Notice('Задачи: Название мероприятия обязательно');
        return;
      }
      const place = inputs.place.value.trim();
      const targetAudience = inputs.targetAudience.value.trim();
      const dateVal = inputs.date.value;
      const startTime = inputs.startTime.value;
      const endTime = inputs.endTime.value;
      const additionalInfo = additionalTextarea.value.trim();
      if (!dateVal) {
        new Notice('Задачи: Дата проведения обязательна');
        return;
      }

      submitBtn.setText('⏳');
      submitBtn.setAttr('disabled', 'true');

      const eventData: Record<string, unknown> = {
        title,
        place,
        targetAudience,
        startTime,
        endTime,
        additionalInfo,
      };
      const description = JSON.stringify(eventData, null, 2);
      const assignedIds = assigneeSelector.getSelectedIds();
      const deadlineMs = new Date(`${dateVal}T${endTime || '23:59'}`).getTime();
      const selectedColumnId = columnSelect.value;

      const payload: CreateTaskPayload = {
        title,
        description,
        columnId: selectedColumnId || undefined,
        assigned: assignedIds.length > 0 ? assignedIds : undefined,
        deadline: { deadline: deadlineMs, withTime: true },
      };

      try {
        await this.plugin.yougile.createTask(payload);
        new Notice('Задачи: Мероприятие создано');
        this.createViewActive = false;
        void this.syncAndRender();
      } catch (e: unknown) {
        if (isNetworkError(e)) {
          this.plugin.tasksDb.addToOfflineQueue({
            type: 'create-task',
            payload: {
              title,
              description,
              columnId: selectedColumnId || undefined,
              assigned: assignedIds.length > 0 ? assignedIds : undefined,
              deadline: { deadline: deadlineMs, withTime: true },
            },
          });
          new Notice('Задачи: Нет соединения. Мероприятие будет создано позже.');
          this.createViewActive = false;
          this.renderFromCache();
        } else {
          new Notice(`Задачи: Ошибка — ${errorMessage(e)}`);
          submitBtn.setText('Создать');
          submitBtn.removeAttribute('disabled');
        }
      }
    });
  }

  // --- Вкладка Редактирование задачи ---

  private renderEditForm(task: YouGileTaskFull): void {
    const container = this.containerElContent;
    container.empty();

    const backBtn = container.createEl('button', { text: '← Назад к деталям', cls: 'tn-task-btn' });
    backBtn.addEventListener('click', () => void this.renderTaskDetail(task.id));

    container.createEl('h3', { text: `Редактирование: ${task.title}` });

    const nameInput = container.createEl('input', { attr: { type: 'text', placeholder: 'Название задачи' } });
    nameInput.addClass('tn-task-input');
    nameInput.value = task.title || '';

    const descInput = container.createEl('textarea', { attr: { placeholder: 'Описание', rows: '3' } });
    descInput.addClass('tn-task-textarea');
    descInput.value = stripHtml(task.description || '');

    const projects = this.plugin.tasksDb.getProjects();
    const projectSelect = container.createEl('select');
    projectSelect.addClass('tn-task-select');

    const col = this.plugin.tasksDb.getColumns().find(c => c.id === task.columnId);
    const board = col ? this.plugin.tasksDb.getBoards().find(b => b.id === col.boardId) : undefined;
    const currentProject = board ? projects.find(p => p.id === board.projectId) : undefined;

    projectSelect.createEl('option', { value: '', text: '— выберите проект —' });
    for (const p of projects) {
      projectSelect.createEl('option', { value: p.id, text: p.title });
    }
    if (currentProject) projectSelect.value = currentProject.id;

    const boardSelect = container.createEl('select');
    boardSelect.addClass('tn-task-select');

    const columnSelect = container.createEl('select');
    columnSelect.addClass('tn-task-select');

    let selectedBoardId = board?.id || '';
    let selectedColumnId = task.columnId || '';

    const populateBoards = () => {
      boardSelect.empty();
      boardSelect.createEl('option', { value: '', text: '— выберите доску —' });
      const pid = projectSelect.value;
      const boards = pid ? this.plugin.tasksDb.getBoards().filter(b => b.projectId === pid) : [];
      for (const b of boards) {
        boardSelect.createEl('option', { value: b.id, text: b.title });
      }
      boardSelect.value = selectedBoardId;
    };

    const populateColumns = () => {
      columnSelect.empty();
      columnSelect.createEl('option', { value: '', text: '— выберите колонку —' });
      const bid = boardSelect.value;
      const columns = bid ? this.plugin.tasksDb.getColumns().filter(c => c.boardId === bid) : [];
      for (const c of columns) {
        columnSelect.createEl('option', { value: c.id, text: c.title });
      }
      columnSelect.value = selectedColumnId;
    };

    populateBoards();
    populateColumns();

    projectSelect.addEventListener('change', () => {
      selectedBoardId = '';
      selectedColumnId = '';
      populateBoards();
      populateColumns();
    });

    boardSelect.addEventListener('change', () => {
      selectedBoardId = boardSelect.value;
      selectedColumnId = '';
      populateColumns();
    });

    columnSelect.addEventListener('change', () => {
      selectedColumnId = columnSelect.value;
    });

    const assigneeSelector = new AssigneeSelector(container, 'Исполнители', () => this.plugin.tasksDb.getUsers());
    if (task.assigned && task.assigned.length > 0) {
      assigneeSelector.setSelectedIds(task.assigned);
    }

    const deadlineInput = container.createEl('input', { attr: { type: 'date' } });
    deadlineInput.addClass('tn-task-input');
    if (task.deadline?.deadline) {
      deadlineInput.value = new Date(task.deadline.deadline).toISOString().split('T')[0];
    }

    const btnRow = container.createDiv({ cls: 'tn-task-header' });

    const submitBtn = btnRow.createEl('button', { text: '💾 Сохранить', cls: 'tn-task-btn' });
    submitBtn.addEventListener('click', async () => {
      const title = nameInput.value.trim();
      if (!title) {
        new Notice('Задачи: Название задачи обязательно');
        return;
      }
      submitBtn.setText('⏳');
      submitBtn.setAttr('disabled', 'true');
      try {
        const assigned = assigneeSelector.getSelectedIds();
        const payload: Record<string, unknown> = { title };
        const desc = descInput.value.trim();
        if (desc) payload.description = desc;
        if (selectedColumnId) payload.columnId = selectedColumnId;
        if (assigned.length > 0) payload.assigned = assigned;
        const deadlineVal = deadlineInput.value;
        if (deadlineVal) {
          payload.deadline = { deadline: new Date(deadlineVal).getTime(), withTime: false };
        } else {
          payload.deadline = null;
        }
        await this.plugin.yougile.updateTask(task.id, payload);
        new Notice('Задачи: Задача обновлена');
        await this.renderTaskDetail(task.id);
      } catch (e: unknown) {
        new Notice(`Задачи: Ошибка — ${errorMessage(e)}`);
        submitBtn.setText('💾 Сохранить');
        submitBtn.removeAttribute('disabled');
      }
    });

    const cancelBtn = btnRow.createEl('button', { text: 'Отмена', cls: 'tn-task-btn' });
    cancelBtn.addEventListener('click', () => void this.renderTaskDetail(task.id));
  }

  // --- Вкладка Чаты ---

  private currentChatId = '';
  private currentChatTitle = '';

  private async renderChats(): Promise<void> {
    const container = this.containerElContent;
    container.empty();

    if (!this.plugin.yougile.isAvailable()) {
      container.createDiv({ text: 'Настройте авторизацию YouGile: включите плагин SBE YouGile и выполните вход.', cls: 'tn-task-empty' });
      return;
    }

    if (this.currentChatId) {
      await this.renderMessages(container);
      return;
    }

    container.createDiv({ text: 'Загрузка...', cls: 'tn-task-loading' });

    try {
      const taskIdRow = container.createDiv({ cls: 'tn-task-flex-row tn-task-flex-wrap' });
      taskIdRow.style.gap = '8px';
      taskIdRow.style.marginBottom = '8px';
      const taskIdInput = taskIdRow.createEl('input', { attr: { type: 'text', placeholder: 'Введите ID задачи для загрузки чата...' } });
      taskIdInput.style.flex = '1';
      const loadBtn = taskIdRow.createEl('button', { text: 'Загрузить', cls: 'tn-task-btn' });
      loadBtn.addEventListener('click', () => {
        const id = taskIdInput.value.trim();
        if (id) {
          this.currentChatId = id;
          this.currentChatTitle = id;
          void this.renderChats();
        }
      });

      const chats = await this.plugin.yougile.getGroupChats();
      container.empty();
      if (chats.length === 0) {
        container.createDiv({ text: 'Нет чатов', cls: 'tn-task-empty' });
        return;
      }
      for (const chat of chats) {
        const chatEl = container.createDiv({ cls: 'tn-task-item' });
        chatEl.createDiv({ text: chat.title, cls: 'tn-task-title' });
        chatEl.addEventListener('click', () => {
          this.currentChatId = chat.id;
          this.currentChatTitle = chat.title;
          void this.renderChats();
        });
      }
    } catch (e: unknown) {
      container.empty();
      const msg = errorMessage(e);
      container.createDiv({ text: `Ошибка: ${msg}`, cls: 'tn-task-error' });
    }
  }

  private async renderMessages(container: HTMLElement): Promise<void> {
    container.empty();

    const backBtn = container.createEl('button', { text: '← Назад к чатам', cls: 'tn-task-btn' });
    backBtn.addEventListener('click', () => {
      this.currentChatId = '';
      this.currentChatTitle = '';
      void this.renderChats();
    });

    container.createEl('h6', { text: this.currentChatTitle });

    const msgContainer = container.createDiv();
    msgContainer.createDiv({ text: 'Загрузка...', cls: 'tn-task-loading' });

    try {
      const messages = await this.plugin.yougile.getChatMessages(this.currentChatId);
      msgContainer.empty();
      for (const msg of messages) {
        const msgEl = msgContainer.createDiv({ cls: 'tn-task-item' });
        msgEl.createDiv({ cls: 'tn-task-meta', text: this.plugin.tasksDb.getUserName(msg.fromUserId) });
        msgEl.createDiv({ cls: 'tn-task-title', text: msg.text });
        if (msg.label) msgEl.createDiv({ cls: 'tn-task-meta', text: `🏷 ${msg.label}` });
      }
    } catch (e: unknown) {
      msgContainer.empty();
      const msg = errorMessage(e);
      msgContainer.createDiv({ text: `Ошибка: ${msg}`, cls: 'tn-task-error' });
    }

    const inputRow = container.createDiv();
    inputRow.addClass('tn-task-fullwidth');
    const inputEl = inputRow.createEl('textarea', { attr: { placeholder: 'Сообщение...', rows: '2' } });
    inputEl.addClass('tn-task-textarea');
    const sendBtn = inputRow.createEl('button', { text: 'Отправить' });
    sendBtn.addEventListener('click', async () => {
      const text = inputEl.value.trim();
      if (!text) return;
      sendBtn.setText('⏳');
      try {
        await this.plugin.yougile.sendChatMessage(this.currentChatId, text);
        inputEl.value = '';
        await this.renderMessages(container);
      } catch (e: unknown) {
        const msg = errorMessage(e);
        new Notice(`Задачи: Ошибка — ${msg}`);
        sendBtn.setText('Отправить');
      }
    });
  }
}
