import fetch from 'node-fetch';

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/h\d>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&ouml;/g, 'ö')
    .replace(/&auml;/g, 'ä')
    .replace(/&aring;/g, 'å')
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function extractLunch(text) {
  const lower = text.toLowerCase();
  const idx = lower.search(/lunch\s*erbjudande|lunch\s*meny|lunchmeny|lunch\b/);
  if (idx === -1) return null;
  // Take a window from lunch section
  const window = text.slice(idx, Math.min(text.length, idx + 1200));
  return window.trim();
}

export async function fetchKretaMenu({ url = 'https://pizzeriakreta.se/meny/' } = {}) {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'hoor-lunch/0.1 (+local)' }
    });
    if (!res.ok) return { ok: false, error: `page_fetch_failed:${res.status}`, url };
    const html = await res.text();
    const text = stripTags(html);
    const lunch = extractLunch(text);
    if (!lunch) return { ok: false, error: 'lunch_section_not_found', url };
    return { ok: true, url, text: lunch };
  } catch (err) {
    return { ok: false, error: err?.message || String(err), url };
  }
}
