let apply: (()=>Promise<void>) | undefined;
const listeners=new Set<()=>void>();
export function announceUpdate(update:()=>Promise<void>) { apply=update; for(const listener of listeners)listener(); }
export const updateAvailable=()=>!!apply;
export function onUpdateAvailable(listener:()=>void) { listeners.add(listener);return ()=>{listeners.delete(listener);}; }
export async function applyUpdate() { if(apply) await apply(); }

/** Use the browser lifecycle directly; no additional package is required. */
export async function registerAppUpdates() {
 if (!('serviceWorker' in navigator)) return;
 try {
  const registration=await navigator.serviceWorker.register('/sw.js',{scope:'/'});
  const waiting=()=>{
   if (!registration.waiting || !navigator.serviceWorker.controller) return;
   announceUpdate(async()=>{
    const worker=registration.waiting;
    if (!worker) throw new Error('UPDATE_UNAVAILABLE');
    await new Promise<void>((resolve,reject)=>{
     const changed=()=>{clearTimeout(timeout);navigator.serviceWorker.removeEventListener('controllerchange',changed);window.location.reload();resolve();};
     const timeout=setTimeout(()=>{navigator.serviceWorker.removeEventListener('controllerchange',changed);reject(new Error('UPDATE_TIMEOUT'));},15000);
     navigator.serviceWorker.addEventListener('controllerchange',changed);
     worker.postMessage({type:'SKIP_WAITING'});
    });
   });
  };
  waiting();
  const watch=(worker:ServiceWorker | null)=>{
   worker?.addEventListener('statechange',()=>{if(worker.state==='installed')waiting();});
  };
  registration.addEventListener('updatefound',()=>watch(registration.installing));
  watch(registration.installing);
  window.addEventListener('focus',()=>{void registration.update().then(waiting).catch(()=>undefined);});
 } catch { /* Registration failure never blocks orders or local draft recovery. */ }
}
