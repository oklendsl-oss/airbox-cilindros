/**
 * apply-schema-pg.mjs
 * Aplica el schema directamente via conexión PostgreSQL
 * Usa pg (node-postgres) para conectarse al host de Supabase
 */

// Supabase DB connection details
// Host format: db.[project-ref].supabase.co
// Password: the "Database Password" from project settings (NOT the service role key)
// If you don't have it, reset it in: 
//   https://supabase.com/dashboard/project/pwybaiuuxuyocbfiubfb/settings/database

const { default: pg } = await import('pg').catch(() => ({ default: null }))
const { Client } = pg || {}

if (!Client) {
  console.error('❌ pg module not available')
  process.exit(1)
}

// Try to connect with common Supabase connection string format
const DB_PASSWORD = process.env.DB_PASSWORD || process.env.SUPABASE_DB_PASSWORD || ''

if (!DB_PASSWORD) {
  console.log('❌ Se necesita la contraseña de la base de datos (DB_PASSWORD)')
  console.log('')
  console.log('📋 Para obtenerla:')
  console.log('   1. Ve a https://supabase.com/dashboard/project/pwybaiuuxuyocbfiubfb/settings/database')
  console.log('   2. Copia la "Database Password"')
  console.log('   3. Ejecuta: DB_PASSWORD=tu-password node scripts/apply-schema-pg.mjs')
  console.log('')
  console.log('⚠️  Si la perdiste, puedes resetearla en el dashboard')
  process.exit(1)
}

const client = new Client({
  host: 'db.pwybaiuuxuyocbfiubfb.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: DB_PASSWORD,
  ssl: { rejectUnauthorized: false }
})

const SCHEMA_SQL = `
create table if not exists instalaciones (id uuid primary key default gen_random_uuid(), nombre text not null unique, created_at timestamptz default now());
create table if not exists zonas (id uuid primary key default gen_random_uuid(), instalacion_id uuid references instalaciones(id) on delete cascade, nombre text not null, created_at timestamptz default now(), unique(instalacion_id, nombre));
create table if not exists tipos_cilindro (id uuid primary key default gen_random_uuid(), nombre text not null unique, descripcion text, orden int default 0);
insert into tipos_cilindro (nombre, descripcion, orden) values ('Europeo estándar', 'Perfil europeo sin protección especial', 1),('Europeo alta seguridad', 'Con antitaladro, antibumping, antiganzúa', 2),('Antibumping', 'Con protección anti-bumping', 3),('Pomo', 'Cilindro con pomo interior', 4),('Doble embrague', 'Permite apertura con llave por ambos lados', 5),('Desconocido', 'Pendiente de identificar en campo', 99) on conflict (nombre) do nothing;
create table if not exists puertas (id uuid primary key default gen_random_uuid(), zona_id uuid references zonas(id) on delete cascade, codigo text not null, tipo_cilindro_id uuid references tipos_cilindro(id), estado text default 'pendiente' check (estado in ('pendiente','revisada','cambiada','incidencia')), observaciones text, info_cilindro jsonb default '{}'::jsonb, revisado_por uuid references auth.users(id), revisado_en timestamptz, created_at timestamptz default now(), updated_at timestamptz default now(), unique(zona_id, codigo));
create table if not exists fotos (id uuid primary key default gen_random_uuid(), puerta_id uuid references puertas(id) on delete cascade, storage_path text not null, nombre_original text, subida_por uuid references auth.users(id), created_at timestamptz default now());
create table if not exists historial (id uuid primary key default gen_random_uuid(), puerta_id uuid references puertas(id) on delete cascade, usuario_id uuid references auth.users(id), accion text not null, detalle jsonb, created_at timestamptz default now());
create index if not exists idx_puertas_codigo on puertas(codigo);
create index if not exists idx_puertas_estado on puertas(estado);
create index if not exists idx_zonas_instalacion on zonas(instalacion_id);
create or replace function update_updated_at() returns trigger as $$ begin new.updated_at = now(); return new; end; $$ language plpgsql;
drop trigger if exists puertas_updated_at on puertas;
create trigger puertas_updated_at before update on puertas for each row execute function update_updated_at();
alter table instalaciones enable row level security;
alter table zonas enable row level security;
alter table puertas enable row level security;
alter table fotos enable row level security;
alter table tipos_cilindro enable row level security;
alter table historial enable row level security;
`

const POLICIES_SQL = `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='instalaciones' AND policyname='Usuarios autenticados pueden leer instalaciones') THEN
    CREATE POLICY "Usuarios autenticados pueden leer instalaciones" ON instalaciones FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='instalaciones' AND policyname='Usuarios autenticados pueden insertar instalaciones') THEN
    CREATE POLICY "Usuarios autenticados pueden insertar instalaciones" ON instalaciones FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='instalaciones' AND policyname='Usuarios autenticados pueden actualizar instalaciones') THEN
    CREATE POLICY "Usuarios autenticados pueden actualizar instalaciones" ON instalaciones FOR UPDATE TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='zonas' AND policyname='Usuarios autenticados pueden leer zonas') THEN
    CREATE POLICY "Usuarios autenticados pueden leer zonas" ON zonas FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='zonas' AND policyname='Usuarios autenticados pueden insertar zonas') THEN
    CREATE POLICY "Usuarios autenticados pueden insertar zonas" ON zonas FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='zonas' AND policyname='Usuarios autenticados pueden actualizar zonas') THEN
    CREATE POLICY "Usuarios autenticados pueden actualizar zonas" ON zonas FOR UPDATE TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='puertas' AND policyname='Usuarios autenticados pueden leer puertas') THEN
    CREATE POLICY "Usuarios autenticados pueden leer puertas" ON puertas FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='puertas' AND policyname='Usuarios autenticados pueden insertar puertas') THEN
    CREATE POLICY "Usuarios autenticados pueden insertar puertas" ON puertas FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='puertas' AND policyname='Usuarios autenticados pueden actualizar puertas') THEN
    CREATE POLICY "Usuarios autenticados pueden actualizar puertas" ON puertas FOR UPDATE TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='fotos' AND policyname='Usuarios autenticados pueden leer fotos') THEN
    CREATE POLICY "Usuarios autenticados pueden leer fotos" ON fotos FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='fotos' AND policyname='Usuarios autenticados pueden insertar fotos') THEN
    CREATE POLICY "Usuarios autenticados pueden insertar fotos" ON fotos FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='fotos' AND policyname='Usuarios autenticados pueden eliminar fotos') THEN
    CREATE POLICY "Usuarios autenticados pueden eliminar fotos" ON fotos FOR DELETE TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tipos_cilindro' AND policyname='Usuarios autenticados pueden leer tipos_cilindro') THEN
    CREATE POLICY "Usuarios autenticados pueden leer tipos_cilindro" ON tipos_cilindro FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='historial' AND policyname='Usuarios autenticados pueden leer historial') THEN
    CREATE POLICY "Usuarios autenticados pueden leer historial" ON historial FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='historial' AND policyname='Usuarios autenticados pueden insertar historial') THEN
    CREATE POLICY "Usuarios autenticados pueden insertar historial" ON historial FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;
`

try {
  console.log('🔌 Conectando a Supabase PostgreSQL...')
  await client.connect()
  console.log('✅ Conexión establecida\n')

  console.log('📋 Aplicando schema...')
  await client.query(SCHEMA_SQL)
  console.log('✅ Schema aplicado\n')

  console.log('🔒 Aplicando políticas RLS...')
  await client.query(POLICIES_SQL)
  console.log('✅ Políticas aplicadas\n')

  // Verify
  const { rows } = await client.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name IN ('instalaciones','zonas','puertas','fotos','historial','tipos_cilindro')
    ORDER BY table_name
  `)
  console.log('✅ Tablas verificadas:')
  rows.forEach(r => console.log(`   - ${r.table_name}`))

  const { rows: tipos } = await client.query('SELECT nombre FROM tipos_cilindro ORDER BY orden')
  console.log('\n📋 Tipos de cilindro:')
  tipos.forEach(t => console.log(`   - ${t.nombre}`))

  console.log('\n🎉 Schema completamente aplicado!')
} catch (err) {
  console.error('❌ Error:', err.message)
} finally {
  await client.end()
}
