---
name: sfstore-test-driven-development
description: Aplicar desarrollo guiado por pruebas (TDD) a lógica y correcciones de SFSTORE. Usar para bugs, cambios de comportamiento, reglas de precios, pedidos, stock, permisos y endpoints; no usar para documentación pura.
---

# TDD para SFSTORE

Basado en la práctica de Test-Driven Development. Usar la skill de TDD del entorno cuando esté disponible; esta adaptación define únicamente los comandos y guardas de SFSTORE, **no pretende ser una copia oficial**.

## RED → GREEN → REFACTOR
1. Leer el comportamiento actual y la prueba vecina; identificar un caso esperado que falla **antes** de implementar. Para bug, reproducirlo primero. Si es imposible demostrar RED por dependencias inaccesibles, documentar el límite sin fingirlo.
2. Crear la prueba mínima, determinista y aislada. Cubrir también el borde crítico (precio negativo, estado duplicado, idempotencia, permisos faltantes) cuando corresponda.
3. Ejecutar la prueba focalizada y confirmar fallo por motivo correcto.
4. Hacer el cambio mínimo, correr prueba focalizada y refactorizar conservando verde.
5. Para cambios significativos, ampliar al conjunto del proyecto con `node --test tests/*.test.mjs`, TypeScript, lint, build, según `sfstore-quality-gate`.
6. Si toca UI, verificar también en navegador; TDD no reemplaza revisión visual.
7. No reejecutar pruebas idénticas tras PASS sin un cambio relevante.

## Seguridad de pruebas
Usar mocks, fixtures y PostgreSQL local efímero para ventas, pagos, stock, Auth o Supabase. Nunca credenciales productivas, clientes reales, webhook productivo ni operaciones pagas sin autorización. No modificar reglas comerciales solo para que un test pase.

## Resultado
Informar caso RED observado, PASS posterior, regresiones y omitidas; no decir «todo probado» si hay etapas sin verificar.

## Referencia
La skill `test-driven-development` del paquete instalado `agent-skills` puede guiar el ciclo general en entornos donde esté disponible; la presente skill es la versión específica para este repositorio.
