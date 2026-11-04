# El Armario · API de catálogo

Backend de lectura en Cloudflare Workers. Consulta el CSV público actual de Sheets y publica solo columnas permitidas; no necesita credenciales de Google. No modifica Sheets, Drive ni registra pedidos.

## Desarrollo

Node.js 22.12+ o 24 LTS.

~~~sh
npm ci
npm run dev
~~~

Endpoints: GET /api/health y GET /api/products. En el frontend, define VITE_API_URL=http://localhost:8787/api/products en .env.local y reinicia Vite.

~~~sh
npm test
npx wrangler deploy --dry-run
~~~

## Configuración y despliegue futuro

wrangler.toml declara nombre del Worker y orígenes autorizados. ALLOWED_ORIGINS es una lista separada por comas. Incluye el origen real del frontend, y sus URLs de preview si las usarás. SHEET_CSV_URL permite reemplazar el CSV público; si no se indica, usa el de la web actual.

Para publicar cuando se decida: autenticar Wrangler con la cuenta Cloudflare correcta y ejecutar npm run deploy. Luego configurar VITE_API_URL en el frontend con la URL del Worker seguida de /api/products y recompilar. No se desplegó, no se hicieron commits ni push.

## Contrato

/api/products devuelve { products: [filas], updatedAt: fechaISO, source: 'google-sheets' }. Las filas usan codigo, nombre, tipo, talla, precio, foto1, foto2, foto3, vendido, genero, descripcion, foto_ia. El frontend valida y normaliza estos valores. updatedAt indica cuándo se leyó el CSV, no la última edición de la hoja.

Solo GET, HEAD y OPTIONS. Errores de Google/formato devuelven 502 sin caché; no se confunden con catálogo vacío. CORS se aplica por origen. Caché de borde 300 s y del cliente 60 s; Cache API opera en el Worker desplegado y no garantiza caché compartida entre ubicaciones.

La API es pública: CORS no es autenticación. No agregar información privada a las columnas públicas del catálogo. Los cambios de disponibilidad pueden tardar en propagarse. Esta API no garantiza reservas, cobros ni actualizaciones atómicas de stock.

## Evolución recomendada

Mantener Sheets/Drive mientras sea un catálogo con ventas coordinadas manualmente. Para reservas, stock transaccional, pedidos y administración concurrente: BD relacional y almacenamiento de objetos; migrar primero con exportación y validación, conservando códigos y enlaces. La migración de datos no forma parte de esta entrega.
