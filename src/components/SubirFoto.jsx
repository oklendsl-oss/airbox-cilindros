import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

export default function SubirFoto({ puerta, onFotoSubida, onCancelar }) {
  const [archivo, setArchivo] = useState(null)
  const [preview, setPreview] = useState(null)
  const [subiendo, setSubiendo] = useState(false)
  const inputRef = useRef(null)

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast.error('Solo se permiten imágenes')
      return
    }

    if (file.size > 20 * 1024 * 1024) {
      toast.error('La imagen no puede superar los 20 MB')
      return
    }

    setArchivo(file)
    const reader = new FileReader()
    reader.onloadend = () => setPreview(reader.result)
    reader.readAsDataURL(file)
  }

  const handleSubir = async () => {
    if (!archivo || !puerta) return

    setSubiendo(true)
    try {
      const session = await supabase.auth.getSession()
      const userId = session?.data?.session?.user?.id

      const instalacionId = puerta.zona?.instalacion?.id || 'sin-instalacion'
      const zonaId = puerta.zona?.id || 'sin-zona'
      const ext = archivo.name.split('.').pop()
      const nombreArchivo = `${Date.now()}-${Math.random().toString(36).substr(2, 6)}.${ext}`
      const storagePath = `${instalacionId}/${zonaId}/${puerta.id}/${nombreArchivo}`

      // Subir a storage
      const { error: uploadError } = await supabase.storage
        .from('puertas-fotos')
        .upload(storagePath, archivo, {
          cacheControl: '3600',
          upsert: false,
          contentType: archivo.type
        })

      if (uploadError) throw uploadError

      // Crear registro en tabla fotos
      const { error: dbError } = await supabase
        .from('fotos')
        .insert({
          puerta_id: puerta.id,
          storage_path: storagePath,
          nombre_original: archivo.name,
          subida_por: userId || null
        })

      if (dbError) {
        // Rollback: eliminar archivo subido
        await supabase.storage.from('puertas-fotos').remove([storagePath])
        throw dbError
      }

      toast.success('Foto subida correctamente')
      onFotoSubida?.()
    } catch (err) {
      console.error('Error al subir foto:', err)
      toast.error(err.message || 'Error al subir la foto')
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Añadir foto</h3>
          <button onClick={onCancelar} className="text-gray-400 hover:text-gray-600 transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Área de selección */}
          {!preview ? (
            <button
              onClick={() => inputRef.current?.click()}
              className="w-full aspect-video border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center gap-2 hover:border-blue-400 hover:bg-blue-50 transition"
            >
              <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <p className="text-sm text-gray-500">Toca para tomar foto o seleccionar</p>
              <p className="text-xs text-gray-400">JPG, PNG, HEIC hasta 20 MB</p>
            </button>
          ) : (
            <div className="relative">
              <img
                src={preview}
                alt="Vista previa"
                className="w-full aspect-video object-cover rounded-xl"
              />
              <button
                onClick={() => { setPreview(null); setArchivo(null) }}
                className="absolute top-2 right-2 bg-white/90 rounded-full p-1 hover:bg-white transition shadow"
              >
                <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* Input oculto */}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            className="hidden"
          />

          {/* Nombre del archivo */}
          {archivo && (
            <p className="text-xs text-gray-500 truncate text-center">{archivo.name}</p>
          )}

          {/* Acciones */}
          <div className="flex gap-2">
            <button
              onClick={onCancelar}
              disabled={subiendo}
              className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleSubir}
              disabled={!archivo || subiendo}
              className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {subiendo ? (
                <span className="flex items-center justify-center gap-1.5">
                  <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Subiendo…
                </span>
              ) : 'Confirmar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
