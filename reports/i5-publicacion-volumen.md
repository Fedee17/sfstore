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
