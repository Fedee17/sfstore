# SFSTORE — Criterios permanentes para el proyecto Emprendimiento

**Actualización:** 19/11/2026 · Identidad boutique, prototipos web y control profesional.

**Propósito:** orientar decisiones en cualquier chat sin releer el historial. Este archivo complementa las instrucciones actuales del proyecto; no reemplaza manuales especializados.

## Prioridad
**«La tecnología tiene que ayudarnos a vender más, no convertirse en un proyecto que nos impida terminar la tienda».** Priorizar conversión, confianza, claridad de compra y operación cotidiana. No abrir proyectos técnicos accesorios si retrasan mejoras comerciales relevantes.

## Principio prioritario: agilidad, simplicidad y eficiencia

**Regla fundamental: ahorrar tiempo, reducir fricción y obtener el dato o resultado importante de inmediato.** Todo trabajo —tienda, administrador, atención, Codex, Claude y ChatGPT— debe minimizar pasos, clics, campos y mensajes sin comprometer precisión, seguridad, legalidad ni calidad.

- **Primero lo esencial:** costo → ganancia → precios, o el recorrido mínimo equivalente para cada tarea; controles avanzados disponibles pero ocultos por defecto.
- **Continuar sin fricción:** una aprobación expresa cierra esa decisión. Si el usuario solicita avanzar, entregar la acción o el prompt ejecutable de inmediato; no responder solamente que quedó aprobado ni pedir confirmaciones reiteradas.
- **No repetir:** consultar el estado vigente, reutilizar código, diseños, pruebas y decisiones aprobadas; no volver a investigar, proponer o rehacer lo resuelto.
- **Autonomía con límites:** decidir internamente detalles técnicos menores que estén autorizados; reservar consultas para decisiones comerciales/visuales pendientes, credenciales y autorizaciones exigidas para Production, pagos o datos reales.
- **Comunicación breve y útil:** respuesta directa al pedido, sin preámbulos, recapitulaciones, ofrecimientos o pasos genéricos; mostrar únicamente resultado, bloqueos reales y siguiente acción necesaria. Si se pide un prompt, darlo listo para usar en el mismo mensaje.
- **Fidelidad visual y control:** los mockups aprobados son especificaciones, no sugerencias; la rapidez no habilita alterar diseños, fórmulas, precios ni omitir verificaciones.

## Identidad y negocio
SFSTORE Importados: tienda pequeña en Argentina de perfumes importados y árabes, decants, mates, termos, yerbas, accesorios materos, electrónica pequeña y regalos. Público predominante: 18–35 años. Venta guiada y cercana: recomendar según gustos, uso, destinatario y presupuesto; nunca inventar atributos ni prometer condiciones no verificadas.

**Identidad digital vigente aprobada: boutique cálida, natural y premium accesible**, coherente con el local (madera, verde oliva, plantas y luz cálida). La paleta azul es histórica y queda en retirada progresiva de la interfaz pública, salvo colores propios de marcas o estados que deban conservarse. No cambiar el logo original. La ficha de Éclaire y su bloque «Sobre este producto» aprobados son la referencia visual; no equivalen a autorización para publicar o alterar otras pantallas. Referencias de UX: Parfumerie, Rouge, Raffe, Juleriaque, Godly.design y Transitions.dev; aprender de ellas, no copiarlas ni introducir dependencias por moda.

## Regla permanente de diseño digital: sistema reutilizable y fidelidad visual

- No alcanza con reemplazar azul por verde. La identidad incluye acabados, profundidad sutil, hojas fotográficas verdes y definidas, marfil cálido, beige, marrón, tipografía jerarquizada, aire visual e iconografía coherente. Evitar hojas planas, oscuras o desenfocadas y fondos genéricos. La decoración no debe competir con el producto.
- Diseñar y desarrollar a partir de `storefront-theme.css`, tokens y componentes compartidos. No duplicar estilos ni hacer que una ficha sobrescriba el encabezado u otros componentes desde afuera. Cada componente debe consumir el sistema común y gobernar sus propios estilos; aplicar el tema por contenedor durante la migración.
- Conservar la estructura, contenido, datos, lógica y estados de los componentes aprobados. No inventar logotipos, fotografías, reseñas, favoritos, cuentas, categorías o funcionalidades. Solo cambiar distribución cuando el propietario lo autorice expresamente.
- Los mockups de interfaces se entregan exclusivamente como prototipos web navegables, componentes renderizados o vistas previas locales reales, no como imágenes generadas de páginas. Partir del candidato vigente y reutilizar componentes y tokens. Las imágenes siguen permitidas como recursos fotográficos individuales y capturas de evidencia. Si no se puede renderizar o verificar, declarar el bloqueo; no sustituir el prototipo por una imagen.
- La aprobación del propietario es necesaria para cerrar visualmente cada componente; pasar pruebas técnicas no equivale a aprobación estética. No repetir una propuesta rechazada con un simple cambio de color. La versión inicial del encabezado del 19/11 fue rechazada; la continuidad registra las correcciones posteriores.
- Las especificaciones implementables se encuentran en `SFSTORE-ESTANDARES-DISENO-DESARROLLO.md`; no duplicarlas en cada prompt. La continuidad y los estados de tareas se registran en su documento correspondiente.

**Control profesional obligatorio antes de entregar:** el agente verifica por sí mismo la coherencia entre pantallas, tipografía, tokens, componentes, precios, estados, espaciados, fotografías y accesibilidad en móvil y escritorio. Corrige diferencias no autorizadas antes de mostrar la propuesta. El propietario aprueba decisiones, no detecta errores evitables. Si falta evidencia, informar qué no se verificó y no declarar aprobación. La coherencia de marca es un requisito comercial de confianza y conversión, no una preferencia opcional. Ver protocolo técnico en Estándares.

## UX/UI y comercio
La imagen del producto debe ser protagonista, especialmente en celular; luego elegir variante, entender precio y disponibilidad, y comprar. Mantener elección de variante explícita, sin confundir foto representativa con SKU elegido. Cada presentación debe mostrar su foto real correcta; no inventar imágenes ni reemplazar fotos de frascos por decants. Informar claramente precios y medios realmente habilitados; **25% de descuento por transferencia sobre lista, pago completo**. Diferenciar pedido preparado/creado, pago acreditado y venta confirmada: la acreditación actual es manual. No afirmar envío, retiro o stock inmediato sin verificación. Retiro comunicado: lunes a sábados de 17:30 a 20:30, sujeto a confirmación del pedido. Envíos nacionales por el flujo existente.

## Regla estricta de imágenes comerciales: fidelidad y naturalidad
**Obligatoria para banners, tarjetas de categorías, redes y cualquier pieza visual de SFSTORE.** Priorizar que el cliente reconozca el producto real por encima de una composición espectacular. Las imágenes generadas son propuestas, **no pruebas de fidelidad**.

1. **Producto verificable.** Antes de crear la pieza, elegir productos reales de SFSTORE y utilizar fotografías de referencia aprobadas. No inventar envases, etiquetas, notas, marcas, modelos, tamaños ni características; si falta referencia suficiente, señalarlo.
2. **Fidelidad del frasco u objeto.** Respetar silueta, tapa, bordes y curvas, proporciones, materiales, colores, textos y logotipos. No presentar como fotografía fiel una recreación que cambie esos detalles. En mates y termos también respetar virolas, costuras, bases y accesorios.
3. **Naturalidad fotográfica.** Buscar luz lateral cálida y creíble, sombras de contacto coherentes, reflejos propios del vidrio o metal y texturas auténticas. Evitar iluminación excesivamente perfecta, brillo artificial, materiales plásticos y aspecto de render 3D.
4. **Composición comercial sobria.** Usar pocos productos protagonistas y decoración secundaria (madera, piedra, plantas u otros elementos pertinentes); evitar escenografías recargadas o poses imposibles. Mantener coherencia visual entre piezas sin repetir exactamente la misma escena.
5. **Diseñar para el destino.** Definir medidas, recortes y zonas seguras de fotografía y texto **antes** de generar. Los textos y CTA de la web se implementan en HTML/CSS, no incrustados en fotografías de fondo, salvo pedido explícito.
6. **Edición controlada.** Si se pide corregir un elemento puntual, conservar intacto lo demás. Nunca borrar inscripciones propias del producto al retirar textos publicitarios. Si la edición por IA no puede asegurar fidelidad, usar fotomontaje controlado con referencias originales o declarar la limitación; no prometer precisión píxel a píxel.
7. **Revisión previa obligatoria.** Comparar la propuesta con las referencias ampliadas, revisar detalles y proporciones, integración con el fondo y apariencia natural, y comprobar el recorte en móvil y escritorio. No aprobar ni implementar una imagen con errores visibles sin autorización expresa del propietario.

## Regla estricta de eficiencia: no repetir trabajo aprobado
**Obligatoria en todas las tareas de SFSTORE, especialmente diseño, generación de imágenes, mockups y desarrollo.** La prioridad es entregar el resultado solicitado con el menor trabajo redundante posible, sin trasladar decisiones técnicas innecesarias al propietario.

1. **Inventario antes de proponer o crear.** Revisar qué recursos, imágenes, bocetos, archivos, pruebas y decisiones ya existen; distinguir claramente **aprobado**, **en revisión** y **realmente pendiente**. No pedir de nuevo información o referencias ya aportadas.
2. **Reutilizar antes de regenerar.** Si existe una imagen o composición aprobada, trabajar sobre ese recurso. No generar versiones nuevas, cambiar la escena ni repetir una vista previa salvo que exista una necesidad concreta y justificada para el resultado solicitado.
3. **Una corrección, un alcance.** Aplicar únicamente lo pedido y preservar las partes aprobadas. No reabrir decisiones cerradas, ni cambiar formatos, productos, textos o ambientación por iniciativa propia.
4. **Validar antes de mostrar.** Comprobar medidas reales, fidelidad de productos, etiquetas, legibilidad, composición y ausencia de errores evidentes. No entregar imágenes de gran formato como si fueran vistas previas verificadas a escala ni declarar un recurso «final» si falta comprobarlo.
5. **Progreso comprobable.** Al informar el siguiente paso, explicar brevemente qué **ya está hecho** y cuál es la **única tarea pendiente** que permite avanzar. Si el paso ya fue completado, pasar al siguiente, no volver a proponerlo.
6. **Responsabilidad de ejecución.** Elegir internamente el método técnico más eficiente y realizar las comprobaciones posibles sin pedir aprobaciones reiteradas para detalles menores. Reservar la intervención del propietario para decisiones visuales o comerciales reales y autorizaciones requeridas.
7. **Detener el ciclo improductivo.** Si dos intentos no resuelven la misma corrección, no insistir con variantes casi idénticas: identificar la causa, cambiar de método o reconocer la limitación antes de consumir más generaciones.

**Criterio de cierre:** un entregable se considera terminado solo cuando cumple la necesidad acordada y fue validado en su uso real, no por la cantidad de bocetos o iteraciones producidas.

## Desarrollo y colaboración
Stack: Next.js, Supabase y Vercel. Codex implementa y prueba; ChatGPT evalúa resultados y ayuda a decidir. **Antes de crear algo, comprobar lo ya existente.** Reutilizar editor, componentes, galería y servicios; nada de pantallas duplicadas. Los cargadores virtuales son dos publicaciones (USB-C a USB-C y USB-C a Lightning) con componentes y stock compartidos; cada una se administra desde el editor normal del producto. No alterar recetas, cantidades, pagos ni seguridad por cambios visuales.

El **Plan de Mejora Continua, sección 9**, es la única cola de tareas; no abrir planes paralelos. Conservar informes y auditorías anteriores como fuentes bajo demanda. Distinguir hallazgos comprobados de hipótesis. No repetir validaciones aprobadas sin cambios o riesgos que lo justifiquen, pero tampoco omitir verificaciones de seguridad y post-publicación.

## Regla estricta de Git: aislamiento, trazabilidad y autorización
**Obligatoria para toda tarea de Codex.** No iniciar una tarea independiente sobre cambios de otra tarea sin aislarlos o resolver explícitamente su estado. Un árbol sucio no es automáticamente un error si todos los cambios están identificados y pertenecen a la tarea activa; sí es un bloqueo si su origen o alcance es incierto.

1. **Control de entrada.** Antes de editar: confirmar repositorio, worktree, rama, HEAD, `git status` (staged, unstaged y untracked), base de comparación y si existen tareas paralelas. Informar cualquier cambio previo y no sobrescribirlo.
2. **Una responsabilidad por rama/worktree.** Separar funcionalidades, diseño y mantenimiento no relacionado. Si se detecta un fallo ajeno, diagnosticarlo y solicitar autorización antes de editar; usar otro worktree cuando corresponda.
3. **Alcance explícito.** Registrar objetivo, archivos o áreas autorizadas y prohibiciones. Si se requieren archivos adicionales, detenerse y pedir aprobación de la ampliación. No incluir temporales, credenciales, artefactos generados o archivos ignorados sin necesidad justificada.
4. **Puntos de control.** Validar el cambio en su propio entorno (pruebas pertinentes, TypeScript, lint, build y revisión visual cuando aplique). Distinguir pruebas aprobadas, fallidas y omitidas; no presentar omisiones como éxitos. Comunicar diferencias y riesgos antes del commit.
5. **Commit trazable.** Crear commits acotados por tarea, solo con aprobación expresa o autorización previa delimitada; verificar lista de archivos y árbol limpio al cerrar. No mezclar correcciones de base con cambios comerciales o visuales en el mismo commit.
6. **Integración completa, no solo último diff.** Antes de merge/push comparar la **rama completa** con `origin/main` actualizado, incluidos commits anteriores; comprobar conflictos, pruebas y alcance comercial. Cuando haya líneas independientes, validar el árbol combinado en entorno aislado.
7. **Publicación separada.** Commit, push, merge y despliegue son operaciones distintas y requieren la autorización correspondiente. Un push puede activar Vercel: verificar configuración efectiva, dominio, deployments y plan de reversión antes de cualquier acción remota. Nunca asumir que el merge es inocuo por tener un árbol local limpio.
8. **Regla de detención.** Ante cambios inesperados, fallos nuevos, divergencia no explicada, conflicto o necesidad de alterar Production, seguridad, inventario o pagos: detenerse, preservar estado y comunicar causa, archivos afectados y solución mínima; no corregir por cuenta propia fuera del alcance.

**Cierre obligatorio de cada tarea:** informar rama/worktree, HEAD, estado de Git, archivos cambiados, validaciones (incluidas omisiones), autorizaciones pendientes y próximo paso. La sección 9 del Plan conserva el seguimiento; no duplicar una nueva cola aquí.

## Permisos y forma de respuesta
**Regla de concisión obligatoria:** responder directamente a lo solicitado, con la mínima extensión necesaria para resolverlo correctamente. No divagar, repetir contexto conocido, agregar introducciones, conclusiones, explicaciones, listas ni próximos pasos no pedidos. Ampliar solo cuando sea imprescindible para evitar errores o cuando el usuario solicite detalle.

No autorizar cambios en Production, migraciones, precios, stock, productos, permisos ni despliegues sin autorización explícita. Pruebas sin pedidos reales salvo permiso específico. Controlar Vercel y restablecer `Ignored Build Step = Automatic` tras publicaciones controladas. Responder en español argentino, **breve y práctico**: explicar qué informó Codex, si se aprueba, riesgos reales y próximo paso. Evitar auditorías o prompts largos por reflejo.
