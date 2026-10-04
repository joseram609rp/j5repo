# Frenos La Bandera

Base de PWA para el taller: React + TypeScript + Vite; Node.js/TypeScript preparado para Azure Functions v4 / Static Web Apps; carpeta de scripts SQL. Repositorio: https://github.com/joseram609rp/j5repo.

## Ejecutar sin secretos

Requiere Node 22.12+ (22 LTS recomendado para coincidir con Azure; desarrollo también probado con 24) y pnpm 11.19.0.

```powershell
cd C:\j5repo
pnpm install --frozen-lockfile
pnpm dev
```

Abrir http://localhost:5173 y elegir **Entrar a demostración**. API local en 127.0.0.1:7071. No hace falta .env, cuenta Azure ni Functions Core Tools para desarrollar. Si pnpm no está en PATH, usar `scripts/pnpm.ps1`, que usa el runtime local disponible de Codex. Ejemplo: `./scripts/pnpm.ps1 dev`. En un equipo nuevo con npm disponible: `npm install -g pnpm@11.19.0`.

El demo no es autenticación productiva y guarda datos del servidor en memoria. Usa datos ficticios. IndexedDB conserva el borrador en el navegador. Azure permanece sin conexión y sus rutas de negocio fallan cerradas. No hay secretos, cuentas reales ni despliegue.

```powershell
pnpm check       # tipos + pruebas de fiabilidad + builds frontend/backend
pnpm test
pnpm --filter @j5/frontend preview  # PWA compilada; sin API proxy
```

PWA generada solo en build; para probarla con API usar un proxy de mismo origen hacia 7071. El servidor de desarrollo Vite sí incluye ese proxy. Las pruebas de instalación en dispositivos y del host Functions quedan para la siguiente etapa.

## Estructura

- `frontend/`: pantalla responsive de prueba, IndexedDB, autosave y cliente API.
- `backend/`: dominio de borrador, controles de sesión, idempotencia/concurrencia, helper SQL retry, adaptadores HTTP local y Functions.
- `database/`: plan de migraciones y patrón SQL de concurrencia (sin ejecutar).
- `infra/`: guía de configuración y empaquetado de Azure.
- `docs/architecture.md`: garantías, límites y próximos pasos.

Copiar `.env.example` a `.env` solo cuando sea necesario. El servidor local lee el archivo raíz. En Azure usar application settings. Ningún secreto puede ir en `VITE_*` ni versionarse. `.env` y `local.settings.json` están ignorados.

Destino SQL futuro: `tallerj5`, servidor `j5sqlserver.database.windows.net`, resource group `AZ_SQLRG_J5`, región Central US. No se crea ni modifica la base existente.

Para continuar: primero esquema SQL y repositorios, después autenticación persistente y primeras pantallas de negocio. Ver [arquitectura](docs/architecture.md), [SQL](database/README.md) e [infraestructura](infra/README.md).
