export interface ScheduleEvent {
  id: string;
  title: string;
  startHour: number;
  startMin: number;
  endHour: number;
  endMin: number;
  startMinutes: number;
  endMinutes: number;
  raw: string;
}

const SCHEDULE_REGEX = /^- (\d{2}):(\d{2})\s*[-–]\s*(\d{2}):(\d{2})\s+(.+)$/;

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

    events.push({
      id: `${sh}${sm}${eh}${em}${title}`,
      title: title.trim(),
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
    // Section doesn't exist — append it
    return content + `\n### ${sectionName}\n${newLine}\n`;
  }

  // Collect indices of existing schedule lines in this section
  const scheduleLines: { idx: number; startMinutes: number }[] = [];
  for (let i = sectionIdx + 1; i < lines.length; i++) {
    if (lines[i].startsWith('###')) break;
    const m = lines[i].match(SCHEDULE_REGEX);
    if (m) {
      const startM = parseInt(m[1]) * 60 + parseInt(m[2]);
      scheduleLines.push({ idx: i, startMinutes: startM });
    }
  }

  // Find insertion position (sorted by startMinutes)
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

