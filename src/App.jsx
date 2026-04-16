import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import Login from './components/Login'
import GenerarInforme from './components/GenerarInforme'
import Buscador from './components/Buscador'
import FichaPuerta from './components/FichaPuerta'
import toast from 'react-hot-toast'

export default function App() {
  const [session, setSession] = useState(null)
  const [cargandoAuth, setCargandoAuth] = useState(true)
  const [puertaSeleccionada, setPuertaSeleccionada] = useState(null)
  const [contadores, setContadores] = useState({ total: 0, pendientes: 0 })
  const [mostrarInforme, setMostrarInforme] = useState(false)

  useEffect(() => {
    // Obtener sesión inicial
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setCargandoAuth(false)
    })

    // Escuchar cambios de auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
        setCargandoAuth(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  // Cargar contadores cuando hay sesión
  useEffect(() => {
    if (session) {
      cargarContadores()
    }
  }, [session])

  const cargarContadores = async () => {
    try {
      const [{ count: total }, { count: pendientes }] = await Promise.all([
        supabase.from('puertas').select('id', { count: 'exact', head: true }),
        supabase.from('puertas').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente')
      ])
      setContadores({ total: total || 0, pendientes: pendientes || 0 })
    } catch (err) {
      console.error('Error al cargar contadores:', err)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setPuertaSeleccionada(null)
    toast.success('Sesión cerrada')
  }

  if (cargandoAuth) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <svg className="animate-spin w-8 h-8 text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    )
  }

  if (!session) {
    return <Login />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          {/* Logo */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>
            <span className="font-bold text-gray-900 text-sm hidden sm:block">
              AIRBOX <span className="text-gray-400 font-normal">— Revisión de Cilindros</span>
            </span>
            <span className="font-bold text-gray-900 text-sm sm:hidden">AIRBOX</span>
          </div>

          {/* Contadores */}
          <div className="flex items-center gap-3 ml-2 flex-1">
            <div className="hidden md:flex items-center gap-2">
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                {contadores.total} puertas totales
              </span>
              {contadores.pendientes > 0 && (
                <span className="text-xs text-orange-700 bg-orange-100 px-2 py-1 rounded-full font-medium">
                  {contadores.pendientes} pendientes
                </span>
              )}
            </div>
          </div>

          {/* Usuario y logout */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-gray-500 hidden sm:block truncate max-w-32">
              {session.user.email}
            </span>
            <button
              onClick={() => setMostrarInforme(true)}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600 border border-gray-200 hover:border-blue-200 rounded-lg px-2.5 py-1.5 transition"
            >
              <span>📄</span>
              <span className="hidden sm:block">Informe</span>
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600 border border-gray-200 hover:border-red-200 rounded-lg px-2.5 py-1.5 transition"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span className="hidden sm:block">Salir</span>
            </button>
          </div>
        </div>
      </header>

      {/* Contenido principal */}
      {mostrarInforme && <GenerarInforme onCerrar={() => setMostrarInforme(false)} />}
      <main>
        {puertaSeleccionada ? (
          <FichaPuerta
            puertaId={puertaSeleccionada}
            onVolver={() => {
              setPuertaSeleccionada(null)
              cargarContadores()
            }}
          />
        ) : (
          <Buscador
            onSeleccionarPuerta={(id) => setPuertaSeleccionada(id)}
          />
        )}
      </main>
    </div>
  )
}
