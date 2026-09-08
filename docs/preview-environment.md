# Preview aislado

La rama `chore/preview-environment` habilita un Preview de consulta sin servicios productivos.
Estas protecciones aplican a ramas que contengan este cambio; no se fusiona a `main` durante la prueba.

- Vercel define `VERCEL_ENV=preview` y `VERCEL_URL` para cada deployment.
- `next.config.ts` deriva `NEXT_PUBLIC_PREVIEW_MODE` y `NEXT_PUBLIC_SITE_URL` de esas variables.
- No copiar claves Supabase, secretos de Google Sheets, tokens Mercado Pago ni credenciales administrativas a Preview.
- Incluso el cliente anonimo de Supabase permite crear pedidos en el flujo actual; no es una credencial de solo lectura.
- El catalogo usa exclusivamente los datos de respaldo existentes en `data/products.ts`.
- Home, categorias, detalle y carrito local permiten revisar la interfaz; no representan el inventario real.
- Admin, checkout y todas las APIs devuelven 403 antes de ejecutar sus handlers. Tambien se bloquean metodos distintos de GET y HEAD, incluidas Server Actions.
- Los tres clientes Supabase rechazan conexiones en Preview, aunque alguien agregue credenciales por error.
- Las respuestas Preview indican `noindex, nofollow`. Se conserva la proteccion de acceso de Vercel.
- Production y Development mantienen su comportamiento previo. `NODE_ENV=production` no distingue un build Preview de uno Production.

Validacion local de las protecciones: `node --test tests/preview-environment.test.cjs`.
El build de Preview se verifica en Vercel, sin cargar `.env.local`.

Para probar pedidos, admin o pagos completos se necesita un entorno de datos aislado y credenciales de prueba.
No habilitar escrituras con credenciales productivas para solucionar limitaciones de Preview.
