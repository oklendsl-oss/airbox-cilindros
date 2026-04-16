import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

const formatearZona = (nombre) => {
  if (!nombre) return ''
  const match = nombre.match(/^(\d+)[\.\s_-]*(.*)$/)
  if (match) {
    const num = match[1].padStart(2, '0')
    const resto = match[2].trim().replace(/\s+/g, '_')
    return `${num}_${resto}`
  }
  return nombre.replace(/\s+/g, '_')
}

const ESTADO_COLORES = {
  pendiente: 'bg-gray-100 text-gray-700',
  revisada: 'bg-green-100 text-green-700',
  cambiada: 'bg-blue-100 text-blue-700',
  incidencia: 'bg-red-100 text-red-700'
}

const ESTADO_LABELS = {
  pendiente: 'Pendiente',
  revisada: 'Revisada',
  cambiada: 'Cambiada',
  incidencia: 'Incidencia'
}

export default function Buscador({ onSeleccionarPuerta }) {
  const [instalaciones, setInstalaciones] = useState([])
  const [zonas, setZonas] = useState([])
  const [tiposCilindro, setTiposCilindro] = useState([])
  const [puertas, setPuertas] = useState([])
  const [cargando, setCargando] = useState(false)

  const [filtroInstalacion, setFiltroInstalacion] = useState('')
  const [filtroZona, setFiltroZona] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroCodigo, setFiltroCodigo] = useState('')

  const debounceRef = useRef(null)

  // Cargar instalaciones y tipos al montar
  useEffect(() => {
    cargarInstalaciones()
    cargarTiposCilindro()
  }, [])

  // Cargar zonas cuando cambia instalación
  useEffect(() => {
    if (filtroInstalacion) {
      cargarZonas(filtroInstalacion)
      setFiltroZona('')
    } else {
      setZonas([])
      setFiltroZona('')
    }
  }, [filtroInstalacion])

  // Buscar puertas con debounce en código
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      buscarPuertas()
    }, filtroCodigo ? 500 : 0)
    return () => clearTimeout(debounceRef.current)
  }, [filtroInstalacion, filtroZona, filtroEstado, filtroTipo, filtroCodigo])

  const cargarInstalaciones = async () => {
    const { data, error } = await supabase
      .from('instalaciones')
      .select('id, nombre')
      .order('nombre')
    if (error) {
      toast.error('Error al cargar instalaciones')
      return
    }
    setInstalaciones(data || [])
  }

  const cargarZonas = async (instalacionId) => {
    const { data, error } = await supabase
      .from('zonas')
      .select('id, nombre')
      .eq('instalacion_id', instalacionId)
      .order('nombre')
    if (error) {
      toast.error('Error al cargar zonas')
      return
    }
    setZonas(data || [])
  }

  const cargarTiposCilindro = async () => {
    const { data, error } = await supabase
      .from('tipos_cilindro')
      .select('id, nombre')
      .order('orden')
    if (error) return
    setTiposCilindro(data || [])
  }

  const buscarPuertas = useCallback(async () => {
    setCargando(true)
    try {
      let query = supabase
        .from('puertas')
        .select(`
          id, codigo, estado, observaciones,
          zona:zonas(id, nombre, instalacion:instalaciones(id, nombre)),
          tipo_cilindro:tipos_cilindro(id, nombre),
          fotos(id, storage_path)
        `)
        .order('codigo')
        .limit(100)

      if (filtroZona) {
        query = query.eq('zona_id', filtroZona)
      } else if (filtroInstalacion) {
        // Filtrar por instalación via zonas
        const { data: zonasInst } = await supabase
          .from('zonas')
          .select('id')
          .eq('instalacion_id', filtroInstalacion)
        if (zonasInst && zonasInst.length > 0) {
          query = query.in('zona_id', zonasInst.map(z => z.id))
        } else {
          setPuertas([])
          setCargando(false)
          return
        }
      }

      if (filtroEstado) query = query.eq('estado', filtroEstado)
      if (filtroTipo) query = query.eq('tipo_cilindro_id', filtroTipo)
      if (filtroCodigo.trim()) query = query.ilike('codigo', `%${filtroCodigo.trim()}%`)

      const { data, error } = await query
      if (error) throw error
      setPuertas(data || [])
    } catch (err) {
      toast.error('Error al buscar puertas')
      console.error(err)
    } finally {
      setCargando(false)
    }
  }, [filtroInstalacion, filtroZona, filtroEstado, filtroTipo, filtroCodigo])

  const getUrlFoto = (storagePath) => {
    if (!storagePath) return null
    const { data } = supabase.storage.from('puertas-fotos').getPublicUrl(storagePath)
    return data?.publicUrl
  }

  return (
    <div className="p-4 max-w-7xl mx-auto">
      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
          </svg>
          Filtros de búsqueda
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Instalación */}
          <select
            value={filtroInstalacion}
            onChange={(e) => setFiltroInstalacion(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">Todas las instalaciones</option>
            {instalaciones.map(i => (
              <option key={i.id} value={i.id}>{i.nombre}</option>
            ))}
          </select>

          {/* Zona */}
          <select
            value={filtroZona}
            onChange={(e) => setFiltroZona(e.target.value)}
            disabled={!filtroInstalacion}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
          >
            <option value="">Todas las zonas</option>
            {zonas.map(z => (
              <option key={z.id} value={z.id}>{z.nombre}</option>
            ))}
          </select>

          {/* Estado */}
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">Todos los estados</option>
            <option value="pendiente">Pendiente</option>
            <option value="revisada">Revisada</option>
            <option value="cambiada">Cambiada</option>
            <option value="incidencia">Incidencia</option>
          </select>

          {/* Tipo cilindro */}
          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">Todos los tipos</option>
            {tiposCilindro.map(t => (
              <option key={t.id} value={t.id}>{t.nombre}</option>
            ))}
          </select>

          {/* Búsqueda por código */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={filtroCodigo}
              onChange={(e) => setFiltroCodigo(e.target.value)}
              placeholder="Buscar por código…"
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Resultados */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500">
          {cargando ? 'Buscando…' : `${puertas.length} puerta${puertas.length !== 1 ? 's' : ''} encontrada${puertas.length !== 1 ? 's' : ''}`}
        </span>
      </div>

      {cargando ? (
        <div className="flex items-center justify-center py-16">
          <svg className="animate-spin w-8 h-8 text-blue-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : puertas.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-sm">No se encontraron puertas</p>
          <p className="text-xs mt-1">Ajusta los filtros o añade datos a la base de datos</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {puertas.map(puerta => {
            const primeraFoto = puerta.fotos?.[0]
            const fotoUrl = primeraFoto ? getUrlFoto(primeraFoto.storage_path) : null
            return (
              <button
                key={puerta.id}
                onClick={() => onSeleccionarPuerta(puerta.id)}
                className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:border-blue-400 hover:shadow-md transition-all text-left group"
              >
                {/* Thumbnail */}
                <div className="aspect-square bg-gray-100 relative overflow-hidden">
                  {fotoUrl ? (
                    <img
                      src={fotoUrl}
                      alt={`Puerta ${puerta.codigo}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" style={{imageOrientation:'from-image'}}
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-2">
                  <p className="text-xs font-semibold text-gray-900 truncate">{puerta.codigo}</p>
                  {puerta.zona && (
                    <p className="text-xs text-gray-400 truncate mt-0.5">{formatearZona(puerta.zona.nombre)}</p>
                  )}
                  <span className={`inline-block mt-1.5 px-1.5 py-0.5 rounded text-xs font-medium ${ESTADO_COLORES[puerta.estado] || 'bg-gray-100 text-gray-600'}`}>
                    {ESTADO_LABELS[puerta.estado] || puerta.estado}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
