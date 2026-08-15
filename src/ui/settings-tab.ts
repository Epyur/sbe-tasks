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

    new Setting(containerEl)
      .setName('Проект по умолчанию')
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
  }
}
