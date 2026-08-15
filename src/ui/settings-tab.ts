import { App, PluginSettingTab, Setting } from 'obsidian';
import type SbeTasksPlugin from '../main';

export class TasksSettingsTab extends PluginSettingTab {
  private plugin: SbeTasksPlugin;

  constructor(app: App, plugin: SbeTasksPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    this.renderProjectSection(containerEl);
  }

  private renderProjectSection(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: 'Проекты' });

    new Setting(containerEl)
      .setName('Проект по умолчанию (задачи)')
      .setDesc('Используется как начальное значение фильтра «Проект» во вьюхе «Задачи». Проекты появятся после первой синхронизации.')
      .addDropdown(drop => {
        drop.addOption('', '— все проекты —');
        for (const p of this.plugin.tasksDb.getProjects()) {
          drop.addOption(p.id, p.title);
        }
        drop.setValue(this.plugin.settings.selectedProjectId);
        drop.onChange(async value => {
          this.plugin.settings.selectedProjectId = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName('Проект мероприятий')
      .setDesc('Проект, в котором создаются мероприятия через кнопку «Добавить мероприятие».')
      .addDropdown(drop => {
        drop.addOption('', '— выберите проект —');
        for (const p of this.plugin.tasksDb.getProjects()) {
          drop.addOption(p.id, p.title);
        }
        drop.setValue(this.plugin.settings.eventsProjectId);
        drop.onChange(async value => {
          this.plugin.settings.eventsProjectId = value;
          if (value) {
            const boards = this.plugin.tasksDb.getBoards().filter(b => b.projectId === value);
            const current = this.plugin.settings.eventsBoardId;
            if (!boards.some(b => b.id === current)) this.plugin.settings.eventsBoardId = '';
          } else {
            this.plugin.settings.eventsBoardId = '';
          }
          await this.plugin.saveSettings();
          this.display();
        });
      });

    new Setting(containerEl)
      .setName('Доска мероприятий')
      .setDesc('Доска в проекте мероприятий: из неё берутся «Направления мероприятия» в форме создания.')
      .addDropdown(drop => {
        drop.addOption('', '— выберите доску —');
        const pid = this.plugin.settings.eventsProjectId;
        const boards = pid
          ? this.plugin.tasksDb.getBoards().filter(b => b.projectId === pid)
          : [];
        for (const b of boards) {
          drop.addOption(b.id, b.title);
        }
        drop.setValue(this.plugin.settings.eventsBoardId);
        drop.onChange(async value => {
          this.plugin.settings.eventsBoardId = value;
          await this.plugin.saveSettings();
        });
      });
  }
}
