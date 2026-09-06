import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { ThemeToggle } from '../components/ThemeToggle'

export default function Login() {
  const [cpf, setCpf]             = useState('')
  const [password, setPassword]   = useState('')
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(false)
  const { login }                 = useAuthStore()
  const navigate                  = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const user = await login(cpf, password)
      if (user.role === 'admin' || user.role === 'supervisor') navigate('/dashboard')
      else navigate('/terminal')
    } catch (err) {
      const msg = err.response?.data?.error ?? 'Falha no login. Verifique suas credenciais.'
      setError(msg === 'email_not_verified' ? 'E-mail ainda não verificado. Verifique sua caixa de entrada.' : msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[600px]
                        rounded-full bg-brand-600/10 blur-[120px]" />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="absolute top-0 right-0 -mt-2 -mr-2">
          <ThemeToggle />
        </div>

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl
                          bg-brand-600 mb-4 shadow-lg shadow-brand-600/30">
            <span className="text-3xl">🎟️</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Validevento</h1>
          <p className="text-muted-foreground text-sm mt-1">Sistema de Validação de Portaria</p>
        </div>

        <form
          id="login-form"
          onSubmit={handleSubmit}
          className="card p-6 flex flex-col gap-5 shadow-lg"
        >
          <div>
            <label htmlFor="login-cpf" className="label">CPF</label>
            <input
              id="login-cpf"
              className="input"
              placeholder="000.000.000-00"
              value={cpf}
              onChange={(e) => setCpf(e.target.value)}
              required
              autoComplete="username"
              inputMode="numeric"
            />
          </div>

          <div>
            <label htmlFor="login-password" className="label">Senha</label>
            <input
              id="login-password"
              type="password"
              className="input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p id="login-error" className="text-red-600 dark:text-red-400 text-sm text-center
                                            bg-red-50 dark:bg-red-500/10
                                            border border-red-200 dark:border-red-500/20 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <button
            id="login-submit"
            type="submit"
            className="btn-primary btn-lg w-full mt-1"
            disabled={loading}
          >
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <p className="text-center text-muted-foreground/60 text-xs mt-6">
          Validevento · Controle de Acesso
        </p>
      </div>
    </div>
  )
}
