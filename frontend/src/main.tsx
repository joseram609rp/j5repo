import { createRoot } from 'react-dom/client';
import { App } from './App';
import { registerAppUpdates } from './pwa-update';
if (import.meta.env.PROD) void registerAppUpdates();
createRoot(document.getElementById('root')!).render(<App/>);
