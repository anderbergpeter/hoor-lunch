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
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // Prefer the explicit daily header used on the page.
  let startIdx = lines.findIndex(l => /^DAGENS\s*R(Ä|A)TT\s*-\s*/i.test(l));

  // Fallback: find the "Dagens Rätt" section and then the next daily header beneath it.
  if (startIdx === -1) {
    const sectionIdx = lines.findIndex(l => /^Dagens\s*R(Ä|A)tt\b/i.test(l));
    if (sectionIdx !== -1) {
      const window = lines.slice(sectionIdx, sectionIdx + 30);
      const rel = window.findIndex(l => /^DAGENS\s*R(Ä|A)TT\s*-\s*/i.test(l));
      if (rel !== -1) startIdx = sectionIdx + rel;
      else startIdx = sectionIdx;
    }
  }

  if (startIdx === -1) return null;

  // Take the header + a few descriptive lines; stop early if we hit the next big section.
  const out = [];
  for (const l of lines.slice(startIdx, startIdx + 12)) {
    if (/^Populära\b/i.test(l) || /^VARMA\s+R(Ä|A)TTER/i.test(l) || /^Baguetter/i.test(l)) break;
    out.push(l);
  }
  return out.join('\n').trim() || null;
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
