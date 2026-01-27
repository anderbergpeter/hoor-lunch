import fetch from 'node-fetch';
import { createWorker } from 'tesseract.js';

function pickMenuImageUrl(html) {
  // Look for JPG/JPEG in WordPress uploads.
  const re = /https:\/\/hoorsgastis\.se\/wp-content\/uploads\/\d{4}\/\d{2}\/[^"'\s>]+\.(?:jpe?g)/ig;
  const m = (html.match(re) || []).map(s => s.trim());
  if (m.length === 0) return null;

  // Heuristics:
  // - Prefer current-year uploads (menus are typically posted like /2026/01/IMG_....jpeg)
  // - Prefer filenames containing IMG_ (camera uploads)
  const prefer = m.filter(u => /\/2026\//.test(u) && /IMG_/i.test(u));
  if (prefer.length > 0) return prefer[0];

  const yearPrefer = m.filter(u => /\/2026\//.test(u));
  if (yearPrefer.length > 0) return yearPrefer[0];

  // Fallback: pick the last match (often the content image rather than header assets)
  return m[m.length - 1];
}

export async function fetchGastisMenu({ pageUrl = 'https://hoorsgastis.se/restaurang/lunch/' } = {}) {
  const pageRes = await fetch(pageUrl, {
    headers: {
      'user-agent': 'hoor-lunch/0.0.1 (+local)'
    }
  });
  if (!pageRes.ok) {
    return { ok: false, error: `page_fetch_failed:${pageRes.status}` };
  }
  const html = await pageRes.text();
  const imageUrl = pickMenuImageUrl(html);
  if (!imageUrl) {
    return { ok: false, error: 'no_menu_image_found', pageUrl };
  }

  // OCR
  const worker = await createWorker('swe');
  try {
    const {
      data: { text }
    } = await worker.recognize(imageUrl);

    return {
      ok: true,
      pageUrl,
      imageUrl,
      ocrText: (text || '').trim()
    };
  } finally {
    await worker.terminate();
  }
}
