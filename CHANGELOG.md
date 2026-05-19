# Changelog

## [1.1.0] - 2026-05-19

### Added
- **Drag tooltip** — floating `HH:MM – HH:MM` label follows the cursor during any drag or resize
- **Undo** (`Cmd/Ctrl+Z`) — reverts the last change (drag, resize, edit, delete, add), up to 20 steps
- **Tag colors** — events with `#tag` in their title get a unique accent color on the left border; monthly chips reflect the same colors
- **Daily stats bar** — shows total scheduled time and per-tag time breakdown below the daily timeline
- **Zoom** — `−` / `+` buttons in the header scale the timeline density (0.75× / 1× / 1.5× / 2×)
- **Top resize** — drag the top edge of an event to adjust its start time (daily view)
- **Note link** (`↗`) — edit popup shows an open button when the event title contains a `[[wiki link]]`

### Changed
- `PX_PER_MIN` is now a dynamic getter driven by zoom level; CSS uses `--dtl-row-h` custom property

---

## [1.0.1] - 2026-05-19

### Fixed
- Plugin ID mismatch (`note-calendar` → `schedule-calendar`) corrected in all files
- Replaced deprecated `builtin-modules` npm package with native `module.builtinModules`
- Removed `detachLeavesOfType` from `onunload` (violates Obsidian plugin guidelines)
- Settings heading now uses `Setting.setHeading()` instead of raw `createEl`

---

## [1.0.0] - 2026-05-19

### Initial release
- Daily, weekly, and monthly views
- 24-hour timeline with drag-to-move and bottom-edge resize (15-minute snaps)
- Double-click empty area to add an event (ghost preview + configurable default duration)
- Click event to edit title and time in a popup; delete from the same popup
- Auto-sync — all changes written back to the daily note file immediately
- Now-line showing current time
- Configurable schedule section name, daily note folder, and default event duration
