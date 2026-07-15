-- SFSTORE initial catalog seed.
-- Run manually in Supabase SQL editor after schema.sql.
-- This seed is idempotent for categories, products, and attributes.

insert into categories (name, slug, description, is_active, sort_order)
values
  ('Perfumes', 'perfumes', 'Fragancias importadas seleccionadas por SFSTORE.', true, 10),
  ('Mates', 'mates', 'Mates premium y piezas materas principales.', true, 20),
  ('Termos', 'termos', 'Termos para acompanar el ritual matero.', true, 30),
  ('Bombillas', 'bombillas', 'Bombillas y accesorios de cebado.', true, 40),
  ('Accesorios', 'accesorios', 'Complementos y accesorios importados.', true, 50)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  updated_at = now();

with product_seed as (
  select *
  from (
    values
      (
        'perfumes',
        'Lattafa Asad',
        'lattafa-asad',
        'Fragancia intensa, especiada y elegante con impronta oriental.',
        'Perfume importado de perfil intenso y especiado, ideal para quienes buscan presencia y duracion.',
        89900::numeric,
        4,
        true,
        'Lattafa',
        'Fragancia importada'
      ),
      (
        'perfumes',
        'Lattafa Khamrah',
        'lattafa-khamrah',
        'Aroma dulce, ambarado y sofisticado para ocasiones especiales.',
        'Perfume importado con salida dulce y fondo ambarado, pensado para uso nocturno y ocasiones especiales.',
        109900::numeric,
        2,
        true,
        'Lattafa',
        'Fragancia importada'
      ),
      (
        'perfumes',
        'Rasasi Hawas For Him',
        'rasasi-hawas-for-him',
        'Salida fresca y acuatica con fondo masculino de gran duracion.',
        'Fragancia masculina importada con perfil fresco, acuatico y moderno.',
        124900::numeric,
        0,
        false,
        'Rasasi',
        'Fragancia importada'
      ),
      (
        'perfumes',
        'Afnan 9 PM Elixir',
        'afnan-9-pm-elixir',
        'Perfil nocturno, moderno y envolvente con presencia premium.',
        'Perfume importado de caracter nocturno, envolvente y con gran presencia.',
        118500::numeric,
        3,
        true,
        'Afnan',
        'Fragancia importada'
      ),
      (
        'perfumes',
        'Lattafa Yara Rosa',
        'lattafa-yara-rosa',
        'Fragancia femenina cremosa, suave y delicadamente dulce.',
        'Perfume importado femenino de perfil cremoso, suave y delicadamente dulce.',
        84500::numeric,
        5,
        false,
        'Lattafa',
        'Fragancia importada'
      ),
      (
        'perfumes',
        'Club de Nuit Sillage',
        'club-de-nuit-sillage',
        'Aroma citrico, metalico y limpio con estela distinguida.',
        'Fragancia importada con perfil citrico, limpio y elegante, de estela distinguida.',
        132000::numeric,
        0,
        false,
        'Armaf',
        'Fragancia importada'
      ),
      (
        'mates',
        'Mate Imperial Premium',
        'mate-imperial-premium',
        'Mate imperial con terminacion cuidada y presencia artesanal.',
        'Mate premium con terminacion cuidada, pensado para uso diario o regalo especial.',
        69000::numeric,
        3,
        true,
        'SFSTORE',
        'Mate'
      ),
      (
        'mates',
        'Mate Torpedo Alpaca',
        'mate-torpedo-alpaca',
        'Formato torpedo con detalles en alpaca y estilo tradicional.',
        'Mate torpedo con detalles en alpaca y estilo tradicional argentino.',
        74000::numeric,
        2,
        true,
        'SFSTORE',
        'Mate'
      ),
      (
        'mates',
        'Mate Camionero Argentina',
        'mate-camionero-argentina',
        'Mate camionero robusto con identidad clasica argentina.',
        'Mate camionero robusto, clasico y de gran presencia para cebadas largas.',
        52000::numeric,
        0,
        false,
        'SFSTORE',
        'Mate'
      ),
      (
        'mates',
        'Mate Imperial Liso',
        'mate-imperial-liso',
        'Diseno sobrio, elegante y facil de combinar para todos los dias.',
        'Mate imperial liso de diseno sobrio y elegante, ideal para uso cotidiano.',
        61000::numeric,
        4,
        false,
        'SFSTORE',
        'Mate'
      ),
      (
        'bombillas',
        'Bombilla Pico de Loro',
        'bombilla-pico-de-loro',
        'Bombilla practica, resistente y comoda para cebadas largas.',
        'Bombilla pico de loro resistente y comoda para el ritual matero diario.',
        18500::numeric,
        8,
        false,
        'SFSTORE',
        'Bombilla'
      ),
      (
        'termos',
        'Termo Stanley',
        'termo-stanley',
        'Termo de alta conservacion para acompanar el ritual matero.',
        'Termo de alta conservacion, practico para mate, viajes y uso diario.',
        119000::numeric,
        0,
        true,
        'Stanley',
        'Termo'
      )
  ) as seeded(
    category_slug,
    name,
    slug,
    short_description,
    description,
    price,
    stock,
    featured,
    brand,
    product_type
  )
),
upserted_products as (
  insert into products (
    category_id,
    name,
    slug,
    short_description,
    description,
    price,
    stock,
    featured,
    status
  )
  select
    categories.id,
    product_seed.name,
    product_seed.slug,
    product_seed.short_description,
    product_seed.description,
    product_seed.price,
    product_seed.stock,
    product_seed.featured,
    'active'
  from product_seed
  join categories on categories.slug = product_seed.category_slug
  on conflict (slug) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    short_description = excluded.short_description,
    description = excluded.description,
    price = excluded.price,
    stock = excluded.stock,
    featured = excluded.featured,
    status = excluded.status,
    updated_at = now()
  returning id, slug
)
insert into product_attributes (product_id, name, value, sort_order)
select upserted_products.id, attributes.name, attributes.value, attributes.sort_order
from upserted_products
join product_seed on product_seed.slug = upserted_products.slug
cross join lateral (
  values
    ('Marca', product_seed.brand, 10),
    ('Tipo', product_seed.product_type, 20)
) as attributes(name, value, sort_order)
where not exists (
  select 1
  from product_attributes existing
  where existing.product_id = upserted_products.id
    and existing.name = attributes.name
);

-- Images are intentionally not inserted yet.
-- When real assets are ready, insert rows into product_images with:
-- product_id, url, alt, sort_order, is_primary.
