# Registro de Presupuestación de Servicio

Aplicación web para registrar órdenes de servicio con múltiples repuestos, consultar el historial y exportar la información como libro de Excel o CSV.

## Funciones

- Formulario con número de orden, fecha, cliente, técnico, modelo y observaciones.
- Múltiples repuestos por orden (código, cantidad y descripción).
- Acceso por correo autorizado y código de un solo uso (Supabase Auth).
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

La nueva versión **todavía no está publicada en Vercel**. El sitio anterior en OpenAI Sites continúa privado y sin modificaciones. El proyecto de Vercel está creado; falta verificar el dominio de envío de Resend, comprobar la recepción del código y autorizar un plan apto para uso comercial. No se contrató Vercel Pro.

La base ya tiene las funciones nuevas y el administrador principal configurado, conservando las órdenes existentes y la clave anterior. Los cuatro correos proporcionados por escrito están habilitados; los de la captura están pendientes de confirmación adicional. Los correos reales y la contraseña no se incluyen en este repositorio público.

Las funciones antiguas se conservan temporalmente para que el sitio existente siga funcionando. La migración de seguridad no está cerrada hasta revocar sus permisos anónimos durante el cambio definitivo, después de verificar el acceso nuevo. No publicar la nueva versión como terminada antes de esa verificación.

- Aplicación: https://registro-servicio-elias.eliasstrizik.chatgpt.site/
- Código fuente: https://github.com/eliasstrizik/registro-servicio

## Base de datos

`supabase/schema.sql` documenta la base histórica, no la configuración final de seguridad. La evolución aditiva está en `supabase/migrations/20260902171856_email_access_control.sql`; no elimina órdenes ni funciones anteriores. La lista autorizada se administra exclusivamente en `private.service_access`, con roles `admin` y `operator`.

`tests/access.sql` comprueba permisos, clave, límite de intentos, carga con varios repuestos y revocación de acceso dentro de una transacción que se revierte. `tests/access.test.mjs` comprueba interfaz, descarga, cierre de sesión y respuestas obsoletas.

## Correo y dominio

Supabase Auth entrega códigos mediante SMTP de Resend. `supabase/config.toml` toma `RESEND_API_KEY` del entorno, sin guardar la clave en código. Las plantillas están en `supabase/templates/otp.html`. **`supabase config push` modifica la configuración remota**: revisar los cambios y preservar ajustes existentes antes de ejecutarlo; no es una vista previa.

Dominio de envío previsto: `auth.eliasstrizik.com.ar`. Aplicación prevista: `servicio.eliasstrizik.com.ar`. Agregar solo los registros nuevos indicados por los proveedores; no reemplazar los registros del sitio principal ni del correo existente.
