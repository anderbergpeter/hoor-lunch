import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, '..', 'data');
const sourcesPath = path.join(dataDir, 'sources.json');
const menusPath = path.join(dataDir, 'menus.json');

async function ensureDataDir() {
  await fs.mkdir(dataDir, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

async function loadSources() {
  try {
    const raw = await fs.readFile(sourcesPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { updatedAt: null, radiusKm: 5, center: { name: 'Höör' }, places: [] };
  }
}

import { fetchGastisMenu } from './adapters/gastis.js';
import { fetchAkersbergMenu } from './adapters/akersberg.js';
import { fetchRalsenMenu } from './adapters/ralsen.js';

async function buildMenus(sources) {
  const results = [];
  for (const p of sources.places || []) {
    // Allow curation: keep places in sources.json but exclude from menus if they don't serve lunch / are closed.
    if (p.active === false || p.hasLunch === false) {
      continue;
    }

    const base = {
      placeId: p.id,
      placeName: p.name,
      fetchedAt: nowIso(),
      ok: false,
      error: null,
      source: p.source || null,
      week: null,
      raw: null
    };

    try {
      if (p.source?.type === 'gastis-image') {
        const out = await fetchGastisMenu({ pageUrl: p.source.pageUrl });
        if (!out.ok) results.push({ ...base, ok: false, error: out.error, raw: out });
        else results.push({ ...base, ok: true, raw: { pageUrl: out.pageUrl, imageUrl: out.imageUrl, ocrText: out.ocrText } });
        continue;
      }

      if (p.source?.type === 'akersberg-html') {
        const out = await fetchAkersbergMenu({ url: p.source.url });
        if (!out.ok) results.push({ ...base, ok: false, error: out.error, raw: out });
        else results.push({ ...base, ok: true, raw: { url: out.url, text: out.text } });
        continue;
      }

      if (p.source?.type === 'ralsen-html') {
        const out = await fetchRalsenMenu({ url: p.source.url });
        if (!out.ok) results.push({ ...base, ok: false, error: out.error, raw: out });
        else results.push({ ...base, ok: true, raw: { url: out.url, text: out.text } });
        continue;
      }

      // Keep unknown sources in the dataset so the UI can list them.
      results.push({ ...base, ok: false, error: 'unsupported_source_type', raw: { note: p.source?.note || null } });
    } catch (err) {
      results.push({ ...base, ok: false, error: err?.message || String(err) });
    }
  }
  return results;
}

async function main() {
  await ensureDataDir();
  const sources = await loadSources();
  const menus = await buildMenus(sources);
  const payload = {
    schema: 1,
    generatedAt: nowIso(),
    sourcesUpdatedAt: sources.updatedAt,
    results: menus
  };
  await fs.writeFile(menusPath, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`Wrote ${menusPath} (${payload.results.length} places)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
