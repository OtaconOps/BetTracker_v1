# Ledger — Bet Tracker

A private, offline, installable bet tracker. No login, no server, no data leaves your phone.

## What's inside

- **Dashboard** — net profit, win rate, total wagered/returned, average profit per bet, current streak, biggest win/loss, longest streaks, and a bankroll-over-time chart (All / 30d / 7d).
- **Add/Edit bet** — stake, return, Win/Loss toggle, date, optional notes, live profit preview. Tap any bet in History to edit or delete it.
- **History** — search by notes, filter by Today / Week / Month / All.
- **Settings** — export a full JSON backup, restore from a backup, export a CSV (for Excel/Sheets), or wipe all data.
- Dark, finance-app styled UI. Installable as a real app icon on Android (and iOS) with full offline support via a service worker.
- Data is stored in **IndexedDB** on your device — nothing is uploaded anywhere.

## Put it on your phone (recommended: GitHub Pages, since you already have the repo)

1. Delete the old contents of your `BetTracker_v1` repo (or create a fresh repo).
2. Upload every file **and folder** from this ZIP, keeping the same structure:
   ```
   index.html
   style.css
   app.js
   db.js
   manifest.json
   service-worker.js
   assets/
     icon-192.png
     icon-512.png
     icon-180.png
     favicon-32.png
   ```
3. Commit. Wait ~30–60 seconds for GitHub Pages to rebuild.
4. On your phone, open the site in **Chrome**, tap the ⋮ menu, and choose **Install app**.
5. Open it from your home screen — it should launch full-screen, no address bar.

## Updating later

Whenever you want a new feature, just replace the changed files in the repo and commit. Your bets stay untouched — they live in your phone's IndexedDB, not in the code.

## Backing up your data

Since everything is local to the device, **do this occasionally**: Settings → Export backup (.json). If you ever switch phones, clear your browser data, or reinstall, use Settings → Restore backup to bring your bets back.

## Notes on the numbers

- **Return** = the total amount the bookmaker pays you back on a win (stake + winnings), not just the winnings.
- **Profit** on a win = Return − Stake. On a loss it's simply −Stake.
- Net profit, win rate, streaks etc. are all computed live from your bet history — nothing is hardcoded.
