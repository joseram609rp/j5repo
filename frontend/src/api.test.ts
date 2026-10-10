import { afterEach, expect, it, vi } from 'vitest';
import { api, onBackendSuccess } from './api';
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it('does not retry unsafe mutations or version conflicts', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ code: 'BUSY' }, { status: 503 })); vi.stubGlobal('fetch', fetch);
  await expect(api('/customers', { method: 'POST' })).rejects.toMatchObject({ status: 503 }); expect(fetch).toHaveBeenCalledTimes(1);
  fetch.mockResolvedValue(Response.json({ code: 'CONFLICT' }, { status: 412 }));
  await expect(api('/orders/1', { method: 'PUT', headers: { 'Idempotency-Key': 'key' } })).rejects.toMatchObject({ status: 412 }); expect(fetch).toHaveBeenCalledTimes(2);
});
it('honors Retry-After and preserves write identity', async () => {
  vi.useFakeTimers(); const fetch = vi.fn().mockResolvedValueOnce(Response.json({}, { status: 503, headers: { 'Retry-After': '6' } })).mockResolvedValueOnce(Response.json({ ok: true })); vi.stubGlobal('fetch', fetch);
  const promise = api('/orders/1', { method: 'PUT', headers: { 'Idempotency-Key': 'same-key' }, body: '{}' });
  await vi.advanceTimersByTimeAsync(5999); expect(fetch).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1000); expect(await promise).toEqual({ ok: true });
  expect(fetch.mock.calls[1]?.[1].headers.get('Idempotency-Key')).toBe('same-key');
});

it('reports recovery only after successful parsed responses', async () => {
  const recovered = vi.fn(); const stop = onBackendSuccess(recovered);
  try {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({}, {status:401}))
      .mockResolvedValueOnce(new Response('invalid')).mockResolvedValueOnce(Response.json({orders:[]})));
    await expect(api('/auth/me')).rejects.toMatchObject({status:401});
    await expect(api('/health')).rejects.toThrow();
    expect(recovered).not.toHaveBeenCalled();
    await api('/orders?status=OPEN'); expect(recovered).toHaveBeenCalledTimes(1);
  } finally { stop(); }
});

it.each(['network','503'])('catalog retries transient %s and succeeds',async kind=>{
 vi.useFakeTimers();const fetch=vi.fn();if(kind==='network')fetch.mockRejectedValueOnce(new TypeError('offline'));else fetch.mockResolvedValueOnce(Response.json({}, {status:503,headers:{'Retry-After':'2'}}));fetch.mockResolvedValue(Response.json({makes:[]}));vi.stubGlobal('fetch',fetch);
 const promise=api('/vehicle-catalog');await vi.advanceTimersByTimeAsync(2500);expect(await promise).toEqual({makes:[]});expect(fetch).toHaveBeenCalledTimes(2);
});
it('catalog bounds retries and never retries authentication or missing endpoint',async()=>{
 vi.useFakeTimers();const fetch=vi.fn().mockResolvedValue(Response.json({}, {status:503}));vi.stubGlobal('fetch',fetch);
 const result=api('/vehicle-catalog').catch(e=>e);await vi.advanceTimersByTimeAsync(30000);expect(await result).toMatchObject({status:503});expect(fetch).toHaveBeenCalledTimes(4);
 for(const status of [400,401,403,404]) {fetch.mockClear().mockResolvedValue(Response.json({}, {status}));await expect(api('/vehicle-catalog')).rejects.toMatchObject({status});expect(fetch).toHaveBeenCalledTimes(1);}
});

it('allows a catalog request to complete SQL retries beyond six seconds',async()=>{
 vi.useFakeTimers();const fetch=vi.fn((_url:string,_options:RequestInit)=>new Promise(resolve=>setTimeout(()=>resolve(Response.json({version:1,makes:[]})),16000)));vi.stubGlobal('fetch',fetch);
 const request=api('/vehicle-catalog');await vi.advanceTimersByTimeAsync(16000);
 expect(await request).toEqual({version:1,makes:[]});expect(fetch).toHaveBeenCalledTimes(1);
 const signal=fetch.mock.calls[0]?.[1]?.signal;expect(signal?.aborted).not.toBe(true);
});

it('login retries unavailable service for a full minute with unchanged credentials, then reports an outage',async()=>{
 vi.useFakeTimers();const fetch=vi.fn().mockResolvedValue(Response.json({code:'SQL_UNAVAILABLE'},{status:503}));vi.stubGlobal('fetch',fetch);
 const body=JSON.stringify({username:'fixture',password:'fixture-password'});
 const request=api('/auth/login',{method:'POST',body}).catch(error=>error);
 await vi.advanceTimersByTimeAsync(59999);expect(fetch).toHaveBeenCalledTimes(7);
 await vi.advanceTimersByTimeAsync(1);expect(await request).toMatchObject({status:503,code:'LOGIN_SERVICE_UNAVAILABLE'});
 expect(fetch.mock.calls.every(c=>c[1].body===body)).toBe(true);
});
it('login succeeds after SQL resumes without requiring another submit',async()=>{
 vi.useFakeTimers();let started=Date.now();const fetch=vi.fn().mockImplementation(async()=>Date.now()-started<45000?Response.json({code:'SQL_UNAVAILABLE'},{status:503}):Response.json({userId:'fixture'}));vi.stubGlobal('fetch',fetch);
 const request=api('/auth/login',{method:'POST',body:'credentials'});
 await vi.advanceTimersByTimeAsync(45000);expect(await request).toEqual({userId:'fixture'});
});
it.each([400,401,403,429])('login never retries rejected credentials or security response %s',async status=>{
 const fetch=vi.fn().mockResolvedValue(Response.json({code:'REJECTED'},{status}));vi.stubGlobal('fetch',fetch);
 await expect(api('/auth/login',{method:'POST'})).rejects.toMatchObject({status});expect(fetch).toHaveBeenCalledTimes(1);
});
it('login caps Retry-After at the minute deadline',async()=>{
 vi.useFakeTimers();const fetch=vi.fn().mockResolvedValue(Response.json({}, {status:503,headers:{'Retry-After':'120'}}));vi.stubGlobal('fetch',fetch);
 const request=api('/auth/login',{method:'POST'}).catch(e=>e);await vi.advanceTimersByTimeAsync(60000);
 expect(await request).toMatchObject({code:'LOGIN_SERVICE_UNAVAILABLE'});expect(fetch).toHaveBeenCalledTimes(1);
});

it('login retries network failures and keeps the original credential body',async()=>{
 vi.useFakeTimers();const fetch=vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockResolvedValue(Response.json({userId:'fixture'}));vi.stubGlobal('fetch',fetch);
 const request=api('/auth/login',{method:'POST',body:'same-credentials'});await vi.advanceTimersByTimeAsync(5000);
 expect(await request).toEqual({userId:'fixture'});expect(fetch).toHaveBeenCalledTimes(2);expect(fetch.mock.calls[1]![1].body).toBe('same-credentials');
});
