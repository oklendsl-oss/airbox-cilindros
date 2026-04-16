-- AIRBOX — Schema SQL completo
-- Revisión de cilindros de puertas

create table if not exists instalaciones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  created_at timestamptz default now()
);

create table if not exists zonas (
  id uuid primary key default gen_random_uuid(),
  instalacion_id uuid references instalaciones(id) on delete cascade,
  nombre text not null,
  created_at timestamptz default now(),
  unique(instalacion_id, nombre)
);

create table if not exists tipos_cilindro (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  descripcion text,
  orden int default 0
);

insert into tipos_cilindro (nombre, descripcion, orden) values
  ('Europeo estándar', 'Perfil europeo sin protección especial', 1),
  ('Europeo alta seguridad', 'Con antitaladro, antibumping, antiganzúa', 2),
  ('Antibumping', 'Con protección anti-bumping', 3),
  ('Pomo', 'Cilindro con pomo interior', 4),
  ('Doble embrague', 'Permite apertura con llave por ambos lados', 5),
  ('Desconocido', 'Pendiente de identificar en campo', 99)
on conflict (nombre) do nothing;

create table if not exists puertas (
  id uuid primary key default gen_random_uuid(),
  zona_id uuid references zonas(id) on delete cascade,
  codigo text not null,
  tipo_cilindro_id uuid references tipos_cilindro(id),
  estado text default 'pendiente' check (estado in ('pendiente','revisada','cambiada','incidencia')),
  observaciones text,
  info_cilindro jsonb default '{}'::jsonb,
  revisado_por uuid references auth.users(id),
  revisado_en timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(zona_id, codigo)
);

create table if not exists fotos (
  id uuid primary key default gen_random_uuid(),
  puerta_id uuid references puertas(id) on delete cascade,
  storage_path text not null,
  nombre_original text,
  subida_por uuid references auth.users(id),
  created_at timestamptz default now()
);

create table if not exists historial (
  id uuid primary key default gen_random_uuid(),
  puerta_id uuid references puertas(id) on delete cascade,
  usuario_id uuid references auth.users(id),
  accion text not null,
  detalle jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_puertas_codigo on puertas(codigo);
create index if not exists idx_puertas_estado on puertas(estado);
create index if not exists idx_zonas_instalacion on zonas(instalacion_id);

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists puertas_updated_at on puertas;
create trigger puertas_updated_at
  before update on puertas
  for each row execute function update_updated_at();

-- RLS
alter table instalaciones enable row level security;
alter table zonas enable row level security;
alter table puertas enable row level security;
alter table fotos enable row level security;
alter table tipos_cilindro enable row level security;
alter table historial enable row level security;

-- Políticas RLS: usuarios autenticados pueden leer/escribir todo
create policy "Usuarios autenticados pueden leer instalaciones"
  on instalaciones for select to authenticated using (true);
create policy "Usuarios autenticados pueden insertar instalaciones"
  on instalaciones for insert to authenticated with check (true);
create policy "Usuarios autenticados pueden actualizar instalaciones"
  on instalaciones for update to authenticated using (true);

create policy "Usuarios autenticados pueden leer zonas"
  on zonas for select to authenticated using (true);
create policy "Usuarios autenticados pueden insertar zonas"
  on zonas for insert to authenticated with check (true);
create policy "Usuarios autenticados pueden actualizar zonas"
  on zonas for update to authenticated using (true);

create policy "Usuarios autenticados pueden leer puertas"
  on puertas for select to authenticated using (true);
create policy "Usuarios autenticados pueden insertar puertas"
  on puertas for insert to authenticated with check (true);
create policy "Usuarios autenticados pueden actualizar puertas"
  on puertas for update to authenticated using (true);

create policy "Usuarios autenticados pueden leer fotos"
  on fotos for select to authenticated using (true);
create policy "Usuarios autenticados pueden insertar fotos"
  on fotos for insert to authenticated with check (true);
create policy "Usuarios autenticados pueden eliminar fotos"
  on fotos for delete to authenticated using (true);

create policy "Usuarios autenticados pueden leer tipos_cilindro"
  on tipos_cilindro for select to authenticated using (true);

create policy "Usuarios autenticados pueden leer historial"
  on historial for select to authenticated using (true);
create policy "Usuarios autenticados pueden insertar historial"
  on historial for insert to authenticated with check (true);
