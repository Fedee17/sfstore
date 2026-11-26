---
name: sfstore-quality-gate
description: Verificar cambios en SFSTORE con pruebas focalizadas, seguridad, regresión y navegador antes de declarar un trabajo listo o proponer su publicación. Usar tras modificar código o revisar un PR.
---

# Puerta de calidad SFSTORE

## Determinar alcance
Clasificá lo modificado: documentación pura, UI, lógica comercial, catálogo, permisos, pagos, inventario o despliegue. Contrastá con `docs/SECURITY_RULES.md` y `docs/production-checklist.md`. La prueba debe comprobar el riesgo real, no acumular comandos.

## Verificación progresiva
1. Revisar diff: nada ajeno al encargo, secretos, cambios inadvertidos de precios/stock/pagos, commits de otros worktrees o bypass de guardas.
2. Para comportamiento nuevo/corregido: `sfstore-test-driven-development` con caso que falla antes de corregir (si es viable), luego pruebas focalizadas de archivos afectados.
3. Para cambios significativos correr comandos existentes del proyecto: `node --test tests/*.test.mjs`, `npm run lint`, `npm run build`, `npx tsc --noEmit`. Evitar `tsc` concurrente con build si comparten archivos generados.
4. Para UI: inspección real en navegador 320/390/1366, uso táctil/teclado, contraste, imágenes, console/network, estados de error. Comparar con prototipo aprobado; sin navegador no declarar esa parte pasada.
5. Para catálogo/admin: prueba aislada de creación, edición, validación server-side, guardado, imágenes y variantes. Para precios, órdenes y stock: fixtures o DB aislada, nunca datos productivos para tests.
6. Para Mercado Pago: probar firma webhook, idempotencia, ownership, importes, estados, duplicados y fail-closed con mocks/sandbox; **no probar cobros reales** sin autorización expresa.
7. Contabilizá pases, fallos y omitidas por separado. No silencies warnings ni desactives pruebas para conseguir verde. No repitas suites sin cambio en código o evidencia nueva.

## Salida
`PASS / FAIL / NO VERIFICADO` por dimensión pertinente, con evidencia precisa. Un test en verde no implica autorización de merge o que Production esté comprobada.
