/**
 * analizar-dropbox.js
 * Lee la carpeta dropbox-source/ y genera estructura.json
 *
 * Estructura esperada:
 *   dropbox-source/
 *     Instalación A/
 *       Zona 1/
 *         Puerta-101/          ← carpeta con fotos
 *           foto1.jpg
 *           foto2.jpg
 *         Puerta-102.jpg       ← o archivo individual (sin fotos extra)
 *       Zona 2/
 *         ...
 *
 * Genera: dropbox-source/estructura.json
 */

const fs = require('fs')
const path = require('path')

const SOURCE_DIR = path.join(process.env.HOME, 'airbox-cilindros', 'dropbox-source')
const OUTPUT_FILE = path.join(SOURCE_DIR, 'estructura.json')

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.heic', '.webp', '.gif', '.tiff', '.bmp'])

function esImagen(nombreArchivo) {
  return IMAGE_EXTENSIONS.has(path.extname(nombreArchivo).toLowerCase())
}

function esDirectorioValido(nombre) {
  return !nombre.startsWith('.') && nombre !== 'estructura.json'
}

function procesarPuerta(carpetaPuerta, nombrePuerta) {
  const stat = fs.statSync(carpetaPuerta)

  if (stat.isFile()) {
    // Puerta como archivo de imagen individual
    if (esImagen(nombrePuerta)) {
      return {
        codigo: path.parse(nombrePuerta).name,
        tipo: 'archivo',
        fotos: [carpetaPuerta]
      }
    }
    return null
  }

  if (stat.isDirectory()) {
    // Puerta como carpeta con fotos
    const fotos = []
    let items
    try {
      items = fs.readdirSync(carpetaPuerta)
    } catch (e) {
      console.error(`  ⚠️ No se puede leer ${carpetaPuerta}: ${e.message}`)
      return null
    }

    for (const item of items) {
      if (item.startsWith('.')) continue
      const itemPath = path.join(carpetaPuerta, item)
      const itemStat = fs.statSync(itemPath)
      if (itemStat.isFile() && esImagen(item)) {
        fotos.push(itemPath)
      }
    }

    return {
      codigo: nombrePuerta,
      tipo: 'carpeta',
      fotos
    }
  }

  return null
}

function procesarZona(carpetaZona, nombreZona) {
  let items
  try {
    items = fs.readdirSync(carpetaZona)
  } catch (e) {
    console.error(`  ⚠️ No se puede leer zona ${carpetaZona}: ${e.message}`)
    return null
  }

  const puertas = []

  for (const item of items) {
    if (!esDirectorioValido(item)) continue
    const itemPath = path.join(carpetaZona, item)
    const puerta = procesarPuerta(itemPath, item)
    if (puerta) puertas.push(puerta)
  }

  return {
    nombre: nombreZona,
    puertas,
    total_fotos: puertas.reduce((sum, p) => sum + p.fotos.length, 0)
  }
}

function procesarInstalacion(carpetaInstalacion, nombreInstalacion) {
  let items
  try {
    items = fs.readdirSync(carpetaInstalacion)
  } catch (e) {
    console.error(`⚠️ No se puede leer instalación ${carpetaInstalacion}: ${e.message}`)
    return null
  }

  const zonas = []

  for (const item of items) {
    if (!esDirectorioValido(item)) continue
    const itemPath = path.join(carpetaInstalacion, item)
    const stat = fs.statSync(itemPath)
    if (stat.isDirectory()) {
      const zona = procesarZona(itemPath, item)
      if (zona) zonas.push(zona)
    }
  }

  return {
    nombre: nombreInstalacion,
    zonas,
    total_puertas: zonas.reduce((sum, z) => sum + z.puertas.length, 0),
    total_fotos: zonas.reduce((sum, z) => sum + z.total_fotos, 0)
  }
}

function main() {
  console.log('🔍 AIRBOX — Analizador de Dropbox')
  console.log('===================================')
  console.log(`📁 Directorio fuente: ${SOURCE_DIR}`)

  if (!fs.existsSync(SOURCE_DIR)) {
    fs.mkdirSync(SOURCE_DIR, { recursive: true })
    console.log(`✅ Creado directorio ${SOURCE_DIR}`)
    console.log('\n⚠️  El directorio estaba vacío. Añade las fotos con esta estructura:')
    console.log('   dropbox-source/')
    console.log('   ├── Instalación A/')
    console.log('   │   ├── Zona 1/')
    console.log('   │   │   ├── Puerta-101/')
    console.log('   │   │   │   ├── foto1.jpg')
    console.log('   │   │   │   └── foto2.jpg')
    console.log('   │   │   └── Puerta-102.jpg')
    console.log('   │   └── Zona 2/')
    console.log('   └── Instalación B/')
    process.exit(0)
  }

  let items
  try {
    items = fs.readdirSync(SOURCE_DIR)
  } catch (e) {
    console.error(`❌ Error al leer directorio: ${e.message}`)
    process.exit(1)
  }

  const instalaciones = []

  for (const item of items) {
    if (!esDirectorioValido(item)) continue
    const itemPath = path.join(SOURCE_DIR, item)
    const stat = fs.statSync(itemPath)
    if (stat.isDirectory()) {
      console.log(`\n📦 Procesando instalación: ${item}`)
      const instalacion = procesarInstalacion(itemPath, item)
      if (instalacion) {
        instalaciones.push(instalacion)
        console.log(`   ✅ ${instalacion.zonas.length} zonas, ${instalacion.total_puertas} puertas, ${instalacion.total_fotos} fotos`)
      }
    }
  }

  const estructura = {
    generado_en: new Date().toISOString(),
    source_dir: SOURCE_DIR,
    resumen: {
      total_instalaciones: instalaciones.length,
      total_zonas: instalaciones.reduce((s, i) => s + i.zonas.length, 0),
      total_puertas: instalaciones.reduce((s, i) => s + i.total_puertas, 0),
      total_fotos: instalaciones.reduce((s, i) => s + i.total_fotos, 0)
    },
    instalaciones
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(estructura, null, 2), 'utf8')

  console.log('\n===================================')
  console.log('📊 RESUMEN:')
  console.log(`   Instalaciones: ${estructura.resumen.total_instalaciones}`)
  console.log(`   Zonas:         ${estructura.resumen.total_zonas}`)
  console.log(`   Puertas:       ${estructura.resumen.total_puertas}`)
  console.log(`   Fotos:         ${estructura.resumen.total_fotos}`)
  console.log(`\n✅ Estructura guardada en: ${OUTPUT_FILE}`)
  console.log('\nAhora ejecuta: node migrar.js')
}

main()
