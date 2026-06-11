# Höör Lunch

A tiny site + menu fetcher for lunch places in Höör (+~5km).
Live: https://anderbergpeter.github.io/hoor-lunch/

## How it works
- `src/fetch.js` scrapes every restaurant via adapters in `src/adapters/` and writes `data/menus.json` + `docs/data/menus.json`.
- GitHub Actions (`.github/workflows/update-menus.yml`) runs the fetcher on a schedule (early morning + mid-morning on weekdays, plus weekend runs) and commits `docs/data/menus.json`.
- GitHub Pages serves `docs/` – the frontend (`docs/index.html`) parses the raw menu text per restaurant client-side and highlights today's lunch.
- Each dish gets a **"Bryan Johnson Blueprint likelihood"** score (heuristic).

## Reliability
- Every adapter gets one automatic retry plus a timeout.
- If a fetch still fails, the previous successful result is reused for up to 4 days and marked `stale` (shown as "OK (äldre data)" on the site).
- Restaurants whose menus can't be machine-read (e.g. Facebook-only) use source type `link-only` and are always shown with a link instead of an error.

### Höörs Gästis
The weekly menu is an uploaded PDF in WordPress. The adapter derives the original PDF URL from the page's thumbnail (`...-pdf-300x300.jpg` → `....pdf`) and extracts its embedded text directly. OCR of the full-size image is only a fallback.

## Dev
```bash
npm i
npm run dev   # serves docs/ (same files as GitHub Pages) on http://127.0.0.1:3030
```

### Windows note (PowerShell execution policy)
Om `npm run dev` failar med "running scripts is disabled", kör servern direkt (funkar alltid):

```bash
node src/server.js
```

Alternativt: kör kommandot från **cmd.exe** i stället för PowerShell, eller sätt:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

## Run fetcher
```bash
npm run fetch
```

## Data
- `data/menus.json` (normalized menus, gitignored – the committed copy lives in `docs/data/menus.json`)
- `data/sources.json` (restaurants + menu source URLs; set `"active": false` / `"hasLunch": false` to exclude a place)

## Adding a restaurant
1. Add an entry to `data/sources.json` with a `source.type`:
   - an existing adapter type (`generic-html`, `wp-api`, `eatsmart-api`, ...) or
   - `link-only` (+ `pageUrl` and `note`) when the menu can't be scraped.
2. For a new site structure, add an adapter in `src/adapters/` and wire it up in `adapterFor()` in `src/fetch.js`.
3. If the menu needs day-by-day parsing, add a parser + branch in `pickToday()` in `docs/index.html`.
