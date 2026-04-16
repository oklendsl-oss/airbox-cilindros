# AIRBOX — Informe de Entrega
**Sistema de Revisión de Cilindros de Puertas**
Generado: 2026-04-16

---

## Estado por Partes

| Parte | Estado | Detalle |
|-------|--------|---------|
| 1 — Schema SQL | ⚠️ Pendiente aplicar | Ver instrucciones abajo |
| 2 — Bucket Storage | ✅ Completado | Bucket `puertas-fotos` creado en Supabase |
| 3 — App React | ✅ Completado | Build limpio, todos los componentes |
| 4 — Scripts Node.js | ✅ Completado | analizar-dropbox.js + migrar.js |
| 5 — GitHub | ⚠️ Pendiente | gh CLI no autenticado, ver instrucciones |
| 6 — Vercel | ⚠️ Pendiente | Ver instrucciones de deploy |

---

## PARTE 1 — Aplicar Schema SQL

### ⚠️ Acción requerida: el schema NO se pudo aplicar automáticamente

La Supabase Management API requiere un Personal Access Token (PAT), no la service role key.
El acceso directo a la BD desde esta máquina (host externo) también está bloqueado.

### Opción A — SQL Editor del Dashboard (recomendada, 2 minutos)

1. Abre: https://supabase.com/dashboard/project/pwybaiuuxuyocbfiubfb/sql/new
2. Copia y pega el contenido de: `~/airbox-cilindros/scripts/schema.sql`
3. Haz clic en **Run**
4. Deberías ver: "Success. No rows returned"

### Opción B — Supabase CLI

```bash
# Instalar CLI
brew install supabase/tap/supabase

# Autenticarse (necesitas PAT de https://app.supabase.com/account/tokens)
supabase login

# Ejecutar SQL
supabase db remote execute --project-ref pwybaiuuxuyocbfiubfb < ~/airbox-cilindros/scripts/schema.sql
```

### Opción C — psql directo

```bash
# Necesitas la Database Password del proyecto
# Ve a: https://supabase.com/dashboard/project/pwybaiuuxuyocbfiubfb/settings/database

psql "postgresql://postgres:[DB_PASSWORD]@db.pwybaiuuxuyocbfiubfb.supabase.co:5432/postgres" \
  -f ~/airbox-cilindros/scripts/schema.sql
```

### Verificar que se aplicó

```bash
cd ~/airbox-cilindros
node scripts/apply-schema.mjs
```

---

## PARTE 2 — Bucket Storage

✅ **Bucket `puertas-fotos` creado y público.**

- URL base: `https://pwybaiuuxuyocbfiubfb.supabase.co/storage/v1/object/public/puertas-fotos/`
- Estructura de paths: `{instalacion_id}/{zona_id}/{puerta_id}/{filename}`

---

## PARTE 3 — App React

✅ **Build limpio.** Todos los archivos están en `~/airbox-cilindros/`

### Componentes

| Archivo | Descripción |
|---------|-------------|
| `src/lib/supabase.js` | Cliente Supabase con URL y anon key |
| `src/components/Login.jsx` | Magic link en español, estados: enviando/enviado/error |
| `src/components/Buscador.jsx` | Grid con filtros por instalación/zona/estado/tipo/código |
| `src/components/FichaPuerta.jsx` | Detalle completo con galería, guardado automático, realtime, historial |
| `src/components/SubirFoto.jsx` | Upload con compresión, preview, capture="environment" |
| `src/App.jsx` | Layout con header, contadores, auth state |
| `src/main.jsx` | Entry point con Toaster |

### Levantar en desarrollo

```bash
cd ~/airbox-cilindros
npm install
npm run dev
# → http://localhost:5173
```

### Build de producción

```bash
cd ~/airbox-cilindros
npm run build
# Salida en dist/
```

---

## PARTE 4 — Scripts de Migración

### Flujo completo

```bash
cd ~/airbox-cilindros/scripts
npm install  # instala @supabase/supabase-js y sharp

# PASO 1: Copiar fotos a dropbox-source/
# Estructura:
# dropbox-source/
#   Instalación A/
#     Zona 1/
#       Puerta-101/        ← carpeta con fotos
#         foto1.jpg
#       Puerta-102.jpg     ← o imagen directa

# PASO 2: Analizar estructura
node analizar-dropbox.js
# Genera: dropbox-source/estructura.json

# PASO 3: Migrar (requiere schema aplicado primero)
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... node migrar.js
```

El script migrar.js es **idempotente**: puedes ejecutarlo varias veces sin duplicar datos.

---

## PARTE 5 — GitHub

⚠️ **Requiere autenticación de gh CLI.**

El repositorio local está inicializado con el commit inicial.

```bash
# Autenticar gh CLI
gh auth login

# Crear y subir repositorio
cd ~/airbox-cilindros
gh repo create oklendsl-oss/airbox-cilindros --public --source=. --push
```

---

## PARTE 6 — Vercel Deploy

### Opción A — Vercel CLI

```bash
# Instalar
npm install -g vercel

# Deploy (dentro de ~/airbox-cilindros)
vercel

# Variables de entorno a configurar en Vercel:
# VITE_SUPABASE_URL = https://pwybaiuuxuyocbfiubfb.supabase.co
# VITE_SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Opción B — Import desde GitHub (más fácil)

1. Sube el repo a GitHub (ver Parte 5)
2. Ve a https://vercel.com/new
3. Importa `oklendsl-oss/airbox-cilindros`
4. Añade variables de entorno:
   - `VITE_SUPABASE_URL` = `https://pwybaiuuxuyocbfiubfb.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = la anon key
5. Deploy → URL pública automática

---

## Gestión de Usuarios

AIRBOX usa **Magic Link** (sin contraseña). Para dar de alta nuevos usuarios:

### Opción A — Desde el dashboard (recomendada)
1. Ir a: https://supabase.com/dashboard/project/pwybaiuuxuyocbfiubfb/auth/users
2. Clic en **"Invite user"**
3. Introducir el email del técnico
4. El usuario recibirá un email con enlace de acceso

### Opción B — El usuario lo hace solo
El propio técnico puede introducir su email en la pantalla de login.
Supabase enviará el magic link automáticamente.

> ⚠️ **Nota:** Si quieres restringir dominios de email, configúralo en:
> Authentication → Providers → Email → Allowed domains

---

## Credenciales del Proyecto

```
Proyecto Supabase: pwybaiuuxuyocbfiubfb
URL: https://pwybaiuuxuyocbfiubfb.supabase.co
Bucket: puertas-fotos (público)
```

> 🔒 Las credenciales completas están en `~/airbox-cilindros/.env.local` (no incluido en Git)

---

## Incidencias

| # | Incidencia | Causa | Estado |
|---|-----------|-------|--------|
| 1 | Schema SQL no aplicado automáticamente | Supabase Management API requiere PAT personal (no service_role key) | ⚠️ Requiere acción manual |
| 2 | GitHub no publicado | gh CLI sin autenticar en este equipo | ⚠️ Requiere `gh auth login` |
| 3 | Vercel no desplegado | Requiere gh auth + vercel login | ⚠️ Pendiente |
| 4 | DB host bloqueado externamente | ENOTFOUND `db.pwybaiuuxuyocbfiubfb.supabase.co` desde sandbox | Info |

---

## Checklist Final Post-Entrega

- [ ] Aplicar schema SQL (5 min — dashboard o CLI)
- [ ] Verificar: `node ~/airbox-cilindros/scripts/apply-schema.mjs`
- [ ] Autenticar gh CLI y publicar repo
- [ ] Deploy en Vercel
- [ ] Invitar primer usuario técnico
- [ ] Probar magic link end-to-end
- [ ] Añadir datos de prueba (instalación + zona + puerta)
- [ ] Probar subida de foto desde móvil
