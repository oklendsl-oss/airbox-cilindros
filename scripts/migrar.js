/**
 * migrar.js
 * Migra datos desde estructura.json a Supabase
 *
 * Lee estructura.json generado por analizar-dropbox.js
 * Inserta: instalaciones → zonas → puertas
 * Para cada foto: comprime con sharp (1920px, calidad 85) → sube → crea registro
 *
 * Uso:
 *   SUPABASE_URL=... SUPABASE_KEY=... node migrar.js
 *   O configura las variables en el propio script
 */

const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')
let sharp
try {
  sharp = require('sharp')
} catch (e) {
  console.warn('⚠️  sharp no disponible, las fotos se subirán sin comprimir')
  console.warn('    Instala con: npm install en la carpeta scripts/')
  sharp = null
}

// ═══════════════════════════════════════════════
// CONFIGURACIÓN
// ═══════════════════════════════════════════════
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pwybaiuuxuyocbfiubfb.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3eWJhaXV1eHV5b2NiZml1YmZiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjMzMDY0MSwiZXhwIjoyMDkxOTA2NjQxfQ.4i_pU2bzEkpsxpyztB1ThZVZf7mYViPxTbHahBnMLLM'

const BUCKET = 'puertas-fotos'
const FOTO_MAX_WIDTH = 1920
const FOTO_CALIDAD = 85
const MAX_REINTENTOS = 3
const PROGRESO_CADA = 50

const SOURCE_DIR = path.join(process.env.HOME, 'airbox-cilindros', 'dropbox-source')
const ESTRUCTURA_FILE = path.join(SOURCE_DIR, 'estructura.json')
// ═══════════════════════════════════════════════

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

let totalFotos = 0
let fotosSubidas = 0
let fotosFallidas = 0
let tiempoInicio = Date.now()

function log(msg) {
  const elapsed = ((Date.now() - tiempoInicio) / 1000).toFixed(1)
  console.log(`[${elapsed}s] ${msg}`)
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function conReintentos(fn, descripcion, maxReintentos = MAX_REINTENTOS) {
  for (let intento = 1; intento <= maxReintentos; intento++) {
    try {
      return await fn()
    } catch (err) {
      if (intento === maxReintentos) {
        console.error(`  ❌ Falló después de ${maxReintentos} intentos: ${descripcion}`)
        console.error(`     Error: ${err.message}`)
        throw err
      }
      const delay = intento * 1000
      console.warn(`  ⚠️  Intento ${intento}/${maxReintentos} fallido para "${descripcion}", reintentando en ${delay}ms…`)
      await sleep(delay)
    }
  }
}

async function comprimirFoto(rutaArchivo) {
  if (!sharp) {
    return fs.readFileSync(rutaArchivo)
  }
  try {
    const buffer = await sharp(rutaArchivo)
      .resize({ width: FOTO_MAX_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: FOTO_CALIDAD, progressive: true })
      .toBuffer()
    return buffer
  } catch (err) {
    console.warn(`  ⚠️  No se pudo comprimir ${path.basename(rutaArchivo)}, subiendo original`)
    return fs.readFileSync(rutaArchivo)
  }
}

async function subirFoto(rutaArchivo, storagePath) {
  return conReintentos(async () => {
    const buffer = await comprimirFoto(rutaArchivo)
    const nombreArchivo = path.basename(rutaArchivo)
    const ext = path.extname(nombreArchivo).toLowerCase()
    const contentType = ext === '.png' ? 'image/png' :
      ext === '.webp' ? 'image/webp' : 'image/jpeg'

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buffer, {
        contentType,
        upsert: true
      })

    if (error) throw error
    return storagePath
  }, `subir ${path.basename(rutaArchivo)}`)
}

async function insertarInstalacion(nombre) {
  return conReintentos(async () => {
    // Upsert por nombre
    const { data, error } = await supabase
      .from('instalaciones')
      .upsert({ nombre }, { onConflict: 'nombre' })
      .select('id')
      .single()
    if (error) throw error
    return data.id
  }, `insertar instalación: ${nombre}`)
}

async function insertarZona(instalacionId, nombre) {
  return conReintentos(async () => {
    const { data, error } = await supabase
      .from('zonas')
      .upsert({ instalacion_id: instalacionId, nombre }, { onConflict: 'instalacion_id,nombre' })
      .select('id')
      .single()
    if (error) throw error
    return data.id
  }, `insertar zona: ${nombre}`)
}

async function insertarPuerta(zonaId, codigo) {
  return conReintentos(async () => {
    const { data, error } = await supabase
      .from('puertas')
      .upsert({ zona_id: zonaId, codigo, estado: 'pendiente' }, { onConflict: 'zona_id,codigo' })
      .select('id')
      .single()
    if (error) throw error
    return data.id
  }, `insertar puerta: ${codigo}`)
}

async function insertarFoto(puertaId, storagePath, nombreOriginal) {
  return conReintentos(async () => {
    // Verificar si ya existe
    const { data: existente } = await supabase
      .from('fotos')
      .select('id')
      .eq('puerta_id', puertaId)
      .eq('storage_path', storagePath)
      .maybeSingle()

    if (existente) return existente.id

    const { data, error } = await supabase
      .from('fotos')
      .insert({ puerta_id: puertaId, storage_path: storagePath, nombre_original: nombreOriginal })
      .select('id')
      .single()
    if (error) throw error
    return data.id
  }, `insertar foto: ${nombreOriginal}`)
}

async function procesarFoto(rutaFoto, instalacionId, zonaId, puertaId) {
  const nombreArchivo = path.basename(rutaFoto)
  const ext = path.extname(nombreArchivo).toLowerCase()
  const nombreBase = `${Date.now()}-${path.parse(nombreArchivo).name}${sharp ? '.jpg' : ext}`
  const storagePath = `${instalacionId}/${zonaId}/${puertaId}/${nombreBase}`

  try {
    await subirFoto(rutaFoto, storagePath)
    await insertarFoto(puertaId, storagePath, nombreArchivo)
    fotosSubidas++
  } catch (err) {
    fotosFallidas++
    console.error(`  ❌ Error con foto ${nombreArchivo}: ${err.message}`)
  }

  totalFotos++
  if (totalFotos % PROGRESO_CADA === 0) {
    const pct = Math.round((fotosSubidas / (fotosSubidas + fotosFallidas || 1)) * 100)
    log(`📸 Progreso: ${fotosSubidas} fotos subidas, ${fotosFallidas} fallidas (${pct}% éxito)`)
  }
}

async function main() {
  console.log('🚀 AIRBOX — Migrador de datos')
  console.log('===============================')

  // Verificar que existe estructura.json
  if (!fs.existsSync(ESTRUCTURA_FILE)) {
    console.error(`❌ No se encontró ${ESTRUCTURA_FILE}`)
    console.error('   Ejecuta primero: node analizar-dropbox.js')
    process.exit(1)
  }

  let estructura
  try {
    estructura = JSON.parse(fs.readFileSync(ESTRUCTURA_FILE, 'utf8'))
  } catch (e) {
    console.error(`❌ Error al leer estructura.json: ${e.message}`)
    process.exit(1)
  }

  console.log(`📊 Datos a migrar:`)
  console.log(`   Instalaciones: ${estructura.resumen.total_instalaciones}`)
  console.log(`   Zonas:         ${estructura.resumen.total_zonas}`)
  console.log(`   Puertas:       ${estructura.resumen.total_puertas}`)
  console.log(`   Fotos:         ${estructura.resumen.total_fotos}`)
  console.log()

  tiempoInicio = Date.now()

  for (const instalacion of estructura.instalaciones) {
    log(`\n📦 Instalación: ${instalacion.nombre}`)

    let instalacionId
    try {
      instalacionId = await insertarInstalacion(instalacion.nombre)
      log(`   ✅ ID instalación: ${instalacionId}`)
    } catch (err) {
      log(`   ❌ Falló instalación ${instalacion.nombre}, saltando…`)
      continue
    }

    for (const zona of instalacion.zonas) {
      log(`  📂 Zona: ${zona.nombre} (${zona.puertas.length} puertas)`)

      let zonaId
      try {
        zonaId = await insertarZona(instalacionId, zona.nombre)
      } catch (err) {
        log(`   ❌ Falló zona ${zona.nombre}, saltando…`)
        continue
      }

      for (const puerta of zona.puertas) {
        let puertaId
        try {
          puertaId = await insertarPuerta(zonaId, puerta.codigo)
        } catch (err) {
          log(`   ❌ Falló puerta ${puerta.codigo}, saltando…`)
          continue
        }

        // Subir fotos de esta puerta
        for (const rutaFoto of puerta.fotos) {
          await procesarFoto(rutaFoto, instalacionId, zonaId, puertaId)
        }
      }
    }
  }

  const tiempoTotal = ((Date.now() - tiempoInicio) / 1000).toFixed(1)
  console.log('\n===============================')
  console.log('✅ MIGRACIÓN COMPLETADA')
  console.log(`   Fotos subidas:  ${fotosSubidas}`)
  console.log(`   Fotos fallidas: ${fotosFallidas}`)
  console.log(`   Tiempo total:   ${tiempoTotal}s`)
  console.log()

  if (fotosFallidas > 0) {
    console.log('⚠️  Algunas fotos fallaron. Revisa los errores arriba y vuelve a ejecutar.')
    console.log('   El script es idempotente: no duplicará datos ya existentes.')
  }
}

main().catch(err => {
  console.error('\n❌ Error fatal:', err.message)
  process.exit(1)
})
