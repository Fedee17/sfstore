# Cargadores y combos: cierre de validación local

Fecha: 20/10/2026. Candidato funcional: `259d83ed876be38a85b032d61019b2b2911ded5b`, rama `codex/charger-components-20261019`. No se modificó Production ni se publicó código.

## Alcance y evidencia

Se reutilizan las 865 pruebas de aplicación y 56 pruebas PostgreSQL aprobadas en [la entrega anterior](CHARGER-COMBO-PRICING.md); no se repiten como una nueva auditoría general. No se cambiaron fórmulas, interfaces comerciales, RPC operativas ni precios reales durante esta validación.

El nuevo test `tests/component-combo-real-local.test.mjs` prueba servicios reales mediante HTTP, Auth y PostgREST. Usa PostgreSQL **17.6 descartable**, PostgREST real con base de negocio separada y el Auth del proyecto local identificado por etiquetas Docker y conexión a su propia base local. No lee `.env` ni accede a Production. Las claves locales y cookies permanecen en memoria; el informe persistido contiene únicamente resultados sanitizados.

| Verificación integrada | Resultado esperado y comprobado |
| --- | --- |
| Autorización | Sesión real de Auth y cookies SSR; administrador autorizado, usuario fuera de allowlist y ausencia de sesión rechazados. |
| Catálogo | Dos conectores, presentación comercial conservada, precios $30.666,67 / $23.000; sin costos ni auditoría privada en la proyección pública. |
| Compras | Servicio de borrador, acción de composición y acción de confirmación reales; recepción de dos conjuntos agrega dos cabezales, un cable de cada conector y cero stock de conjunto. Segunda confirmación no duplica movimientos. |
| Individuales | Recepción conserva $22.000 de lista del cabezal y $15.800 de ambos cables; la regla del combo permanece en $23.000 netos. |
| Mostrador | Acción real cobra $23.000 con efectivo + transferencia y guarda dos líneas físicas con snapshot de combo; reintento conserva pedido y stock. |
| Métodos y descuentos | Efectivo + débito cobra $30.666,67; intento de aplicar nuevamente el 25% es rechazado sin movimiento. |
| Carrito y checkout | Estado Zustand y serializador reales; selección de ambos conectores viaja por `/api/checkout`, sesión verificada en Auth, PostgREST y RPC. Dos combos suman $46.000; cuatro líneas físicas conservan dos grupos y costos privados fuera del comprobante. |
| Idempotencia y propietario | Reintento del checkout no duplica stock ni pedido; solo el comprador obtiene su comprobante. |
| Rechazos | Sin Auth devuelve 401; cupón adicional devuelve 400; ambos sin crear registros. |
| Acreditación | Servicio administrativo real confirma el pago sintético con idempotencia, sin descontar nuevamente componentes; usuario no administrador rechazado. No hay dinero real. |
| Privilegios | JWT reales anon y authenticated, incluso el del administrador, no permiten invocar directamente la configuración privada; la aplicación autoriza antes de usar el servicio de servidor. |
| Preflight | Consulta de estado productivo preparada se ejecuta en READ ONLY sobre la compra sintética, con rollback y sin cambiar productos. |

Las acciones se invocan desde un harness HTTP **solo local** que importa el código real; no se simula Auth ni PostgREST. Esto valida el contrato del formulario, servicio y RPC, pero no la interacción por clic/hidratación en un navegador.

Los usuarios sintéticos creados por el ensayo se eliminan mediante Auth; los contenedores, red y proceso Next propios se retiran. No se cambian usuarios ni datos preexistentes del Supabase local. El primer intento encontró un error de tipado UUID en el fixture de proveedor; se corrigió únicamente el test y se repitió. No se encontró un defecto comercial que requiriera modificar el candidato.

## Límites reales

- **Validación visual bloqueada:** sigue vigente la prohibición de navegador/escritorio. No se abrió un navegador ni se pidieron permisos para hacerlo. El selector y sus etiquetas/precios/estados tienen evidencia de renderizado automatizado previa, pero no certificación visual a 390/1366 px ni interacción táctil.
- **CAPTCHA invitado:** Auth mantiene CAPTCHA habilitado. Las sesiones del ensayo se obtienen mediante enlaces sintéticos verificados por OTP de Auth local; no se prueba un token nuevo de Turnstile ni un alta anónima real. No se deshabilita CAPTCHA ni se presenta este ensayo como validación de ese widget. El circuito de CAPTCHA ya validado no se cambió en el candidato.
- **Storage:** este ensayo no vuelve a probar carga binaria ni privacidad de archivos. La autorización y carga de comprobantes no fueron modificadas; se reutiliza su evidencia anterior. El comprobante de pedido sí se consulta por el servicio real y conserva ambos grupos de combo.
- No se certifica vigencia del inventario/compra productivos a partir de fixtures. El nuevo respaldo y el preflight de Production son pendientes previos a una futura autorización.

## Preflight preparado, sin ejecutar en Production

1. Confirmar el proyecto exacto `xspvoicelbxlmtqoiolc`, dominio/deployment activo, candidato que se aprobará y sincronización con `main`. No asumir que `259d83e` sea ya una rama de publicación basada en el deployment vigente.
2. `reports/charger-components-release-state-read-only.sql`: fotografía mínima de la compra conocida, sus productos, importes, stock/costos, huella de movimientos, referencias a reservas pendientes, propietarios y hashes/ACL de los contratos relevantes. Solo lectura; no devuelve cuerpos de funciones ni filas de clientes. Su etiqueta no demuestra el destino. **No es una aprobación automática:** contrastar el resultado privado con la evidencia y el respaldo.
3. Revisar por separado el mapa exacto de seis SKU de la receta. La consulta anterior cubre los SKU de la compra original; no acredita por sí sola el cabezal previo ni los dos cables nuevos. Comprobar sus IDs, apertura, costos, precios, imágenes, ausencia de actividad incompatible y exclusión del cable USB-A/C. No crear los cables ni asumir sus IDs durante una lectura.
4. Verificar esquema base y dependencias de `202610190001_component_inventory.sql`. Tras su instalación autorizada, `reports/component-combo-pricing-preflight-read-only.sql` debe aprobar las cinco firmas, hashes normalizados CRLF/LF y permisos antes de la segunda migración. No eliminar sus guardas si una condición difiere.
5. Con la receta explícitamente aprobada y registrada, usar `reports/charger-components-preflight-read-only.sql` y el auxiliar `scripts/component-inventory.mjs` para el plan y su huella. El auxiliar conecta **solo a loopback**; su modo `review-sql` prepara una transacción privada y no la ejecuta. Una captura antigua no sustituye el plan bloqueado que valida el ejecutor.

## Respaldo y publicación: procedimiento pendiente de autorización

1. Preparar un destino privado nuevo fuera del repositorio mediante el auxiliar de respaldo ya documentado. Usar `verify-full`, CA validada y contraseña mediante entrada oculta, sin argumentos, archivos ni logs con credenciales. Obtener el dump PostgreSQL actual antes de tocar contratos o inventario; no sobrescribir respaldos previos.
2. Cubrir datos y definiciones de `public`, RPC, triggers, constraints, índices, RLS, grants y dependencias/roles necesarios para recuperar ese alcance. Restaurar en PostgreSQL 17.6 aislado; verificar SHA-256, tamaños, cantidades de filas y contratos. Registrar exclusiones de Auth/Storage gestionados. Este cambio no mueve archivos de Storage: sus metadatos y las imágenes relacionadas deben conservarse, pero un dump SQL no equivale a una copia de sus binarios ni a recuperación integral de Supabase.
3. Ensayar el candidato definitivo sobre la restauración aislada sin exponer datos en informes. Confirmar pausa breve de edición/importación de productos/recetas. Si hay una discrepancia nueva en ventas, reservas o movimientos de la compra a convertir, detener la conversión: no ajustar la captura para forzarla.
4. Solicitar autorización específica de los SQL exactos y sus hashes; aplicar en orden `202610190001_component_inventory.sql` y `202610200001_component_combo_pricing.sql`, con sus timeouts y transacciones. No usar `db push` general ni repetir tras un resultado incierto. Las migraciones no fijan los precios ni convierten la compra real.
5. Verificar esquema/privilegios y publicar el código compatible mediante una autorización separada y el protocolo de `main`/Vercel. No habilitar ofertas de combo con una UI anterior que cobre la suma individual. Productos simples conservan su contrato; verificar mostrador y checkout sin crear operaciones productivas de prueba no autorizadas.
6. Solicitar la autorización de la configuración real: SKU/receta, conversión auditada, precios individuales $22.000/$15.800, aprobación exacta y regla de combo $30.666,67/$23.000. Identificar actor y claves idempotentes. No publicar automáticamente valores ni copiar UUID del fixture. Comparar stock, valor total de adquisición y residuales después de cada transacción; conservar compra/historial originales.

## Recuperación

- Fallo dentro de una migración/transacción: detener, verificar rollback y estado real. No reejecutar automáticamente si se perdió la conexión.
- Fallo antes de vender combos: mantenerlos sin oferta y conservar ventas simples; no borrar auditoría ni reabrir el conjunto como SKU con stock propio.
- Tras una venta/reserva: mantener una versión del código compatible con snapshots de combo. Pausar compras/ofertas mediante el procedimiento aprobado si fuera necesario; no restaurar ciegamente Vercel ni PostgreSQL sobre datos recientes.
- La conversión solo se revierte mediante `reverse_component_conversion` y su clave original si no hubo actividad posterior y el estado coincide exactamente. Si hay movimientos, reservas o ventas posteriores, se detiene la reversión y se concilia hacia adelante con otra revisión. No reescribir la compra histórica.
- Devolución física del par y reembolso financiero son operaciones distintas: el auxiliar de devolución no modifica pagos. No crear reembolsos ni devoluciones reales como prueba.

**Conclusión:** contratos comerciales integrados validados por HTTP/Auth/PostgREST; preparado para revisión de publicación **con condiciones**: prueba visual pendiente, preflight/respaldo fresco, candidato de publicación y autorizaciones específicas. No requiere otra decisión de precios o costos.

## Resultado de esta entrega

- **12/12 tests integrados aprobados**, sin fallos ni omisiones (11 escenarios más el test contenedor). ESLint focalizado y `git diff --check` aprobados. No se repitió build porque no cambió código de aplicación; se conserva la evidencia aprobada de `259d83e`.
- Ejecución: `SFSTORE_REAL_LOCAL_COMBOS=true` y `SFSTORE_TEST_DOCKER` apuntando al ejecutable local de Docker; `node --test tests/component-combo-real-local.test.mjs`. No requiere navegador ni credenciales productivas.
- Evidencia sanitizada por ejecución en `staging/runtime/combo-http/<run>/result-sanitized.json`, ignorada por Git. No contiene claves, sesiones ni datos personales.
- Archivos funcionales y SQL de migración del candidato conservados sin modificaciones. Las nuevas piezas son un test de integración, un preflight de lectura y documentación.

### Huellas para futura revisión

Estas huellas corresponden a bytes LF de Git; una autorización debe identificar el archivo exacto que se aplicará.

- `supabase/migrations/202610190001_component_inventory.sql`: `3b65067ecb22003431606f7a667863d91c68068632c71134c96c96ea2bb2c394`.
- `supabase/migrations/202610200001_component_combo_pricing.sql`: `b8cf692d065d3fd593e232c6d6ce04f06759201e2cd01418e61deadb20d727ea`.
