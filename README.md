# El Armario · API y administrador

Worker con catálogo público, administración privada, D1 y fotos en R2. Consulta [ADMIN_SETUP.md](./ADMIN_SETUP.md) para crear los recursos y tu cuenta real.

## Comandos

~~~sh
npm ci
npm test
npm run db:migrate:local
npm run admin:create -- --email tu@correo.com --local
npm run dev
~~~

Para producción: crear D1 y R2, sustituir database_id en wrangler.toml, aplicar db:migrate:remote y crear tu cuenta con admin:create --remote. Después publica por GitHub o npm run deploy. No se crearon recursos ni usuarios en producción.

## API

- GET /api/health: comprobación del servicio.
- GET /api/products: catálogo público. Conserva el formato original de columnas.
- GET /api/media/:id/:width.webp: foto pública optimizada. Caché inmutable y ETag.
- GET /api/admin/status: indica si están conectados los bindings.
- POST /api/admin/login, POST /api/admin/logout, GET /api/admin/me: sesión.
- GET y POST /api/admin/products: listado privado y alta.
- PUT /api/admin/products/:code: edición con revisión y visibilidad.
- POST /api/admin/uploads: recibe las cuatro variantes WebP.
- POST /api/admin/import: copia el catálogo actual a D1 sin sobrescribir ediciones y deja de sincronizar Sheets al terminar.

Las escrituras exigen sesión (excepto login), origen permitido y X-Admin-Request: 1. No hay registro público. El frontend actúa como proxy del mismo dominio para las cookies HttpOnly.

## Transición

Antes de importar, Sheets se consulta con caché de 300 segundos y se combina con D1. D1 tiene prioridad por código. Después de importar, solo se consulta D1. La respuesta pública completa usa no-store para reflejar las ediciones del panel al recargar. Las fotos antiguas siguen en Drive y las nuevas se suben a R2.

D1 y R2 locales están en .wrangler y no se versionan. La suite prueba las rutas con SQLite real y un bucket de prueba; además se verificó localmente con Wrangler/D1/R2.
