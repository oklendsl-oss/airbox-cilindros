import { useState } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

const SHARED_EMAIL = 'equipo@airbox.pro'

export default function Login() {
  const [codigo, setCodigo] = useState('')
  const [cargando, setCargando] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    if (!codigo) return
    setCargando(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: SHARED_EMAIL,
      password: codigo
    })
    if (error) {
      toast.error('Código incorrecto')
    }
    setCargando(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">AIRBOX</h1>
          <p className="text-sm text-gray-400 mt-1">Revisión de Cilindros</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Código de acceso
            </label>
            <input
              type="password"
              value={codigo}
              onChange={e => setCodigo(e.target.value)}
              placeholder="••••••••"
              required
              autoFocus
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <button
            type="submit"
            disabled={cargando}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl text-sm transition disabled:opacity-60"
          >
            {cargando ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
