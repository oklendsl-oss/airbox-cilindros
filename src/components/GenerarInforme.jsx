import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  ImageRun, Table, TableRow, TableCell, WidthType,
  BorderStyle, AlignmentType, PageBreak, VerticalAlign
} from 'docx'
import { saveAs } from 'file-saver'

const formatearZona = (nombre, instalacionNombre = '') => {
  const match = nombre.match(/^(\d+)[\.\s_-]*(.*)$/)
  const inst = instalacionNombre.trim().toUpperCase().replace(/\s+/g, '_')
  if (match) {
    const num = match[1].padStart(2, '0')
    const resto = match[2].trim().toUpperCase().replace(/\s+/g, '_')
    return inst ? `${num}_${inst}_${resto}` : `${num}_${resto}`
  }
  const base = nombre.trim().toUpperCase().replace(/\s+/g, '_')
  return inst ? `${inst}_${base}` : base
}

const ordenarZonas = (lista) => [...lista].sort((a, b) => {
  const numA = parseInt(a.nombre.match(/^(\d+)/)?.[1] || '0')
  const numB = parseInt(b.nombre.match(/^(\d+)/)?.[1] || '0')
  return numA - numB
})

// Obtiene dimensiones reales de imagen desde base64
const getImageDimensions = (base64, mimeType) => {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.width, height: img.height })
    img.onerror = () => resolve({ width: 1, height: 1 })
    img.src = `data:${mimeType};base64,${base64}`
  })
}

export default function GenerarInforme({ onCerrar }) {
  const [instalaciones, setInstalaciones] = useState([])
  const [instalacionId, setInstalacionId] = useState('')
  const [zonas, setZonas] = useState([])
  const [zonasSeleccionadas, setZonasSeleccionadas] = useState([])
  const [generando, setGenerando] = useState(false)
  const [progreso, setProgreso] = useState('')

  useEffect(() => {
    supabase.from('instalaciones').select('*').order('nombre').then(({ data }) => {
      setInstalaciones(data || [])
    })
  }, [])

  useEffect(() => {
    if (!instalacionId) { setZonas([]); setZonasSeleccionadas([]); return }
    supabase.from('zonas').select('*').eq('instalacion_id', instalacionId).then(({ data }) => {
      const ordenadas = ordenarZonas(data || [])
      setZonas(ordenadas)
      setZonasSeleccionadas(ordenadas.map(z => z.id))
    })
  }, [instalacionId])

  const toggleZona = (id) => {
    setZonasSeleccionadas(prev =>
      prev.includes(id) ? prev.filter(z => z !== id) : [...prev, id]
    )
  }

  const fetchImageAsBase64 = async (url) => {
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      return new Promise((resolve) => {
        const reader = new FileReader()
        reader.onloadend = () => {
          const base64 = reader.result.split(',')[1]
          resolve({ base64, mimeType: blob.type || 'image/jpeg' })
        }
        reader.readAsDataURL(blob)
      })
    } catch {
      return null
    }
  }

  const generarDocx = async () => {
    if (!instalacionId || zonasSeleccionadas.length === 0) {
      toast.error('Selecciona una instalación y al menos una zona')
      return
    }
    setGenerando(true)

    try {
      const instalacion = instalaciones.find(i => i.id === instalacionId)
      const zonasData = zonas.filter(z => zonasSeleccionadas.includes(z.id))
      const children = []

      // Portada
      children.push(
        new Paragraph({
          children: [new TextRun({ text: 'INFORME DE REVISIÓN DE CILINDROS', bold: true, size: 36, color: '1e40af' })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 1200, after: 400 }
        }),
        new Paragraph({
          children: [new TextRun({ text: instalacion.nombre.toUpperCase(), bold: true, size: 28 })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 }
        }),
        new Paragraph({
          children: [new TextRun({
            text: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }),
            size: 20, color: '6b7280'
          })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 800 }
        }),
        new Paragraph({ children: [new PageBreak()] })
      )

      // Por cada zona
      for (let i = 0; i < zonasData.length; i++) {
        const zona = zonasData[i]
        const zonaLabel = formatearZona(zona.nombre, instalacion.nombre)
        setProgreso(`Procesando ${i + 1}/${zonasData.length}: ${zonaLabel}`)

        // Cargar puertas de la zona (cada puerta = una foto de la zona en este layout)
        const { data: puertas } = await supabase
          .from('puertas')
          .select('*, tipos_cilindro(nombre), fotos(storage_path, nombre_original)')
          .eq('zona_id', zona.id)
          .order('codigo')

        // Título zona
        children.push(
          new Paragraph({
            children: [new TextRun({ text: zonaLabel, bold: true, size: 22, color: '1e3a5f' })],
            spacing: { before: 300, after: 200 }
          })
        )

        if (!puertas || puertas.length === 0) {
          children.push(new Paragraph({
            children: [new TextRun({ text: 'Sin puertas registradas', italics: true, color: '9ca3af', size: 18 })],
            spacing: { after: 200 }
          }))
          if (i < zonasData.length - 1) children.push(new Paragraph({ children: [new PageBreak()] }))
          continue
        }

        // Recopilar TODAS las fotos de la zona (una por puerta, la primera)
        const todasLasFotos = []
        for (const puerta of puertas) {
          const fotosOrdenadas = puerta.fotos || []
          if (fotosOrdenadas.length > 0) {
            const { data: { publicUrl } } = supabase.storage.from('puertas-fotos').getPublicUrl(fotosOrdenadas[0].storage_path)
            const imgData = await fetchImageAsBase64(publicUrl)
            if (imgData) {
              const dims = await getImageDimensions(imgData.base64, imgData.mimeType)
              todasLasFotos.push({ imgData, dims, puerta })
            }
          }
        }

        // Agrupar en filas de 4
        const FOTOS_POR_FILA = 4
        const CELDA_ANCHO_PCT = Math.floor(100 / FOTOS_POR_FILA) // 25%
        const IMG_ANCHO = 1500000 // EMU ~1.65cm
        const IMG_ALTO = 2000000  // EMU ~2.2cm — más alto para fotos verticales

        for (let f = 0; f < todasLasFotos.length; f += FOTOS_POR_FILA) {
          const grupo = todasLasFotos.slice(f, f + FOTOS_POR_FILA)
          // Rellenar hasta 4
          while (grupo.length < FOTOS_POR_FILA) grupo.push(null)

          const celdas = grupo.map((item) => {
            if (!item) {
              return new TableCell({
                children: [new Paragraph({ children: [] })],
                width: { size: CELDA_ANCHO_PCT, type: WidthType.PERCENTAGE },
                borders: {
                  top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
                  left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }
                }
              })
            }

            const { imgData, dims } = item
            // Calcular dimensiones manteniendo ratio pero forzando orientación vertical
            let w = IMG_ANCHO
            let h = IMG_ALTO
            const ratio = dims.width / dims.height
            if (ratio > 1) {
              // Foto horizontal → rotar visualmente forzando alto > ancho
              h = IMG_ALTO
              w = Math.round(IMG_ALTO * (dims.height / dims.width))
            } else {
              w = IMG_ANCHO
              h = Math.round(IMG_ANCHO / ratio)
              if (h > IMG_ALTO * 1.5) h = IMG_ALTO * 1.5
            }

            return new TableCell({
              children: [new Paragraph({
                children: [new ImageRun({
                  data: imgData.base64,
                  transformation: { width: Math.round(w / 9144), height: Math.round(h / 9144) },
                  type: 'jpg'
                })],
                alignment: AlignmentType.CENTER
              })],
              width: { size: CELDA_ANCHO_PCT, type: WidthType.PERCENTAGE },
              verticalAlign: VerticalAlign.CENTER,
              borders: {
                top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
                left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }
              }
            })
          })

          children.push(new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [new TableRow({ children: celdas })],
            borders: {
              top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
              left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
              insideH: { style: BorderStyle.NONE }, insideV: { style: BorderStyle.NONE }
            }
          }))

          children.push(new Paragraph({ spacing: { after: 80 } }))
        }

        // Nivel de la zona (si alguna puerta tiene nivel asignado, usar el más frecuente)
        const niveles = puertas.map(p => p.nivel).filter(Boolean)
        if (niveles.length > 0) {
          const nivelMasFrecuente = niveles.sort((a, b) =>
            niveles.filter(v => v === b).length - niveles.filter(v => v === a).length
          )[0]
          children.push(new Paragraph({
            children: [new TextRun({ text: `Nivel: ${nivelMasFrecuente}`, bold: true, size: 20, color: '374151' })],
            alignment: AlignmentType.RIGHT,
            spacing: { before: 100, after: 200 }
          }))
        }

        // Salto de página entre zonas
        if (i < zonasData.length - 1) {
          children.push(new Paragraph({ children: [new PageBreak()] }))
        }
      }

      setProgreso('Generando documento...')
      const doc = new Document({
        sections: [{ properties: {}, children }],
        styles: { default: { document: { run: { font: 'Calibri', size: 20 } } } }
      })

      const blob = await Packer.toBlob(doc)
      const nombreArchivo = `AIRBOX_${instalacion.nombre.replace(/\s+/g, '_').toUpperCase()}_${new Date().toISOString().slice(0, 10)}.docx`
      saveAs(blob, nombreArchivo)
      toast.success('Informe generado ✅')
      onCerrar()

    } catch (err) {
      console.error(err)
      toast.error('Error al generar el informe')
    } finally {
      setGenerando(false)
      setProgreso('')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">📄 Generar Informe</h2>
          <button onClick={onCerrar} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Instalación</label>
          <select
            value={instalacionId}
            onChange={e => setInstalacionId(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Selecciona una instalación...</option>
            {instalaciones.map(i => (
              <option key={i.id} value={i.id}>{i.nombre}</option>
            ))}
          </select>
        </div>

        {zonas.length > 0 && (
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">Zonas ({zonasSeleccionadas.length}/{zonas.length})</label>
              <div className="flex gap-2">
                <button onClick={() => setZonasSeleccionadas(zonas.map(z => z.id))} className="text-xs text-blue-600 hover:underline">Todas</button>
                <span className="text-gray-300">|</span>
                <button onClick={() => setZonasSeleccionadas([])} className="text-xs text-gray-500 hover:underline">Ninguna</button>
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
              {zonas.map(zona => (
                <label key={zona.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={zonasSeleccionadas.includes(zona.id)}
                    onChange={() => toggleZona(zona.id)}
                    className="rounded text-blue-600"
                  />
                  <span className="text-sm text-gray-700">{formatearZona(zona.nombre, instalaciones.find(i => i.id === instalacionId)?.nombre || '')}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {generando && (
          <div className="mb-4 bg-blue-50 rounded-lg px-4 py-3 text-sm text-blue-700">
            ⏳ {progreso || 'Generando...'}
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={onCerrar} disabled={generando} className="flex-1 border border-gray-200 text-gray-600 rounded-lg py-2.5 text-sm hover:bg-gray-50 transition disabled:opacity-50">
            Cancelar
          </button>
          <button
            onClick={generarDocx}
            disabled={generando || !instalacionId || zonasSeleccionadas.length === 0}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2.5 text-sm font-medium transition disabled:opacity-50"
          >
            {generando ? 'Generando...' : '⬇️ Descargar Word'}
          </button>
        </div>
      </div>
    </div>
  )
}
