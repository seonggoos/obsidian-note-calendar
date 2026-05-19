# Note Calendar

A visual drag-and-drop calendar for [Obsidian](https://obsidian.md) — turn your daily note schedules into an interactive timeline, just like Notion Calendar.

## Features

- **Daily view** — 24-hour timeline of today's schedule
- **Weekly view** — side-by-side 7-day overview
- **Drag to move** — drag events up/down to reschedule (snaps to 15-minute intervals)
- **Resize** — drag the bottom edge to change end time
- **Auto-sync** — changes instantly reflect in your note file
- **Now line** — red indicator showing the current time
- **Configurable** — set your own schedule section name and daily note folder path

## How It Works

Note Calendar reads schedule entries from your daily notes and renders them as visual blocks on a timeline. Any changes you make in the calendar are written back to the note file automatically.

### Schedule Format

Your daily note must have a `### Schedules` section with entries in this format:

```markdown
### Schedules
- 09:00 - 10:00 Morning routine
- 10:00 - 13:00 Deep work
- 13:00 - 14:00 Lunch
- 14:00 - 18:00 Meetings
```

## Installation

### From Community Plugins (recommended)

1. Open **Settings → Community plugins**
2. Disable **Restricted mode** if enabled
3. Click **Browse** and search for `Note Calendar`
4. Click **Install**, then **Enable**

### Manual Installation

1. Download `main.js`, `manifest.json`, `styles.css` from the [latest release](https://github.com/seonggoos/obsidian-note-calendar/releases/latest)
2. Create a folder: `<vault>/.obsidian/plugins/note-calendar/`
3. Copy the three files into that folder
4. Open Obsidian → Settings → Community plugins → enable **Note Calendar**

### BRAT (Beta)

1. Install the [BRAT plugin](https://github.com/TfTHacker/obsidian42-brat)
2. Add `seonggoos/obsidian-note-calendar` as a beta plugin

## Usage

- Click the **📅 calendar icon** in the left ribbon, or
- Open the command palette and run **Open Note Calendar**
- Toggle between **일 (daily)** and **주 (weekly)** view using the buttons in the header
- In weekly view, click a day header or event to jump to that day's daily view

## Settings

Go to **Settings → Note Calendar** to configure:

| Setting | Default | Description |
|---------|---------|-------------|
| Schedule section | `Schedules` | The `###` section name to parse from daily notes |
| Daily note folder | `30.Calendar/31.Daily/` | Folder path where daily notes are stored |

## Compatibility

- Obsidian v1.0.0+
- Works with [Daily Notes](https://help.obsidian.md/Plugins/Daily+notes) core plugin
- Works with [Periodic Notes](https://github.com/liamcain/obsidian-periodic-notes) plugin

## License

[MIT](LICENSE)
