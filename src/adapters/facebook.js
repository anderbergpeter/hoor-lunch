import fetch from 'node-fetch';

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function looksLikeLunch(text) {
  const s = (text || '').toLowerCase();
  return /(lunch|dagens|meny|lunchmeny|veckans|v\.?\s?\d{1,2})/.test(s);
}

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
];

async function tryFetch(url, headers) {
  try {
    const res = await fetch(url, { headers, redirect: 'follow', timeout: 10000 });
    if (!res.ok) return { ok: false, status: res.status };
    const html = await res.text();
    if (/Sorry,\s+something went wrong/i.test(html) || /error facebook/i.test(html)) {
      return { ok: false, status: 'blocked' };
    }
    return { ok: true, html };
  } catch (err) {
    return { ok: false, status: err?.message || String(err) };
  }
}

function normalizeUrl(pageUrl, variant) {
  try {
    const u = new URL(pageUrl);
    u.hostname = variant;
    u.searchParams.delete('locale');
    return u.toString();
  } catch {
    return pageUrl;
  }
}

export async function fetchFacebookMenu({ pageUrl }) {
  // Try multiple Facebook variants (mbasic, m, www, touch)
  const variants = ['mbasic.facebook.com', 'm.facebook.com', 'touch.facebook.com', 'www.facebook.com'];

  for (const variant of variants) {
    const url = normalizeUrl(pageUrl, variant);

    for (const ua of USER_AGENTS) {
      const headers = {
        'user-agent': ua,
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'sv-SE,sv;q=0.9,en;q=0.7',
        'cache-control': 'no-cache',
      };

      const result = await tryFetch(url, headers);
      if (!result.ok) continue;

      const html = result.html;

      // Extract post links from the page
      const links = Array.from(html.matchAll(/href="(\/story\.php\?[^\"]+|\/permalink\.php\?[^\"]+|\/[^\"]*\/posts\/[^\"]+)"/g))
        .map(m => m[1]);

      // Check root page first
      const rootText = stripTags(html);
      if (looksLikeLunch(rootText)) {
        // Try to extract just the relevant part
        const lines = rootText.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
        const body = lines.slice(0, 80).join('\n');
        if (looksLikeLunch(body)) {
          return { ok: true, pageUrl, postUrl: url, text: body };
        }
      }

      // Visit post links looking for lunch content
      const candidates = links.slice(0, 15).map(l => {
        const base = `https://${variant}`;
        return l.startsWith('http') ? l : base + l.replace(/&amp;/g, '&');
      });

      for (const c of candidates) {
        const postResult = await tryFetch(c, headers);
        if (!postResult.ok) continue;

        const text = stripTags(postResult.html);
        const lines = text.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
        const body = lines.slice(0, 80).join('\n');

        if (looksLikeLunch(body)) {
          return { ok: true, pageUrl, postUrl: c, text: body };
        }
      }
    }
  }

  return { ok: false, error: 'facebook_all_attempts_failed', pageUrl };
}
