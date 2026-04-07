import fetch from 'node-fetch';

export async function fetchEatsmartMenu({ restaurantUid }) {
  try {
    const url = `https://www.eatsmart.se/api/restaurant/${restaurantUid}/menu`;
    const res = await fetch(url, {
      headers: {
        'user-agent': 'hoor-lunch/0.1 (+local)',
        'accept': 'application/json'
      }
    });
    if (!res.ok) return { ok: false, error: `eatsmart_api_failed:${res.status}`, url };

    const data = await res.json();

    // Extract categories and items into readable text
    const lines = [];
    const categories = data.categories || data.menu?.categories || [];
    const items = data.items || data.menu?.items || [];

    if (Array.isArray(categories) && categories.length > 0) {
      for (const cat of categories) {
        lines.push(`\n--- ${cat.name || cat.title || 'Kategori'} ---`);
        const catItems = (cat.items || items.filter(i => i.categoryId === cat.id) || []);
        for (const item of catItems.slice(0, 30)) {
          const name = item.name || item.title || '';
          const desc = item.description || '';
          const price = item.price || item.basePrice || '';
          lines.push(`${name}${price ? ' – ' + price + ' kr' : ''}${desc ? '\n  ' + desc : ''}`);
        }
      }
    } else if (Array.isArray(items) && items.length > 0) {
      for (const item of items.slice(0, 50)) {
        const name = item.name || item.title || '';
        const desc = item.description || '';
        const price = item.price || item.basePrice || '';
        lines.push(`${name}${price ? ' – ' + price + ' kr' : ''}${desc ? '\n  ' + desc : ''}`);
      }
    } else {
      // Fallback: stringify what we got
      const text = JSON.stringify(data).slice(0, 2500);
      return { ok: true, url, text, note: 'raw_json_fallback' };
    }

    return { ok: true, url, text: lines.join('\n').trim() };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}
