# 🎯 Recitation Picker

A simple classroom tool for calling on students fairly and keeping track of who has participated. Project it on the screen or use it on your laptop.

**Your students' names never leave your computer.** There is no account, no server, and nothing is uploaded. Everything is saved inside your web browser on the computer you're using.

---

## Opening the app

- **Online:** open the GitHub Pages link for this repository (see "Putting it online" below).
- **Offline:** download this repository, then double‑click `index.html`. It works the same way without internet.

Use the same browser on the same computer each time — that's where your data lives.

## Getting started

1. Click **+ Class** and type a class name, for example `PA 106`.
2. On the **Roster** tab, paste your students' names, **one name per line** (straight from Excel, Google Sheets, or a class list). Click **Add to roster**.
   - Numbering like `1.` or `2)` at the start of a line is removed automatically.
   - Names already on the roster are skipped, so you can paste again safely.
3. Repeat for your other classes. Switch classes with the drop‑down at the top.

To **fix a name**, go to **Roster** and type over it — it saves on its own. Their history stays with them.

## In class

1. Go to the **Pick** tab and click **Pick a student** (or press the **Space bar**).
2. The name is revealed in large text.
3. Tap one of the buttons to log how it went (or press a number key):
   - **1 – Answered well**
   - **2 – Answered**
   - **3 – Passed**
   - **4 – Absent** — this student is skipped for the rest of today.
4. Changed your mind? Click **Skip (don't log)** or press **Esc**. Logged by mistake? Click **Undo** in the message at the bottom of the screen.

Click **⛶ Full screen** when projecting.

### Fair picking

- Nobody is picked twice until **everyone present** has had a turn. Then a new round starts automatically.
- Students marked **Absent** don't use up their turn — they'll be in the pool next time they're present.
- Tick **Allow repeats** if you want anyone to be picked at any time (it still avoids the same person twice in a row).
- **Today → Start a new round** makes everyone pickable again right away.

## Today tab

Shows everyone called today in this class, newest first. You can change an outcome or delete an entry here.
Below that is a list of students **not called yet today** — tap **Absent** next to a name to take attendance before you start picking.

## Summary tab

A table for each student across all your sessions: how many times they were called, how many times they answered well, answered, passed, or were absent, and the last date they were called. Students who have never been called are shown in red. Click a column heading to sort, or click a student to see their full history.

## Exporting to a spreadsheet (CSV)

On **Summary** (or **Backup**), click **Export CSV**. You get a file for the current class with three columns: **Name, Date, Outcome**. The file name includes the class and the date, for example `PA-106_participation_2026-11-05.csv`. It opens in Excel or Google Sheets.

## Backing up — please read

Because everything is stored in your browser, **your data can be lost** if you:

- clear your browser history / site data,
- use a private or incognito window,
- switch to a different browser or computer.

**Make a backup regularly (e.g., once a week):**

1. Open the **Backup** tab.
2. Click **Download backup (.json)**.
3. Save the file somewhere safe — your Google Drive, a USB stick, or email it to yourself.

The app shows a reminder at the top if you have records and haven't backed up in 14 days.

**To restore** (or to move to another computer): open the app, go to **Backup**, click **Restore from backup…**, and choose your `.json` file. ⚠️ Restoring **replaces** everything currently in the app with what's in the file.

> The backup file contains your students' names, so store it as carefully as you would a class record.

## Putting it online (GitHub Pages)

1. On GitHub, open this repository → **Settings** → **Pages**.
2. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
3. Choose the **main** branch and the **/ (root)** folder, then **Save**.
4. After a minute, your link appears at the top of that page (something like `https://<your-username>.github.io/recitation-picker/`).

Even when it's online, the data still stays only in the browser you use — GitHub never sees your students' names.

## Keyboard shortcuts (Pick tab)

| Key | Action |
| --- | --- |
| Space | Pick a student |
| 1 / 2 / 3 / 4 | Answered well / Answered / Passed / Absent |
| Esc | Skip without logging |

## Files

- `index.html` — the page
- `style.css` — the look
- `app.js` — how it works

No build step and no outside libraries.
