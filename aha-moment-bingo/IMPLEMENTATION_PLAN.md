# Bingo App Improvements Plan

## Context
The Aha Moment Bingo app works well but has several UX gaps: the journal button is buried at the bottom, day labels are cryptic ("D1"), the journal view is a flat list with no stats/grouping/editing, and user login is a raw browser `prompt()`. These changes will make the app feel polished for the Denver accelerator.

## Changes

### 1. Day labels + Journal button placement
- Change "D1/D2/D3/D4" → "Day 1/Day 2/Day 3/Day 4" as pill-shaped buttons
- Move "My Journal" button from bottom actions bar up next to the day selector
- CSS: day-dots become pills (padding instead of fixed circle width)

### 2. Welcome/Login page (replaces browser prompt)
- Full-screen overlay with name, email, VBU dropdown
- Styled to match app theme (works in light + dark)
- Stores profile in localStorage, uses email as userId for API
- `init()` checks for profile first — shows welcome if missing
- Small "Hi, Name (change)" link near card info for returning users
- **Lambda update needed**: Add `day` field to the PutCommand Item destructure

### 3. Enhanced Journal view
- **Stats banner**: 4-stat grid (Aha moments, Reflections, Tokens, Bingos)
- **Grouped by day**: Day 1/2/3/4 sections with entries sorted by time
- **Timestamps**: Each entry shows time (e.g. "10:32 AM")
- **Edit inline**: Click pencil icon → textarea replaces note text → saves on blur
- **Delete**: Trash icon with confirm, removes from localStorage + API
- **Share individual aha**: Share button on each entry (clipboard/native share)
- **Export**: "Download My Journal" copies formatted Markdown to clipboard

### 4. Data layer changes
- Add `day: activeDay` to journal entries when saving
- New `markedByDay` state: `{1: Set, 2: Set, 3: Set, 4: Set}` persisted to localStorage
- `inferDayFromTimestamp()` fallback for existing entries without day field
- Persist `totalTokens` to localStorage (survives reload)

### 5. Progress bars on day pills
- Thin lime progress bar at bottom of each day pill (CSS `::after` with `--day-progress` variable)
- Updated after every mark/unmark via `updateDayProgress()`

### 6. Share from side panel
- Add "Share" button in side panel bottom alongside "Got it!"

## Files to modify
- `aha-moment-bingo/aha-moment-bingo.html` — all CSS, HTML, and JS changes
- `/tmp/bingo-lambda/index.mjs` — add `day` to destructure + PutCommand Item

## Implementation order
1. Data layer (day tracking, token persistence, markedByDay)
2. Lambda update (add day field)
3. Day labels + journal button move (quick UI)
4. Welcome/login page
5. Enhanced journal view (largest change)
6. Progress bars on day pills
7. Share button in side panel
8. Deploy: S3 upload + CloudFront invalidation + Lambda update

## Verification
- Test in browser via Chrome DevTools/Playwright
- Check light + dark mode for all new UI
- Test welcome flow (clear localStorage, reload)
- Test journal: create entries, edit, delete, export
- Test day progress bars fill when marking cells
- Verify API still works (save/load journal entries with day field)
