import { createServer } from 'node:http';
import { createApi } from './api.js';
if (process.env.NODE_ENV === 'production' || process.env.WEBSITE_INSTANCE_ID) throw new Error('Local demo cannot run in Azure/production');
const api = createApi({ demo: true });
createServer(async (req, res) => {
  try {
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 32000) { res.writeHead(413); res.end(); return; }
      chunks.push(chunk);
    }
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(',') : value);
    const result = await api(new Request(`http://localhost:7071${req.url}`, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method ?? 'GET') ? undefined : Buffer.concat(chunks) }));
    res.writeHead(result.status, Object.fromEntries(result.headers)); res.end(await result.text());
  } catch { res.writeHead(500); res.end(); }
}).listen(7071, '127.0.0.1', () => console.log('API local de demostración: http://127.0.0.1:7071'));
