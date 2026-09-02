# Registro de Presupuestación de Servicio

Aplicación web para registrar órdenes de servicio con múltiples repuestos, consultar el historial y exportar la información como libro de Excel o CSV.

## Funciones

- Formulario con número de orden, fecha, cliente, técnico, modelo y observaciones.
- Múltiples repuestos por orden (código, cantidad y descripción).
- Acceso por correo autorizado y código de un solo uso (Supabase Auth).
- Sección Usuarios: el administrador verifica además la contraseña de órdenes para ver la lista, agregar operadores y activar/desactivar correos. Las cuentas administradoras no se pueden modificar desde esta sección.
- Administrador principal: consulta y descarga directa tras iniciar sesión.
- Operadores habilitados: carga de órdenes; consulta y descarga al ingresar la clave compartida.
- Clave compartida solo en memoria durante la sesión, nunca en almacenamiento del navegador; botón para bloquear registros.
- Validación de permisos en cada consulta/exportación y bloqueo de clave tras cinco fallos durante una ventana de 15 minutos.
- Búsqueda global, detalle por orden, totales y exportación a Excel (`.xlsx`, con hojas de órdenes y repuestos) o CSV.
- Persistencia en Supabase con RLS y acceso mediante funciones controladas.

## Desarrollo

Instalá con `pnpm install --frozen-lockfile`. Ejecutá `pnpm dev` y abrí `http://localhost:4173`. Pruebas: `pnpm test`.

## Producción

`pnpm build` genera el sitio estático en `dist/`. Supabase JS está fijado en el archivo de dependencias y se copia al build. La configuración del navegador usa solamente una clave publicable; no se incluye ninguna clave privilegiada.

### Estado de migración (2 de septiembre de 2026)

La nueva versión está publicada en **Cloudflare Pages, plan gratuito**, conectada a este repositorio con despliegues automáticos desde `main`. La aplicación y sus scripts responden HTTP 200. No se contrató Vercel Pro. El sitio anterior en OpenAI Sites continúa sin modificaciones, pendiente de retiro funcional después de comprobar el primer ingreso real por correo.

El proyecto de Vercel quedó como preparación anterior, sin despliegue ni plan pago. La integración gratuita de Resend provisionada desde Vercel sigue siendo el proveedor de SMTP; no requiere alojar la web en Vercel. No desconectarla durante el cambio de alojamiento sin preparar primero su reemplazo.

La base ya tiene las funciones nuevas y el administrador principal configurado, conservando las órdenes existentes y la clave anterior. Los cuatro correos proporcionados por escrito están habilitados; los de la captura están pendientes de confirmación adicional. Los correos reales y la contraseña no se incluyen en este repositorio público.

Las funciones antiguas se conservan temporalmente para que el sitio existente siga funcionando. La migración de seguridad no está cerrada hasta revocar sus permisos anónimos durante el cambio definitivo, después de verificar el acceso nuevo. No publicar la nueva versión como terminada antes de esa verificación.

- Aplicación: https://servicio.eliasstrizik.com.ar/
- URL alternativa: https://registro-servicio.pages.dev/
- Código fuente: https://github.com/eliasstrizik/registro-servicio

## Base de datos

`supabase/schema.sql` documenta la base histórica, no la configuración final de seguridad. La evolución aditiva está en `supabase/migrations/20260902171856_email_access_control.sql`; no elimina órdenes ni funciones anteriores. La lista autorizada se administra exclusivamente en `private.service_access`, con roles `admin` y `operator`.

`tests/access.sql` comprueba permisos, clave, límite de intentos, carga con varios repuestos y revocación de acceso dentro de una transacción que se revierte. `tests/access.test.mjs` comprueba interfaz, descarga, cierre de sesión y respuestas obsoletas.

## Administración de usuarios

Ingresar con la cuenta administradora, abrir **Usuarios** e introducir la contraseña de órdenes registradas. Se puede buscar por correo, agregar operadores y activar/desactivar los existentes. Cada alta o cambio requiere confirmación. La nueva persona ingresa solicitando su propio código de correo; no se envía una invitación automáticamente. No se agregaron automáticamente correos adicionales.

La API `manage_service_users` vuelve a validar administrador, lista activa y contraseña en cada llamada. La contraseña no se guarda en almacenamiento del navegador. Cinco fallos bloquean los intentos durante hasta 15 minutos. Las cuentas administradoras están protegidas: esta sección no permite desactivarlas ni crear/promover otros administradores. Un operador no puede administrar usuarios aunque conozca la contraseña compartida.

La migración `20260902182747_service_users_admin.sql` añade esta API y un registro privado de auditoría `private.service_access_audit`. Las pruebas `tests/users.sql` se ejecutan con rollback y verifican denegaciones, altas, bajas, reactivación, administrador protegido, límite de intentos y auditoría; `tests/users.test.mjs` verifica el formulario, confirmaciones y limpieza al cerrar sesión. La revocación global sigue pendiente del cierre de las API antiguas descrito arriba.

## Correo y dominio

Supabase Auth entrega códigos mediante SMTP de Resend. `supabase/config.toml` toma `RESEND_API_KEY` del entorno, sin guardar la clave en código. Las plantillas están en `supabase/templates/otp.html`. **`supabase config push` modifica la configuración remota**: revisar los cambios y preservar ajustes existentes antes de ejecutarlo; no es una vista previa.

Dominio de envío verificado en Resend: `auth.eliasstrizik.com.ar`, con remitente `acceso@auth.eliasstrizik.com.ar`. Aplicación asociada a `servicio.eliasstrizik.com.ar` y comprobada por HTTPS. Se agregaron registros DNS específicos para DKIM, SPF/MX de envío y CNAME de la aplicación, preservando el sitio principal y el correo existente. La recepción real del código aún requiere confirmación del propietario.

## Publicación gratuita en Cloudflare Pages

- Conectar solamente `eliasstrizik/registro-servicio`, no todos los repositorios de la cuenta.
- Rama de producción: `main`.
- Framework: ninguno (HTML/CSS/JavaScript).
- Comando de build: `pnpm run build`.
- Directorio de salida: `dist`.
- Node.js: 24; dependencias instaladas usando el lockfile del repositorio.
- No copiar `.env.local`, claves SMTP ni tokens a los assets ni a variables públicas. El sitio no necesita secretos de Resend en su build.
- Proyecto Cloudflare: `registro-servicio`, URL `https://registro-servicio.pages.dev/`, dominio `servicio.eliasstrizik.com.ar`.
- El build inicial creado sin comando ni salida devolvía 404. Se corrigió a `pnpm run build` y `dist`, y se verificaron los tres archivos principales por HTTPS después del despliegue exitoso.
- Mantener el plan gratuito. Si se alcanza un límite de cualquier proveedor, informar al propietario; no activar upgrades ni recargas automáticas.

La exportación XLSX/CSV se genera en el navegador y las órdenes permanecen en Supabase. El cambio de alojamiento no copia ni mueve registros de clientes a Cloudflare.

