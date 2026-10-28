import fetch from 'node-fetch';

// Fetches recent posts from a public Facebook page via the Apify actor
// "apify/facebook-posts-scraper" and extracts the lunch menu:
//   1. A recent text post that looks like a lunch menu is used directly.
//   2. Otherwise image posts are OCR:ed (the menus are usually photos).
// Requires the APIFY_TOKEN environment variable (GitHub Actions secret).

const ACTOR_ENDPOINT = 'https://api.apify.com/v2/acts/apify~facebook-posts-scraper/run-sync-get-dataset-items';

const LUNCH_RE = /(dagens|lunch|meny|veckans|vecka\s*\d)/i;
// Strong menu signal: avoids false positives from posts that merely hashtag #lunch.
const MENU_RE = /(dagens\s*(rätt|lunch)|lunchmeny|veckans\s*(lunch|meny|rätt)|vecka\s*\d|lunch\s*v\.?\s*\d)/i;
const DAY_RE = /(måndag|tisdag|onsdag|torsdag|fredag|lördag|söndag)/i;

function dedupe(arr) {
  return [...new Set(arr)];
}

function postTime(it) {
  const t = it.time || it.timestamp || it.date || it.publishedAt || it.creation_time || null;
  const ms = t ? new Date(t).getTime() : NaN;
  return Number.isFinite(ms) ? ms : 0;
}

function postText(it) {
  return (it.text || it.message || it.caption || '').trim();
}

function postUrl(it, fallback) {
  return it.url || it.postUrl || it.topLevelUrl || fallback;
}

// Deep-walk the item for plausible photo URLs (field names vary between actor versions).
export function collectImageUrls(obj, out = []) {
  if (!obj) return out;
  if (typeof obj === 'string') {
    if (/^https?:\/\//i.test(obj)
        && (/fbcdn/i.test(obj) || /\.(jpe?g|png|webp)(\?|$)/i.test(obj))
        && !/static\.|rsrc|emoji|\/safe_image|profile|avatar/i.test(obj)) {
      out.push(obj);
    }
  } else if (Array.isArray(obj)) {
    for (const v of obj) collectImageUrls(v, out);
  } else if (typeof obj === 'object') {
    for (const v of Object.values(obj)) collectImageUrls(v, out);
  }
  return out;
}

// Pick the best lunch text post, newest first. Exported for tests.
export function pickLunchTextPost(items) {
  for (const it of items) {
    const text = postText(it);
    const dayCount = new Set((text.toLowerCase().match(/(måndag|tisdag|onsdag|torsdag|fredag|lördag|söndag)/g) || [])).size;
    if ((MENU_RE.test(text) && text.length > 30)
        || (LUNCH_RE.test(text) && dayCount >= 3 && text.length > 60)) {
      return it;
    }
  }
  return null;
}

const OCR_TIMEOUT_MS = 60_000;

// Download the image ourselves so we can verify it really is an image before
// handing it to tesseract. Facebook CDN links expire and may answer with HTML,
// which makes tesseract's native reader fail hard (see ocrImage below).
async function downloadImage(imageUrl) {
  const res = await fetch(imageUrl, { redirect: 'follow' });
  if (!res.ok) throw new Error(`image http ${res.status}`);
  const type = (res.headers.get('content-type') || '').toLowerCase();
  if (!/^image\/(jpe?g|png|webp|bmp|gif|tiff?)/.test(type)) {
    throw new Error(`not an image (content-type: ${type || 'unknown'})`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 100) throw new Error(`image too small (${buf.length} bytes)`);
  return buf;
}

async function ocrImage(imageUrl) {
  const buf = await downloadImage(imageUrl);
  const { createWorker } = await import('tesseract.js');

  // tesseract.js reports "Error attempting to read image" as an 'error' event on
  // the worker, not as a rejected recognize() promise. Without an errorHandler
  // that event is rethrown on process.nextTick and kills the whole process.
  let rejectWorker;
  const workerFailed = new Promise((_, reject) => { rejectWorker = reject; });
  const worker = await createWorker('swe', undefined, {
    errorHandler: (err) => rejectWorker(err instanceof Error ? err : new Error(String(err?.message || err)))
  });

  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`ocr timeout after ${OCR_TIMEOUT_MS}ms`)), OCR_TIMEOUT_MS).unref());

  try {
    const { data: { text } } = await Promise.race([worker.recognize(buf), workerFailed, timeout]);
    return (text || '').trim();
  } finally {
    await worker.terminate().catch(() => {});
  }
}

export async function fetchFacebookApifyMenu({ pageUrl, scrapeUrl, token = process.env.APIFY_TOKEN } = {}) {
  if (!token) {
    return { ok: false, error: 'apify_token_missing', pageUrl };
  }

  const res = await fetch(`${ACTOR_ENDPOINT}?token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      startUrls: [{ url: scrapeUrl || pageUrl }],
      resultsLimit: 6,
      onlyPostsNewerThan: '30 days'
    })
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return { ok: false, error: `apify_http_${res.status}: ${body.slice(0, 200)}`, pageUrl };
  }

  const items = await res.json();
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: 'apify_no_posts', pageUrl };
  }

  items.sort((a, b) => postTime(b) - postTime(a));

  // 1) Plain text post that looks like a menu.
  const textPost = pickLunchTextPost(items);
  if (textPost) {
    return {
      ok: true,
      pageUrl,
      postUrl: postUrl(textPost, pageUrl),
      postedAt: postTime(textPost) ? new Date(postTime(textPost)).toISOString() : null,
      text: postText(textPost)
    };
  }

  // 2) OCR images from the newest posts (menus are usually photos).
  const attempts = [];
  for (const it of items.slice(0, 4)) {
    const caption = postText(it);
    const imgs = dedupe(collectImageUrls(it)).slice(0, 2);
    if (imgs.length === 0) continue;

    for (const img of imgs) {
      try {
        const ocr = await ocrImage(img);
        if (ocr.length > 40 && (LUNCH_RE.test(ocr) || DAY_RE.test(ocr) || LUNCH_RE.test(caption))) {
          const combined = [caption, ocr].filter(Boolean).join('\n\n');
          return {
            ok: true,
            pageUrl,
            postUrl: postUrl(it, pageUrl),
            postedAt: postTime(it) ? new Date(postTime(it)).toISOString() : null,
            imageUrl: img,
            ocrText: combined
          };
        }
        attempts.push(`ocr ${img.slice(0, 80)}: no lunch text (${ocr.length} chars)`);
      } catch (err) {
        attempts.push(`ocr ${img.slice(0, 80)}: ${err?.message || err}`);
      }
    }
  }

  return { ok: false, error: 'apify_no_lunch_post_found: ' + attempts.slice(0, 3).join(' | '), pageUrl };
}
