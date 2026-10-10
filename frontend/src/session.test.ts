// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest';
import { trackActivity } from './session';
import { api } from './api';
vi.mock('./api',()=>({api:vi.fn()}));
it('focus/visibility and background GET polling never extend the two-hour idle session',async()=>{
 vi.useFakeTimers();const now=Date.now(),expired=vi.fn();vi.mocked(api).mockResolvedValue({});
 const stop=trackActivity({userId:'u',csrf:'csrf',lastActivity:now,idleMs:7200000},expired);
 try {
  for(let i=0;i<3;i++) { window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));await api('/orders/id');await vi.advanceTimersByTimeAsync(30000); }
  expect(vi.mocked(api).mock.calls.every(([path])=>path==='/orders/id')).toBe(true);
  await vi.advanceTimersByTimeAsync(7200000-90000);expect(expired).toHaveBeenCalledTimes(1);
 } finally {stop();vi.useRealTimers();vi.clearAllMocks();}
});
