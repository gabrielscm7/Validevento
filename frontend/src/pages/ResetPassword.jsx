import { useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { forgotPasswordApi, resetPasswordApi } from '../services/authService'
import Logo from '../components/Logo'
import Btn from '../components/ui'

function validatePassword(p) {
  if (p.length < 8) return 'A senha deve ter no mínimo 8 caracteres.'
  return ''
}

/**
 * Recuperação de senha em dois passos:
 *  - /recuperar-senha            → envia e-mail (forgot-password)
 *  - /recuperar-senha?token=X    → define nova senha (reset-password)
 */
export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const resetToken = searchParams.get('token') || ''
  const isReset = !!resetToken

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleForgot(e) {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)
    try {
      await forgotPasswordApi(email)
      setMessage('Se o e-mail estiver cadastrado, você receberá as instruções em breve.')
      setEmail('')
    } catch (err) {
      setError(err?.response?.data?.error || 'Não foi possível solicitar a recuperação.')
    } finally {
      setLoading(false)
    }
  }

  async function handleReset(e) {
    e.preventDefault()
    setError('')
    const pErr = validatePassword(password)
    if (pErr) return setError(pErr)
    if (password !== confirm) return setError('As senhas não conferem.')

    setLoading(true)
    try {
      await resetPasswordApi(resetToken, password)
      navigate('/login', { state: { notice: 'Senha redefinida com sucesso. Acesse com sua nova senha.' } })
    } catch (err) {
      setError(
        err?.response?.data?.details ||
        err?.response?.data?.error ||
        'Não foi possível redefinir a senha. O link pode ter expirado.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page">
      <div className="page-body narrow">
        <div style={{ maxWidth: 400, margin: '0 auto', paddingTop: 40 }}>
          <Logo withText />

          <div className="card card-pad" style={{ marginTop: 20 }}>
            {isReset ? (
              <>
                <h1 className="auth-title">Defina uma nova senha</h1>
                <p className="auth-sub">Escolha uma nova senha para sua conta.</p>

                {message && <div className="form-success">{message}</div>}
                {error && <div className="form-error">{error}</div>}

                <form onSubmit={handleReset} noValidate>
                  <div className="field">
                    <label htmlFor="rp-pass" className="label">Nova senha</label>
                    <input
                      id="rp-pass"
                      type="password"
                      className="input"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mínimo 8 caracteres"
                      required
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="rp-confirm" className="label">Confirmar nova senha</label>
                    <input
                      id="rp-confirm"
                      type="password"
                      className="input"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      placeholder="Repita a senha"
                      required
                    />
                  </div>
                  <Btn type="submit" variant="primary" block size="lg" loading={loading}>
                    Redefinir senha
                  </Btn>
                </form>
              </>
            ) : (
              <>
                <h1 className="auth-title">Recuperar senha</h1>
                <p className="auth-sub">
                  Informe o e-mail cadastrado. Enviaremos um link para você redefinir sua senha.
                </p>

                {message && <div className="form-success">{message}</div>}
                {error && <div className="form-error">{error}</div>}

                <form onSubmit={handleForgot} noValidate>
                  <div className="field">
                    <label htmlFor="fp-email" className="label">E-mail</label>
                    <input
                      id="fp-email"
                      type="email"
                      className="input"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="voce@exemplo.com"
                      required
                    />
                  </div>
                  <Btn type="submit" variant="primary" block size="lg" loading={loading}>
                    Enviar instruções
                  </Btn>
                </form>
              </>
            )}

            <div className="mt-4 text-center">
              <Link to="/login" className="btn-text">Voltar para o login</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
