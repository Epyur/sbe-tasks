import { Plugin, WorkspaceLeaf } from 'obsidian';
import { TasksDatabase } from './database/tasks-db';
import { YougileConsumer } from './services/yougile-consumer';
import { TasksView, SBE_TASKS_VIEW_TYPE } from './ui/tasks-view';
import { TasksSettingsTab } from './ui/settings-tab';
import { publishService, unpublishService } from '../../sbe-core/src/bridge';
import type { SbeTasksApi } from '../../sbe-core/src/types';

export interface SbeTasksSettings {
  selectedProjectId: string;
}

const DEFAULT_SETTINGS: SbeTasksSettings = {
  selectedProjectId: '',
};

export default class SbeTasksPlugin extends Plugin {
  settings!: SbeTasksSettings;
  tasksDb!: TasksDatabase;
  yougile!: YougileConsumer;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.tasksDb = new TasksDatabase(this.app, this);
    await this.tasksDb.init();
    this.yougile = new YougileConsumer();

    this.registerView(
      SBE_TASKS_VIEW_TYPE,
      (leaf: WorkspaceLeaf) => new TasksView(leaf, this),
    );

    this.addSettingTab(new TasksSettingsTab(this.app, this));

    // Точка входа — магазин: «Установленные → Открыть». Собственных риббона/команды нет.
    publishService<SbeTasksApi>('sbe-tasks', {
      open: async () => {
        await this.activateView();
      },
    }, {
      version: this.manifest.version,
      name: this.manifest.name,
    });
  }

  onunload(): void {
    unpublishService('sbe-tasks');
  }

  async loadSettings(): Promise<void> {
    const data = (await this.loadData() as Partial<SbeTasksSettings>) || {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async activateView(): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(SBE_TASKS_VIEW_TYPE)[0];
    if (existing) {
      workspace.revealLeaf(existing);
      return;
    }
    const leaf = workspace.getLeaf(false);
    await leaf.setViewState({ type: SBE_TASKS_VIEW_TYPE, active: true });
    workspace.revealLeaf(leaf);
  }
}
