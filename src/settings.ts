import { App, PluginSettingTab, Setting } from 'obsidian';
import type TimelinePlugin from './main';

export interface TimelineSettings {
  scheduleSection: string;
  dailyNotePath: string;
}

export const DEFAULT_SETTINGS: TimelineSettings = {
  scheduleSection: 'Schedules',
  dailyNotePath: '30.Calendar/31.Daily/',
};

export class TimelineSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: TimelinePlugin) {
    super(app, plugin);
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Obsidian Timeline' });

    new Setting(containerEl)
      .setName('Schedule section')
      .setDesc('데일리 노트에서 스케줄을 파싱할 섹션 이름 (예: Schedules)')
      .addText((text) =>
        text
          .setPlaceholder('Schedules')
          .setValue(this.plugin.settings.scheduleSection)
          .onChange(async (value) => {
            this.plugin.settings.scheduleSection = value.trim() || 'Schedules';
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Daily note folder')
      .setDesc('데일리 노트가 저장된 폴더 경로')
      .addText((text) =>
        text
          .setPlaceholder('30.Calendar/31.Daily/')
          .setValue(this.plugin.settings.dailyNotePath)
          .onChange(async (value) => {
            let path = value.trim();
            if (path && !path.endsWith('/')) path += '/';
            this.plugin.settings.dailyNotePath = path;
            await this.plugin.saveSettings();
          })
      );
  }
}
