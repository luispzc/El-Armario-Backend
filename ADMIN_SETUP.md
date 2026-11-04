# Activar el administrador de El Armario

El panel está implementado y probado en local. Todavía debes crear los recursos de tu cuenta y tu administrador real. No hay usuarios ni contraseñas predeterminadas en producción. No se hicieron commits, push ni despliegues.

## 1. Crear almacenamiento en Cloudflare

Abre una terminal en G:\Workeo\El-Armario-Backend y ejecuta:

~~~powershell
npx wrangler login
npx wrangler d1 create el-armario-db
npx wrangler r2 bucket create el-armario-images
~~~

El inicio de sesión se completa en tu navegador. Si Cloudflare pide activar R2, completa ese paso en tu cuenta. No compartas tokens ni contraseñas en el chat.

El comando de D1 imprime un database_id. En wrangler.toml del backend, reemplaza el UUID 00000000-0000-0000-0000-000000000000 por ese valor. Los bindings deben llamarse DB e IMAGES; el bucket configurado es el-armario-images. Si ya existen estos recursos, reutilízalos y copia el ID de esa base.

## 2. Preparar las tablas y tu cuenta

Desde la misma carpeta:

~~~powershell
npm run db:migrate:remote
npm run admin:create -- --email TU_CORREO --remote
~~~

Reemplaza TU_CORREO por tu correo real. El segundo comando solicita una contraseña de al menos 12 caracteres y su confirmación; se muestra enmascarada y solo se guarda su hash. El correo debe ser único. Puedes crear otra cuenta administradora con otro correo usando el mismo comando. No existe registro público.

## 3. Subir y desplegar primero el backend

Haz tus commits y push de El-Armario-Backend. En Cloudflare, el Worker el-armario-api debe usar:

- Directorio raíz: /
- Comando de compilación: vacío (o npm test si quieres ejecutar las pruebas en CI).
- Comando de despliegue: npx wrangler deploy

El wrangler.toml del backend declara D1 y R2. Crear los recursos y aplicar la migración antes de desplegar evita interrumpir el catálogo. ALLOWED_ORIGINS ya incluye el-armario.lezmarucrack.workers.dev, el dominio pages.dev anterior y localhost. Si usas otro dominio, añádelo ahí.

## 4. Subir y desplegar el frontend

Haz tus commits y push de El-Armario. Conserva el archivo wrangler.toml nuevo en el repositorio: ahora declara el pequeño Worker que conecta /api con el backend y sirve los archivos de dist. Esa conexión permite usar una cookie HttpOnly bajo el mismo dominio del panel.

En Cloudflare, el frontend el-armario debe usar:

- Comando de compilación: npm run build
- Comando de despliegue: npx wrangler deploy
- Variable de compilación VITE_API_URL: /api/products
- Directorio raíz: /

El comando anterior con --assets ./dist --name el-armario --compatibility-date 2026-11-04 también respeta la nueva configuración, pero npx wrangler deploy evita duplicarla. API_ORIGIN, en el wrangler.toml del frontend, apunta a https://el-armario-api.lezmarucrack.workers.dev.

## 5. Entrar al panel

Abre https://el-armario.lezmarucrack.workers.dev/admin e inicia sesión con el correo y contraseña que creaste.

Puedes añadir prendas, subir fotos, editar precios y tallas, marcar vendido y ocultar o volver a mostrar prendas. Guardar actualiza D1; no necesitas hacer commits para cambiar el inventario. El catálogo abierto en otra pestaña se actualiza al recargar.

## 6. Pasar el catálogo actual a D1

Al principio se combinan las prendas de Sheets y las guardadas en D1. Editar una prenda de la hoja crea una copia en D1 que tiene prioridad; no modifica tu hoja.

El botón Copiar catálogo a D1 importa las prendas de la hoja sin sobrescribir las ediciones ya guardadas. Al completarse, el catálogo usa solo D1: los cambios posteriores en Sheets dejan de sincronizarse. Tu hoja y sus archivos de Drive permanecen intactos.

Las fotos antiguas siguen enlazadas a Drive. Las fotos nuevas que subas se guardan en R2 en cuatro tamaños WebP (240, 480, 960 y 1600 px), sin ampliar imágenes pequeñas. No se trasladaron masivamente las fotos antiguas.

## Prueba local

En El-Armario-Backend:

~~~powershell
npm ci
npm run db:migrate:local
npm run admin:create -- --email TU_CORREO --local
npm run dev
~~~

En otra terminal, dentro de El-Armario:

~~~powershell
npm ci
npm run dev
~~~

Abre http://127.0.0.1:5173/admin. Usa VITE_API_URL=/api/products en .env.local si lo tienes. Vite conecta /api con el backend local del puerto 8787. Los datos, usuarios y fotos de prueba locales están aislados de producción en .wrangler (ignorado por Git).

## Comportamiento y límites

- Sesión HttpOnly de 8 horas, contraseña con sal y hash, límites de intentos y comprobación de origen en operaciones de escritura. Salir revoca la sesión.
- Las sesiones no se guardan en localStorage ni sessionStorage. Usa HTTPS en producción.
- Una edición antigua no sobrescribe otra más reciente: el panel pide actualizar los datos.
- Ocultar es reversible; no borra la prenda ni sus fotos. No hay borrado permanente desde el panel.
- Cada foto admite hasta 20 MB de entrada y 30 megapíxeles. Se aceptan JPG, PNG y WebP. Las subidas procesadas están limitadas a 12 MB y a 200 fotos por administrador en 24 horas.
- Las fotos ya subidas no se borran automáticamente al reemplazarlas o cancelar una prenda; esto evita romper enlaces, pero puede dejar archivos sin uso en R2.
- Las ventas y los pagos siguen coordinándose por WhatsApp. Este panel no valida pagos ni reserva stock.
- Para revocar una cuenta, cambia active a 0 en admin_users desde D1. Para una contraseña olvidada, crea otra cuenta administradora por CLI y revoca la anterior; no hay recuperación por correo.
- No hay automatización de migraciones en cada despliegue. Ejecuta las migraciones pendientes cuando actualices el esquema.
