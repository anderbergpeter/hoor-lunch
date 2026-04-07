import fetch from 'node-fetch';

async function extractPdfText(buffer) {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(buffer);
  const doc = await pdfjsLib.getDocument({ data }).promise;
  let fullText = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(' ');
    fullText += pageText + '\n';
  }
  return fullText.trim();
}

export async function fetchElisefarmMenu({ url = 'https://elisefarm.se/restaurang/lunch/' } = {}) {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'hoor-lunch/0.1 (+local)' },
      redirect: 'follow'
    });

    if (!res.ok) {
      return { ok: false, error: `fetch_failed:${res.status}`, url };
    }

    const contentType = res.headers.get('content-type') || '';

    if (contentType.includes('pdf')) {
      const buffer = await res.arrayBuffer();
      const text = await extractPdfText(buffer);
      if (text.length > 30) {
        return { ok: true, url, text };
      }
      return { ok: false, error: 'pdf_empty', url };
    }

    return { ok: false, error: 'not_a_pdf', url };
  } catch (err) {
    return { ok: false, error: err?.message || String(err), url };
  }
}
