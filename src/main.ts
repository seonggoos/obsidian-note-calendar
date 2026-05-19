import { Plugin } from 'obsidian';
import { TimelineView, TIMELINE_VIEW_TYPE } from './TimelineView';
import { TimelineSettings, DEFAULT_SETTINGS, TimelineSettingTab } from './settings';

export default class TimelinePlugin extends Plugin {
  settings: TimelineSettings = DEFAULT_SETTINGS;

  async onload() {
    await this.loadSettings();

    this.registerView(TIMELINE_VIEW_TYPE, (leaf) => new TimelineView(leaf, this));

    this.addRibbonIcon('calendar-days', 'Obsidian Timeline', () => this.activateView());

    this.addCommand({
      id: 'open-timeline',
      name: 'Open Timeline',
      callback: () => this.activateView(),
    });

    this.addSettingTab(new TimelineSettingTab(this.app, this));
  }

  async onunload() {
    this.app.workspace.detachLeavesOfType(TIMELINE_VIEW_TYPE);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async activateView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(TIMELINE_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = workspace.getRightLeaf(false)!;
      await leaf.setViewState({ type: TIMELINE_VIEW_TYPE, active: true });
    }
    workspace.revealLeaf(leaf);
  }
}
