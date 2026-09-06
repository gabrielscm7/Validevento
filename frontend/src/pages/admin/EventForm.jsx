import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import TopBar from '../../components/TopBar'
import { PageLoader, ErrorNotice } from '../../components/feedback'
import Btn from '../../components/ui'
import { getEvent, createEvent, updateEvent } from '../../services/eventsService'

const EMPTY = {
  name: '',
  date: '',
  time: '',
  location: '',
  capacity: 3000,
  responsible: [],
  responsibleInput: '',
  banner_url: '',
  logo_url: '',
}

function toLocalInput(iso) {
  if (!iso) return { date: '', time: '' }
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  }
}

export default function EventForm() {
  const { id } = useParams()
  const isEdit = !!id
  const [form, setForm] = useState(EMPTY)
  const [loading, setLoading] = useState(isEdit)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (!isEdit) return
    let mounted = true
    getEvent(id)
      .then((data) => {
        if (!mounted) return
        const dt = toLocalInput(data.date || data.expected_start)
        setForm({
          name: data.name || '',
          date: dt.date || '',
          time: dt.time || '',
          location: data.location || '',
          capacity: data.capacity ?? 3000,
          responsible: data.responsible || [],
          responsibleInput: '',
          banner_url: data.banner_url || '',
          logo_url: data.logo_url || '',
        })
      })
      .catch((e) => setError(e?.response?.data?.error || 'Erro ao carregar evento.'))
      .finally(() => mounted && setLoading(false))
    return () => { mounted = false }
  }, [id, isEdit])

  const addResponsible = () => {
    const v = form.responsibleInput.trim()
    if (!v) return
    if (!form.responsible.includes(v)) {
      setForm({ ...form, responsible: [...form.responsible, v], responsibleInput: '' })
    } else {
      setForm({ ...form, responsibleInput: '' })
    }
  }

  const removeResponsible = (name) =>
    setForm({ ...form, responsible: form.responsible.filter((r) => r !== name) })

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const dateIso = form.date
        ? new Date(`${form.date}T${form.time || '00:00'}:00-03:00`).toISOString()
        : null
      const payload = {
        name: form.name,
        date: dateIso,
        location: form.location || null,
        capacity: Number(form.capacity),
        responsible: form.responsible,
      }
      // banner_url/logo_url ainda não são persistidos pelo backend v2 (pendência
      // documentada). Mantemos no formulário para quando o backend suportar.
      if (form.banner_url) payload.banner_url = form.banner_url
      if (form.logo_url) payload.logo_url = form.logo_url

      if (isEdit) {
        await updateEvent(id, payload)
        navigate(`/admin/eventos/${id}`)
      } else {
        const created = await createEvent(payload)
        navigate(`/admin/eventos/${created.id}`, { replace: true })
      }
    } catch (e) {
      setError(e?.response?.data?.details || e?.response?.data?.error || 'Erro ao salvar evento.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (<div className="page"><TopBar /><PageLoader /></div>)

  return (
    <div className="page">
      <TopBar crumb={`Admin · ${isEdit ? 'Editar' : 'Novo'} evento`} />
      <div className="page-body narrow">
        <section className="hero">
          <div>
            <p className="hero-eyebrow">Evento</p>
            <h1 className="hero-title">{isEdit ? 'Editar evento' : 'Novo evento'}</h1>
            <p className="hero-sub">Preencha os dados básicos. As configurações avançadas ficam na tela de Configurar.</p>
          </div>
        </section>

        {error && <ErrorNotice>{error}</ErrorNotice>}

        <form onSubmit={handleSave} className="card card-pad">
          <div className="field">
            <label className="label">Nome do evento *</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>

          <div className="grid grid-cols-2">
            <div className="field">
              <label className="label">Data</label>
              <input type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="field">
              <label className="label">Horário previsto de início</label>
              <input type="time" className="input" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-2">
            <div className="field">
              <label className="label">Local</label>
              <input className="input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Endereço ou descrição" />
            </div>
            <div className="field">
              <label className="label">Capacidade máxima</label>
              <input type="number" min={1} className="input" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
            </div>
          </div>

          <div className="field">
            <label className="label">Responsáveis</label>
            <div className="tag-input">
              {form.responsible.map((r) => (
                <span key={r} className="tag">
                  {r}
                  <button type="button" onClick={() => removeResponsible(r)} aria-label={`Remover ${r}`}>×</button>
                </span>
              ))}
              <input
                value={form.responsibleInput}
                onChange={(e) => setForm({ ...form, responsibleInput: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault()
                    addResponsible()
                  }
                }}
                onBlur={addResponsible}
                placeholder="Digite um nome e pressione Enter"
              />
            </div>
          </div>

          <div className="grid grid-cols-2">
            <div className="field">
              <label className="label">URL do logo do evento (opcional)</label>
              <input className="input" value={form.logo_url} onChange={(e) => setForm({ ...form, logo_url: e.target.value })} placeholder="https://…" />
              <span className="hint">Usado nas telas de supervisores e validadores quando definido.</span>
            </div>
            <div className="field">
              <label className="label">URL do banner do evento (opcional)</label>
              <input className="input" value={form.banner_url} onChange={(e) => setForm({ ...form, banner_url: e.target.value })} placeholder="https://…" />
            </div>
          </div>

          <div className="flex gap-2 mt-2">
            <Btn type="submit" variant="primary" size="lg" loading={saving} disabled={!form.name}>
              {isEdit ? 'Salvar alterações' : 'Criar evento'}
            </Btn>
            <Btn type="button" variant="ghost" size="lg" onClick={() => navigate(isEdit ? `/admin/eventos/${id}` : '/admin/eventos')}>
              Cancelar
            </Btn>
          </div>
        </form>
      </div>
    </div>
  )
}
