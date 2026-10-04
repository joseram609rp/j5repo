import { app } from '@azure/functions';
import { createApi } from './api.js';
const api = createApi({ demo: false });
app.http('api', {
  route: '{*path}', methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], authLevel: 'anonymous',
  handler: async request => {
    const response = await api(new Request(request.url, { method: request.method, headers: Object.fromEntries(request.headers), body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.text() }));
    return { status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() };
  }
});
