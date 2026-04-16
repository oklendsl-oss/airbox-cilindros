export default function Login() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-lg p-10 max-w-sm w-full text-center">
        <div className="text-5xl mb-4">🔐</div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">AIRBOX</h1>
        <p className="text-gray-500 text-sm mb-6">Revisión de Cilindros</p>
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-blue-700 text-sm">
          Accede usando el enlace que te ha enviado el administrador.
        </div>
        <p className="text-gray-400 text-xs mt-6">
          ¿Sin acceso? Contacta con tu responsable.
        </p>
      </div>
    </div>
  )
}
