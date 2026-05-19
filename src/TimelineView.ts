import { ItemView, WorkspaceLeaf, TFile, moment } from 'obsidian';
import { parseSchedules, updateEventInContent, ScheduleEvent, pad } from './parser';
import type TimelinePlugin from './main';

export const TIMELINE_VIEW_TYPE = 'note-calendar';
const PX_PER_MIN = 1.2;
const SNAP_MIN = 15;

type ViewMode = 'daily' | 'weekly';

export class TimelineView extends ItemView {
  private mode: ViewMode = 'daily';
  private focusDate: moment.Moment = moment();
  private currentFile: TFile | null = null;
  private eventsEl: HTMLElement | null = null;
  private nowLineEls: HTMLElement[] = [];
  private nowInterval: number | null = null;

  constructor(leaf: WorkspaceLeaf, private plugin: TimelinePlugin) {
    super(leaf);
  }

  getViewType() { return TIMELINE_VIEW_TYPE; }
  getDisplayText() { return 'Timeline'; }
  getIcon() { return 'calendar-days'; }

  async onOpen() {
    await this.render();
    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        if (this.mode === 'daily' && file === this.currentFile) this.refreshDailyEvents();
      })
    );
  }

  async onClose() {
    if (this.nowInterval !== null) window.clearInterval(this.nowInterval);
  }

  private async render() {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass('dtl-root');
    this.eventsEl = null;
    this.nowLineEls = [];
    if (this.nowInterval !== null) { window.clearInterval(this.nowInterval); this.nowInterval = null; }

    this.renderHeader(root);

    if (this.mode === 'daily') {
      await this.renderDailyView(root);
    } else {
      await this.renderWeeklyView(root);
    }
  }

  // ─── Header ───────────────────────────────────────────────────────────────

  private renderHeader(root: HTMLElement) {
    const header = root.createEl('div', { cls: 'dtl-header' });

    const nav = header.createEl('div', { cls: 'dtl-nav' });
    const prev = nav.createEl('button', { cls: 'dtl-nav-btn', text: '‹' });
    const dateEl = nav.createEl('span', { cls: 'dtl-date' });
    const next = nav.createEl('button', { cls: 'dtl-nav-btn', text: '›' });
    const todayBtn = nav.createEl('button', { cls: 'dtl-today-btn', text: '오늘' });

    this.updateDateLabel(dateEl);

    prev.addEventListener('click', () => {
      this.focusDate.subtract(1, this.mode === 'daily' ? 'day' : 'week');
      this.render();
    });
    next.addEventListener('click', () => {
      this.focusDate.add(1, this.mode === 'daily' ? 'day' : 'week');
      this.render();
    });
    todayBtn.addEventListener('click', () => { this.focusDate = moment(); this.render(); });

    const toggle = header.createEl('div', { cls: 'dtl-mode-toggle' });
    const dailyBtn = toggle.createEl('button', {
      cls: 'dtl-mode-btn' + (this.mode === 'daily' ? ' active' : ''),
      text: '일',
    });
    const weeklyBtn = toggle.createEl('button', {
      cls: 'dtl-mode-btn' + (this.mode === 'weekly' ? ' active' : ''),
      text: '주',
    });

    dailyBtn.addEventListener('click', () => { this.mode = 'daily'; this.render(); });
    weeklyBtn.addEventListener('click', () => { this.mode = 'weekly'; this.render(); });
  }

  private updateDateLabel(el: HTMLElement) {
    if (this.mode === 'daily') {
      el.textContent = this.focusDate.format('YYYY-MM-DD (ddd)');
    } else {
      const start = this.focusDate.clone().startOf('isoWeek');
      const end = start.clone().add(6, 'days');
      el.textContent = `${start.format('MM/DD')} – ${end.format('MM/DD')}`;
    }
  }

  // ─── Daily View ───────────────────────────────────────────────────────────

  private async renderDailyView(root: HTMLElement) {
    const dateStr = this.focusDate.format('YYYY-MM-DD');
    const filePath = `${this.plugin.settings.dailyNotePath}${dateStr}.md`;
    const file = this.app.vault.getAbstractFileByPath(filePath);

    const wrap = root.createEl('div', { cls: 'dtl-wrap' });

    if (!file || !(file instanceof TFile)) {
      wrap.createEl('div', { cls: 'dtl-empty', text: `데일리 노트 없음:\n${filePath}` });
      return;
    }

    this.currentFile = file;
    const content = await this.app.vault.read(file);
    const events = parseSchedules(content, this.plugin.settings.scheduleSection);

    const grid = this.createGrid(wrap);
    this.eventsEl = grid.createEl('div', { cls: 'dtl-events' });
    this.renderDailyEvents(this.eventsEl, events, file);

    const nowLine = grid.createEl('div', { cls: 'dtl-now-line' });
    this.nowLineEls = [nowLine];
    this.tickNowLines();
    this.nowInterval = window.setInterval(() => this.tickNowLines(), 60000);

    requestAnimationFrame(() => {
      const now = moment();
      wrap.scrollTop = Math.max(0, (now.hours() * 60 + now.minutes() - 60) * PX_PER_MIN);
    });
  }

  private renderDailyEvents(container: HTMLElement, events: ScheduleEvent[], file: TFile) {
    container.empty();
    for (const event of events) {
      const el = this.createEventEl(container, event);
      this.attachDrag(el, event, file);
    }
  }

  private async refreshDailyEvents() {
    if (!this.currentFile || !this.eventsEl) return;
    const content = await this.app.vault.read(this.currentFile);
    const events = parseSchedules(content, this.plugin.settings.scheduleSection);
    this.renderDailyEvents(this.eventsEl, events, this.currentFile);
  }

  // ─── Weekly View ──────────────────────────────────────────────────────────

  private async renderWeeklyView(root: HTMLElement) {
    const weekStart = this.focusDate.clone().startOf('isoWeek');
    const days = Array.from({ length: 7 }, (_, i) => weekStart.clone().add(i, 'days'));

    const wrap = root.createEl('div', { cls: 'dtl-wrap dtl-wrap--weekly' });
    const weekGrid = wrap.createEl('div', { cls: 'dtl-week-grid' });

    // Day headers
    const headerRow = weekGrid.createEl('div', { cls: 'dtl-week-headers' });
    headerRow.createEl('div', { cls: 'dtl-week-gutter' }); // spacer for hour labels
    for (const day of days) {
      const isToday = day.isSame(moment(), 'day');
      const h = headerRow.createEl('div', {
        cls: 'dtl-week-day-header' + (isToday ? ' today' : ''),
      });
      h.createEl('div', { cls: 'dtl-week-day-name', text: day.format('ddd') });
      const dateLabel = h.createEl('div', { cls: 'dtl-week-day-date', text: day.format('M/D') });
      dateLabel.addEventListener('click', () => {
        this.focusDate = day.clone();
        this.mode = 'daily';
        this.render();
      });
    }

    // Time columns
    const colsWrap = weekGrid.createEl('div', { cls: 'dtl-week-cols-wrap' });
    const hourCol = colsWrap.createEl('div', { cls: 'dtl-week-hour-col' });
    for (let h = 0; h < 24; h++) {
      hourCol.createEl('div', { cls: 'dtl-hour-row', attr: { 'data-h': h } })
        .createEl('span', { cls: 'dtl-hour-label', text: h === 0 ? '' : `${pad(h)}:00` });
    }

    for (const day of days) {
      const isToday = day.isSame(moment(), 'day');
      const col = colsWrap.createEl('div', { cls: 'dtl-week-col' + (isToday ? ' today' : '') });
      for (let h = 0; h < 24; h++) col.createEl('div', { cls: 'dtl-hour-row' });

      const eventsEl = col.createEl('div', { cls: 'dtl-events' });
      const dateStr = day.format('YYYY-MM-DD');
      const filePath = `${this.plugin.settings.dailyNotePath}${dateStr}.md`;
      const file = this.app.vault.getAbstractFileByPath(filePath);

      if (file instanceof TFile) {
        const content = await this.app.vault.read(file);
        const events = parseSchedules(content, this.plugin.settings.scheduleSection);
        for (const event of events) {
          const el = this.createEventEl(eventsEl, event, true);
          el.addEventListener('click', () => {
            this.focusDate = day.clone();
            this.mode = 'daily';
            this.render();
          });
        }
      }

      if (isToday) {
        const nowLine = col.createEl('div', { cls: 'dtl-now-line' });
        this.nowLineEls.push(nowLine);
      }
    }

    this.tickNowLines();
    this.nowInterval = window.setInterval(() => this.tickNowLines(), 60000);

    requestAnimationFrame(() => {
      const now = moment();
      colsWrap.scrollTop = Math.max(0, (now.hours() * 60 + now.minutes() - 60) * PX_PER_MIN);
    });
  }

  // ─── Shared helpers ───────────────────────────────────────────────────────

  private createGrid(parent: HTMLElement): HTMLElement {
    const grid = parent.createEl('div', { cls: 'dtl-grid' });
    for (let h = 0; h < 24; h++) {
      const row = grid.createEl('div', { cls: 'dtl-hour-row' });
      row.createEl('span', { cls: 'dtl-hour-label', text: h === 0 ? '' : `${pad(h)}:00` });
    }
    return grid;
  }

  private createEventEl(container: HTMLElement, event: ScheduleEvent, compact = false): HTMLElement {
    const top = event.startMinutes * PX_PER_MIN;
    const height = Math.max((event.endMinutes - event.startMinutes) * PX_PER_MIN, 24);

    const el = container.createEl('div', { cls: 'dtl-event' + (compact ? ' dtl-event--compact' : '') });
    el.style.top = `${top}px`;
    el.style.height = `${height}px`;

    if (!compact) {
      el.createEl('div', {
        cls: 'dtl-event-time',
        text: `${pad(event.startHour)}:${pad(event.startMin)} – ${pad(event.endHour)}:${pad(event.endMin)}`,
      });
    }
    el.createEl('div', { cls: 'dtl-event-title', text: event.title });

    if (!compact) el.createEl('div', { cls: 'dtl-event-resize' });

    return el;
  }

  private attachDrag(el: HTMLElement, event: ScheduleEvent, file: TFile) {
    const resizeHandle = el.querySelector('.dtl-event-resize') as HTMLElement;
    const duration = event.endMinutes - event.startMinutes;

    // Move
    let moveStartY = 0, moveStartMin = 0;

    const onMoveMove = (e: PointerEvent) => {
      const snapped = Math.round((e.clientY - moveStartY) / PX_PER_MIN / SNAP_MIN) * SNAP_MIN;
      const newStart = Math.max(0, Math.min(1440 - duration, moveStartMin + snapped));
      el.style.top = `${newStart * PX_PER_MIN}px`;
      const timeEl = el.querySelector('.dtl-event-time');
      if (timeEl) timeEl.textContent = `${pad(Math.floor(newStart / 60))}:${pad(newStart % 60)} – ${pad(Math.floor((newStart + duration) / 60))}:${pad((newStart + duration) % 60)}`;
    };

    const onMoveUp = async (e: PointerEvent) => {
      el.classList.remove('dtl-dragging');
      el.releasePointerCapture(e.pointerId);
      document.removeEventListener('pointermove', onMoveMove);
      document.removeEventListener('pointerup', onMoveUp);
      const snapped = Math.round((e.clientY - moveStartY) / PX_PER_MIN / SNAP_MIN) * SNAP_MIN;
      const newStart = Math.max(0, Math.min(1440 - duration, moveStartMin + snapped));
      if (newStart !== moveStartMin) await this.saveEvent(file, event, newStart, newStart + duration);
    };

    el.addEventListener('pointerdown', (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('.dtl-event-resize')) return;
      e.preventDefault();
      el.classList.add('dtl-dragging');
      el.setPointerCapture(e.pointerId);
      moveStartY = e.clientY;
      moveStartMin = event.startMinutes;
      document.addEventListener('pointermove', onMoveMove);
      document.addEventListener('pointerup', onMoveUp);
    });

    // Resize
    let resizeStartY = 0, resizeStartEnd = 0;

    const onResizeMove = (e: PointerEvent) => {
      const snapped = Math.round((e.clientY - resizeStartY) / PX_PER_MIN / SNAP_MIN) * SNAP_MIN;
      const newEnd = Math.max(event.startMinutes + SNAP_MIN, Math.min(1440, resizeStartEnd + snapped));
      el.style.height = `${Math.max(24, (newEnd - event.startMinutes) * PX_PER_MIN)}px`;
      const timeEl = el.querySelector('.dtl-event-time');
      if (timeEl) timeEl.textContent = `${pad(event.startHour)}:${pad(event.startMin)} – ${pad(Math.floor(newEnd / 60))}:${pad(newEnd % 60)}`;
    };

    const onResizeUp = async (e: PointerEvent) => {
      resizeHandle.releasePointerCapture(e.pointerId);
      document.removeEventListener('pointermove', onResizeMove);
      document.removeEventListener('pointerup', onResizeUp);
      const snapped = Math.round((e.clientY - resizeStartY) / PX_PER_MIN / SNAP_MIN) * SNAP_MIN;
      const newEnd = Math.max(event.startMinutes + SNAP_MIN, Math.min(1440, resizeStartEnd + snapped));
      if (newEnd !== resizeStartEnd) await this.saveEvent(file, event, event.startMinutes, newEnd);
    };

    resizeHandle.addEventListener('pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      resizeHandle.setPointerCapture(e.pointerId);
      resizeStartY = e.clientY;
      resizeStartEnd = event.endMinutes;
      document.addEventListener('pointermove', onResizeMove);
      document.addEventListener('pointerup', onResizeUp);
    });
  }

  private async saveEvent(file: TFile, event: ScheduleEvent, newStartMin: number, newEndMin: number) {
    const updated: ScheduleEvent = {
      ...event,
      startMinutes: newStartMin, endMinutes: newEndMin,
      startHour: Math.floor(newStartMin / 60), startMin: newStartMin % 60,
      endHour: Math.floor(newEndMin / 60), endMin: newEndMin % 60,
    };
    const content = await this.app.vault.read(file);
    await this.app.vault.modify(file, updateEventInContent(content, event.raw, updated));
  }

  private tickNowLines() {
    const now = moment();
    const top = (now.hours() * 60 + now.minutes()) * PX_PER_MIN;
    for (const el of this.nowLineEls) el.style.top = `${top}px`;
  }
}
