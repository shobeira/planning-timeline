# Week-based planning timeline

A simple, interactive horizontal timeline for planning milestones across multiple life projects. No installation, no accounts, no internet required — just open a file in your browser.

![Week-based planning timeline](screenshot.png)

## How to Use

### 1. Download and Open

1. Download this project (click the green **Code** button above → **Download ZIP**)
2. Unzip the folder
3. Open `index.html` in your browser (Chrome, Firefox, Edge, Safari — any will work)

That's it. The app runs entirely in your browser. Nothing is sent to any server.

### 2. Add Your First Milestone

**Option A — Click the "+ Add" button** in the toolbar. Fill in:
- **Title** — what's the milestone? (e.g. "Lease signed")
- **Description** — optional details
- **Year and Month** — when you're aiming for
- **When in month** — Early, Mid, or Late (rough is fine — this is planning, not scheduling)
- **Tag** — which project it belongs to (e.g. Home, Business, Health)
- **Status** — Planned, In Progress, or Done

**Option B — Double-click the timeline** at roughly the right time position. The add form opens pre-filled with that date.

**Option C — Batch Add** for adding many milestones at once. Click "Batch Add" and paste lines like:

```
Kitchen renovation, May 2025, early, Home
Lease signed, Mar 2025, mid, Business, done
First 10K run, Aug 2025, late, Health
```

Format: `title, date, early/mid/late, tag, status` — only title and date are required.

Shorthand: `e` = Early, `m` = Mid, `l` = Late. Supported date formats: `Mar 2025`, `March 2025`, `2025-03`, `03/2025`, `032025`. Lines starting with `#` are ignored (comments).

### 3. Organise with Tags

Tags are colour-coded categories for your projects. Click **Tags** in the toolbar to:
- Add new tags
- Rename or delete existing ones
- Change tag colours

Each milestone can have one tag. The coloured dots on the timeline match the tag colour, so you can see at a glance which project each milestone belongs to.

### 4. Track Progress with Statuses

Click **Status** in the toolbar to manage statuses. The defaults are Planned, In Progress, and Done — but you can rename them, add new ones, or change colours to fit how you work.

### 5. Filter Your View

The filter bar below the toolbar lets you show/hide milestones by clicking the status or tag pills. For example:
- Click "Done" to hide completed milestones and focus on what's ahead
- Click a tag name to hide that project and reduce clutter
- Combine both — show only "Planned" milestones for "Home"

### 6. Controls

| Action | How |
|---|---|
| Pan timeline | Hold **Shift** and scroll, or click-drag the timeline |
| Zoom in/out | Hold **Ctrl** and scroll, or use **Zoom −** / **Zoom +** buttons |
| Reset view | Click **Reset View** |
| Add milestone | Click **+ Add**, or double-click the timeline |
| Batch add | Click **Batch Add**, paste comma-separated lines |
| Edit milestone | Hover a card → click **Edit**, or click it in the list below |
| Delete milestone | Hover a card → click **Delete**, or use Delete in the edit dialog |
| Reschedule | Drag a milestone card left or right |
| Filter | Click status or tag pills in the filter bar to show/hide |
| Manage tags | Click **Tags** → add, rename, recolour, or delete |
| Manage statuses | Click **Status** → add, rename, recolour, or delete |
| Save data | Click **Save Data** → downloads a JSON file |
| Load data | Click **Load Data** → import a JSON file |
| Start fresh | Click **Clear All** (confirm to delete everything) |

### 7. Save and Load Your Data

Your data **auto-saves** in your browser — close the tab and come back later, everything is still there.

To **back up** or **move to another device**:
1. Click **Save Data** — downloads a `timeline-data.json` file
2. On the other device, click **Load Data** and select that file

To **start fresh**, click **Clear All** (this deletes everything — save first if you want a backup).

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
