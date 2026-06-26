import { useState, useEffect } from 'react'
import api from '../../services/api'

export default function BatchesTab({ eventId }) {
  const [batches, setBatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', capacity: '' })
  const [editingId, setEditingId] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!eventId) return
    let mounted = true
    async function load() {
      try {
        const { data } = await api.get('/api/batches', { params: { event_id: eventId } })
        if (mounted) setBatches(data)
      } catch { if (mounted) setError('Erro ao carregar lotes') }
      finally { if (mounted) setLoading(false) }
    }
    load()
    return () => { mounted = false }
  }, [eventId])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    try {
      const payload = { event_id: eventId, name: form.name, capacity: parseInt(form.capacity) || 0 }
      if (editingId) {
        await api.put(`/api/batches/${editingId}`, payload)
      } else {
        await api.post('/api/batches', payload)
      }
      setForm({ name: '', capacity: '' })
      setEditingId(null)
      const { data } = await api.get('/api/batches', { params: { event_id: eventId } })
      setBatches(data)
    } catch (err) {
      setError(err.response?.data?.error ?? 'Erro ao salvar lote')
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Remover este lote?')) return
    await api.delete(`/api/batches/${id}`)
    const { data } = await api.get('/api/batches', { params: { event_id: eventId } })
    setBatches(data)
  }

  function handleEdit(b) {
    setEditingId(b.id)
    setForm({ name: b.name, capacity: String(b.capacity) })
  }

  if (loading) return <div className="animate-pulse h-32 bg-muted rounded-xl" />

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="card p-5 space-y-4">
        <h4 className="font-semibold text-foreground">{editingId ? 'Editar lote' : 'Novo lote'}</h4>
        {error && <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input className="input" placeholder="Nome do lote (ex: LOTE-05)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input className="input" type="number" placeholder="Capacidade" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
        </div>
        <div className="flex gap-2">
          <button type="submit" className="btn-primary py-2 px-4 text-sm">{editingId ? 'Atualizar' : 'Criar'}</button>
          {editingId && (
            <button type="button" onClick={() => { setEditingId(null); setForm({ name: '', capacity: '' }) }} className="btn-ghost py-2 px-4 text-sm">Cancelar</button>
          )}
        </div>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground text-xs uppercase tracking-wide">
              <th className="text-left pb-3 font-medium">Lote</th>
              <th className="text-right pb-3 font-medium">Capacidade</th>
              <th className="text-right pb-3 font-medium">Ingressos</th>
              <th className="text-right pb-3 font-medium">Validados</th>
              <th className="text-right pb-3 font-medium">%</th>
              <th className="text-right pb-3 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {batches.map((b) => (
              <tr key={b.id} className="text-foreground">
                <td className="py-3 font-medium">{b.name}</td>
                <td className="py-3 text-right">{b.capacity}</td>
                <td className="py-3 text-right">{b.total_tickets}</td>
                <td className="py-3 text-right">{b.validated_tickets}</td>
                <td className="py-3 text-right">
                  {b.capacity > 0 ? ((b.validated_tickets / b.capacity) * 100).toFixed(1) : '-'}%
                </td>
                <td className="py-3 text-right">
                  <button onClick={() => handleEdit(b)} className="btn-ghost py-1 px-2 text-xs">Editar</button>
                  <button onClick={() => handleDelete(b.id)} className="btn-ghost py-1 px-2 text-xs text-red-600 dark:text-red-400 ml-1">Remover</button>
                </td>
              </tr>
            ))}
            {batches.length === 0 && (
              <tr><td colSpan="6" className="py-8 text-center text-muted-foreground">Nenhum lote cadastrado</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
