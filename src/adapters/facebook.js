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

function normalizeToMbasic(url) {
  try {
    const u = new URL(url);
    // prefer mbasic (most parseable)
    u.hostname = 'mbasic.facebook.com';
    // strip locale to reduce variants
    u.searchParams.delete('locale');
    return u.toString();
  } catch {
    return url;
  }
}

export async function fetchFacebookMenu({ pageUrl }) {
  const url = normalizeToMbasic(pageUrl);
  const headers = {
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'sv-SE,sv;q=0.9,en;q=0.7',
  };

  try {
    // First try the page root
    const res = await fetch(url, { headers, redirect: 'follow' });
    const html = await res.text();

    if (!res.ok) {
      return { ok: false, error: `facebook_http_${res.status}`, pageUrl: url };
    }

    // Facebook often blocks automated requests with a generic "Sorry" page.
    if (/Sorry,\s+something went wrong/i.test(html) || /error facebook/i.test(html)) {
      return { ok: false, error: 'facebook_blocked', pageUrl: url };
    }

    // Extract candidate post links; mbasic uses /story.php?story_fbid=... or /permalink.php
    const links = Array.from(html.matchAll(/href="(\/story\.php\?[^\"]+|\/permalink\.php\?[^\"]+)"/g)).map(m => m[1]);

    // Also try "posts" tab if available
    const postsTab = (html.match(/href="(\/[^\"]+\/?\?v=timeline[^\"]*)"/i) || [])[1];

    const candidates = [];
    for (const l of links.slice(0, 25)) candidates.push('https://mbasic.facebook.com' + l.replace(/&amp;/g, '&'));
    if (postsTab) candidates.unshift('https://mbasic.facebook.com' + postsTab.replace(/&amp;/g, '&'));

    // Visit candidates and look for lunch/menu text.
    for (const c of candidates.slice(0, 12)) {
      let r;
      try {
        r = await fetch(c, { headers, redirect: 'follow' });
      } catch {
        continue;
      }
      const h = await r.text();
      if (!r.ok) continue;
      if (/Sorry,\s+something went wrong/i.test(h) || /error facebook/i.test(h)) continue;

      const text = stripTags(h);
      // Keep only somewhat short-ish excerpt to avoid dumping entire page chrome.
      const lines = text.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
      const body = lines.slice(0, 80).join('\n');

      if (looksLikeLunch(body)) {
        return {
          ok: true,
          pageUrl: url,
          postUrl: c,
          text: body
        };
      }
    }

    // Fallback: strip the root page.
    const rootText = stripTags(html);
    if (looksLikeLunch(rootText)) {
      return { ok: true, pageUrl: url, postUrl: url, text: rootText.slice(0, 2500) };
    }

    return { ok: false, error: 'facebook_no_menu_found', pageUrl: url };
  } catch (err) {
    return { ok: false, error: err?.message || String(err), pageUrl: url };
  }
}
