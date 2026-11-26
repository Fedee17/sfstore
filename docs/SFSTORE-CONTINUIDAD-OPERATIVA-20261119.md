# SFSTORE — Continuidad operativa (actualización de diseño al 19/11/2026)

**Uso:** leer este archivo al iniciar otro chat del proyecto. Resume únicamente estado y siguiente trabajo; **no repite** criterios, manuales ni backlog. Basado en el último informe de Codex y capturas aportadas, no en una consulta actual a producción. Antes de ejecutar cambios, comprobar estado real en Git/Supabase/Vercel.

## 1. Base histórica operativa (informe del 04/11/2026; no usar como estado actual de Git)

- Negocio y propuesta de valor: ver `SFSTORE-CRITERIOS-PERMANENTES.md`; no duplicar aquí.
- Repositorio: `Fedee17/sfstore`. Producción: https://sfstore-ten.vercel.app/.
- **Commit publicado en `main` al 04/11:** `30625ef403bd3bc79b4419381c1fb598c034a992`; **deployment:** `dpl_5GLkAmox6jcemusuA7HQJzZqd7d6`, READY, según informe de Codex. `Ignored Build Step = Automatic` restaurado.
- **Seguimiento local al 04/11:** commit `0c20777`, deliberadamente **sin push** para evitar otro deployment. No confundirlo con producción. Último worktree limpio según reporte.
- Validación reportada: 995 tests aprobados, 0 fallidos, 19 omitidos; TypeScript/build OK; ESLint 13 warnings sin errores. Aviso moderado de dependencias runtime, no bloqueante según informe. Home y catálogo probados a 390, 768 y 1366 px; sin overflow ni imágenes rotas reportados. No equivale a auditoría exhaustiva de UX, accesibilidad ni conversión.

## 2. Hecho y cerrado: no reabrir sin evidencia de regresión

- **Precios:** transacción atómica confirmada sobre 25 IDs de perfumes: 20 frascos activos con stock y 5 borradores que luego se publicaron. Fórmula de **precio especial efectivo/transferencia**: techo al próximo múltiplo de $1.000 de `costo × 1,40` (aritmética exacta). **Lista:** `especial / 0,75` con redondeo monetario existente. Descuento de 25% desde lista. Lote excluyó 54 registros (35 agotados, 10 decants activos, 2 borradores no seleccionados, 7 archivados). No aplicar automáticamente a decants ni demás categorías. No volver a repriciar ese lote salvo nueva decisión comercial.
- **Administrador:** acción explícita «Calcular precio sugerido (+40%)» para perfumes completos; no recalcular al abrir o guardar otro campo. El bloque fijo duplicado de cargadores en venta local se retiró, manteniendo ambos cargadores buscables. Si persiste algún problema de búsqueda como «Acrili», reproducirlo antes de intervenir.
- **Cinco productos antes en borrador, ahora publicados:** Bharara Rome Pour Femme ($95.000 especial), Afnan 9AM Pour Femme ($85.000), Club de Nuit Maleka ($96.000), Club de Nuit Woman ($91.000) y Rasasi Hawas Malibú ($91.000). Importes provenientes de la aprobación de octubre, **no garantía de precio ni stock actual**. Se completaron fichas y portadas `IMG_1876.webp`, `1877`, `1878`, `1879`, `1892` según correspondencia de Codex. No inventar intensidad ni presentación de Rome.
- **Fotografías:** 59 imágenes reales preparadas para 37 productos; 3 ya publicadas + 5 de los borradores + 51 restantes incorporadas, según reporte. **75 imágenes finales de galería**, conservando 19 fotos previas sin borrados. No duplicar uploads ni asociar frascos a decants. Correcciones ya aplicadas: Club de Nuit Iconic 105 ml, Club de Nuit Intense Man EDT 105 ml, Stallion 53 Uomo Intense 100 ml + atomizador 20 ml.
- **Web:** header compacto y Ayuda → `/ayuda`; tarjetas adaptadas a fotos verticales; textos de categorías más legibles; home con banners, cuatro categorías, beneficios, destacados y zonas de regalos/asesoramiento. Carrito/checkout y precios verificados; API pública sin costos ni atributo administrativo `Proveedor` según pruebas. Respetar TLS, RLS y validación server-side.

## 3. Continuidad visual vigente al 19/11/2026

**Objetivo:** identidad boutique unificada en toda la tienda mediante el sistema centralizado; no reconstruir componentes ni alterar la lógica comercial. La estética azul anterior no es el objetivo. Leer los criterios permanentes y, para implementar, los estándares actualizados; no duplicar sus reglas aquí.

**Estado comunicado por Codex (candidato local, sin publicación):**
- Fichas de perfumes: referencia visual aprobada de Éclaire, galería real con miniaturas verticales en escritorio y horizontales en móvil, bloque superior más aireado con cuatro notas ilustradas, panel de precio y ahorro conservado, «Sobre este producto» con composición, pirámide y acordes documentados. Auditoría posterior: 56 fichas con cuatro notas ilustradas, 55 con pirámide completa. Única excepción de pirámide informada: decant Rasasi Hawas Verde, notas sin etapas por fuentes discrepantes. Datos preparados sin escrituras en Supabase. No inventar la etapa faltante.
- Arquitectura etapas 1–2: `storefront-theme.css` centraliza tema y recursos; componentes con estilos propios que consumen el sistema. Codex informó 42 comparativas idénticas píxel por píxel y 58 pruebas aprobadas. Home, carrito y checkout no adquirieron el tema en esas etapas.
- Etapa 3, encabezado: versión inicial rechazada, luego corregida con oliva más vivo, hojas transparentes y navegación más aireada. Codex informó 50 pruebas y revisión en navegador; el propietario autorizó avanzar a la home. Mantener el encabezado compartido vigente; no rediseñarlo. Checkout conserva encabezado propio. Estado local informado, no publicado.

**Próximo paso:** implementar la home como vista previa web local controlada, usando el sistema compartido y la ficha real aprobada de Éclaire como fuente estética. La distribución de las tres secciones del boceto de home elegido se conserva, pero sus tipografías, precios, botones, logo y acabados generados no sustituyen el sistema real. No generar más imágenes de mockups UI. El propietario solicitó categorías con fotografías ambientadas y productos aislados sin fondo en «Los más elegidos» y «Ritual Matero», sin recortes desprolijos: usar recursos individuales fieles verificados, con autorización visual antes de sustituir fotos. Conservar textos, títulos, descripciones breves, precios y descuentos reales; mostrar ahorro con variante compacta del componente compartido. Mantener resto de la home fuera de cambios no autorizados. Comparar home y ficha en navegador antes de pedir aprobación. Después: catálogo, carrito lateral/página juntos y checkout al final. Seguir backlog canónico.

**Referencias visuales y técnicas existentes (no recrear):**
- Mockup escritorio aprobado: `a_detailed_web_product_page_mockup_desktop_in_sp.png`; móvil como referencia estética: `a_detailed_mobile_app_product_page_screenshot_in_t.png`, con la organización responsive real de «Sobre este producto» preservada. Bloque superior aprobado de cuatro notas: `a_clean_product_info_ui_section_on_a_warm_cream_ba.png`. Estos nombres identifican imágenes de esta conversación; si no están accesibles, recuperar las capturas reales del candidato con Codex, no improvisar una referencia nueva.
- `docs/STOREFRONT-DESIGN-ARCHITECTURE.md` y `storefront-theme.css` del candidato local; informe de comparativas `arquitectura-boutique/EVIDENCIA.md`; capturas `ficha-perfumes-cierre/`, `etapa-3-encabezado/`. Rutas relativas a las entregas de Codex, no archivos comprobados en Production.
- Candidato informado: `C:/dev/sfstore/.worktrees/next-16-4-6-20261116` (Next.js 16.4.6 en local). Última consulta de `main` registrada en la conversación (18/11): `4393eeab4a7b90da3153e93294517b939ad8a4ef`; verificar nuevamente antes de intervenir. No asumir que el candidato fue publicado ni que tareas paralelas están integradas.

## 4. Mapa documental: cómo usar los archivos SIN releer todo

**Lectura inicial obligatoria (solo dos):**
1. `SFSTORE-CRITERIOS-PERMANENTES.md` — reglas estables: identidad, cliente, diseño, imágenes fieles, eficiencia, permisos y Git.
2. **Este documento** — estado reciente, tareas terminadas y próximo paso.

**Abrir solo según el trabajo:**
- Web / código: `SFSTORE-ESTANDARES-DISENO-DESARROLLO.md`. El manual `SFSTORE-DIRECTRICES-MAESTRAS.md` amplía UX/CRO; consultar solo si hace falta detalle adicional, **no leer ambos enteros por defecto**.
- Redes / contenido: `SFSTORE_Manual_Maestro_Contenido_2026.pdf`.
- Reels basados en referencias externas: **obligatorio** `SFSTORE_Protocolo_Obligatorio_Reels_Work_v1.0.md` y ejecutar sus etapas.
- Historias específicas de perfumes: `SFSTORE_Anexo_Estilo_Historias_Perfumes_v1.0.md`.
- **Backlog canónico y decisiones técnicas vivas:** `docs/SFSTORE-PLAN-MEJORA-CONTINUA.md`, **sección 9 del repositorio**. No crear otro backlog. `SFSTORE_Plan_Mejora_Continua_v1.0.md` adjunto es una copia histórica y no debe dirigir nuevas tareas.

**Documentos que no deben quedar duplicados en archivos activos del proyecto:**
- `SFSTORE-CONTINUIDAD-OPERATIVA-20261119.md` **versiones anteriores**: reemplazar con esta versión del **mismo nombre** (no conservar ambas).
- `SFSTORE_02_CONTINUIDAD_2026-11-04.md` si se agregó previamente: es un segundo traspaso; **quitarlo** y usar solo este archivo.
- `SFSTORE_Kit_Continuidad_2026-11-04.zip`: **no agregar al proyecto**. No es una fuente de instrucciones.
- Nueve PDFs externos de Amach Studio (incluidos los BONUS): recursos de consulta opcional, no instrucciones permanentes; conviene retirarlos de archivos activos si no se usan y conservarlos fuera del proyecto, para incorporarlos a un chat solo cuando sean necesarios.

## 5. Forma de colaboración al retomar

ChatGPT evalúa opciones, impacto comercial y consistencia; Codex implementa y verifica. Evitar prompts largos que repitan el contexto. Pedir a Codex el estado Git/producción y el backlog real solo si se va a actuar. No editar precios, stock, fichas, permisos, base de datos ni desplegar sin permiso explícito. Priorizar precisión y mensajes breves en español argentino con voseo. Las reglas extensas de autorización y Git están en **Criterios permanentes**, no repetirlas.

## 6. Contexto recuperado de conversaciones recientes (19/11/2026)

**Actualización posterior:** el apartado 3 incorpora las decisiones más recientes del 19/11. La propuesta Home v4 no está aprobada como identidad independiente: su distribución se conserva, sus acabados se normalizan con los componentes reales. La siguiente entrega debe ser web navegable, no imagen. El control profesional previo se rige por Criterios Permanentes y Estándares v1.2.

- Ficha individual: el propietario pidió foto completa y centrada, sin franjas grises, recortes ni relleno desenfocado, proporcionada para dejar lugar al título, precio y resto de la ficha.
- Local: preferencia por relieves, madera, plantas y toque rústico, no minimalismo extremo. Desde la entrada: estantería de mates próxima a puerta secundaria, paso de una persona adulta entre mostrador y estantería; planta entre puerta secundaria y logo. Confirmar medidas y fotos antes de mover muebles.
- Cartel de vereda: 100 × 65 cm, vertical, simple y legible, realizable a mano; usar logo real, Instagram y productos reconocibles, no saturar palabras ni ilustraciones difíciles.
- Historias: para composiciones de notas sobre foto original, marca centrada mediana arriba, nombre mayor debajo, frase comercial sin repetir y sin CTA si no aporta; conservar fondo real. Situaciones de regalo adaptadas a destinatario.
- Clasificación comercial de perfumes: cuando el usuario pida segmentar por género, separar femeninos y masculinos, no introducir categoría unisex en esa salida; separar masculinos otoño/invierno y primavera/verano cuando se solicite. No forzar asignaciones sin evidencia.
- Referencias web de inspiración: Parfumerie, Rouge, Raffe, Juleriaque, Godly.design y Transitions.dev (sin URL exacta verificada aquí).
- Historial técnico parcial: fase 4B.1 de recomendaciones informó rama feat/perfume-recommendation-thresholds, commit 5c047e7101168979aa43dbb0d63fc3df017fcbd5, umbrales primaria 70/secundaria 40, sin merge según ese informe; verificar si avanzó antes de tocar. Importación histórica reportó 48 mappings REVIEW sin asignación automática (3 ambiguos y 45 no encontrados), incluido duplicado Yara Rosa; estado posterior desconocido, no ejecutar correcciones a partir de este dato antiguo.

## 7. Automatizaciones y auditoría (consulta de configuración 19/11/2026)

- Activa: Auditoría integral diaria SFSTORE, 17:00 Argentina, ID 6aeb337d253c8191a89acd5ffa921c3b. Última ejecución registrada 18/11. Revisar continuidad y evitar duplicarla al migrar.
- Pausadas: Auditoría diaria SFSTORE (03:00), Prueba navegador SFSTORE (única), Desarrollo autónomo SFSTORE (horaria). No reactivar sin autorización; la última tiene instrucciones históricas de escritura y push que deben reconciliarse con criterios Git vigentes.
- Auditoría integral: solo lectura de producción; evidencia end-to-end mediante pruebas sintéticas aisladas de pedido/transferencia, nunca pagos ni pedidos reales. GitHub endpoint exacto https://api.github.com/repos/Fedee17/sfstore/actions/runs sin parámetros; filtrar workflow SFSTORE daily storefront audit, event schedule, fecha local, status/conclusion; consultar ambos jobs/logs, SFSTORE_AUDIT_SUMMARY_JSON y TAP. Contrastar SHA con Vercel production. Cron nominal 04:15 local, ejecuciones 14–17/11 iniciadas 11:08–13:59. Si no hay evidencia del día: NO VERIFICADO. Histórico 17/11: 45 PASS, 0 FAIL, 2 WARN, backend 9/9, Lighthouse móvil 74, LCP 6.4 s; fallo del 13/11 de selector carrito corregido por PR #22. No confundir datos de laboratorio y producción real. Informe breve con semáforo, evidencia, impacto y hasta tres acciones. No modificar nada.

**Límite de recuperación:** se conservaron todos los adjuntos disponibles y los datos visibles en resúmenes recientes; no se exportaron conversaciones completas ni imágenes de chats antiguos, archivos locales de Codex, datos conectados privados o historial completo de ejecuciones. Este documento no sustituye esos originales.
