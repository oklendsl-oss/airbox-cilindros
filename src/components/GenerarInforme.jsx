import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  ImageRun, Table, TableRow, TableCell, WidthType,
  BorderStyle, AlignmentType, PageBreak
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

  // Carga la imagen, respeta el EXIF de orientación usando canvas
  const fetchImageCorregida = (url) => {
    return new Promise((resolve) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
        const base64 = dataUrl.split(',')[1]
        resolve({ base64, mimeType: 'image/jpeg' })
      }
      img.onerror = () => resolve(null)
      img.src = url
    })
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
          children: [new TextRun({ text: 'INFORME DE REVISIÓN DE CILINDROS', bold: true, size: 32, color: '1e40af' })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 1200, after: 400 }
        }),
        new Paragraph({
          children: [new TextRun({ text: `Instalación: ${instalacion.nombre}`, bold: true, size: 24 })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 }
        }),
        new Paragraph({
          children: [new TextRun({ text: `Fecha: ${new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}`, size: 20, color: '6b7280' })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 }
        }),
        new Paragraph({
          children: [new TextRun({ text: `Zonas incluidas: ${zonasSeleccionadas.length} de ${zonas.length}`, size: 20, color: '6b7280' })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 800 }
        }),
        new Paragraph({ children: [new PageBreak()] })
      )

      // Por cada zona
      for (let i = 0; i < zonasData.length; i++) {
        const zona = zonasData[i]
        const zonaLabel = formatearZona(zona.nombre, instalacion.nombre)
        setProgreso(`Procesando zona ${i + 1}/${zonasData.length}: ${zonaLabel}`)

        const { data: puertas } = await supabase
          .from('puertas')
          .select('*, tipos_cilindro(nombre), fotos(storage_path, nombre_original)')
          .eq('zona_id', zona.id)
          .order('codigo')

        // Título zona
        children.push(
          new Paragraph({
            text: zonaLabel,
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 }
          }),
          new Paragraph({
            children: [new TextRun({ text: `${puertas?.length || 0} puertas`, color: '6b7280', size: 18 })],
            spacing: { after: 300 }
          })
        )

        if (!puertas || puertas.length === 0) {
          children.push(new Paragraph({
            children: [new TextRun({ text: 'Sin puertas registradas', italics: true, color: '9ca3af' })],
            spacing: { after: 300 }
          }))
          if (i < zonasData.length - 1) children.push(new Paragraph({ children: [new PageBreak()] }))
          continue
        }

        // Cada puerta
        for (const puerta of puertas) {
          children.push(
            new Paragraph({
              text: `Puerta: ${puerta.codigo}`,
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 300, after: 100 }
            })
          )

          // Tabla info puerta — NIVEL en vez de estado, sin estado
          const filas = [
            ['Nivel', puerta.nivel != null ? String(puerta.nivel) : 'Sin asignar'],
            ['Tipo de cilindro', puerta.tipos_cilindro?.nombre || 'No definido'],
          ]
          if (puerta.observaciones) filas.push(['Observaciones', puerta.observaciones])
          if (puerta.info_cilindro) {
            const info = puerta.info_cilindro
            if (info.marca) filas.push(['Marca', info.marca])
            if (info.modelo) filas.push(['Modelo', info.modelo])
            if (info.medidas_ext) filas.push(['Medidas exteriores', info.medidas_ext])
            if (info.medidas_int) filas.push(['Medidas interiores', info.medidas_int])
            if (info.num_llaves) filas.push(['Nº llaves', info.num_llaves])
            if (info.acabado) filas.push(['Acabado', info.acabado])
          }

          children.push(new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: filas.map(([campo, valor]) => new TableRow({
              children: [
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun({ text: campo, bold: true, size: 18 })] })],
                  width: { size: 30, type: WidthType.PERCENTAGE },
                  shading: { fill: 'f3f4f6' }
                }),
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun({ text: String(valor || ''), size: 18 })] })],
                  width: { size: 70, type: WidthType.PERCENTAGE }
                })
              ]
            })),
            borders: {
              top: { style: BorderStyle.SINGLE, size: 1, color: 'e5e7eb' },
              bottom: { style: BorderStyle.SINGLE, size: 1, color: 'e5e7eb' },
              left: { style: BorderStyle.SINGLE, size: 1, color: 'e5e7eb' },
              right: { style: BorderStyle.SINGLE, size: 1, color: 'e5e7eb' },
              insideH: { style: BorderStyle.SINGLE, size: 1, color: 'e5e7eb' },
              insideV: { style: BorderStyle.SINGLE, size: 1, color: 'e5e7eb' }
            }
          }))

          // Fotos — tal como están, sin rotar, hasta 3
          if (puerta.fotos && puerta.fotos.length > 0) {
            children.push(new Paragraph({ spacing: { before: 200, after: 100 } }))
            for (const foto of puerta.fotos.slice(0, 3)) {
              const { data: { publicUrl } } = supabase.storage.from('puertas-fotos').getPublicUrl(foto.storage_path)
              const imgData = await fetchImageCorregida(publicUrl)
              if (imgData) {
                children.push(new Paragraph({
                  children: [new ImageRun({
                    data: imgData.base64,
                    transformation: { width: 300, height: 220 },
                    type: 'jpg'
                  })],
                  spacing: { after: 100 }
                }))
              }
            }
          }

          children.push(new Paragraph({ spacing: { before: 200, after: 100 } }))
        }

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
      const nombreArchivo = `AIRBOX_${instalacion.nombre.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.docx`
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
