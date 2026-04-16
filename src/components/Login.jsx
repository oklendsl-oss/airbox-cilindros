import { useState } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

export default function Login() {
  const [email, setEmail] = useState('')
  const [estado, setEstado] = useState('idle') // idle | enviando | enviado | error

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email.trim()) {
      toast.error('Por favor, introduce tu email')
      return
    }

    setEstado('enviando')
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: window.location.origin
        }
      })

      if (error) throw error

      setEstado('enviado')
      toast.success('Enlace enviado a tu correo')
    } catch (err) {
      console.error('Error al enviar enlace:', err)
      setEstado('error')
      toast.error(err.message || 'Error al enviar el enlace')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4 shadow-lg">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">AIRBOX</h1>
          <p className="text-sm text-gray-500 mt-1">Revisión de Cilindros de Puertas</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          {estado === 'enviado' ? (
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-green-100 rounded-full mb-4">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Enlace enviado</h2>
              <p className="text-gray-500 text-sm mb-1">
                Hemos enviado un enlace de acceso a:
              </p>
              <p className="font-medium text-gray-800 text-sm mb-4">{email}</p>
              <p className="text-gray-400 text-xs">
                Revisa tu bandeja de entrada y haz clic en el enlace para acceder.
              </p>
              <button
                onClick={() => setEstado('idle')}
                className="mt-4 text-blue-600 text-sm hover:underline"
              >
                Usar otro email
              </button>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Acceso</h2>
              <p className="text-sm text-gray-500 mb-6">
                Introduce tu email para recibir un enlace de acceso directo.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                    Correo electrónico
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@empresa.com"
                    disabled={estado === 'enviando'}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                      disabled:bg-gray-50 disabled:text-gray-400 transition"
                  />
                </div>

                {estado === 'error' && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Error al enviar. Verifica el email e inténtalo de nuevo.
                  </div>
                )}

                <button
                  type="submit"
                  disabled={estado === 'enviando'}
                  className="w-full bg-blue-600 text-white py-2.5 px-4 rounded-lg text-sm font-medium
                    hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                    disabled:opacity-60 disabled:cursor-not-allowed transition"
                >
                  {estado === 'enviando' ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Enviando…
                    </span>
                  ) : (
                    'Enviar enlace de acceso'
                  )}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          Solo para uso interno autorizado
        </p>
      </div>
    </div>
  )
}
