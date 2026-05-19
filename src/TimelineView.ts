import { ItemView, WorkspaceLeaf, TFile, moment, normalizePath } from 'obsidian';
import {
  parseSchedules,
  updateEventInContent,
  deleteEventFromContent,
  insertEventIntoContent,
  ScheduleEvent,
  pad,
} from './parser';
import type TimelinePlugin from './main';

export const TIMELINE_VIEW_TYPE = 'schedule-calendar';
const PX_PER_MIN = 1.2;
const SNAP_MIN = 15;

type ViewMode = 'daily' | 'weekly' | 'monthly';

export class TimelineView extends ItemView {
  private mode: ViewMode = 'daily';
  private focusDate: moment.Moment = moment();
  private currentFile: TFile | null = null;
  private eventsEl: HTMLElement | null = null;
  private nowLineEls: HTMLElement[] = [];
  private nowInterval: number | null = null;
  private activePopup: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf, private plugin: TimelinePlugin) {
    super(leaf);
  }

  getViewType() { return TIMELINE_VIEW_TYPE; }
  getDisplayText() { return 'Schedule Calendar'; }
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
    this.closePopup();
  }

  private async render() {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass('dtl-root');
    this.eventsEl = null;
    this.nowLineEls = [];
    if (this.nowInterval !== null) { window.clearInterval(this.nowInterval); this.nowInterval = null; }
    this.closePopup();

    this.renderHeader(root);

    if (this.mode === 'daily') await this.renderDailyView(root);
    else if (this.mode === 'weekly') await this.renderWeeklyView(root);
    else await this.renderMonthlyView(root);
  }

  // ─── Header ────────────────────────────────────────────────────────────────

  private renderHeader(root: HTMLElement) {
    const header = root.createEl('div', { cls: 'dtl-header' });

    const nav = header.createEl('div', { cls: 'dtl-nav' });
    nav.createEl('button', { cls: 'dtl-nav-btn', text: '‹' })
      .addEventListener('click', () => { this.shiftDate(-1); this.render(); });
    const dateEl = nav.createEl('span', { cls: 'dtl-date', text: this.getDateLabel() });
    nav.createEl('button', { cls: 'dtl-nav-btn', text: '›' })
      .addEventListener('click', () => { this.shiftDate(1); this.render(); });
    nav.createEl('button', { cls: 'dtl-today-btn', text: '오늘' })
      .addEventListener('click', () => { this.focusDate = moment(); this.render(); });

    const toggle = header.createEl('div', { cls: 'dtl-mode-toggle' });
    for (const [m, label] of [['daily', '일'], ['weekly', '주'], ['monthly', '월']] as [ViewMode, string][]) {
      toggle.createEl('button', {
        cls: 'dtl-mode-btn' + (this.mode === m ? ' active' : ''),
        text: label,
      }).addEventListener('click', () => { this.mode = m; this.render(); });
    }
  }

  private shiftDate(dir: number) {
    if (this.mode === 'daily') this.focusDate.add(dir, 'day');
    else if (this.mode === 'weekly') this.focusDate.add(dir, 'week');
    else this.focusDate.add(dir, 'month');
  }

  private getDateLabel(): string {
    if (this.mode === 'daily') return this.focusDate.format('YYYY-MM-DD (ddd)');
    if (this.mode === 'weekly') {
      const s = this.focusDate.clone().startOf('isoWeek');
      return `${s.format('MM/DD')} – ${s.clone().add(6, 'days').format('MM/DD')}`;
    }
    return this.focusDate.format('YYYY년 MM월');
  }

  // ─── Daily View ────────────────────────────────────────────────────────────

  private async renderDailyView(root: HTMLElement) {
    const dateStr = this.focusDate.format('YYYY-MM-DD');
    const filePath = normalizePath(`${this.plugin.settings.dailyNotePath}${dateStr}.md`);
    const file = this.app.vault.getAbstractFileByPath(filePath);
    const wrap = root.createEl('div', { cls: 'dtl-wrap' });

    if (!file || !(file instanceof TFile)) {
      wrap.createEl('div', { cls: 'dtl-empty', text: `데일리 노트 없음\n${filePath}` });
      return;
    }

    this.currentFile = file;
    const content = await this.app.vault.read(file);
    const events = parseSchedules(content, this.plugin.settings.scheduleSection);

    const grid = this.createGrid(wrap);
    this.eventsEl = grid.createEl('div', { cls: 'dtl-events' });
    this.renderDailyEvents(this.eventsEl, events, file);

    this.setupHoverPreview(grid);

    // Double-click empty area → add event
    grid.addEventListener('dblclick', (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('.dtl-event')) return;
      const dur = this.plugin.settings.defaultDuration;
      const y = e.clientY - grid.getBoundingClientRect().top;
      const startMin = Math.max(0, Math.min(1440 - dur, Math.round(y / PX_PER_MIN / dur) * dur));
      this.openAddPopup(e.clientX, e.clientY, startMin, startMin + dur, file);
    });

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
      const el = this.createEventEl(container, event, false);
      this.attachClickPopup(el, event, file);
      this.attachDailyDrag(el, event, file);
    }
  }

  private async refreshDailyEvents() {
    if (!this.currentFile || !this.eventsEl) return;
    const content = await this.app.vault.read(this.currentFile);
    const events = parseSchedules(content, this.plugin.settings.scheduleSection);
    this.renderDailyEvents(this.eventsEl, events, this.currentFile);
  }

  // ─── Weekly View ───────────────────────────────────────────────────────────

  private async renderWeeklyView(root: HTMLElement) {
    const weekStart = this.focusDate.clone().startOf('isoWeek');
    const days = Array.from({ length: 7 }, (_, i) => weekStart.clone().add(i, 'days'));

    const wrap = root.createEl('div', { cls: 'dtl-wrap dtl-wrap--weekly' });
    const weekGrid = wrap.createEl('div', { cls: 'dtl-week-grid' });

    // Day headers
    const headerRow = weekGrid.createEl('div', { cls: 'dtl-week-headers' });
    headerRow.createEl('div', { cls: 'dtl-week-gutter' });
    for (const day of days) {
      const isToday = day.isSame(moment(), 'day');
      const h = headerRow.createEl('div', { cls: 'dtl-week-day-header' + (isToday ? ' today' : '') });
      h.createEl('div', { cls: 'dtl-week-day-name', text: day.format('ddd') });
      h.createEl('div', { cls: 'dtl-week-day-date', text: day.format('M/D') });
      h.addEventListener('click', () => { this.focusDate = day.clone(); this.mode = 'daily'; this.render(); });
    }

    const colsWrap = weekGrid.createEl('div', { cls: 'dtl-week-cols-wrap' });

    // Hour labels column
    const hourCol = colsWrap.createEl('div', { cls: 'dtl-week-hour-col' });
    for (let h = 0; h < 24; h++) {
      hourCol.createEl('div', { cls: 'dtl-hour-row' })
        .createEl('span', { cls: 'dtl-hour-label', text: h === 0 ? '' : `${pad(h)}:00` });
    }

    // Load all day data in parallel
    const dayData = await Promise.all(days.map(async (day) => {
      const fp = normalizePath(`${this.plugin.settings.dailyNotePath}${day.format('YYYY-MM-DD')}.md`);
      const f = this.app.vault.getAbstractFileByPath(fp);
      if (!(f instanceof TFile)) return { day, file: null as TFile | null, events: [] as ScheduleEvent[] };
      return { day, file: f, events: parseSchedules(await this.app.vault.read(f), this.plugin.settings.scheduleSection) };
    }));

    for (const { day, file, events } of dayData) {
      const isToday = day.isSame(moment(), 'day');
      const col = colsWrap.createEl('div', { cls: 'dtl-week-col' + (isToday ? ' today' : '') });

      for (let h = 0; h < 24; h++) col.createEl('div', { cls: 'dtl-hour-row' });
      const eventsEl = col.createEl('div', { cls: 'dtl-events' });

      if (file) {
        for (const event of events) {
          const el = this.createEventEl(eventsEl, event, true);
          this.attachClickPopup(el, event, file);
          this.attachWeeklyDrag(el, event, file, col);
        }

        this.setupHoverPreview(col);

        col.addEventListener('dblclick', (e: MouseEvent) => {
          if ((e.target as HTMLElement).closest('.dtl-event')) return;
          const dur = this.plugin.settings.defaultDuration;
          const y = e.clientY - col.getBoundingClientRect().top;
          const startMin = Math.max(0, Math.min(1440 - dur, Math.round(y / PX_PER_MIN / dur) * dur));
          this.openAddPopup(e.clientX, e.clientY, startMin, startMin + dur, file);
        });
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

  // ─── Monthly View ──────────────────────────────────────────────────────────

  private async renderMonthlyView(root: HTMLElement) {
    const monthStart = this.focusDate.clone().startOf('month');
    const gridStart = monthStart.clone().startOf('isoWeek');
    const gridEnd = this.focusDate.clone().endOf('month').endOf('isoWeek');

    const wrap = root.createEl('div', { cls: 'dtl-month-wrap' });

    const dayNames = wrap.createEl('div', { cls: 'dtl-month-day-names' });
    for (const d of ['월', '화', '수', '목', '금', '토', '일'])
      dayNames.createEl('div', { cls: 'dtl-month-day-name', text: d });

    const grid = wrap.createEl('div', { cls: 'dtl-month-grid' });

    // Load events in parallel
    const dates: moment.Moment[] = [];
    let cur = gridStart.clone();
    while (cur.isSameOrBefore(gridEnd, 'day')) { dates.push(cur.clone()); cur.add(1, 'day'); }

    const eventMap = new Map<string, ScheduleEvent[]>();
    await Promise.all(dates.map(async (day) => {
      const fp = normalizePath(`${this.plugin.settings.dailyNotePath}${day.format('YYYY-MM-DD')}.md`);
      const f = this.app.vault.getAbstractFileByPath(fp);
      eventMap.set(day.format('YYYY-MM-DD'), f instanceof TFile
        ? parseSchedules(await this.app.vault.read(f), this.plugin.settings.scheduleSection)
        : []);
    }));

    for (const day of dates) {
      const dateStr = day.format('YYYY-MM-DD');
      const isCurrentMonth = day.isSame(this.focusDate, 'month');
      const isToday = day.isSame(moment(), 'day');

      const cell = grid.createEl('div', {
        cls: 'dtl-month-cell' + (isCurrentMonth ? '' : ' dtl-month-cell--out') + (isToday ? ' dtl-month-cell--today' : ''),
      });
      cell.createEl('div', { cls: 'dtl-month-cell-day', text: String(day.date()) });

      const events = eventMap.get(dateStr) ?? [];
      const chips = cell.createEl('div', { cls: 'dtl-month-chips' });
      for (const ev of events.slice(0, 3))
        chips.createEl('div', { cls: 'dtl-month-chip', text: ev.title });
      if (events.length > 3)
        chips.createEl('div', { cls: 'dtl-month-more', text: `+${events.length - 3}` });

      const capturedDate = day.clone();
      cell.addEventListener('click', () => { this.focusDate = capturedDate; this.mode = 'daily'; this.render(); });
    }
  }

  // ─── Popup ─────────────────────────────────────────────────────────────────

  private closePopup() {
    this.activePopup?.remove();
    this.activePopup = null;
  }

  private openEditPopup(clientX: number, clientY: number, event: ScheduleEvent, file: TFile) {
    this.closePopup();
    const popup = this.createPopup(clientX, clientY);

    const titleInput = popup.createEl('input', {
      cls: 'dtl-popup-input dtl-popup-title',
      attr: { type: 'text', value: event.title, placeholder: 'Title' },
    }) as HTMLInputElement;

    const timeRow = popup.createEl('div', { cls: 'dtl-popup-time-row' });
    const startInput = timeRow.createEl('input', {
      cls: 'dtl-popup-input dtl-popup-time',
      attr: { type: 'text', value: `${pad(event.startHour)}:${pad(event.startMin)}` },
    }) as HTMLInputElement;
    timeRow.createEl('span', { cls: 'dtl-popup-time-sep', text: '–' });
    const endInput = timeRow.createEl('input', {
      cls: 'dtl-popup-input dtl-popup-time',
      attr: { type: 'text', value: `${pad(event.endHour)}:${pad(event.endMin)}` },
    }) as HTMLInputElement;

    const btnRow = popup.createEl('div', { cls: 'dtl-popup-btn-row' });
    const saveBtn = btnRow.createEl('button', { cls: 'dtl-popup-btn dtl-popup-btn--primary', text: 'Save' });
    const deleteBtn = btnRow.createEl('button', { cls: 'dtl-popup-btn dtl-popup-btn--danger', text: 'Delete' });
    btnRow.createEl('button', { cls: 'dtl-popup-btn', text: 'Cancel' })
      .addEventListener('click', () => this.closePopup());

    const doSave = async () => {
      const title = titleInput.value.trim();
      if (!title) return;
      const [sh, sm] = this.parseTime(startInput.value);
      const [eh, em] = this.parseTime(endInput.value);
      const updated: ScheduleEvent = {
        ...event, title,
        startHour: sh, startMin: sm, endHour: eh, endMin: em,
        startMinutes: sh * 60 + sm, endMinutes: eh * 60 + em,
      };
      const content = await this.app.vault.read(file);
      await this.app.vault.modify(file, updateEventInContent(content, event.raw, updated));
      this.closePopup();
      if (this.mode === 'daily') await this.refreshDailyEvents(); else await this.render();
    };

    const doDelete = async () => {
      const content = await this.app.vault.read(file);
      await this.app.vault.modify(file, deleteEventFromContent(content, event.raw));
      this.closePopup();
      if (this.mode === 'daily') await this.refreshDailyEvents(); else await this.render();
    };

    saveBtn.addEventListener('click', doSave);
    deleteBtn.addEventListener('click', doDelete);
    popup.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); doSave(); }
      if (e.key === 'Escape') { e.preventDefault(); this.closePopup(); }
    });

    requestAnimationFrame(() => { titleInput.focus(); titleInput.select(); });
  }

  private openAddPopup(clientX: number, clientY: number, startMin: number, endMin: number, file: TFile) {
    this.closePopup();
    const popup = this.createPopup(clientX, clientY);

    const titleInput = popup.createEl('input', {
      cls: 'dtl-popup-input dtl-popup-title',
      attr: { type: 'text', placeholder: 'New event title' },
    }) as HTMLInputElement;

    const timeRow = popup.createEl('div', { cls: 'dtl-popup-time-row' });
    const startInput = timeRow.createEl('input', {
      cls: 'dtl-popup-input dtl-popup-time',
      attr: { type: 'text', value: `${pad(Math.floor(startMin / 60))}:${pad(startMin % 60)}` },
    }) as HTMLInputElement;
    timeRow.createEl('span', { cls: 'dtl-popup-time-sep', text: '–' });
    const endInput = timeRow.createEl('input', {
      cls: 'dtl-popup-input dtl-popup-time',
      attr: { type: 'text', value: `${pad(Math.floor(endMin / 60))}:${pad(endMin % 60)}` },
    }) as HTMLInputElement;

    const btnRow = popup.createEl('div', { cls: 'dtl-popup-btn-row' });
    const addBtn = btnRow.createEl('button', { cls: 'dtl-popup-btn dtl-popup-btn--primary', text: 'Add' });
    btnRow.createEl('button', { cls: 'dtl-popup-btn', text: 'Cancel' })
      .addEventListener('click', () => this.closePopup());

    const doAdd = async () => {
      const title = titleInput.value.trim();
      if (!title) return;
      const [sh, sm] = this.parseTime(startInput.value);
      const [eh, em] = this.parseTime(endInput.value);
      const newEvent: ScheduleEvent = {
        id: `new_${Date.now()}`, title,
        startHour: sh, startMin: sm, endHour: eh, endMin: em,
        startMinutes: sh * 60 + sm, endMinutes: eh * 60 + em, raw: '',
      };
      const content = await this.app.vault.read(file);
      await this.app.vault.modify(file, insertEventIntoContent(content, newEvent, this.plugin.settings.scheduleSection));
      this.closePopup();
      if (this.mode === 'daily') await this.refreshDailyEvents(); else await this.render();
    };

    addBtn.addEventListener('click', doAdd);
    popup.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); doAdd(); }
      if (e.key === 'Escape') { e.preventDefault(); this.closePopup(); }
    });

    requestAnimationFrame(() => titleInput.focus());
  }

  private createPopup(clientX: number, clientY: number): HTMLElement {
    const popup = document.body.createEl('div', { cls: 'dtl-popup' });
    this.activePopup = popup;

    // Prevent clicks inside popup from triggering the outside-click handler
    popup.addEventListener('mousedown', (e) => e.stopPropagation());

    // Position after render so we know popup dimensions
    requestAnimationFrame(() => {
      const w = popup.offsetWidth || 280, h = popup.offsetHeight || 180;
      let left = clientX + 8, top = clientY + 8;
      if (left + w > window.innerWidth - 8) left = clientX - w - 8;
      if (top + h > window.innerHeight - 8) top = clientY - h - 8;
      popup.style.left = `${Math.max(8, left)}px`;
      popup.style.top = `${Math.max(8, top)}px`;
    });

    // Close on outside click (after current event propagation finishes)
    const outsideHandler = (e: MouseEvent) => {
      if (!popup.contains(e.target as Node)) {
        this.closePopup();
        document.removeEventListener('mousedown', outsideHandler);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', outsideHandler), 0);

    return popup;
  }

  private parseTime(val: string): [number, number] {
    const [h = '0', m = '0'] = val.split(':');
    return [
      Math.max(0, Math.min(23, parseInt(h) || 0)),
      Math.max(0, Math.min(59, parseInt(m) || 0)),
    ];
  }

  // ─── Shared helpers ─────────────────────────────────────────────────────────

  private createGrid(parent: HTMLElement): HTMLElement {
    const grid = parent.createEl('div', { cls: 'dtl-grid' });
    for (let h = 0; h < 24; h++) {
      grid.createEl('div', { cls: 'dtl-hour-row' })
        .createEl('span', { cls: 'dtl-hour-label', text: h === 0 ? '' : `${pad(h)}:00` });
    }
    return grid;
  }

  private createEventEl(container: HTMLElement, event: ScheduleEvent, compact: boolean): HTMLElement {
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
    } else if (height >= 36) {
      // Show start time in compact mode when there's enough height
      el.createEl('div', {
        cls: 'dtl-event-time',
        text: `${pad(event.startHour)}:${pad(event.startMin)}`,
      });
    }
    el.createEl('div', { cls: 'dtl-event-title', text: event.title });
    if (!compact) el.createEl('div', { cls: 'dtl-event-resize' });

    return el;
  }

  private attachClickPopup(el: HTMLElement, event: ScheduleEvent, file: TFile) {
    let didMove = false;
    el.addEventListener('pointerdown', () => { didMove = false; });
    el.addEventListener('pointermove', () => { didMove = true; });
    el.addEventListener('click', (e: MouseEvent) => {
      if (didMove) return;
      if ((e.target as HTMLElement).closest('.dtl-event-resize')) return;
      e.stopPropagation();
      this.openEditPopup(e.clientX, e.clientY, event, file);
    });
  }

  // ─── Daily drag ─────────────────────────────────────────────────────────────

  private attachDailyDrag(el: HTMLElement, event: ScheduleEvent, file: TFile) {
    const resizeHandle = el.querySelector('.dtl-event-resize') as HTMLElement;
    const duration = event.endMinutes - event.startMinutes;
    let startY = 0, startMin = 0, moved = false;

    const onMoveMove = (e: PointerEvent) => {
      moved = true;
      const snapped = Math.round((e.clientY - startY) / PX_PER_MIN / SNAP_MIN) * SNAP_MIN;
      const newStart = Math.max(0, Math.min(1440 - duration, startMin + snapped));
      el.style.top = `${newStart * PX_PER_MIN}px`;
      const t = el.querySelector('.dtl-event-time');
      if (t) t.textContent = `${pad(Math.floor(newStart / 60))}:${pad(newStart % 60)} – ${pad(Math.floor((newStart + duration) / 60))}:${pad((newStart + duration) % 60)}`;
    };

    const onMoveUp = async (e: PointerEvent) => {
      el.classList.remove('dtl-dragging');
      el.releasePointerCapture(e.pointerId);
      document.removeEventListener('pointermove', onMoveMove);
      document.removeEventListener('pointerup', onMoveUp);
      if (!moved) return;
      const snapped = Math.round((e.clientY - startY) / PX_PER_MIN / SNAP_MIN) * SNAP_MIN;
      const newStart = Math.max(0, Math.min(1440 - duration, startMin + snapped));
      if (newStart !== startMin) await this.saveEvent(file, event, newStart, newStart + duration);
    };

    el.addEventListener('pointerdown', (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('.dtl-event-resize')) return;
      e.preventDefault();
      moved = false;
      el.classList.add('dtl-dragging');
      el.setPointerCapture(e.pointerId);
      startY = e.clientY;
      startMin = event.startMinutes;
      document.addEventListener('pointermove', onMoveMove);
      document.addEventListener('pointerup', onMoveUp);
    });

    let resizeStartY = 0, resizeStartEnd = 0;

    const onResizeMove = (e: PointerEvent) => {
      const snapped = Math.round((e.clientY - resizeStartY) / PX_PER_MIN / SNAP_MIN) * SNAP_MIN;
      const newEnd = Math.max(event.startMinutes + SNAP_MIN, Math.min(1440, resizeStartEnd + snapped));
      el.style.height = `${Math.max(24, (newEnd - event.startMinutes) * PX_PER_MIN)}px`;
      const t = el.querySelector('.dtl-event-time');
      if (t) t.textContent = `${pad(event.startHour)}:${pad(event.startMin)} – ${pad(Math.floor(newEnd / 60))}:${pad(newEnd % 60)}`;
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
      e.preventDefault(); e.stopPropagation();
      resizeHandle.setPointerCapture(e.pointerId);
      resizeStartY = e.clientY;
      resizeStartEnd = event.endMinutes;
      document.addEventListener('pointermove', onResizeMove);
      document.addEventListener('pointerup', onResizeUp);
    });
  }

  // ─── Weekly drag (vertical time change only) ─────────────────────────────────

  private attachWeeklyDrag(el: HTMLElement, event: ScheduleEvent, file: TFile, col: HTMLElement) {
    const duration = event.endMinutes - event.startMinutes;
    let grabOffsetPx = 0, moved = false;

    el.addEventListener('pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      moved = false;
      grabOffsetPx = e.clientY - el.getBoundingClientRect().top;
      el.classList.add('dtl-dragging');
      el.setPointerCapture(e.pointerId);

      const calcStart = (clientY: number) => {
        const rawTopPx = clientY - col.getBoundingClientRect().top - grabOffsetPx;
        return Math.max(0, Math.min(1440 - duration,
          Math.round(Math.max(0, rawTopPx) / PX_PER_MIN / SNAP_MIN) * SNAP_MIN));
      };

      const onMove = (e: PointerEvent) => {
        moved = true;
        el.style.top = `${calcStart(e.clientY) * PX_PER_MIN}px`;
      };

      const onUp = async (e: PointerEvent) => {
        el.classList.remove('dtl-dragging');
        el.releasePointerCapture(e.pointerId);
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        if (!moved) return;
        const newStart = calcStart(e.clientY);
        if (newStart !== event.startMinutes) {
          await this.saveEvent(file, event, newStart, newStart + duration);
          await this.render();
        }
      };

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });
  }

  // ─── Hover preview ghost ──────────────────────────────────────────────────────

  private setupHoverPreview(grid: HTMLElement) {
    const ghost = grid.createEl('div', { cls: 'dtl-ghost' });

    grid.addEventListener('mousemove', (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('.dtl-event')) {
        ghost.style.display = 'none';
        return;
      }
      const dur = this.plugin.settings.defaultDuration;
      const y = e.clientY - grid.getBoundingClientRect().top;
      const startMin = Math.max(0, Math.min(1440 - dur, Math.round(y / PX_PER_MIN / dur) * dur));
      const endMin = startMin + dur;
      ghost.style.display = 'block';
      ghost.style.top = `${startMin * PX_PER_MIN}px`;
      ghost.style.height = `${dur * PX_PER_MIN}px`;
      ghost.textContent = `${pad(Math.floor(startMin / 60))}:${pad(startMin % 60)} – ${pad(Math.floor(endMin / 60))}:${pad(endMin % 60)}`;
    });

    grid.addEventListener('mouseleave', () => { ghost.style.display = 'none'; });
  }

  // ─── Data ───────────────────────────────────────────────────────────────────

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
