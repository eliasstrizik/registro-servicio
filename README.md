# Registro de Presupuestación de Servicio

Aplicación web para registrar órdenes de servicio con múltiples repuestos, consultar el historial y exportar la información como libro de Excel o CSV.

## Funciones

- Formulario público con número de orden, fecha, cliente, técnico, modelo y observaciones.
- Múltiples repuestos por orden (código, cantidad y descripción).
- Panel administrativo protegido por clave.
- Búsqueda global, detalle por orden, totales y exportación a Excel (`.xlsx`, con hojas de órdenes y repuestos) o CSV.
- Persistencia en Supabase con RLS y acceso mediante funciones controladas.

## Desarrollo

Ejecutá `npm run dev` y abrí `http://localhost:4173`.

## Producción

`npm run build` genera el sitio estático en `dist/`. El proyecto está preparado para Vercel y OpenAI Sites. La configuración activa usa una clave publicable de Supabase; no se incluye ninguna clave privilegiada.

- Aplicación: https://registro-servicio-elias.eliasstrizik.chatgpt.site/
- Código fuente: https://github.com/eliasstrizik/registro-servicio

## Base de datos

El esquema de referencia está en `supabase/schema.sql`. Antes de aplicarlo en otro proyecto, reemplazá `REEMPLAZAR_POR_SHA256` por el SHA-256 de la clave administrativa elegida.

