# Performance

How Little Log stays quick as a family's log grows, what was measured, and the budgets the test suite holds it to.

## The measure

A log that a family would have after fourteen months of logging every day: **9,702 entries** over 420 days for two children (a baby's
feeds, diapers, sleeps and play; an older child's meals, potty and play; health notes), about 1.7 MB as JSON. Measured in the test
harness (headless Chromium on a build server, so a phone is roughly two to three times slower); each figure is the median of three.

| What | Before | After |
|---|---|---|
| Stats page, one-year range | 989 ms | 88 ms |
| Stats page, 30-day range | 167 ms | 112 ms |
| Month page | 71 ms | 38 ms |
| Day page | 45 ms | 53 ms (unchanged within noise) |
| Routine, Guide, Family, More pages | 19–34 ms | 31–59 ms (unchanged within noise) |
| 365 days looked up, one by one | 1 s (a scan of the log per day) | 9 ms |
| Saving the whole log (blocking part / total) | 20 ms / 27 ms | 10 ms / 19 ms |
| Reopening the app, log loaded and first page drawn | — | 430 ms after navigation starts (395 ms of it is loading the scripts) |
| First push of the whole log to the server (batches of 200 → 500) | 9.1 s | 8.4 s |
| A new phone joining and pulling the whole log | 11.6 s | 11.2 s |
| JavaScript heap with the log open | 28 MB | 29 MB |

## What changed (1.18.0)

**The page's view of the log is built once and reused.** Every page used to filter the whole log for each day it showed: the Stats
page asked for 365 days, each scanning ten thousand entries four times over. `viewOf()` in app.js now builds, once, the entries in
scope (the child shown, or everyone), grouped by the day they fall on, with the sleeps (they can span midnight) and the drop-offs on
the side; `eventsOnDay`, `dayStats`, `sleepMinutesOn` and `stays` read from it. It is rebuilt on the next read after anything changes:
`save()` and `removeEvent()` drop it, and its key (the log's identity and length, the edit clock `db.meta.hlc`, the child shown)
catches a log swapped or grown by a sync or a switch of child. One side effect, for the better: an entry belongs to the local day it
falls on even on the two days a year that are 23 or 25 hours long.

**Start-up marks.** `performance.mark('ll:start' | 'll:loaded' | 'll:drawn')` at the three points of start-up (scripts ready, log
loaded from IndexedDB, first page drawn), for the speed suite and for anyone profiling a phone with the devtools timeline.

**The lock screen keeps its message.** A sync that finishes while the PIN pad is up redraws the screen; "That PIN is not right" and
the countdown after five wrong tries now stay on it instead of vanishing (the digits typed already survived a redraw).

**Storage asked to persist.** `navigator.storage.persist()` at start-up, so a browser treats the log as data worth keeping under
storage pressure (on a phone the app's storage is its own already).

## What was looked at and left

* **Minifying the scripts** (esbuild, whitespace and syntax only) cut start-up by about a tenth on the build server, inside the
  noise between runs, and would have turned crash reports' line numbers into column numbers in a one-line file. Not worth it: the
  1.3 MB of scripts parse in well under half a second even on a phone, and they are readable in a crash report as they are.
* **Saving.** The whole log is written to IndexedDB on every change (a structured clone, about 10 ms blocking at ten thousand
  entries, after the page has already been redrawn). Splitting the log into per-entry records would make saves cheaper still but
  would complicate the sync, the family switch and the backups for little felt gain.
* **The first sync** of a big log is bounded by the network: entries go up in batches of 500 (the server's limit per call, raised from 200) and come down in pages of 500,
  with "Syncing…" shown meanwhile. Around ten seconds once, for a year of logging, is acceptable.
* **The Day page** is mostly the clock (an SVG with a ray per entry, 11 ms) and building the page's DOM (23 ms); nothing to trim
  without changing what it shows.

## Budgets (tests/perf.test.js)

The speed suite builds the same log and holds every page to a budget, loose enough for a slow CI runner and far below what feels
sluggish on a phone: Day 150 ms, Routine 100 ms, Month 150 ms, Stats over a year 300 ms and over a month 300 ms, Guide 120 ms, Family
150 ms, More 120 ms; 365 days of lookups under 60 ms; a save blocking under 80 ms; reopening with the log loaded under 6 s; the heap
under 200 MB. It also checks that the page's view follows every kind of change (an entry added, moved to another day, removed, another
child shown, entries that arrive from another phone), and that the whole log syncs to a second phone.

## Keeping it quick

* Ask `viewOf()` (through `eventsOnDay`, `dayStats`, `scoped`) rather than filtering `db.events` in a loop over days.
* Change the log through `save()` and `removeEvent()`, which refresh the view; a direct edit of an entry must bump `db.meta.hlc`
  with `stamp()`, as every edit in the app does.
* Keep the per-render work proportional to what is on screen: the Month page draws one month, the Stats page buckets a year into
  months before drawing.
