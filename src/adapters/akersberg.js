import fetch from 'node-fetch';

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&ouml;/g, 'ö')
    .replace(/&auml;/g, 'ä')
    .replace(/&aring;/g, 'å')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractLunchBlock(text) {
  // Heuristic: find "Lunch"/"Lunchmeny" and take a window.
  const idx = text.toLowerCase().search(/lunchmeny|lunch meny|lunch v\.?\s*\d+|lunch\s*v\.?\s*\d+/i);
  if (idx === -1) return null;
  const window = text.slice(idx, Math.min(text.length, idx + 1800));
  return window;
}

export async function fetchAkersbergMenu({ url = 'https://akersberg.se/mat-dryck/' } = {}) {
  const res = await fetch(url, {
    headers: { 'user-agent': 'hoor-lunch/0.0.1 (+local)' }
  });
  if (!res.ok) return { ok: false, error: `page_fetch_failed:${res.status}`, url };
  const html = await res.text();
  const text = stripTags(html);
  const lunchBlock = extractLunchBlock(text);
  if (!lunchBlock) return { ok: false, error: 'lunch_block_not_found', url };
  return { ok: true, url, text: lunchBlock };
}
