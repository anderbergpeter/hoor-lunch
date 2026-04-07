import fetch from 'node-fetch';

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/h\d>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&ouml;/g, 'ö')
    .replace(/&auml;/g, 'ä')
    .replace(/&aring;/g, 'å')
    .replace(/&#8211;/g, '–')
    .replace(/&#8217;/g, "'")
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export async function fetchGenericMenu({ url }) {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'hoor-lunch/0.1 (+local)' }
    });
    if (!res.ok) return { ok: false, error: `page_fetch_failed:${res.status}`, url };
    const html = await res.text();
    const text = stripTags(html);

    // Try to find lunch/meny section
    const lower = text.toLowerCase();
    const idx = lower.search(/lunch|meny|dagens|husman|matlista/);
    let block;
    if (idx !== -1) {
      block = text.slice(Math.max(0, idx - 50), Math.min(text.length, idx + 2000)).trim();
    } else {
      // Fallback: take a chunk of the body
      block = text.slice(0, 2000).trim();
    }

    if (!block || block.length < 20) {
      return { ok: false, error: 'no_content_found', url };
    }

    return { ok: true, url, text: block };
  } catch (err) {
    return { ok: false, error: err?.message || String(err), url };
  }
}
