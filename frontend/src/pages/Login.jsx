import { useEffect, useMemo, useState } from 'react'
import { useNavigate, Link, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { homeForRole } from '../lib/roles'
import { formatCPF } from '../lib/format'
import Logo from '../components/Logo'
import Btn from '../components/ui'

const ERROR_MSGS = {
  email_not_verified: 'Confirme seu e-mail antes de acessar. Verifique sua caixa de entrada.',
  tenant_suspended: 'Acesso suspenso. Entre em contato com o administrador.',
  user_inactive: 'Usuário desativado. Contate o administrador.',
  invalid_credentials: 'CPF ou senha incorretos.',
  missing_fields: 'Informe CPF e senha.',
}

/** Nós + linhas animados (SVG) no painel esquerdo. */
function Particles() {
  const dots = useMemo(() =>
    Array.from({ length: 22 }, (_, i) => ({
      id: i,
      left: `${(i * 37) % 100}%`,
      size: 3 + ((i * 5) % 7),
      dur: `${9 + ((i * 3) % 9)}s`,
      delay: `${-((i * 11) % 10)}s`,
    }))
  , [])
  return (
    <div className="particles" aria-hidden="true">
      {dots.map((d) => (
        <span
          key={d.id}
          className="p-dot"
          style={{
            left: d.left,
            width: d.size,
            height: d.size,
            top: '100%',
            animationDuration: d.dur,
            animationDelay: d.delay,
          }}
        />
      ))}
      <svg className="lines" viewBox="0 0 400 600" preserveAspectRatio="none">
        {dots.slice(0, 10).map((d, i) => (
          <line
            key={`l${d.id}`}
            x1={parseFloat(d.left) / 100 * 400}
            y1={600}
            x2={((parseFloat(d.left) + 25) % 100) / 100 * 400}
            y2={(i % 3) * 150}
            stroke="#ffffff"
            strokeOpacity="0.08"
          />
        ))}
      </svg>
    </div>
  )
}

export default function Login() {
  const [cpf, setCpf] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const { login } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const notice = location.state?.notice || ''

  // Se já autenticado (ex.: sessão persistente), sai da tela de login.
  useEffect(() => {
    const { user, isAuthenticated } = useAuthStore.getState()
    if (isAuthenticated && user) {
      const home = homeForRole(user)
      navigate(home || '/sem-evento', { replace: true })
    }
  }, [navigate])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const user = await login(cpf, password)
      const from = location.state?.from
      // Redireciona para onde o usuário tentava acessar, ou para a home do perfil.
      const fallback = homeForRole(user)
      navigate(from && from !== '/login' ? from : fallback || '/sem-evento', {
        replace: true,
      })
    } catch (err) {
      const code = err?.response?.data?.error || err?.message || ''
      setError(ERROR_MSGS[code] || ERROR_MSGS.invalid_credentials)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-wrap">
      <aside className="auth-left">
        <div className="auth-brand">
          <Logo light size={56} />
          <span className="auth-slogan">EXPERIÊNCIAS ÚNICAS</span>
        </div>
        <Particles />
      </aside>

      <main className="auth-right">
        <div className="auth-card">
          <Logo withText compact />

          <h1 className="auth-title">Acesse sua conta</h1>
          <p className="auth-sub">Use seu CPF e senha para entrar</p>

          {error && (
            <div role="alert" className="form-error" data-testid="login-error">
              {error}
            </div>
          )}
          {!error && notice && (
            <div role="status" className="form-success" data-testid="login-notice">
              {notice}
            </div>
          )}

          <form id="login-form" onSubmit={handleSubmit} noValidate>
            <div className="field">
              <label htmlFor="login-cpf" className="label">
                CPF
              </label>
              <input
                id="login-cpf"
                name="cpf"
                className="input"
                placeholder="000.000.000-00"
                inputMode="numeric"
                autoComplete="username"
                value={cpf}
                onChange={(e) => setCpf(formatCPF(e.target.value))}
                required
              />
            </div>

            <div className="field">
              <div className="label-row">
                <label htmlFor="login-password" className="label">
                  Senha
                </label>
                <Link to="/recuperar-senha" className="btn-text" tabIndex={-1}>
                  Esqueci minha senha
                </Link>
              </div>
              <div className="input-icon-wrap">
                <input
                  id="login-password"
                  name="password"
                  type={showPass ? 'text' : 'password'}
                  className="input"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="input-ico"
                  onClick={() => setShowPass((v) => !v)}
                  aria-label={showPass ? 'Ocultar senha' : 'Mostrar senha'}
                  tabIndex={-1}
                >
                  {showPass ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            <Btn
              id="login-submit"
              type="submit"
              variant="primary"
              size="lg"
              block
              loading={loading}
              disabled={!cpf || !password}
              className="mt-1"
            >
              {loading ? 'Entrando…' : 'Entrar'}
            </Btn>
          </form>
        </div>
      </main>
    </div>
  )
}
