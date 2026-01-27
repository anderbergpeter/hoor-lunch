import fetch from 'node-fetch';

function stripTagsKeepLines(html) {
  const withBreaks = html
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/p\s*>/gi, '\n')
    .replace(/<\s*\/h\d\s*>/gi, '\n');
  return withBreaks
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\r/g, '')
    .split('\n')
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function extractDagensRatt(text) {
  const lines = text.split('\n');
  const startIdx = lines.findIndex(l => /dagens\s*r(ä|a)tt/i.test(l));
  if (startIdx === -1) return null;
  // take next ~20 lines
  return lines.slice(startIdx, Math.min(lines.length, startIdx + 25)).join('\n');
}

export async function fetchRalsenMenu({ url = 'https://www.caferalsen.se/var-meny/' } = {}) {
  const res = await fetch(url, {
    headers: { 'user-agent': 'hoor-lunch/0.0.1 (+local)' }
  });
  if (!res.ok) return { ok: false, error: `page_fetch_failed:${res.status}`, url };
  const html = await res.text();
  const text = stripTagsKeepLines(html);
  const block = extractDagensRatt(text);
  if (!block) return { ok: false, error: 'dagens_ratt_not_found', url };
  return { ok: true, url, text: block };
}
