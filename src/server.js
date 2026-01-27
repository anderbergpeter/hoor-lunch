import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3030;

app.disable('x-powered-by');

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/data', express.static(path.join(__dirname, '..', 'data'), {
  etag: true,
  maxAge: '60s'
}));

app.use('/', express.static(path.join(__dirname, '..', 'web')));

app.listen(PORT, () => {
  console.log(`hoor-lunch listening on http://127.0.0.1:${PORT}`);
});
