alter table suppliers
  add column if not exists contact_name text,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists whatsapp text,
  add column if not exists website text,
  add column if not exists address text;
