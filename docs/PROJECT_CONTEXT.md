# SFSTORE — Contexto del proyecto

Estado documentado el 2026-10-10 sobre `origin/main` (`7a8a105c968f84ba9f58ee1dfd018f27bf6ac3a6`). Esta preparación vive en `codex/semiautonomous-development-preparation`; no incorpora cambios de otras ramas. El negocio vende perfumes importados y árabes, decants, mates y otros artículos; las secciones públicas implementadas son Perfumes y Mates. No se inventan categorías, condiciones comerciales ni integraciones.

## Índice y fuentes

- [Arquitectura](ARCHITECTURE.md): rutas, servicios y límites de datos.
- [Reglas comerciales](BUSINESS_RULES.md): comportamiento actual y decisiones pendientes.
- [Diseño](DESIGN_SYSTEM.md): identidad existente y diferencias con admin.
- [Seguridad](SECURITY_RULES.md): límites para trabajar y riesgos observados.
- [Backlog](DEVELOPMENT_BACKLOG.md): tareas propuestas, todavía no iniciadas.
- [Auditoría y validaciones](PROJECT_AUDIT_2026-10-10.md): evidencia, resultados y limitaciones.
- [Modelo del catálogo](catalog-data-model.md), [sincronización Sheets](google-sheets-product-sync.md) y [checklist de Production](production-checklist.md) conservan su contenido histórico. Sus cifras y estados de despliegue no son una lectura actual de Production.

## Funcionalidad real

| Área | Evidencia y estado |
| --- | --- |
| Catálogo público | Listados, filtros, ficha, relacionados y galería implementados. `services/products.ts` consulta Supabase pero retorna `data/products.ts` ante errores, ausencia de configuración o listados vacíos; verlo renderizar no demuestra disponibilidad del catálogo real. |
| Carrito | Zustand persistido en localStorage; cantidades limitadas por el stock de la instantánea. No es una reserva ni una validación autoritativa de inventario. |
| Admin | Login Supabase, allowlist de correo, páginas y acciones protegidas. Productos, proveedores, compras, ventas, pedidos, inventario y métricas tienen servicios reales. Operación en Production no comprobada en esta auditoría. |
| Productos e imágenes | Guardado atómico con versión e idempotencia, uploads separados y tareas de recuperación. Las pruebas locales cubren RPC, concurrencia y formulario. Procesador Storage y nueva retención segura siguen fuera de main. |
| Recomendaciones | Motor determinista en `/admin/consulta`, con preferencias, atributos y grupos de coincidencia. No usa un servicio de IA ni recomienda automáticamente en el catálogo público. Calidad actual de atributos reales no comprobada. |
| Checkout | Formulario y creación de cliente/pedido/items implementados mediante cliente anon, en llamadas separadas; precios vienen del carrito. Requiere rediseño de confianza y atomicidad antes de declararlo cerrado. |
| Pagos | Transferencia y Mercado Pago implementados; preferencia y webhook consultan servicios externos. No hubo transacciones reales, sandbox MP ni prueba integral de pago en esta ejecución. |
| Configuración | `/admin/configuracion` muestra valores de `lib/brand.ts`; no los edita. La tabla `settings` no convierte esa pantalla en un editor operativo. |
| Analytics | Agregación de pedidos/pagos/productos en `services/admin.ts`; no es un tablero ficticio. Exactitud con datos reales y reconciliación quedan por verificar. |

## Trabajo existente y despliegue

La [PR #1](https://github.com/Fedee17/sfstore/pull/1) está abierta, draft y sin merge al verificarla el 2026-10-10. Su rama `codex/storage-p1-safe-retention`, commit `be25492`, consolida el procesador y bloquea borrados de objetos existentes. El procesador original está en `codex/product-storage-task-processor`, commit `a5fa94e`. No asumir que main contiene esas protecciones ni repetir su implementación.

Worktrees existentes preservados: `/workspace/sfstore` (incluidos dos reports sin confirmar) y `/workspace/sfstore-storage-p1`. La rama remota `codex/autonomous-maintenance` también existe. Se creó un worktree separado para esta documentación.

El checklist histórico identifica Vercel y Production ligada a main. No se inspeccionó la configuración activa de Vercel/Supabase. Un push futuro a una rama conectada podría disparar un despliegue: revisar esa relación antes de publicar cambios. Esta ejecución no hace commit, push, merge ni deploy.

## Propuesta de ejecución semiautónoma

1. El propietario selecciona un alcance del backlog; su existencia no autoriza ejecutarlo.
2. Leer AGENTS y únicamente los documentos/archivos relacionados. Confirmar branch, estado y cambios existentes.
3. Clasificar por el efecto de mayor riesgo. Preparar tareas supervisadas en ramas aisladas; aprobar explícitamente tareas restringidas antes de ejecutarlas.
4. Agrupar un objetivo pequeño por rama; registrar decisiones y alcance. Validar primero lo específico y después los checks generales afectados.
5. Entregar diff revisable, evidencia y limitaciones. Commit/push según autorización; revisión humana antes de integrar tareas supervisadas. Nunca integrar o desplegar implícitamente.
6. Actualizar el estado del backlog y documentos cuando cambie la evidencia; evitar auditorías completas repetidas.

Orden propuesto: atender DEP-01 y diseñar PAY-01/PAY-02 con autorización, revisar Storage existente STG-01; después verificabilidad local (QA-01/QA-02), deuda rutinaria y mejoras supervisadas. Ver prioridades y dependencias concretas en el backlog.

## Decisiones del propietario pendientes

- Aprobar alcance de revisión/corrección de checkout, pagos y permisos; aportar un entorno de pruebas independiente y sandbox de Mercado Pago si se necesita integración.
- Decidir política de catálogo de respaldo ante error o catálogo vacío; no ocultar disponibilidad real por una decisión técnica unilateral.
- Revisar la PR de Storage y aprobar por separado migrations, integración y despliegue. Definir retención de archivos y mecanismo seguro de borrado antes de habilitar eliminación física.
- Confirmar condiciones de envío, costos, reservas de stock y precio vigente al pagar; hoy no hay reglas autoritativas completas para checkout público.
- Elegir prioridad de funcionalidades nuevas (configuración editable, recomendaciones públicas, categorías adicionales); no se consideran encargadas.
- Confirmar identidad visual para admin, datos comerciales/contactos y activos finales. Los documentos históricos de marca/banners discrepan con el código actual.
- Definir responsables de revisión, política de deploy por rama y gestión de secretos. No hace falta revelar credenciales para revisar esta documentación.
