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

/**
 * Placeholder fetcher.
 * Next step: implement per-source adapters (website, Facebook, PDF, etc.)
 */
async function buildMenus(sources) {
  const results = [];
  for (const p of sources.places || []) {
    results.push({
      placeId: p.id,
      placeName: p.name,
      fetchedAt: nowIso(),
      ok: false,
      error: 'fetcher-not-implemented',
      week: null
    });
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
