export interface ScheduleEvent {
  id: string;
  title: string;
  tag?: string;
  startHour: number;
  startMin: number;
  endHour: number;
  endMin: number;
  startMinutes: number;
  endMinutes: number;
  raw: string;
}

const SCHEDULE_REGEX = /^- (\d{2}):(\d{2})\s*[-–]\s*(\d{2}):(\d{2})\s+(.+)$/;

const TAG_PALETTE = ['#4A90E2', '#27AE60', '#F39C12', '#8E44AD', '#E74C3C', '#16A085', '#D35400', '#2980B9'];

export function colorForTag(tag: string): string {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  return TAG_PALETTE[h % TAG_PALETTE.length];
}

export function parseSchedules(content: string, sectionName = 'Schedules'): ScheduleEvent[] {
  const events: ScheduleEvent[] = [];
  const lines = content.split('\n');
  let inSection = false;

  for (const line of lines) {
    if (line.trim() === `### ${sectionName}`) { inSection = true; continue; }
    if (inSection && line.startsWith('###')) inSection = false;
    if (!inSection) continue;

    const match = line.match(SCHEDULE_REGEX);
    if (!match) continue;

    const [, sh, sm, eh, em, title] = match;
    const startH = parseInt(sh), startM = parseInt(sm);
    const endH = parseInt(eh), endM = parseInt(em);
    const trimTitle = title.trim();
    const tagMatch = trimTitle.match(/#([A-Za-z]\w*)/);

    events.push({
      id: `${sh}${sm}${eh}${em}${trimTitle}`,
      title: trimTitle,
      tag: tagMatch ? tagMatch[1].toLowerCase() : undefined,
      startHour: startH, startMin: startM,
      endHour: endH, endMin: endM,
      startMinutes: startH * 60 + startM,
      endMinutes: endH * 60 + endM,
      raw: line,
    });
  }

  return events;
}

export function updateEventInContent(content: string, oldRaw: string, event: ScheduleEvent): string {
  const newLine = formatEventLine(event);
  return content.replace(oldRaw, newLine);
}

export function deleteEventFromContent(content: string, raw: string): string {
  const lines = content.split('\n');
  const filtered = lines.filter(l => l.trimEnd() !== raw.trimEnd());
  return filtered.join('\n');
}

export function insertEventIntoContent(
  content: string,
  event: ScheduleEvent,
  sectionName = 'Schedules',
): string {
  const newLine = formatEventLine(event);
  const lines = content.split('\n');
  const sectionIdx = lines.findIndex(l => l.trim() === `### ${sectionName}`);

  if (sectionIdx === -1) {
    return content + `\n### ${sectionName}\n${newLine}\n`;
  }

  const scheduleLines: { idx: number; startMinutes: number }[] = [];
  for (let i = sectionIdx + 1; i < lines.length; i++) {
    if (lines[i].startsWith('###')) break;
    const m = lines[i].match(SCHEDULE_REGEX);
    if (m) {
      const startM = parseInt(m[1]) * 60 + parseInt(m[2]);
      scheduleLines.push({ idx: i, startMinutes: startM });
    }
  }

  let insertIdx = sectionIdx + 1;
  for (const sl of scheduleLines) {
    if (sl.startMinutes <= event.startMinutes) {
      insertIdx = sl.idx + 1;
    } else {
      break;
    }
  }

  lines.splice(insertIdx, 0, newLine);
  return lines.join('\n');
}

export function formatEventLine(event: ScheduleEvent): string {
  return `- ${pad(event.startHour)}:${pad(event.startMin)} - ${pad(event.endHour)}:${pad(event.endMin)} ${event.title}`;
}

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}
