# SFSTORE Importados

Tienda y administración con Next.js 16 App Router, React, TypeScript, Tailwind y Supabase. Catálogo público: Perfumes y Mates; admin: productos, consulta/recomendaciones deterministas, proveedores, compras, pedidos, ventas e inventario. Checkout y Mercado Pago están implementados con limitaciones pendientes; ver [contexto](docs/PROJECT_CONTEXT.md) y [seguridad](docs/SECURITY_RULES.md).

## Desarrollo local

```bash
npm ci
npm run dev
```

Abrir http://localhost:3000. Para datos conectados usar un proyecto Supabase de pruebas separado; nunca credenciales productivas. El catálogo puede mostrar datos locales de respaldo cuando Supabase no está disponible: eso no demuestra conexión real. No ejecutar imports, migrations ni limpiadores para iniciar el frontend.

## Validaciones

```bash
node --test tests/*.test.mjs
npm run lint
npm run build
npx tsc --noEmit
npm ls --all --json
npm audit --json
```

Ejecutar primero checks específicos al cambio; tsc después del build evita carreras con tipos generados. Tests PostgreSQL y browser requieren runtimes opcionales: ver [auditoría](docs/PROJECT_AUDIT_2026-10-10.md); informar skips explícitamente. No hay script npm test en el baseline. npm audit no implica que todos los advisories sean explotables; no usar audit fix --force.

## Guías

- [AGENTS](AGENTS.md): autorización, autonomía y límites de trabajo.
- [Arquitectura](docs/ARCHITECTURE.md), [negocio](docs/BUSINESS_RULES.md) y [diseño](docs/DESIGN_SYSTEM.md).
- [Backlog](docs/DEVELOPMENT_BACKLOG.md): estado y dependencias; no autoriza ejecutar por sí solo.
- [Modelo de catálogo](docs/catalog-data-model.md) y [sincronización Sheets](docs/google-sheets-product-sync.md).
- [Storage](supabase/storage.md) y [checklist de Production](docs/production-checklist.md): referencias para revisión, sin autorización de escrituras o deploy.

La PR #1 contiene Storage y correcciones lint fuera de main. No repetirlas. Esta fase permite commits locales del lote autónomo; push, merge y despliegue requieren autorización separada. .env.local, secretos y logs de entorno permanecen fuera de Git.
