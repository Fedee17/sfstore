# I5 — Procedimiento de publicación y reversión (PR #37)

Se ejecuta sólo con autorización explícita del propietario para cada paso. No usar `supabase db push`, `migration repair` ni comandos remotos de la CLI. Este procedimiento no carga datos de volumen.

## Archivos y hashes (sha256 sobre el texto con fin de línea LF)

| Archivo | sha256 |
|---|---|
| `supabase/migrations/202611280001_perfume_volume_attribute.sql` | `c4590dd289046328ea40d9df5e2ef991f61ec4663f3827f5e186bf0496ec2008` |
| `reports/perfume-volume-attribute-rollback.sql` | `f926b802d0951700e54aaa39701cdf1398ccf6c9802316788de36a36b4b19d31` |

## Por qué el orden es: primero la migración, después el código

| Combinación | Resultado (probado en PostgreSQL aislado) |
|---|---|
| Código anterior + función anterior | Estado actual |
| **Código anterior + función nueva** | Funciona. El editor anterior no envía `volume_managed`, así que no borra ningún volumen cargado |
| **Código nuevo + función anterior** | **Rompe el guardado de perfumes**: la función anterior rechaza `volume_managed` con `PRODUCT_INVALID_FIELDS` |
| Código nuevo + función nueva | Estado final |

Conclusión:
- Para publicar: **primero la migración y después el código**.
- Para revertir: **primero el código y después la migración**.

## Publicación

1. **Verificación previa** (sólo lectura, en el SQL Editor de producción):
   ```sql
   -- Requisito: la migración de precio de contado está aplicada (la nueva parchea su texto).
   select position('cash_price_approved' in pg_get_functiondef('public.save_product_atomic_internal(uuid,text,uuid,text,jsonb)'::regprocedure)) > 0 as stored_cash_ok;
   -- Debe ser false: la migración todavía no se aplicó.
   select position('volume_managed' in pg_get_functiondef('public.save_product_atomic_internal(uuid,text,uuid,text,jsonb)'::regprocedure)) > 0 as ya_aplicada;
   -- Huella de la función actual, para comprobar la reversión.
   select md5(pg_get_functiondef('public.save_product_atomic_internal(uuid,text,uuid,text,jsonb)'::regprocedure)) as huella_previa;
   -- Filas existentes con el nombre gestionado. Se espera 0; si hay alguna fuera de la lista, la migración se detiene sola.
   select value, count(*) from public.product_attributes where name = 'contenido' group by value;
   ```
   Anotar `huella_previa`. Si `stored_cash_ok` es false, no seguir.

2. **Aplicar la migración**:
   - Comprobar el hash del archivo.
   - Pegar el contenido completo de `202611280001_perfume_volume_attribute.sql` en el SQL Editor y ejecutarlo una sola vez. Es una transacción, con `lock_timeout` de 3 s.
   - Si falla, no queda ningún cambio aplicado. Los errores posibles son:
     - `PERFUME_VOLUME_BASE_CONTRACT_CHANGED`: la función no coincide con la versión probada.
     - `PERFUME_VOLUME_UNMANAGED_VALUE_PRESENT`: hay filas `contenido` con valores fuera de la lista.
     - Un timeout por bloqueo.
   - Si la migración no se aplicó, no seguir con el despliegue.
   - Registrar la versión en el historial de migraciones del mismo modo que las migraciones anteriores aplicadas desde el SQL Editor.

3. **Comprobar** (sólo lectura): `ya_aplicada` debe dar true. Opcionalmente, y con autorización porque es una escritura, se puede guardar sin cambios un perfume desde el admin *actual* (todavía el código anterior): debe funcionar y no tocar ningún atributo `contenido`.

4. **Integrar el PR #37 en `main`**: dispara el despliegue de Vercel. Esperar el deployment de producción en estado Ready para el commit integrado.

5. **Verificación posterior**, sin cargar datos reales:
   - `/perfumes` y `/perfumes?categoria=arabe` cargan sin errores. El filtro «Contenido» no aparece hasta que haya volúmenes cargados.
   - Una ficha de perfume se ve igual que antes.
   - En el admin, el editor de un perfume muestra el selector «Contenido» en «Sin especificar». Abrirlo **no** obliga a guardar.

6. **Cargar los datos**: es un paso aparte, que requiere su propia autorización. Se cargan los 9 volúmenes confirmados o de certeza alta de `reports/i5-volumen-perfumes-20261128.md`, uno por uno desde el editor.

## Reversión

### A. Revertir sólo el código

En Vercel, promover el deployment de producción anterior (Instant Rollback), o revertir el merge en `main`.
- Es seguro con la función nueva: el editor anterior no borra los volúmenes cargados.
- **Efecto visible**: el código anterior muestra el valor crudo («Contenido: 100-ml») en las fichas con volumen cargado, y no tiene filtro de volumen.

### B. Revertir también la migración

Hacerlo **sólo después de A**:
1. Comprobar el hash del archivo `reports/perfume-volume-attribute-rollback.sql`.
2. Ejecutarlo en el SQL Editor. Es una transacción y falla si la función no tiene exactamente el parche aplicado.
3. Comprobar que `md5(pg_get_functiondef(...))` coincide con `huella_previa`.

Las filas `contenido` cargadas se conservan. Si además hubiera que retirarlas, eso es una eliminación de datos y requiere su propia autorización.

**Probado en PostgreSQL aislado:**
- La reversión restaura la definición exacta (misma huella md5).
- El editor anterior conserva los volúmenes cargados.
- El editor nuevo es rechazado mientras la función anterior está activa, y por eso el orden importa.
- La migración se puede volver a aplicar después de revertirla.

## Compatibilidad con Mercado Pago (sin aplicar nada)

- **Migraciones de Mercado Pago**:
  - `202611270001_mercadopago_checkout.sql` (en `main`) parchea funciones de checkout (`create_checkout_atomic`, `transition_checkout_atomic` y guardas) y no toca `save_product_atomic_internal` ni `product_attributes`.
  - La pendiente `202611270002_mercadopago_card_attempts.sql` (rama de Codex `codex/mercadopago-activation-readiness`, commit `16ee39a`) sólo crea `checkout_mercadopago_card_attempts` con RLS.
- **Prueba de orden** en PostgreSQL aislado, sobre el manifest completo: las dos migraciones aplican en ambos órdenes (MP → I5 e I5 → MP), con la función de guardado parcheada y la tabla de MP creada.
- **Conclusión**: el orden entre ellas es indistinto, y las dos versiones no se superponen (`202611270002` < `202611280001`).

## Resultado de la publicación (27/11/2026, ~09:00 Argentina)

Autorizada expresamente por el propietario. Ejecutada en el orden del procedimiento.

| Paso | Resultado |
|---|---|
| 1. Verificación previa | `stored_cash_ok=true`, `ya_aplicada=false`, `huella_previa=057d51689264c550e92bff0cc78ff0b2`, 0 filas `contenido` (coincide con la lectura previa del propietario) |
| 2. Migración | Texto cargado en el SQL Editor con sha256 comprobado en el propio editor (`c4590dd2…ec2008`); ejecutada una vez: «Success. No rows returned» |
| Registro | `supabase_migrations.schema_migrations` no existe en el proyecto; no hay registro que actualizar, igual que en las migraciones anteriores aplicadas desde el SQL Editor |
| 3. Comprobación | `ya_aplicada`, lista `contenido` y guarda `PRODUCT_INVALID_ATTRIBUTE` presentes; `cash_price_approved` intacto; huella nueva `5eb4539184a10a9eb877d80af9a69cbd`; 0 filas `contenido` |
| 4. Integración | PR #37 squash `92d9a38` sobre el head revisado `56c87c0`; deployment de Production Ready |
| 5. Verificación | `/perfumes` y `/perfumes?categoria=arabe` sin errores y sin filtro «Contenido»; `?contenido=100-ml` devuelve 0 productos (código nuevo activo); ficha de Club de Nuit Iconic igual que antes |

Sin verificar: el editor del admin, porque requiere la sesión del propietario.

No se hizo: carga de volúmenes, cambios de precios o stock, migraciones de Mercado Pago.

Para la reversión, `huella_previa` es `057d51689264c550e92bff0cc78ff0b2`.

## Carga de volúmenes (27/11/2026)

Autorizada expresamente por el propietario para los 9 valores confirmados o de certeza alta. Se hizo desde el SQL Editor, porque el editor del admin requiere la sesión del propietario. Las filas son las mismas que escribe el editor: `name='contenido'`, `sort_order=150`.

- **Antes** (solo lectura): los 9 slugs existen, el prefijo de ID coincide con el informe y son perfumes activos con stock 1. Ninguno tenía `contenido`, `Contenido`, `Volumen` ni `Capacidad`.
- **Escritura**: una transacción que vuelve a comprobar los 9 productos y la ausencia de filas previas, inserta 9 filas y exige que sean exactamente 9.
- **Después**: 9 filas `contenido` en total (100-ml ×6, 105-ml ×1, 90-ml ×2). Precio y stock sin cambios.
- **Producción**: el filtro «Contenido» ofrece 90, 100 y 105 ml. `?contenido=100-ml` devuelve Rome Pour Femme, Hawas For Him, 9 PM Elixir, Hawas Fire, Asad y Eclaire; `105-ml` devuelve Club de Nuit Sillage; `90-ml` devuelve Qaed Al Fursan y Untamed. En la ficha de Sillage, «105 ml» aparece bajo el título y en «Contenido».

Para retirar solo estos valores (es una eliminación de datos y requiere autorización): `delete from public.product_attributes where name = 'contenido' and sort_order = 150 and product_id in (…9 ids…)`.

## Segunda carga: 12 volúmenes informados por el propietario (27/11/2026)

El propietario informó: «La presentación estándar de todos estos perfumes es de 100 ml, excepto Club de Nuit Intense Man, cuyo frasco base viene en 105 ml». Ese dato reemplaza la foto de la etiqueta pedida en `reports/i5-volumen-perfumes-20261128.md`.

- **Antes** (solo lectura): los 12 existen, el prefijo de ID coincide, son perfumes activos (Yara Tous con stock 2 y el resto con 1) y ninguno tenía volumen de ningún tipo.
- **Escritura**: el mismo procedimiento con controles que la primera carga; exige exactamente 12 filas nuevas con `sort_order=150`.
  - **100 ml**: lattafa-yara-rosa, perfume-lattafa-yara-tous, lattafa-yara-moi, lattafa-mayar-natural-intense, odyssey-aqua, odyssey-artisto, odyssey-go-mango, odyssey-limoni, odyssey-wild-one, sceptre-malachite-maison-alhambra y vulcan-feu-french-avenue.
  - **105 ml**: club-de-nuit-intense-man.
- **Después**: 21 filas `contenido` (17 × 100 ml, 2 × 105 ml, 2 × 90 ml). Precio y stock sin cambios.
- **Producción**: `?contenido=100-ml` devuelve 17 productos, `105-ml` devuelve Intense Man y Sillage, y `90-ml` devuelve 2. Las fichas de Intense Man, Yara Rosa, Yara Tous y Wild One muestran «Contenido» con su volumen.
