import fetch from 'node-fetch';

function stripTags(html) {
  // Remove Divi/WP shortcodes like [et_pb_*, ...]
  let cleaned = html.replace(/\[[^\]]*\]/g, ' ');

  return cleaned
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
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
    .replace(/&#8221;/g, '"')
    .replace(/&#8220;/g, '"')
    .replace(/&#8243;/g, '"')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function extractLunchBlock(text) {
  const lower = text.toLowerCase();
  const idx = lower.search(/lunch|dagens/);
  if (idx === -1) return text.slice(0, 2000);
  return text.slice(Math.max(0, idx - 20), Math.min(text.length, idx + 1500)).trim();
}

export async function fetchWpApiMenu({ url, slug = 'meny' }) {
  try {
    const apiUrl = `${url}?per_page=50&_fields=slug,title,content`;
    const res = await fetch(apiUrl, {
      headers: { 'user-agent': 'hoor-lunch/0.1 (+local)' }
    });
    if (!res.ok) return { ok: false, error: `wp_api_failed:${res.status}`, url };
    const pages = await res.json();

    // Find the target page
    let page = pages.find(p => p.slug === slug);
    if (!page) {
      page = pages.find(p => {
        const content = (p.content?.rendered || '').toLowerCase();
        return content.includes('lunch') || content.includes('meny');
      });
    }
    if (!page) return { ok: false, error: 'page_not_found', url };

    const html = page.content?.rendered || '';
    const text = stripTags(html);
    const lunch = extractLunchBlock(text);
    if (!lunch) return { ok: false, error: 'no_menu_content', url };

    return { ok: true, url, text: lunch };
  } catch (err) {
    return { ok: false, error: err?.message || String(err), url };
  }
}
