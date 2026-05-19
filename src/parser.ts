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
  const newLine = `- ${pad(event.startHour)}:${pad(event.startMin)} - ${pad(event.endHour)}:${pad(event.endMin)} ${event.title}`;
  return content.replace(oldRaw, newLine);
}

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}
