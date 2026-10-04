import { createServer } from 'node:http';
import { createApi } from './api.js';
if (process.env.WEBSITE_INSTANCE_ID) throw new Error('Use the Functions host in Azure');
const api = createApi();
createServer(async (req, res) => {
  const controller = new AbortController();
  req.on('aborted', () => controller.abort());
  res.on('close', () => { if (!res.writableEnded) controller.abort(); });
  try {
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 32000) { res.writeHead(413); res.end(); return; }
      chunks.push(chunk);
    }
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(',') : value);
    const result = await api(new Request('http://localhost:7071' + req.url, { method: req.method, headers, signal: controller.signal,
      body: ['GET', 'HEAD'].includes(req.method ?? 'GET') ? undefined : Buffer.concat(chunks) }));
    res.writeHead(result.status, Object.fromEntries(result.headers)); res.end(await result.text());
  } catch { if (!res.headersSent) res.writeHead(500); res.end(); }
}).listen(7071, '127.0.0.1', () => console.log('API SQL local: http://127.0.0.1:7071'));
