# Auditoría final de lanzamiento SFSTORE — 11/11/2026

Base auditada: `main` = `origin/main` = b8e66e1, confirmado como el commit servido por sfstore-ten.vercel.app. Auditoría de sólo lectura; las correcciones posteriores viven en la rama `codex/launch-fixes-20261111` y los cambios de datos autorizados se registran abajo con sus recibos (guardados en los artefactos de la sesión, no en el repositorio).

## 1. Semáforo

**Sí, con reservas.** Sin P0 técnico. P0 comercial y legal resuelto el mismo día (vapeador despublicado). Las reservas restantes son de contenido: fotos y descripciones reales.

## 2. Verificado en código, SQL y producción

- Reservas en `create_checkout_atomic` (202610200001:466-609): idempotencia por `(buyer_id, operation_key)` con hash del payload, advisory locks, `FOR UPDATE` ordenado, un movimiento `reservation` por línea; la confirmación convierte `reservation` en `sale` sin segundo descuento; el trigger `guard_checkout_sale_movement` bloquea el camino legacy.
- Pagos informados protegidos: expirar/cancelar falla con `CHECKOUT_PAYMENT_REPORT_PROTECTED` ante reporte pendiente, pago aprobado o pago manual (202610120001:320-327). FK `ON DELETE RESTRICT` hacia `orders`.
- 25 % forzado en servidor: el cliente no envía precios (`lib/checkout/contract.ts`), sólo `transfer`; venta local sólo con cobros en efectivo o transferencia (`create_store_sale_atomic`).
- Admin: 30 páginas y 10 archivos de acciones verifican sesión allowlisted; service role sólo en módulos `server-only`; RLS restrictiva en las 18 tablas base. Brecha P2: `anon` podía leer `products.transfer_price` (SEC-02 redactada en esta rama).
- Catálogo publicado: 104 fichas HTTP 200, 0 imágenes rotas, 104/104 precios coherentes al 25 %, búsqueda con estado vacío correcto.
- Recorrido móvil a 375 px: variante cambia foto, SKU, precio y disponibilidad; agotado bloquea compra y ofrece WhatsApp con SKU; checkout con validaciones accesibles, Turnstile y total exacto.
- Módulo "Stock: qué revisar hoy": datos reales vía `get_stock_health_snapshot()` con service role; Top 5, cobertura < 10 días sobre 30 días, inmovilizado > 60 días excluyendo altas < 30 días, costo faltante separado sin inventar. Tests 16/16.
- Tests ejecutados sin base: web-commercial-pricing 7/7, store-sale-custom-price 23/23, stock-health 16/16, guest-shipping-boundary 15/15 (incluye el proxy de admin nuevo).

## 3. Hallazgos y estado

| Hallazgo | Severidad | Estado |
|---|---|---|
| Vapeador `vaper-elfbar-15k` publicado y comprable | P0 comercial/legal | Despublicado el 11/11 (status draft, sin borrar) |
| 5 accesorios de carga sin foto ni descripción | P1 | Despublicados el 11/11 por decisión del propietario |
| 16 productos sin foto (quedan 8 mates) | P1 | Planilla entregada (`planilla-fotos-y-descripciones-faltantes.csv`) |
| 44 descripciones plantilla y 3 fichas sin información | P1 | Planilla entregada |
| Foto de ficha debajo del CTA y bandas grises; flotante de WhatsApp solapado en móvil | P1 | Corregido en la rama (ea57e59, a661fef) |
| Listas derivadas no redondas ($133.334) | P1 | 81 listas redondeadas a múltiplos de $2.000 + familia Stanley vía `base_price` (11/11) |
| Texto del 25 % desigual | P1 | Unificado: «25% OFF · Transferencia · Efectivo» (a661fef) |
| 5 slugs con error y 11 títulos mal escritos | P1 | Títulos corregidos (11/11); redirecciones 301 en código (d2b6957); renombre de slugs al desplegar |
| Tarjeta repetida en portada; mensaje de WhatsApp de termos incoherente; h2 anidados en Stock | P2 | Corregido (f09d381) |
| `/admin` sin guarda a nivel proxy | P2 | `proxy.ts` falla cerrado sin sesión allowlisted (f09d381) |
| `transfer_price` legible por `anon` | P2 | SEC-02 probada con Docker (5/5) y aplicada en Production el 11/11; anon 401 verificado |
| Docs del liberador de reservas desactualizadas | Deuda | `CHECKOUT_RESERVATION_EXECUTOR.md` actualizado en la rama |

## 4. Checklist de 9 puntos (Sección 10)

| # | Pregunta | Respuesta |
|---|---|---|
| 1 | ¿Se entiende qué hacer y qué se compra? | Sí |
| 2 | ¿Respeta la identidad visual sin sobrecargar? | Sí con reservas: paleta oficial sigue abierta (Sección 02) |
| 3 | ¿Funciona con tacto, teclado, móvil y escritorio? | Sí (ficha móvil corregida en la rama) |
| 4 | ¿Importes, pagos, variantes, stock y mensajes correctos? | Sí |
| 5 | ¿Resuelve una objeción concreta? | Sí |
| 6 | ¿El contenido ayuda a elegir y es verificable? | No: faltan fotos y descripciones reales |
| 7 | ¿Se sabe qué evento revelará el resultado? | Sí: GA4 con consentimiento, `view_item`, `add_to_cart` |
| 8 | ¿Pasaron pruebas de seguridad, integridad y regresión? | Sí con reservas: suite completa según continuidad del 10/11; SEC-02 sin prueba en base |
| 9 | ¿Hay plan de fallos, reversión y autorización? | Sí: deployment previo e2ce993 documentado; cron de expiración activo con liberación manual de respaldo |

## 5. Cambios de datos aplicados en producción (autorizados el 11/11)

| Lote | Detalle | Guarda | Recibo (artefactos de sesión) |
|---|---|---|---|
| Despublicación | 6 productos de `electronica` active → draft | `status=eq.active` | `unpublish-before/after-2026-11-11T14-49-48-620Z.json` |
| Precios | 81 listas a múltiplos de $2.000 | `price=eq.<previo>` | `prices-before/after-2026-11-11T14-57-50-907Z.json` |
| Familia Stanley | `product_families.base_price` 46666,67 → 46000, heredado por trigger | `base_price=eq.46666.67` | `family-price-*.json` |
| Títulos | 11 nombres | `name=eq.<previo>` | `names-2026-11-11T14-58-32-373Z.json` |

Stock, reservas, pedidos, pagos, fotos y `transfer_price` almacenado no se tocaron. `precios-y-slugs-aplicados.csv` es la tabla aprobada por el propietario.

## 6. Auditoría visual (390×844 y 1366×768)

Capturas en `capturas/`: `prod-*` es producción b8e66e1; `local-*` es el preview GET-only del worktree con catálogo sintético (sin credenciales reales; sólo la foto del Stanley gris es real); `admin-stock-*` es el módulo de Stock renderizado con el fixture del repo.

Diferencias listas en la rama: foto primero, a ancho completo y sin bandas; precio con lista tachada y un solo badge; atributos como texto plano; textos plantilla filtrados; WhatsApp flotante oculto en fichas móviles; portada sin tarjeta repetida.

Defectos observados: flotante de WhatsApp sobre la tarjeta de compra (producción, ficha 390; resuelto en local); mates sin foto en `/mates`; badge de tarjeta en dos líneas a 390 (local); flotante sobre la tarjeta "Pago por transferencia" en portada (ambos); foto vertical más alta que el panel de compra en escritorio (local, consecuencia de no recortar). Sin textos cortados, desbordes ni contraste bajo.

Veredicto visual: lista para salir con el deploy de la rama; la estética actual es azul y roja, no la boutique cálida de la Sección 02, decisión de identidad aún abierta que no bloquea vender.

## 7. Pendientes

1. ~~Push, integración a `main` y despliegue; renombrar los 5 slugs en Supabase en el mismo corte.~~ Hecho el 11/11: main b4abf45 en Production, slugs renombrados (recibo `slugs-2026-11-11T15-18-51-331Z.json`), 301 verificadas.
2. ~~Probar SEC-02 con Docker y aplicar sólo con autorización.~~ Hecho el 11/11 (recibo `sec02-applied-2026-11-11T15-27-16-816Z.json`).
3. Completar la planilla de fotos y descripciones y aplicarla.
4. ~~Decidir si el badge de tarjeta vuelve a una línea en 390 px.~~ Decidido el 11/11: «Transf.» en tarjetas bajo 640 px (una línea a 390, dos bajo 380); pendiente de publicar.
