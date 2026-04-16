/**
 * migrar-real.js
 * Migración desde la estructura REAL del Dropbox:
 *   extracted/
 *     Instalación/
 *       Puerta (carpeta con fotos)  ← NO hay nivel zona
 *
 * El script crea una zona "General" por cada instalación
 * y migra todas las puertas a esa zona.
 *
 * USO:
 *   cd ~/airbox-cilindros/scripts && npm install
 *   node migrar-real.js
 *
 * Idempotente: no duplica datos existentes.
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

let sharp
try {
  sharp = require('sharp')
  console.log('✅ sharp disponible — fotos serán comprimidas')
} catch (e) {
  sharp = null
  console.warn('⚠️  sharp no disponible — fotos se subirán sin comprimir')
}

// ═══════════════════════════════════════════════
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pwybaiuuxuyocbfiubfb.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3eWJhaXV1eHV5b2NiZml1YmZiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjMzMDY0MSwiZXhwIjoyMDkxOTA2NjQxfQ.4i_pU2bzEkpsxpyztB1ThZVZf7mYViPxTbHahBnMLLM'

const BUCKET = 'puertas-fotos'
const SOURCE_DIR = path.join(process.env.HOME, 'airbox-cilindros', 'dropbox-source', 'extracted')
const FOTO_MAX_WIDTH = 1920
const FOTO_CALIDAD = 85
const MAX_REINTENTOS = 3
const PROGRESO_CADA = 50
const ZONA_DEFAULT = 'General'

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.heic', '.webp', '.tiff', '.bmp',
  '.JPG', '.JPEG', '.PNG', '.HEIC', '.WEBP'])
// ═══════════════════════════════════════════════

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

let contadores = { instalaciones: 0, zonas: 0, puertas: 0, fotosOk: 0, fotosFail: 0 }
let tiempoInicio = Date.now()

function log(msg) {
  const elapsed = ((Date.now() - tiempoInicio) / 1000).toFixed(1)
  console.log(`[${elapsed}s] ${msg}`)
}

function esImagen(nombre) {
  return IMAGE_EXT.has(path.extname(nombre))
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function conReintentos(fn, desc, max = MAX_REINTENTOS) {
  for (let i = 1; i <= max; i++) {
    try { return await fn() } catch (e) {
      if (i === max) throw e
      console.warn(`  ⚠️  Intento ${i}/${max} fallido para ${desc}: ${e.message}`)
      await sleep(i * 1000)
    }
  }
}

async function upsertInstalacion(nombre) {
  return conReintentos(async () => {
    const { data, error } = await supabase
      .from('instalaciones')
      .upsert({ nombre }, { onConflict: 'nombre' })
      .select('id').single()
    if (error) throw error
    return data.id
  }, `instalacion:${nombre}`)
}

async function upsertZona(instalacionId, nombre) {
  return conReintentos(async () => {
    const { data, error } = await supabase
      .from('zonas')
      .upsert({ instalacion_id: instalacionId, nombre }, { onConflict: 'instalacion_id,nombre' })
      .select('id').single()
    if (error) throw error
    return data.id
  }, `zona:${nombre}`)
}

async function upsertPuerta(zonaId, codigo) {
  return conReintentos(async () => {
    const { data, error } = await supabase
      .from('puertas')
      .upsert({ zona_id: zonaId, codigo, estado: 'pendiente' }, { onConflict: 'zona_id,codigo' })
      .select('id').single()
    if (error) throw error
    return data.id
  }, `puerta:${codigo}`)
}

async function fotoYaExiste(puertaId, nombreOriginal) {
  const { data } = await supabase
    .from('fotos')
    .select('id')
    .eq('puerta_id', puertaId)
    .eq('nombre_original', nombreOriginal)
    .maybeSingle()
  return !!data
}

async function subirFoto(rutaFoto, storagePath) {
  return conReintentos(async () => {
    let buffer
    if (sharp) {
      try {
        buffer = await sharp(rutaFoto)
          .resize({ width: FOTO_MAX_WIDTH, withoutEnlargement: true })
          .jpeg({ quality: FOTO_CALIDAD, progressive: true })
          .toBuffer()
      } catch {
        buffer = fs.readFileSync(rutaFoto)
      }
    } else {
      buffer = fs.readFileSync(rutaFoto)
    }

    const ext = path.extname(rutaFoto).toLowerCase()
    const contentType = ext === '.png' ? 'image/png' : 'image/jpeg'

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buffer, { contentType, upsert: true })
    if (error) throw error
    return storagePath
  }, `upload:${path.basename(rutaFoto)}`)
}

async function procesarFoto(rutaFoto, instalacionId, zonaId, puertaId) {
  const nombreOriginal = path.basename(rutaFoto)

  try {
    // Skip si ya existe
    const existe = await fotoYaExiste(puertaId, nombreOriginal)
    if (existe) {
      log(`  ⏭️  Ya existe: ${nombreOriginal}`)
      contadores.fotosOk++
      return
    }

    const ext = path.extname(nombreOriginal).toLowerCase()
    const nombreStorage = `${Date.now()}-${Math.random().toString(36).substr(2, 5)}${sharp ? '.jpg' : ext}`
    const storagePath = `${instalacionId}/${zonaId}/${puertaId}/${nombreStorage}`

    await subirFoto(rutaFoto, storagePath)

    await conReintentos(async () => {
      const { error } = await supabase.from('fotos').insert({
        puerta_id: puertaId,
        storage_path: storagePath,
        nombre_original: nombreOriginal
      })
      if (error) throw error
    }, `registro_foto:${nombreOriginal}`)

    contadores.fotosOk++
    const totalFotos = contadores.fotosOk + contadores.fotosFail
    if (totalFotos % PROGRESO_CADA === 0) {
      log(`📸 Fotos: ${contadores.fotosOk} OK, ${contadores.fotosFail} fallidas`)
    }
  } catch (err) {
    contadores.fotosFail++
    console.error(`  ❌ ${nombreOriginal}: ${err.message}`)
  }
}

async function main() {
  console.log('🚀 AIRBOX — Migrador de datos reales')
  console.log('=====================================')
  console.log(`📁 Fuente: ${SOURCE_DIR}`)
  console.log()

  if (!fs.existsSync(SOURCE_DIR)) {
    console.error(`❌ No existe: ${SOURCE_DIR}`)
    console.error('   Extrae primero el dropbox.zip en: ~/airbox-cilindros/dropbox-source/extracted/')
    process.exit(1)
  }

  // Verificar que el schema existe
  const { error: schemaCheck } = await supabase.from('instalaciones').select('id').limit(1)
  if (schemaCheck && schemaCheck.code === 'PGRST205') {
    console.error('❌ Schema no aplicado. Ejecuta primero el schema SQL en Supabase.')
    console.error('   Ver instrucciones en ENTREGA.md')
    process.exit(1)
  }

  tiempoInicio = Date.now()

  const instalacionesDirs = fs.readdirSync(SOURCE_DIR)
    .filter(d => !d.startsWith('.') && fs.statSync(path.join(SOURCE_DIR, d)).isDirectory())
    .sort()

  log(`📦 ${instalacionesDirs.length} instalaciones encontradas`)

  for (const nombreInst of instalacionesDirs) {
    const dirInst = path.join(SOURCE_DIR, nombreInst)
    log(`\n📦 Instalación: ${nombreInst}`)

    let instalacionId
    try {
      instalacionId = await upsertInstalacion(nombreInst)
      contadores.instalaciones++
      log(`   → ID: ${instalacionId}`)
    } catch (e) {
      console.error(`   ❌ Falló instalación ${nombreInst}: ${e.message}`)
      continue
    }

    // Crear zona "General"
    let zonaId
    try {
      zonaId = await upsertZona(instalacionId, ZONA_DEFAULT)
      contadores.zonas++
    } catch (e) {
      console.error(`   ❌ Falló zona General: ${e.message}`)
      continue
    }

    const puertas = fs.readdirSync(dirInst)
      .filter(d => !d.startsWith('.') && fs.statSync(path.join(dirInst, d)).isDirectory())
      .sort()

    log(`   📂 ${puertas.length} puertas`)

    for (const nombrePuerta of puertas) {
      const dirPuerta = path.join(dirInst, nombrePuerta)

      let puertaId
      try {
        puertaId = await upsertPuerta(zonaId, nombrePuerta)
        contadores.puertas++
      } catch (e) {
        console.error(`   ❌ Falló puerta ${nombrePuerta}: ${e.message}`)
        continue
      }

      // Subir fotos
      const archivos = fs.readdirSync(dirPuerta)
        .filter(f => esImagen(f))
        .sort()

      for (const archivo of archivos) {
        await procesarFoto(
          path.join(dirPuerta, archivo),
          instalacionId, zonaId, puertaId
        )
      }
    }
  }

  const tiempoTotal = ((Date.now() - tiempoInicio) / 1000).toFixed(1)
  console.log('\n=====================================')
  console.log('✅ MIGRACIÓN COMPLETADA')
  console.log(`   Instalaciones: ${contadores.instalaciones}`)
  console.log(`   Zonas:         ${contadores.zonas}`)
  console.log(`   Puertas:       ${contadores.puertas}`)
  console.log(`   Fotos OK:      ${contadores.fotosOk}`)
  console.log(`   Fotos fallidas:${contadores.fotosFail}`)
  console.log(`   Tiempo:        ${tiempoTotal}s`)
}

main().catch(e => { console.error('❌ Fatal:', e.message); process.exit(1) })
