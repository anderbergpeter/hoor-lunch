# Höör Lunch

A tiny site + weekly menu fetcher for lunch places in Höör (+~5km).

## Goals
- Show **Today** + **This week** menus.
- Auto-refresh every **Monday 10:00 Europe/Stockholm**.
- Annotate each dish with a **"Bryan Johnson Blueprint likelihood"** score (heuristic).

## Dev
```bash
cd hoor-lunch
npm i
npm run dev
```

## Run fetcher
```bash
npm run fetch
```

## Data
- `data/menus.json` (normalized menus)
- `data/sources.json` (restaurants + menu source URLs)
