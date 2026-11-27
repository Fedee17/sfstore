# CAT-01 y CAT-02 — preparación (26/11/2026)

Fuente: catálogo público de producción (`sfstore-ten.vercel.app`, deployment de `168ddc6`), leído por GET. Sin escrituras ni cambios de datos.

## CAT-01 — Clasificación de dos mates

Atributos actuales (son todos los que tiene cada producto; la ficha pública expone la lista completa):

| Producto | ID | Categoría actual | Atributos actuales | Precio lista / contado | Stock | Foto |
|---|---|---|---|---|---|---|
| Imperial con refuerzo de alpaca y base de bolitas (`imperial-con-refuerzo-alpaca-y-base-de-bolitas`) | `c79ee2ec-e006-4be2-b54a-da869542b698` | Accesorios (`6c932233-8d56-4c99-a066-cb44a37cc0ea`) | Tipo = Accesorios | $44.000 / $33.000 | 1 | 1 (`51cf6f1d….webp`) |
| Torpedo criollo con base (`torpedo-criollo-con-base`) | `dcf4dcf5-1abe-4c87-8e5a-0217532b4a69` | Accesorios (`6c932233-8d56-4c99-a066-cb44a37cc0ea`) | Tipo = Accesorios | $38.000 / $28.500 | 1 | 1 (`a6acf392….webp`) |

Cambios exactos propuestos (desde el editor del administrador, que conserva precio, stock, fotos, ID y slug y revalida las rutas):

| Campo | Imperial | Torpedo |
|---|---|---|
| Categoría | Accesorios → **Mates** (`61a589e6-7a88-4236-8813-8e3cbfdc3182`) | Accesorios → **Mates** (`61a589e6-…`) |
| Tipo | Accesorios → **Mates** | Accesorios → **Mates** |
| Tipo de mate (`mate_type`) | **Imperial** | **Torpedo** (el nombre dice «torpedo criollo»; `criollo` también existe como opción: confirmar) |
| Material (`material`) | **Calabaza, Alpaca** (refuerzo y virola de alpaca según el nombre) | **Calabaza, Cuero** (base de cuero cosida, visible en la foto) |
| Color (`color`) | **Borravino** (calabaza rojiza oscura en la foto) | **Natural** (calabaza y cuero claros en la foto) |
| Uso (`use_case`) | **Uso diario, Para regalar** | **Uso diario, Para regalar** (la descripción dice «Para uso diario o regalo») |
| Precio, stock, fotos, slug, ID | Sin cambios | Sin cambios |

Criterio: mismos atributos gestionados que los mates ya clasificados (p. ej. `mate-torpedo-virola-alpaca-cincelada`: torpedo, calabaza, negro, uso diario + regalar). Color y material salen de la foto y del nombre; si el propietario los ve distintos, se corrigen antes de aplicar.

Efecto esperado (simulación previa): Mates 31→33, Accesorios 11→9; dejan de sugerirse como accesorio matero; URL sin cambios.

Verificación posterior: ambas fichas (breadcrumb «Mates»), `/mates?categoria=mates` con filtros Tipo de mate / Material, `/accesorios` sin los dos mates, búsqueda «mate imperial» y «torpedo».

## CAT-02 — Fotografías faltantes

**Comprobación de Storage:** no realizada. El listado de `product-images/products/<id>/` necesita la credencial de servicio y el acceso fue denegado en esta sesión; no se buscó otra vía. Lo verificado: la ficha pública no tiene ninguna fila de imagen para estos diez productos (`primaryImageUrl` nulo, `images` vacío), igual que el 26/11. Para descartar subidas sin asociar hace falta que el propietario autorice el listado de sólo lectura o lo ejecute.

Productos disponibles sin foto, ordenados por relevancia comercial (destacado, stock y precio):

| # | Producto | Variante / presentación exacta | ID | Stock | Precio lista | Referencia fotográfica disponible | Material que debe aportar el propietario |
|---|---|---|---|---|---|---|---|
| 1 | Mate Imperial Premium (`mate-imperial-premium`) | Mate imperial premium (destacado) | `ee468a5a-10b6-4b63-9b6d-b9d4b4b50a3d` | 3 | $70.000 | Ninguna del SKU. Encuadre de referencia: fotos de mostrador de SFSTORE (p. ej. imperial con base de bolitas) | Foto en mano del mate real; si las 3 unidades difieren, una por unidad o confirmar que son iguales |
| 2 | Botella Térmica Stanley 650 ml (`botella-termica-botellas-stanley-650ml`) | 650 ml; color sin informar | `bdd20c4c-f7fc-45a3-95bf-0021e4a013e1` | 2 | $46.000 | Ninguna propia; la foto de fabricante sólo sirve si se confirma modelo y color exactos | Foto de las 2 unidades y color de cada una |
| 3 | Mate Imperial virola alpaca cincelada premium (`mate-imperial-virola-alpaca-cincelada-premium`) | Imperial, virola alpaca cincelada | `4f4d04b7-f869-4b24-8cb4-9817c9d2ccef` | 1 | $38.000 | Ninguna del SKU | Foto del mate (virola visible) |
| 4 | Autocebante 2 en 1 (`autocebante-2-en-1`) | 2 en 1; color/capacidad sin informar | `724f97e4-581a-41c9-88d4-ab3e3dbb98df` | 1 | $36.000 | Ninguna | Foto y, si se conoce, capacidad y marca |
| 5 | Mate Torpedo virola alpaca cincelada (`mate-torpedo-virola-alpaca-cincelada`) | Torpedo, color negro (atributo) | `ef88ee42-4946-4544-9282-21d5d16f17ea` | 1 | $32.000 | No reutilizable: `mate-torpedo-animal-print-alpaca-cincelada` es otro color | Foto del mate negro |
| 6 | Mate Camionero virola de acero inox (`mate-camionero-virola-de-acero-inox`) | Camionero, cuero negro, virola acero | `0c74c49c-47fd-41e4-b07b-730afc08a6cd` | 1 | $26.000 | Ninguna del SKU | Foto del mate |
| 7 | Mate Pampa Original boca abierta (`mate-pampa-original-boca-abierta`) | Boca abierta, negro (atributos) | `05a2fc29-69ae-44a0-b19e-c9ad810c3a89` | 1 | $18.000 | Ninguna | Foto del mate |
| 8 | Lata Matera (`lata-matera`) | Set de dos latas (yerba y azúcar) | `b8a90822-19d2-4ade-b6f9-ce834a2a68a9` | 6 | $16.000 | Ninguna | Foto del set completo; diseño si hay varios |
| 9 | Cable USB-C a Lightning (`sfstore-cable-usbc-lightning-cargador`) | Cable suelto USB-C a Lightning | `deae2db0-c114-476d-a146-4589687aa8ca` | 8 | $15.800 | Ninguna (cargadores pendientes del propietario desde P02) | Foto del cable con su conector visible |
| 10 | Cargador 3.8A + Cable Tipo C (`cargador-3-8a-cable-tipo-c`) | Cabezal 3.8A + cable tipo C | `f0f14dc6-8693-4670-aeab-42cc64732b0e` | 1 | $15.333,33 | Ninguna | Foto del cabezal y del cable juntos |

No se generan ni se reutilizan imágenes de otros modelos. La carga se hace desde el editor existente (galería del producto).
