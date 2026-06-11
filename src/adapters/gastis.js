import fetch from 'node-fetch';

// Höörs Gästis publishes the weekly lunch as an uploaded PDF in WordPress.
// The lunch page only shows a small generated thumbnail (e.g. "...-pdf-300x300.jpg"),
// which is useless for OCR. Strategy, in order of reliability:
//   1. Find/derive the original PDF and extract its embedded text (no OCR needed).
//   2. OCR the full-size image (thumbnail URL with the "-WxH" suffix stripped).
//   3. OCR the thumbnail as a last resort.

const UA = 'Mozilla/5.0 (compatible; hoor-lunch/1.0)';
const WEEKDAY_RE = /(MÅNDAG|TISDAG|ONSDAG|TORSDAG|FREDAG|LÖRDAG|SÖNDAG)/i;

function isoWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function dedupe(arr) {
  return [...new Set(arr)];
}

// Sort candidates: current week number in filename first, then newest upload folder.
export function sortCandidates(urls, week = isoWeek()) {
  const weekRe = new RegExp(`v[.\\-_ ]?0?${week}(?![0-9])`, 'i');
  return urls.slice().sort((a, b) => {
    const aw = weekRe.test(a) ? 1 : 0;
    const bw = weekRe.test(b) ? 1 : 0;
    if (aw !== bw) return bw - aw;
    const am = (a.match(/\/(\d{4})\/(\d{2})\//) || []).slice(1).join('');
    const bm = (b.match(/\/(\d{4})\/(\d{2})\//) || []).slice(1).join('');
    if (am !== bm) return bm.localeCompare(am);
    const al = /dagens|lunch/i.test(a) ? 1 : 0;
    const bl = /dagens|lunch/i.test(b) ? 1 : 0;
    return bl - al;
  });
}

// Extract candidate menu PDF and image URLs from the lunch page HTML.
export function findCandidates(html) {
  const pdfUrls = (html.match(/https?:\/\/hoorsgastis\.se\/wp-content\/uploads\/[^"'\s>]+\.pdf/ig) || [])
    // Static documents like the privacy policy live in old upload folders – skip them.
    .filter(u => !/personuppgift|policy|kamerabevakning/i.test(u));

  const imgUrls = (html.match(/https?:\/\/hoorsgastis\.se\/wp-content\/uploads\/\d{4}\/\d{2}\/[^"'\s>]+\.(?:jpe?g|png|webp)/ig) || []);

  // WordPress names PDF thumbnails "<pdfname>-pdf-<W>x<H>.<ext>" – derive the original PDF.
  for (const img of imgUrls) {
    const m = img.match(/^(.*)-pdf(?:-\d+x\d+)?\.(?:jpe?g|png|webp)$/i);
    if (m) pdfUrls.push(`${m[1]}.pdf`);
  }

  // Full-size images: strip the "-WxH" thumbnail suffix.
  const fullImgs = imgUrls.map(u => u.replace(/-\d+x\d+(\.(?:jpe?g|png|webp))$/i, '$1'));

  return {
    pdfUrls: sortCandidates(dedupe(pdfUrls)),
    imageUrls: sortCandidates(dedupe([...fullImgs, ...imgUrls]))
  };
}

async function extractPdfText(buffer) {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  let fullText = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // Insert newlines when the y-position changes so the day lines stay separated.
    let lastY = null;
    let pageText = '';
    for (const item of content.items) {
      const y = item.transform ? item.transform[5] : null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) pageText += '\n';
      else if (pageText && !pageText.endsWith('\n')) pageText += ' ';
      pageText += item.str;
      if (y !== null) lastY = y;
    }
    fullText += pageText + '\n';
  }
  return fullText.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

async function ocrImage(imageUrl) {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('swe');
  try {
    const { data: { text } } = await worker.recognize(imageUrl);
    return (text || '').trim();
  } finally {
    await worker.terminate();
  }
}

export async function fetchGastisMenu({ pageUrl = 'https://hoorsgastis.se/restaurang/lunch/' } = {}) {
  const pageRes = await fetch(pageUrl, { headers: { 'user-agent': UA } });
  if (!pageRes.ok) {
    return { ok: false, error: `page_fetch_failed:${pageRes.status}`, pageUrl };
  }
  const html = await pageRes.text();
  const { pdfUrls, imageUrls } = findCandidates(html);

  if (pdfUrls.length === 0 && imageUrls.length === 0) {
    return { ok: false, error: 'no_menu_candidates_found', pageUrl };
  }

  const attempts = [];

  // 1) PDF text extraction (most reliable – the menu PDF contains real text).
  for (const pdfUrl of pdfUrls.slice(0, 3)) {
    try {
      const res = await fetch(pdfUrl, { headers: { 'user-agent': UA } });
      if (!res.ok) { attempts.push(`pdf ${pdfUrl}: http ${res.status}`); continue; }
      const text = await extractPdfText(await res.arrayBuffer());
      if (text.length > 50 && WEEKDAY_RE.test(text)) {
        return { ok: true, pageUrl, pdfUrl, text };
      }
      attempts.push(`pdf ${pdfUrl}: no weekday text (${text.length} chars)`);
    } catch (err) {
      attempts.push(`pdf ${pdfUrl}: ${err?.message || err}`);
    }
  }

  // 2) OCR on images (full-size versions are sorted before thumbnails).
  let bestOcr = null;
  for (const imageUrl of imageUrls.slice(0, 3)) {
    try {
      const text = await ocrImage(imageUrl);
      if (text.length > 50 && WEEKDAY_RE.test(text)) {
        const dayHits = (text.match(/(MÅNDAG|TISDAG|ONSDAG|TORSDAG|FREDAG|LÖRDAG|SÖNDAG)\s*:/gi) || []).length;
        if (!bestOcr || dayHits > bestOcr.dayHits) {
          bestOcr = { imageUrl, text, dayHits };
        }
        // A menu with 4+ recognized day headers is good enough – stop early.
        if (dayHits >= 4) break;
      } else {
        attempts.push(`ocr ${imageUrl}: no weekday text (${text.length} chars)`);
      }
    } catch (err) {
      attempts.push(`ocr ${imageUrl}: ${err?.message || err}`);
    }
  }

  if (bestOcr) {
    return { ok: true, pageUrl, imageUrl: bestOcr.imageUrl, ocrText: bestOcr.text };
  }

  return { ok: false, error: 'all_candidates_failed: ' + attempts.slice(0, 5).join(' | '), pageUrl };
}
