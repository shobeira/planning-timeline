# Week-based planning timeline

A simple, interactive horizontal timeline for planning goals and tasks across multiple life projects. No installation, no accounts, no internet required — just open a file in your browser.

<a href="https://timeline.shobeira.com" target="_blank"><strong>Live Demo →</strong></a>

Best experienced on a desktop or laptop display.

## What It Does

**Goals** are single points in time — deadlines, milestones, or events. They appear as cards above the timeline axis, colour-coded by project.

**Tasks** have a start and end date — ongoing work with duration. They appear as horizontal bars below the axis, showing the effort in weeks.

Both can be tagged by project, tracked by status, filtered, dragged to reschedule, and batch-imported.

## How to Use

### 1. Download and Open

1. Download this project (click the green **Code** button above → **Download ZIP**)
2. Unzip the folder
3. Open `index.html` in your browser (Chrome, Firefox, Edge, Safari — any will work)

That's it. The app runs entirely in your browser. Nothing is sent to any server.

### 2. Add Goals and Tasks

**Option A — Click "+ Add"** in the toolbar. Choose **Goal** or **Task**, fill in the details:
- **Title** and optional **Description**
- **Date** — year, month, and Early/Mid/Late in month
- **Tag** — which project it belongs to (create new tags inline with **+ New**)
- **Status** — defaults to Undefined; change to Planned, In Progress, or Done
- For **Tasks**: set both a start and end date. Effort is calculated automatically.

**Option B — Double-click the timeline** to add a goal at that position.

**Option C — Batch Add** for adding many items at once. Click "Batch Add" and paste lines:

```
# Goals
Lease signed, Mar 2025, m, Café, done
First 10K run, Aug 2025, l, Wellness

# Tasks (with duration)
Kitchen reno, May 2025 + 8w, e, Home, inprogress

# Tasks (with end date)
Staff training, Oct 2025, e, Café, planned, Nov 2025, l
```

Format: `title, date, e/m/l, tag, status` — only title and date are required.

Shorthand: `e` = Early, `m` = Mid, `l` = Late. Date formats: `Mar 2025`, `March 2025`, `2025-03`, `03/2025`, `032025`. Lines starting with `#` are ignored.

### 3. Organise with Tags

Tags are colour-coded project categories. Click **Tags** in the toolbar to add, rename, recolour, or delete. You can also create tags inline when adding a goal or task using the **+ New** button.

### 4. Track Progress with Statuses

Four default statuses: **Undefined → Planned → In Progress → Done**. Click **Status** in the toolbar to rename, add, or recolour them.

### 5. Filter Your View

Click status or tag pills in the filter bar to show/hide items. Combine filters to focus — for example, show only "Planned" items for "Home".

### 6. Controls

| Action | How |
|---|---|
| Pan timeline | Hold **Shift** and scroll, or click-drag the timeline |
| Zoom in/out | Hold **Ctrl** and scroll, or use **Zoom −** / **Zoom +** buttons |
| Reset view | Click **Reset View** |
| Add goal | Click **+ Add** → select **Goal**, or double-click the timeline |
| Add task | Click **+ Add** → select **Task**, set start and end dates |
| Batch add | Click **Batch Add**, paste comma-separated lines |
| Edit | Hover a card → click **Edit**, or click it in the list below |
| Delete | Hover a card → click **Delete**, or use Delete in the edit dialog |
| Reschedule | Drag a goal card or task bar left or right |
| Filter | Click status or tag pills in the filter bar |
| Manage tags | Click **Tags** → add, rename, recolour, or delete |
| Manage statuses | Click **Status** → add, rename, recolour, or delete |
| Save data | Click **Save Data** → downloads a JSON file |
| Load data | Click **Load Data** → import a JSON file |
| Start fresh | Click **Clear All** (confirm to delete everything) |
| Help | Hover over **How to?** for a quick guide |

### 7. Save and Load Your Data

Your data **auto-saves** in your browser — close the tab and come back later, everything is still there.

**Your data lives in this browser only.** If you clear your data, switch browsers, or clear browser history, it's gone. Use **Save Data** regularly to keep a backup.

To **back up** or **move to another device**:
1. Click **Save Data** — downloads a `timeline-data.json` file
2. On the other device, click **Load Data** and select that file

To **start fresh**, click **Clear All** (save first if you want a backup).

## File Structure

```
planning-timeline/
├── index.html   ← open this in your browser
├── style.css    ← visual styling (edit theme colours here)
├── app.js       ← application logic
└── README.md    ← you are here
```

## Customisation

To change the colour theme, open `style.css` and edit the variables at the top:

```css
:root {
  --bg:      #111;    /* background */
  --accent:  #E07A5F; /* buttons and highlights */
  --text:    #e8e0d4; /* text colour */
}
```

To change the sample data, edit the `MILESTONES` and `TAGS` arrays in `index.html` — or simply click **Clear All** and build your timeline from the interface.

## Licence

MIT
