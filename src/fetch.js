import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, '..', 'data');
const docsDataDir = path.join(__dirname, '..', 'docs', 'data');
const sourcesPath = path.join(dataDir, 'sources.json');
const menusPath = path.join(dataDir, 'menus.json');

// If a fetch fails, reuse the previous successful result for up to this long.
const STALE_MAX_AGE_MS = 4 * 24 * 60 * 60 * 1000; // 4 days
const ADAPTER_TIMEOUT_MS = 120000;

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

// Previous run – data/menus.json is gitignored, so in CI the docs copy is the one that exists.
async function loadPrevious() {
  for (const p of [menusPath, path.join(docsDataDir, 'menus.json')]) {
    try {
      const raw = await fs.readFile(p, 'utf8');
      const json = JSON.parse(raw);
      if (Array.isArray(json?.results)) return json;
    } catch { /* try next */ }
  }
  return null;
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout_${ms}ms:${label}`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Run an adapter with one retry on failure/exception.
async function runAdapter(label, fn) {
  let last = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const out = await withTimeout(fn(), ADAPTER_TIMEOUT_MS, label);
      if (out?.ok) return out;
      last = out;
    } catch (err) {
      last = { ok: false, error: err?.message || String(err) };
    }
    if (attempt === 1) await new Promise(r => setTimeout(r, 3000));
  }
  return last || { ok: false, error: 'unknown_failure' };
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

function adapterFor(p) {
  const type = p.source?.type;
  switch (type) {
    case 'gastis-image':
    case 'gastis-pdf':
      return () => fetchGastisMenu({ pageUrl: p.source.pageUrl });
    case 'akersberg-html':
      return () => fetchAkersbergMenu({ url: p.source.url });
    case 'ralsen-html':
      return () => fetchRalsenMenu({ url: p.source.url });
    case 'facebook':
      return () => fetchFacebookMenu({ pageUrl: p.source.pageUrl });
    case 'kreta-html':
      return () => fetchKretaMenu({ url: p.source.url });
    case 'wp-api':
      return () => fetchWpApiMenu({ url: p.source.url, slug: p.source.slug });
    case 'eatsmart-api':
      return () => fetchEatsmartMenu({ restaurantUid: p.source.restaurantUid });
    case 'elisefarm-pdf':
      return () => fetchElisefarmMenu({ url: p.source.url });
    case 'generic-html':
    case 'wix-site':
      return () => fetchGenericMenu({ url: p.source.url });
    default:
      return null;
  }
}

async function buildMenus(sources, previous) {
  const prevById = new Map((previous?.results || []).map(r => [r.placeId, r]));
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

    // Places whose menu can't be machine-read: always "ok", just show the link.
    if (p.source?.type === 'link-only') {
      results.push({
        ...base,
        ok: true,
        linkOnly: true,
        raw: { url: p.source.pageUrl || p.source.url, note: p.source.note || null }
      });
      continue;
    }

    const adapter = adapterFor(p);
    if (!adapter) {
      results.push({ ...base, ok: false, error: 'unsupported_source_type', raw: { note: p.source?.note || null } });
      continue;
    }

    console.log(`Fetching ${p.id}...`);
    const out = await runAdapter(p.id, adapter);

    if (out?.ok) {
      results.push({
        ...base,
        ok: true,
        raw: {
          url: out.url || out.postUrl || out.pageUrl || p.source.url || p.source.pageUrl || null,
          pdfUrl: out.pdfUrl || null,
          imageUrl: out.imageUrl || null,
          text: out.text || null,
          ocrText: out.ocrText || null
        }
      });
      continue;
    }

    // Failure: fall back to the previous successful result if it is recent enough.
    const prev = prevById.get(p.id);
    const prevAge = prev?.fetchedAt ? Date.now() - new Date(prev.fetchedAt).getTime() : Infinity;
    if (prev?.ok && !prev.linkOnly && prevAge < STALE_MAX_AGE_MS) {
      console.warn(`  ${p.id}: fetch failed (${out?.error}), reusing previous result from ${prev.fetchedAt}`);
      results.push({ ...prev, source: p.source || prev.source, stale: true, staleError: out?.error || null });
      continue;
    }

    results.push({ ...base, ok: false, error: out?.error || 'unknown_failure', raw: out || null });
  }
  return results;
}

async function main() {
  await ensureDataDir();
  const sources = await loadSources();
  const previous = await loadPrevious();
  const menus = await buildMenus(sources, previous);
  const payload = {
    schema: 1,
    generatedAt: nowIso(),
    sourcesUpdatedAt: sources.updatedAt,
    results: menus
  };
  await fs.writeFile(menusPath, JSON.stringify(payload, null, 2), 'utf8');

  // Also copy to docs/data for GitHub Pages
  await fs.mkdir(docsDataDir, { recursive: true });
  await fs.copyFile(menusPath, path.join(docsDataDir, 'menus.json'));

  const okCount = payload.results.filter(r => r.ok).length;
  const staleCount = payload.results.filter(r => r.stale).length;
  console.log(`Wrote menus.json (${okCount}/${payload.results.length} OK, ${staleCount} stale)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
