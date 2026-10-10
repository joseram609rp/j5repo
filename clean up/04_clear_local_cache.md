# Limpiar datos locales J5
Después del cleanup SQL, cierre todas las pestañas J5 para impedir autosave/sync con datos viejos.
Con todas las pestañas anteriores cerradas, levante pnpm dev y abra una pestaña nueva sin iniciar sesión. Las sesiones SQL anteriores ya no sirven.
Chrome/Edge: abra SOLO http://localhost:5173, F12 > Application > Storage > Clear site data. Incluya IndexedDB, local/session storage, Cache Storage y service workers del origen J5; no incluya datos de terceros.
Compruebe el origen localhost:5173 antes de borrar. Application > IndexedDB debe dejar de mostrar j5-drafts-v1.
Vuelva a entrar con ADMIN; la sesión local se elimina. No borre otros sitios ni todos los datos del navegador.

Alternativa: en consola de J5, con las otras pestañas J5 cerradas:
```js
if (location.origin !== 'http://localhost:5173') throw new Error('Origen incorrecto');
const request = indexedDB.deleteDatabase('j5-drafts-v1');
request.onerror = () => console.error('No se pudo borrar IndexedDB');
request.onblocked = () => console.warn('Cierre otras pestañas J5 y vuelva a intentar');
request.onsuccess = () => { console.info('Borradores J5 eliminados'); location.reload(); };
```
El snippet elimina solo IndexedDB. SQL ya revocó las sesiones. Si la app mantiene una conexión abierta y bloquea el borrado, use DevTools Clear site data y cierre/abra la pestaña.
No crear una ruta pública del producto para ejecutar este borrado.
