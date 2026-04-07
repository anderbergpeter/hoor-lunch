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

function findPdfLink(html) {
  // Look for links to PDF files containing "lunch" in the URL or link text
  const re = /href="([^"]*\.pdf)"/gi;
  let match;
  while ((match = re.exec(html))) {
    const url = match[1];
    if (/lunch/i.test(url)) return url;
  }
  // Fallback: any PDF in wp-content/uploads
  re.lastIndex = 0;
  while ((match = re.exec(html))) {
    const url = match[1];
    if (/wp-content\/uploads/i.test(url)) return url;
  }
  return null;
}

export async function fetchElisefarmMenu({ url = 'https://elisefarm.se/restaurang/' } = {}) {
  try {
    // Step 1: Fetch the restaurang page to find the current PDF link
    const pageRes = await fetch(url, {
      headers: { 'user-agent': 'hoor-lunch/0.1 (+local)' },
      redirect: 'follow'
    });

    if (!pageRes.ok) {
      return { ok: false, error: `page_fetch_failed:${pageRes.status}`, url };
    }

    const html = await pageRes.text();
    const pdfLink = findPdfLink(html);

    if (!pdfLink) {
      return { ok: false, error: 'no_pdf_link_found', url };
    }

    // Make absolute URL if relative
    const pdfUrl = pdfLink.startsWith('http') ? pdfLink : new URL(pdfLink, url).toString();

    // Step 2: Download and parse the PDF
    const pdfRes = await fetch(pdfUrl, {
      headers: { 'user-agent': 'hoor-lunch/0.1 (+local)' }
    });

    if (!pdfRes.ok) {
      return { ok: false, error: `pdf_fetch_failed:${pdfRes.status}`, url: pdfUrl };
    }

    const buffer = await pdfRes.arrayBuffer();
    const text = await extractPdfText(buffer);

    if (text.length > 30) {
      return { ok: true, url: pdfUrl, pageUrl: url, text };
    }

    return { ok: false, error: 'pdf_empty', url: pdfUrl };
  } catch (err) {
    return { ok: false, error: err?.message || String(err), url };
  }
}
