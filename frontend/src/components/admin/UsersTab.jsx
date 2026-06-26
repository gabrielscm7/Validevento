import { useState, useEffect } from 'react'
import api from '../../services/api'

export default function UsersTab() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'validator' })
  const [editingId, setEditingId] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    async function load() {
      try {
        const { data } = await api.get('/api/users')
        if (mounted) setUsers(data)
      } catch { if (mounted) setError('Erro ao carregar usuários') }
      finally { if (mounted) setLoading(false) }
    }
    load()
    return () => { mounted = false }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    try {
      if (editingId) {
        await api.put(`/api/users/${editingId}`, form)
      } else {
        await api.post('/api/users', form)
      }
      setForm({ name: '', email: '', password: '', role: 'validator' })
      setEditingId(null)
      const { data } = await api.get('/api/users')
      setUsers(data)
    } catch (err) {
      setError(err.response?.data?.error ?? 'Erro ao salvar usuário')
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Desativar este usuário?')) return
    await api.delete(`/api/users/${id}`)
    const { data } = await api.get('/api/users')
    setUsers(data)
  }

  function handleEdit(u) {
    setEditingId(u.id)
    setForm({ name: u.name, email: u.email, password: '', role: u.role })
  }

  if (loading) return <div className="animate-pulse h-32 bg-muted rounded-xl" />

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="card p-5 space-y-4">
        <h4 className="font-semibold text-foreground">{editingId ? 'Editar usuário' : 'Novo usuário'}</h4>
        {error && <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input className="input" placeholder="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input className="input" type="email" placeholder="E-mail" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          <input className="input" type="password" placeholder={editingId ? 'Nova senha (opcional)' : 'Senha'} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required={!editingId} />
          <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="validator">Validador</option>
            <option value="supervisor">Supervisor</option>
            <option value="admin">Administrador</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button type="submit" className="btn-primary py-2 px-4 text-sm">
            {editingId ? 'Atualizar' : 'Criar'}
          </button>
          {editingId && (
            <button type="button" onClick={() => { setEditingId(null); setForm({ name: '', email: '', password: '', role: 'validator' }) }} className="btn-ghost py-2 px-4 text-sm">
              Cancelar
            </button>
          )}
        </div>
      </form>

      <div className="space-y-2">
        {users.map((u) => (
          <div key={u.id} className={`card p-4 flex items-center justify-between ${!u.active ? 'opacity-50' : ''}`}>
            <div>
              <p className="font-medium text-foreground">{u.name}</p>
              <p className="text-xs text-muted-foreground">{u.email} · {u.role}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleEdit(u)} className="btn-ghost py-1 px-2 text-xs">Editar</button>
              {u.active && (
                <button onClick={() => handleDelete(u.id)} className="btn-ghost py-1 px-2 text-xs text-red-600 dark:text-red-400">Desativar</button>
              )}
            </div>
          </div>
        ))}
        {users.length === 0 && <p className="text-muted-foreground text-sm text-center py-8">Nenhum usuário encontrado</p>}
      </div>
    </div>
  )
}
