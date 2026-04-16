import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import Lightbox from 'yet-another-react-lightbox'
import 'yet-another-react-lightbox/styles.css'
import SubirFoto from './SubirFoto'

const ESTADO_COLORES = {
  pendiente: 'bg-gray-100 text-gray-700 border-gray-300',
  revisada: 'bg-green-100 text-green-700 border-green-300',
  cambiada: 'bg-blue-100 text-blue-700 border-blue-300',
  incidencia: 'bg-red-100 text-red-700 border-red-300'
}

export default function FichaPuerta({ puertaId, onVolver }) {
  const [puerta, setPuerta] = useState(null)
  const [fotos, setFotos] = useState([])
  const [historial, setHistorial] = useState([])
  const [tiposCilindro, setTiposCilindro] = useState([])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(-1)
  const [mostrarSubirFoto, setMostrarSubirFoto] = useState(false)

  // Estado del formulario
  const [estado, setEstado] = useState('pendiente')
  const [tipoCilindroId, setTipoCilindroId] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [nivel, setNivel] = useState('')
  const [infoCilindro, setInfoCilindro] = useState({
    marca: '', modelo: '', medidas_ext: '', medidas_int: '',
    num_llaves: '', acabado: '', notas: ''
  })

  const saveTimerRef = useRef(null)
  const sessionRef = useRef(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    cargarDatos()
    cargarTiposCilindro()
    supabase.auth.getSession().then(({ data }) => {
      sessionRef.current = data.session
    })

    // Suscripción realtime
    const channel = supabase
      .channel(`puerta-${puertaId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'puertas', filter: `id=eq.${puertaId}` },
        (payload) => {
          if (!mountedRef.current) return
          if (payload.eventType === 'UPDATE') {
            const updated = payload.new
            // Solo actualizar si no estamos editando
            setPuerta(prev => ({ ...prev, ...updated }))
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'fotos', filter: `puerta_id=eq.${puertaId}` },
        () => {
          if (!mountedRef.current) return
          cargarFotos()
        }
      )
      .subscribe()

    return () => {
      mountedRef.current = false
      supabase.removeChannel(channel)
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [puertaId])

  const cargarDatos = async () => {
    setCargando(true)
    try {
      const { data, error } = await supabase
        .from('puertas')
        .select(`
          *,
          tipo_cilindro:tipos_cilindro(id, nombre),
          zona:zonas(id, nombre, instalacion:instalaciones(id, nombre))
        `)
        .eq('id', puertaId)
        .single()

      if (error) throw error
      if (!mountedRef.current) return

      setPuerta(data)
      setEstado(data.estado || 'pendiente')
      setTipoCilindroId(data.tipo_cilindro_id || '')
      setObservaciones(data.observaciones || '')
      setNivel(data.nivel != null ? String(data.nivel) : '')
      setInfoCilindro({
        marca: data.info_cilindro?.marca || '',
        modelo: data.info_cilindro?.modelo || '',
        medidas_ext: data.info_cilindro?.medidas_ext || '',
        medidas_int: data.info_cilindro?.medidas_int || '',
        num_llaves: data.info_cilindro?.num_llaves || '',
        acabado: data.info_cilindro?.acabado || '',
        notas: data.info_cilindro?.notas || ''
      })

      await cargarFotos()
      await cargarHistorial()
    } catch (err) {
      toast.error('Error al cargar la puerta')
      console.error(err)
    } finally {
      if (mountedRef.current) setCargando(false)
    }
  }

  const cargarFotos = async () => {
    const { data, error } = await supabase
      .from('fotos')
      .select('id, storage_path, nombre_original, created_at')
      .eq('puerta_id', puertaId)
      .order('created_at', { ascending: true })
    if (!error && mountedRef.current) setFotos(data || [])
  }

  const cargarHistorial = async () => {
    const { data, error } = await supabase
      .from('historial')
      .select('id, accion, detalle, created_at, usuario_id')
      .eq('puerta_id', puertaId)
      .order('created_at', { ascending: false })
      .limit(20)
    if (!error && mountedRef.current) setHistorial(data || [])
  }

  const cargarTiposCilindro = async () => {
    const { data } = await supabase
      .from('tipos_cilindro')
      .select('id, nombre')
      .order('orden')
    if (data && mountedRef.current) setTiposCilindro(data)
  }

  // Guardado automático con debounce
  const guardarCambios = useCallback(async (nuevoEstado, nuevoTipoCilindroId, nuevasObservaciones, nuevaInfo, nuevoNivel) => {
    const userId = sessionRef.current?.user?.id

    try {
      setGuardando(true)
      const { error } = await supabase
        .from('puertas')
        .update({
          estado: nuevoEstado,
          tipo_cilindro_id: nuevoTipoCilindroId || null,
          observaciones: nuevasObservaciones || null,
          info_cilindro: nuevaInfo,
          nivel: nuevoNivel ? parseInt(nuevoNivel) : null,
          revisado_por: userId || null,
          revisado_en: new Date().toISOString()
        })
        .eq('id', puertaId)

      if (error) throw error

      // Insertar en historial
      await supabase.from('historial').insert({
        puerta_id: puertaId,
        usuario_id: userId || null,
        accion: 'actualización',
        detalle: {
          estado: nuevoEstado,
          tipo_cilindro_id: nuevoTipoCilindroId,
          observaciones: nuevasObservaciones
        }
      })

      await cargarHistorial()
    } catch (err) {
      toast.error('Error al guardar')
      console.error(err)
    } finally {
      if (mountedRef.current) setGuardando(false)
    }
  }, [puertaId])

  const programarGuardado = useCallback((nuevoEstado, nuevoTipo, nuevasObs, nuevaInfo, nuevoNivel) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      guardarCambios(nuevoEstado, nuevoTipo, nuevasObs, nuevaInfo, nuevoNivel)
    }, 800)
  }, [guardarCambios])

  const handleEstadoChange = (val) => {
    setEstado(val)
    programarGuardado(val, tipoCilindroId, observaciones, infoCilindro, nivel)
  }

  const handleTipoChange = (val) => {
    setTipoCilindroId(val)
    programarGuardado(estado, val, observaciones, infoCilindro, nivel)
  }

  const handleObservacionesChange = (val) => {
    setObservaciones(val)
    programarGuardado(estado, tipoCilindroId, val, infoCilindro, nivel)
  }

  const handleNivelChange = (val) => {
    setNivel(val)
    programarGuardado(estado, tipoCilindroId, observaciones, infoCilindro, val)
  }

  const handleInfoChange = (campo, val) => {
    const nueva = { ...infoCilindro, [campo]: val }
    setInfoCilindro(nueva)
    programarGuardado(estado, tipoCilindroId, observaciones, nueva, nivel)
  }

  const getFotoUrl = (storagePath) => {
    const { data } = supabase.storage.from('puertas-fotos').getPublicUrl(storagePath)
    return data?.publicUrl
  }

  const eliminarFoto = async (fotoId, storagePath) => {
    if (!confirm('¿Eliminar esta foto?')) return
    try {
      await supabase.storage.from('puertas-fotos').remove([storagePath])
      await supabase.from('fotos').delete().eq('id', fotoId)
      await cargarFotos()
      toast.success('Foto eliminada')
    } catch (err) {
      toast.error('Error al eliminar la foto')
    }
  }

  if (cargando) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <svg className="animate-spin w-8 h-8 text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    )
  }

  if (!puerta) {
    return (
      <div className="p-4 text-center text-gray-400">
        <p>Puerta no encontrada</p>
        <button onClick={onVolver} className="mt-2 text-blue-600 text-sm hover:underline">Volver</button>
      </div>
    )
  }

  const lightboxSlides = fotos.map(f => ({ src: getFotoUrl(f.storage_path) }))

  return (
    <div className="p-4 max-w-4xl mx-auto pb-12">
      {/* Header ficha */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={onVolver}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Volver
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-gray-900">{puerta.codigo}</h2>
            {guardando && (
              <span className="text-xs text-blue-500 flex items-center gap-1">
                <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Guardando…
              </span>
            )}
          </div>
          <p className="text-sm text-gray-400">
            {puerta.zona?.instalacion?.nombre} › {puerta.zona?.nombre}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Columna izquierda: fotos */}
        <div className="lg:col-span-1 space-y-3">
          {/* Galería */}
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700">Fotos ({fotos.length})</h3>
              <button
                onClick={() => setMostrarSubirFoto(true)}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Añadir foto
              </button>
            </div>

            {fotos.length === 0 ? (
              <button
                onClick={() => setMostrarSubirFoto(true)}
                className="w-full aspect-square border-2 border-dashed border-gray-200 rounded-lg flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-blue-300 hover:text-blue-400 transition"
              >
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="text-xs">Sin fotos aún</span>
              </button>
            ) : (
              <div className="grid grid-cols-3 gap-1">
                {fotos.map((foto, idx) => (
                  <div key={foto.id} className="relative group aspect-square">
                    <img
                      src={getFotoUrl(foto.storage_path)}
                      alt={foto.nombre_original || `Foto ${idx + 1}`}
                      className="w-full h-full object-cover rounded cursor-pointer hover:opacity-90 transition" style={{imageOrientation:'from-image'}}
                      onClick={() => setLightboxIndex(idx)}
                      loading="lazy"
                    />
                    <button
                      onClick={() => eliminarFoto(foto.id, foto.storage_path)}
                      className="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full w-4 h-4 text-xs items-center justify-center hidden group-hover:flex"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Columna derecha: formulario */}
        <div className="lg:col-span-2 space-y-4">
          {/* Estado y tipo */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">Clasificación</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Estado</label>
                <select
                  value={estado}
                  onChange={(e) => handleEstadoChange(e.target.value)}
                  className={`w-full border rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-transparent ${ESTADO_COLORES[estado]}`}
                >
                  <option value="pendiente">Pendiente</option>
                  <option value="revisada">Revisada</option>
                  <option value="cambiada">Cambiada</option>
                  <option value="incidencia">Incidencia</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Nivel (1-5)</label>
                <select
                  value={nivel}
                  onChange={(e) => handleNivelChange(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Sin nivel</option>
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                  <option value="5">5</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Tipo de cilindro</label>
                <select
                  value={tipoCilindroId}
                  onChange={(e) => handleTipoChange(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Sin asignar</option>
                  {tiposCilindro.map(t => (
                    <option key={t.id} value={t.id}>{t.nombre}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Observaciones</label>
              <textarea
                value={observaciones}
                onChange={(e) => handleObservacionesChange(e.target.value)}
                rows={3}
                placeholder="Anota incidencias, estado del cilindro, etc."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
            </div>
          </div>

          {/* Información del cilindro */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Información del cilindro</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { campo: 'marca', label: 'Marca', placeholder: 'Ej: TESA, Cerraduras' },
                { campo: 'modelo', label: 'Modelo', placeholder: 'Ej: T70' },
                { campo: 'medidas_ext', label: 'Medidas ext.', placeholder: 'Ej: 30mm' },
                { campo: 'medidas_int', label: 'Medidas int.', placeholder: 'Ej: 30mm' },
                { campo: 'num_llaves', label: 'Nº llaves', placeholder: 'Ej: 3' },
                { campo: 'acabado', label: 'Acabado', placeholder: 'Ej: Níquel, Latón' }
              ].map(({ campo, label, placeholder }) => (
                <div key={campo}>
                  <label className="block text-xs text-gray-500 mb-1">{label}</label>
                  <input
                    type="text"
                    value={infoCilindro[campo]}
                    onChange={(e) => handleInfoChange(campo, e.target.value)}
                    placeholder={placeholder}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              ))}
            </div>
            <div className="mt-3">
              <label className="block text-xs text-gray-500 mb-1">Notas adicionales</label>
              <textarea
                value={infoCilindro.notas}
                onChange={(e) => handleInfoChange('notas', e.target.value)}
                rows={2}
                placeholder="Información adicional sobre el cilindro…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
            </div>
          </div>

          {/* Historial */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Historial de cambios</h3>
            {historial.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">Sin cambios registrados</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-400 border-b border-gray-100">
                      <th className="pb-2 font-medium">Fecha</th>
                      <th className="pb-2 font-medium">Acción</th>
                      <th className="pb-2 font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {historial.map(h => (
                      <tr key={h.id}>
                        <td className="py-1.5 text-gray-500">
                          {new Date(h.created_at).toLocaleString('es-ES', {
                            day: '2-digit', month: '2-digit', year: '2-digit',
                            hour: '2-digit', minute: '2-digit'
                          })}
                        </td>
                        <td className="py-1.5 text-gray-700 capitalize">{h.accion}</td>
                        <td className="py-1.5">
                          {h.detalle?.estado && (
                            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${ESTADO_COLORES[h.detalle.estado] || ''}`}>
                              {h.detalle.estado}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox */}
      <Lightbox
        open={lightboxIndex >= 0}
        close={() => setLightboxIndex(-1)}
        index={lightboxIndex}
        slides={lightboxSlides}
      />

      {/* Modal subir foto */}
      {mostrarSubirFoto && (
        <SubirFoto
          puerta={{ ...puerta, zona: puerta.zona }}
          onFotoSubida={() => {
            setMostrarSubirFoto(false)
            cargarFotos()
          }}
          onCancelar={() => setMostrarSubirFoto(false)}
        />
      )}
    </div>
  )
}
