import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { homeForRole } from '../lib/roles'
import { verifyEmailApi, resendVerificationApi } from '../services/authService'
import Logo from '../components/Logo'
import Btn from '../components/ui'

function validatePassword(p) {
  if (p.length < 8) return 'A senha deve ter no mínimo 8 caracteres.'
  return ''
}

export default function ActivateAccount() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [expired, setExpired] = useState(false)
  const [done, setDone] = useState(false)
  const [emailForResend, setEmailForResend] = useState('')

  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!token) {
      setError('Link de ativação inválido ou incompleto.')
      return
    }
    const pErr = validatePassword(password)
    if (pErr) return setError(pErr)
    if (password !== confirm) return setError('As senhas não conferem.')

    setLoading(true)
    try {
      const data = await verifyEmailApi(token, password)
      setDone(true)
      // Login automático: resposta contém token + user.
      if (data?.token && data?.user) {
        useAuthStore.getState().applySession(data.token, data.user)
      } else {
        // fallback: se não houver auto-login, apenas redireciona.
        setMessage('Conta ativada com sucesso. Faça login para continuar.')
      }
    } catch (err) {
      const code = err?.response?.data?.error || ''
      if (code === 'invalid_or_expired_token') {
        setExpired(true)
      } else {
        setError(err?.response?.data?.details || err?.response?.data?.error || 'Não foi possível ativar sua conta.')
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    setError('')
    setLoading(true)
    try {
      await resendVerificationApi(emailForResend)
      setMessage('Se o e-mail estiver cadastrado, você receberá um novo link de ativação.')
    } catch (err) {
      // Endpoint pode não existir em versões antigas do backend.
      setError(err?.response?.data?.error || 'Não foi possível reenviar. Contate o administrador.')
    } finally {
      setLoading(false)
    }
  }

  // Login automático via resposta do verify-email (token + user no payload).
  useEffect(() => {
    if (done) {
      const st = useAuthStore.getState()
      const user = st.user
      if (user) {
        const home = homeForRole(user)
        const t = setTimeout(() => navigate(home || '/sem-evento', { replace: true }), 800)
        return () => clearTimeout(t)
      }
    }
  }, [done, navigate])

  if (!token && !expired) {
    return (
      <div className="page">
        <div className="page-body narrow">
          <div className="card card-pad mt-6">
            <Logo withText />
            <div style={{ marginTop: 16 }}>
              <p className="empty-title">Link inválido</p>
              <p className="empty-sub mt-2">Este link de ativação está incompleto. Verifique o e-mail recebido.</p>
              <Link to="/login" className="btn-outline btn" style={{ marginTop: 16 }}>
                Voltar para o login
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-body narrow">
        <div style={{ maxWidth: 400, margin: '0 auto', paddingTop: 40 }}>
          <Logo withText />

          {expired ? (
            <div className="card card-pad" style={{ marginTop: 20 }}>
              <h1 className="auth-title">Link expirado</h1>
              <p className="auth-sub">
                O link de ativação expirou ou já foi utilizado. Informe seu e-mail para reenviar um novo convite.
              </p>

              {message && <div className="form-success">{message}</div>}
              {error && <div className="form-error">{error}</div>}

              <form onSubmit={(e) => { e.preventDefault(); handleResend() }}>
                <div className="field">
                  <label htmlFor="resend-email" className="label">E-mail</label>
                  <input
                    id="resend-email"
                    type="email"
                    className="input"
                    value={emailForResend}
                    onChange={(e) => setEmailForResend(e.target.value)}
                    required
                  />
                </div>
                <Btn type="submit" variant="primary" block loading={loading}>
                  Reenviar convite
                </Btn>
              </form>
              <div className="mt-4 text-center">
                <Link to="/login" className="btn-text">Voltar para o login</Link>
              </div>
            </div>
          ) : done ? (
            <div className="card card-pad" style={{ marginTop: 20 }}>
              <div className="empty">
                <span className="badge-green badge">Conta ativada</span>
                <p className="empty-title mt-3">{message || 'Ativando sua sessão…'}</p>
                {message && (
                  <Link to="/login" className="btn-primary btn mt-4">Ir para o login</Link>
                )}
              </div>
            </div>
          ) : (
            <div className="card card-pad" style={{ marginTop: 20 }}>
              <h1 className="auth-title">Crie sua senha</h1>
              <p className="auth-sub">Defina uma senha segura para ativar seu acesso ao Validevento.</p>

              {message && <div className="form-success">{message}</div>}
              {error && <div className="form-error">{error}</div>}

              <form onSubmit={handleSubmit} noValidate>
                <div className="field">
                  <label htmlFor="activate-pass" className="label">Senha</label>
                  <input
                    id="activate-pass"
                    type="password"
                    className="input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="activate-confirm" className="label">Confirmar senha</label>
                  <input
                    id="activate-confirm"
                    type="password"
                    className="input"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Repita a senha"
                    required
                  />
                </div>

                <Btn type="submit" variant="primary" block size="lg" loading={loading}>
                  Ativar minha conta
                </Btn>
              </form>
              <div className="mt-4 text-center">
                <Link to="/login" className="btn-text">Já tenho conta — entrar</Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
