import { useEffect, useState } from 'react'
import api from '../../services/api'
import { Modal, Btn } from '../ui'

/**
 * Modal de importação de ingressos (CSV/XLSX/JSON/XML).
 * POST /api/import/csv (FormData: file, event_id, batch opcional)
 */
export default function ImportTicketsModal({ event, open, onClose, onDone }) {
  const [file, setFile] = useState(null)
  const [batch, setBatch] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) { setFile(null); setBatch(''); setResult(null); setError('') }
  }, [open])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!file) return setError('Selecione um arquivo CSV, XLSX, JSON ou XML.')
    setLoading(true)
    setError('')
    setResult(null)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('event_id', event.id)
    if (batch) fd.append('batch', batch)
    try {
      const { data } = await api.post('/api/import/csv', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setResult(data)
      onDone?.()
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Erro ao importar arquivo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Importar ingressos — ${event?.name || ''}`} wide
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>Fechar</Btn>
          <Btn variant="primary" loading={loading} onClick={handleSubmit} disabled={!file}>Importar</Btn>
        </>
      }>
      <form onSubmit={handleSubmit}>
        {error && <div className="form-error">{error}</div>}

        {result && (
          <div className="form-success mb-3">
            <strong>Importação concluída:</strong>{' '}
            {result.inserted} inseridos · {result.updated} atualizados · {result.skipped} ignorados
            {result.total ? ` · ${result.total} registros (${Math.round((result.duration_ms || 0))} ms)` : ''}
          </div>
        )}

        {result?.errors?.length > 0 && (
          <div className="form-error mb-3">
            <strong>{result.errors.length} erro(s):</strong>
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              {result.errors.slice(0, 8).map((er, i) => (
                <li key={i}>Linha {er.line}: {er.reason}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="field">
          <label className="label">Arquivo *</label>
          <input
            type="file"
            accept=".csv,.xlsx,.xls,.json,.xml"
            className="input"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <span className="hint">CSV, XLSX, JSON ou XML. Colunas reconhecidas: código/ticket_code, nome/display_name, lote.</span>
        </div>

        <div className="field">
          <label className="label">Lote (opcional)</label>
          <input className="input" value={batch} onChange={(e) => setBatch(e.target.value)}
            placeholder="Ex.: LOTE-01 (usa a coluna 'lote' do arquivo se vazio)" />
        </div>
      </form>
    </Modal>
  )
}
