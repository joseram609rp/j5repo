import {afterEach,expect,it,vi} from 'vitest';
afterEach(()=>{vi.unstubAllGlobals();vi.resetModules();vi.useRealTimers();});
it('detects a waiting update and activates it only after the explicit apply call',async()=>{
 const worker={postMessage:vi.fn()};const registration=Object.assign(new EventTarget(),{waiting:worker,installing:null,update:vi.fn(async()=>{})});
 const service=Object.assign(new EventTarget(),{controller:{},register:vi.fn(async()=>registration)});
 const reload=vi.fn();const view=Object.assign(new EventTarget(),{location:{reload}});
 vi.stubGlobal('navigator',{serviceWorker:service});vi.stubGlobal('window',view);
 const module=await import('./pwa-update');const notified=vi.fn();const stop=module.onUpdateAvailable(notified);
 await module.registerAppUpdates();expect(notified).toHaveBeenCalledTimes(1);expect(module.updateAvailable()).toBe(true);expect(worker.postMessage).not.toHaveBeenCalled();
 worker.postMessage.mockImplementation(()=>service.dispatchEvent(new Event('controllerchange')));
 await module.applyUpdate();expect(worker.postMessage).toHaveBeenCalledWith({type:'SKIP_WAITING'});expect(reload).toHaveBeenCalledTimes(1);
 view.dispatchEvent(new Event('focus'));expect(registration.update).toHaveBeenCalledTimes(1);stop();
});
it('does not announce first installation or block the app when service workers are unavailable',async()=>{
 vi.stubGlobal('navigator',{});const module=await import('./pwa-update');await module.registerAppUpdates();expect(module.updateAvailable()).toBe(false);
 const registration=Object.assign(new EventTarget(),{waiting:{postMessage:vi.fn()},installing:null,update:vi.fn()});
 vi.stubGlobal('navigator',{serviceWorker:{controller:null,register:vi.fn(async()=>registration)}});vi.stubGlobal('window',new EventTarget());
 await module.registerAppUpdates();expect(module.updateAvailable()).toBe(false);
});
