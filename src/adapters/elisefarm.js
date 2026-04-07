import fetch from 'node-fetch';

export async function fetchElisefarmMenu({ url = 'https://elisefarm.se/restaurang/lunch/' } = {}) {
  try {
    // Try the restaurang page for text content
    const pageRes = await fetch('https://elisefarm.se/restaurang/', {
      headers: { 'user-agent': 'hoor-lunch/0.1 (+local)' },
      redirect: 'follow'
    });

    if (pageRes.ok) {
      const html = await pageRes.text();
      const stripped = html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<br\s*\/?\s*>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim();

      const lower = stripped.toLowerCase();
      const idx = lower.search(/lunch|dagens|business/);
      if (idx !== -1) {
        const block = stripped.slice(idx, idx + 1500).trim();
        if (block.length > 30) {
          return { ok: true, url: 'https://elisefarm.se/restaurang/', text: block };
        }
      }
    }

    // If we can't find text, note it's a PDF
    return {
      ok: false,
      error: 'pdf_menu_only',
      url,
      note: 'Menyn finns som PDF/bild på elisefarm.se/restaurang/lunch/'
    };
  } catch (err) {
    return { ok: false, error: err?.message || String(err), url };
  }
}
