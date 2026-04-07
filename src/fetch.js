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
import { fetchFacebookMenu } from './adapters/facebook.js';
import { fetchKretaMenu } from './adapters/kreta.js';
import { fetchWpApiMenu } from './adapters/wpapi.js';
import { fetchEatsmartMenu } from './adapters/eatsmart.js';
import { fetchGenericMenu } from './adapters/generic.js';
import { fetchElisefarmMenu } from './adapters/elisefarm.js';

async function buildMenus(sources) {
  const results = [];
  for (const p of sources.places || []) {
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
      const type = p.source?.type;

      if (type === 'gastis-image') {
        const out = await fetchGastisMenu({ pageUrl: p.source.pageUrl });
        if (!out.ok) results.push({ ...base, ok: false, error: out.error, raw: out });
        else results.push({ ...base, ok: true, raw: { pageUrl: out.pageUrl, imageUrl: out.imageUrl, ocrText: out.ocrText } });
        continue;
      }

      if (type === 'akersberg-html') {
        const out = await fetchAkersbergMenu({ url: p.source.url });
        if (!out.ok) results.push({ ...base, ok: false, error: out.error, raw: out });
        else results.push({ ...base, ok: true, raw: { url: out.url, text: out.text } });
        continue;
      }

      if (type === 'ralsen-html') {
        const out = await fetchRalsenMenu({ url: p.source.url });
        if (!out.ok) results.push({ ...base, ok: false, error: out.error, raw: out });
        else results.push({ ...base, ok: true, raw: { url: out.url, text: out.text } });
        continue;
      }

      if (type === 'facebook' && p.source?.pageUrl) {
        const out = await fetchFacebookMenu({ pageUrl: p.source.pageUrl });
        if (!out.ok) results.push({ ...base, ok: false, error: out.error, raw: out });
        else results.push({ ...base, ok: true, raw: { url: out.postUrl || out.pageUrl, text: out.text } });
        continue;
      }

      if (type === 'kreta-html') {
        const out = await fetchKretaMenu({ url: p.source.url });
        if (!out.ok) results.push({ ...base, ok: false, error: out.error, raw: out });
        else results.push({ ...base, ok: true, raw: { url: out.url, text: out.text } });
        continue;
      }

      if (type === 'wp-api') {
        const out = await fetchWpApiMenu({ url: p.source.url, slug: p.source.slug });
        if (!out.ok) results.push({ ...base, ok: false, error: out.error, raw: out });
        else results.push({ ...base, ok: true, raw: { url: out.url, text: out.text } });
        continue;
      }

      if (type === 'eatsmart-api') {
        const out = await fetchEatsmartMenu({ restaurantUid: p.source.restaurantUid });
        if (!out.ok) results.push({ ...base, ok: false, error: out.error, raw: out });
        else results.push({ ...base, ok: true, raw: { url: out.url, text: out.text } });
        continue;
      }

      if (type === 'elisefarm-pdf') {
        const out = await fetchElisefarmMenu({ url: p.source.url });
        if (!out.ok) results.push({ ...base, ok: false, error: out.error, raw: out });
        else results.push({ ...base, ok: true, source: { ...base.source, pageUrl: out.url }, raw: { url: out.url, text: out.text } });
        continue;
      }

      if (type === 'generic-html') {
        const out = await fetchGenericMenu({ url: p.source.url });
        if (!out.ok) results.push({ ...base, ok: false, error: out.error, raw: out });
        else results.push({ ...base, ok: true, raw: { url: out.url, text: out.text } });
        continue;
      }

      if (type === 'wix-site') {
        // Wix sites are JS-rendered; try generic fetch as best-effort
        const out = await fetchGenericMenu({ url: p.source.url });
        if (!out.ok) results.push({ ...base, ok: false, error: out.error || 'wix_js_rendered', raw: out });
        else results.push({ ...base, ok: true, raw: { url: out.url, text: out.text } });
        continue;
      }

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

  // Also copy to docs/data for GitHub Pages
  const docsDataDir = path.join(__dirname, '..', 'docs', 'data');
  await fs.mkdir(docsDataDir, { recursive: true });
  await fs.copyFile(menusPath, path.join(docsDataDir, 'menus.json'));

  const okCount = payload.results.filter(r => r.ok).length;
  console.log(`Wrote menus.json (${okCount}/${payload.results.length} OK)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
