import { useState } from 'react'
import api from '../../services/api'

export default function ImportTab({ eventId }) {
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!file || !eventId) return
    setError('')
    setResult(null)
    setLoading(true)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('event_id', eventId)

    try {
      const { data } = await api.post('/api/import/csv', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setResult(data)
      setFile(null)
    } catch (err) {
      setError(err.response?.data?.error ?? 'Erro ao importar CSV')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="card p-5 space-y-4">
        <h4 className="font-semibold text-foreground">Importar base de ingressos</h4>
        <p className="text-xs text-muted-foreground">
          Formato: <code className="text-brand-600 dark:text-brand-300">ticket_code, batch, hash_cpf, display_name, status</code>
          {' '}(UTF-8)
        </p>
        {error && <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>}

        <input
          type="file"
          accept=".csv"
          onChange={(e) => setFile(e.target.files[0])}
          className="block w-full text-sm text-foreground file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-brand-600 file:text-white hover:file:bg-brand-500"
          required
        />

        <button type="submit" disabled={loading || !file} className="btn-primary py-2 px-4 text-sm">
          {loading ? 'Importando…' : '📤 Importar CSV'}
        </button>
      </form>

      {result && (
        <div className="card p-5 space-y-2">
          <p className="text-sm text-foreground font-medium">Resultado da importação</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="bg-emerald-50 dark:bg-emerald-500/10 rounded-xl p-3"><p className="text-2xl font-bold text-emerald-600 dark:text-emerald-300">{result.inserted}</p><p className="text-xs text-muted-foreground">Inseridos</p></div>
            <div className="bg-blue-50 dark:bg-blue-500/10 rounded-xl p-3"><p className="text-2xl font-bold text-blue-600 dark:text-blue-300">{result.updated}</p><p className="text-xs text-muted-foreground">Atualizados</p></div>
            <div className="bg-amber-50 dark:bg-amber-500/10 rounded-xl p-3"><p className="text-2xl font-bold text-amber-600 dark:text-amber-300">{result.skipped}</p><p className="text-xs text-muted-foreground">Pulados</p></div>
            <div className="bg-muted rounded-xl p-3"><p className="text-2xl font-bold text-foreground">{result.duration_ms}ms</p><p className="text-xs text-muted-foreground">Duração</p></div>
          </div>
          {result.errors?.length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-red-600 dark:text-red-400 font-medium mb-1">Erros ({result.errors.length}):</p>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {result.errors.map((e, i) => (
                  <p key={i} className="text-xs text-muted-foreground bg-red-50 dark:bg-red-500/5 rounded px-2 py-1">Linha {e.line}: {e.reason}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
