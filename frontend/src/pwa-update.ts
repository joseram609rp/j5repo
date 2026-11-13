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
  const workers = navigator.serviceWorker;
  let controller = workers.controller;
  let applying = false;
  workers.addEventListener('controllerchange', () => {
   const previous = controller;
   controller = workers.controller;
   if (previous && controller && previous !== controller && !applying)
    announceUpdate(async () => { window.location.reload(); });
  });
  const waiting=()=>{
   if (!registration.waiting || !workers.controller) return;
   announceUpdate(async()=>{
    const worker=registration.waiting;
    // The waiting worker may already have been activated from another tab.
    if (!worker) { window.location.reload(); return; }
    applying = true;
    await new Promise<void>((resolve,reject)=>{
     const cleanup=()=>{clearTimeout(timeout);workers.removeEventListener('controllerchange',changed);};
     const changed=()=>{cleanup();window.location.reload();resolve();};
     const timeout=setTimeout(()=>{
      cleanup();
      if (worker.state === 'activated') { window.location.reload(); resolve(); }
      else reject(new Error('UPDATE_TIMEOUT'));
     },15000);
     workers.addEventListener('controllerchange',changed);
     try { worker.postMessage({type:'SKIP_WAITING'}); }
     catch (error) { cleanup(); reject(error); }
    }).finally(() => { applying = false; });
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
