import { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import TopBar from '../../components/TopBar'
import { PageLoader, ErrorNotice } from '../../components/feedback'
import { Btn, Modal } from '../../components/ui'
import { getConfig, updateConfig } from '../../services/eventsActionsService'
import { getEvent } from '../../services/eventsService'
import { getMasterTicket, createMasterTicket, deactivateMasterTicket } from '../../services/eventsActionsService'

const DESCRIPTIONS = {
  qrcode: {
    ticket_code: 'O QRCode contém o código único do ingresso (UUID). Padrão recomendado.',
    cpf: 'O QRCode contém o CPF do participante. Use apenas se os ingressos emitidos usarem CPF no QR.',
    custom_hash: 'O QRCode contém um hash próprio do seu sistema de emissão.',
  },
  reentry: {
    none: 'Um ingresso só pode entrar uma vez. Segunda leitura é bloqueada (duplicata).',
    free: 'Segundo check-in é sempre permitido, mesmo sem checkout. Uso para fluxo contínuo.',
    conditioned: 'Só há reentrada após um checkout registrado. É o padrão de casa de shows.',
  },
  duplicate: {
    warn: 'Apenas avisa o validador que o ingresso já entrou, sem bloquear a operação.',
    block: 'Bloqueia a entrada e informa o validador que o ingresso é duplicado.',
  },
}

export default function EventConfig() {
  const { id } = useParams()
  const [event, setEvent] = useState(null)
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const [masterOpen, setMasterOpen] = useState(false)
  const [masterMax, setMasterMax] = useState('')
  const [masterTicket, setMasterTicket] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [ev, cfg] = await Promise.all([getEvent(id), getConfig(id)])
      setEvent(ev)
      setConfig(cfg)
      const mt = await getMasterTicket(id).catch(() => null)
      setMasterTicket(mt)
    } catch (e) {
      setError(e?.response?.data?.error || 'Erro ao carregar configuração.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  function setField(key, value) {
    setConfig((c) => ({ ...c, [key]: value }))
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const updated = await updateConfig(id, config)
      setConfig(updated)
    } catch (e) {
      setError(e?.response?.data?.details || e?.response?.data?.error || 'Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  async function handleMasterSave() {
    setSaving(true)
    setError('')
    try {
      const mt = await createMasterTicket(id, masterMax === '' ? null : Number(masterMax))
      setMasterTicket(mt)
      setMasterOpen(false)
    } catch (e) {
      setError(e?.response?.data?.details || e?.response?.data?.error || 'Erro ao configurar ingresso master.')
    } finally {
      setSaving(false)
    }
  }

  async function handleMasterDeactivate() {
    if (!window.confirm('Desativar o ingresso master? Usos futuros serão bloqueados.')) return
    setSaving(true)
    try {
      const mt = await deactivateMasterTicket(id)
      setMasterTicket(mt)
    } catch (e) {
      setError(e?.response?.data?.error || 'Erro ao desativar.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (<div className="page"><TopBar /><PageLoader /></div>)

  return (
    <div className="page">
      <TopBar crumb={`Admin · ${event?.name}`} eventName={event?.name} />
      <div className="page-body narrow">
        <section className="hero">
          <div>
            <Link to={`/admin/eventos/${id}`} className="btn-text">← Evento</Link>
            <p className="hero-eyebrow mt-2">Configuração</p>
            <h1 className="hero-title">Configurações do evento</h1>
            <p className="hero-sub">Validação, check-in e relatórios.</p>
          </div>
        </section>

        {error && <ErrorNotice>{error}</ErrorNotice>}

        <div className="card card-pad mb-4">
          <div className="tabs" style={{ borderBottom: '1px solid var(--border)' }}>
            <span className="tab active">Validação</span>
          </div>

          <div className="field mt-3">
            <label className="label">Campo do QRCode</label>
            <select className="select" value={config?.qrcode_field || 'ticket_code'}
              onChange={(e) => setField('qrcode_field', e.target.value)}>
              <option value="ticket_code">Código do ingresso (ticket_code)</option>
              <option value="cpf">CPF</option>
              <option value="custom_hash">Hash customizado</option>
            </select>
            <span className="hint">{DESCRIPTIONS.qrcode[config?.qrcode_field] || ''}</span>
          </div>

          <div className="field">
            <label className="label">Campos para busca manual</label>
            {[
              ['display_name', 'Nome (display_name)'],
              ['cpf', 'CPF'],
              ['ticket_code', 'Código do ingresso'],
            ].map(([k, l]) => (
              <label key={k} className="check-row">
                <input
                  type="checkbox"
                  checked={(config?.manual_fields || []).includes(k)}
                  onChange={(e) => {
                    const current = config?.manual_fields || []
                    const next = e.target.checked
                      ? [...current, k]
                      : current.filter((f) => f !== k)
                    setField('manual_fields', next)
                  }}
                />
                <span className="check-label">{l}</span>
              </label>
            ))}
          </div>

          <div className="field">
            <label className="label">Modo de reentrada</label>
            <label className={`radio-option ${(config?.reentry_mode || 'none') === 'none' ? 'selected' : ''}`} style={{ marginBottom: 8 }}>
              <input type="radio" name="reentry" checked={(config?.reentry_mode || 'none') === 'none'}
                onChange={() => setField('reentry_mode', 'none')} />
              <span className="radio-body">
                <span className="radio-label">Sem reentrada</span>
                <span className="radio-desc">{DESCRIPTIONS.reentry.none}</span>
              </span>
            </label>
            <label className={`radio-option ${config?.reentry_mode === 'free' ? 'selected' : ''}`} style={{ marginBottom: 8 }}>
              <input type="radio" name="reentry" checked={config?.reentry_mode === 'free'}
                onChange={() => setField('reentry_mode', 'free')} />
              <span className="radio-body">
                <span className="radio-label">Reentrada livre</span>
                <span className="radio-desc">{DESCRIPTIONS.reentry.free}</span>
              </span>
            </label>
            <label className={`radio-option ${config?.reentry_mode === 'conditioned' ? 'selected' : ''}`}>
              <input type="radio" name="reentry" checked={config?.reentry_mode === 'conditioned'}
                onChange={() => setField('reentry_mode', 'conditioned')} />
              <span className="radio-body">
                <span className="radio-label">Reentrada condicionada</span>
                <span className="radio-desc">{DESCRIPTIONS.reentry.conditioned}</span>
              </span>
            </label>
          </div>

          <div className="field">
            <label className="label">Ação em duplicata</label>
            {['warn', 'block'].map((v) => (
              <label key={v} className={`radio-option ${config?.duplicate_action === v ? 'selected' : ''}`}>
                <input type="radio" name="dup" checked={config?.duplicate_action === v}
                  onChange={() => setField('duplicate_action', v)} />
                <span className="radio-body">
                  <span className="radio-label">{v === 'warn' ? 'Apenas avisar' : 'Bloquear entrada'}</span>
                  <span className="radio-desc">{DESCRIPTIONS.duplicate[v]}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Check-in */}
        <div className="card card-pad mb-4">
          <h2 className="card-title mb-2">Check-in</h2>

          <div className="switch-row">
            <div className="switch-info">
              <p className="switch-title">Habilitar checkout</p>
              <p className="switch-desc">Permite registrar a saída do participante.</p>
            </div>
            <label className="switch">
              <input type="checkbox" checked={!!config?.checkout_enabled}
                onChange={(e) => setField('checkout_enabled', e.target.checked)} />
              <span className="track" />
            </label>
          </div>

          <div className="switch-row">
            <div className="switch-info">
              <p className="switch-title">Ingresso master habilitado</p>
              <p className="switch-desc">Disponibiliza o botão "Ingresso master" no terminal.</p>
            </div>
            <label className="switch">
              <input type="checkbox" checked={!!config?.master_ticket_enabled}
                onChange={(e) => setField('master_ticket_enabled', e.target.checked)} />
              <span className="track" />
            </label>
          </div>

          <div className="field mt-3">
            <label className="label">Velocidade alvo de validação (segundos)</label>
            <input type="range" min={1} max={30} value={config?.validation_speed_target_sec ?? 5}
              onChange={(e) => setField('validation_speed_target_sec', Number(e.target.value))} />
            <span className="hint">Meta: {config?.validation_speed_target_sec ?? 5}s por validação.</span>
          </div>

          <div className="switch-row">
            <div className="switch-info">
              <p className="switch-title">Rastreamento de portões</p>
              <p className="switch-desc">Registra abertura/fechamento de portões no relatório.</p>
            </div>
            <label className="switch">
              <input type="checkbox" checked={config?.gate_tracking_enabled !== false}
                onChange={(e) => setField('gate_tracking_enabled', e.target.checked)} />
              <span className="track" />
            </label>
          </div>

          {/* Master ticket */}
          <div className="mt-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="switch-title" style={{ fontSize: 14, fontWeight: 500 }}>Ingresso master</p>
                {masterTicket?.active ? (
                  <p className="switch-desc">
                    {masterTicket.max_uses === null
                      ? 'Sem limite de usos'
                      : `Limite de ${masterTicket.max_uses} usos`}{' '}
                    · {masterTicket.uses_count || 0} usos realizados
                  </p>
                ) : (
                  <p className="switch-desc">Nenhum ingresso master ativo. {config?.master_ticket_enabled ? 'Configure o limite de usos.' : 'Habilite o ingresso master acima para configurar.'}</p>
                )}
              </div>
              <div className="flex gap-2">
                {masterTicket?.active ? (
                  <Btn variant="ghost" className="btn-sm" style={{ color: 'var(--danger)' }} onClick={handleMasterDeactivate} loading={saving}>
                    Desativar
                  </Btn>
                ) : (
                  <Btn variant="outline" className="btn-sm" onClick={() => { setMasterMax(masterTicket?.max_uses ?? ''); setMasterOpen(true) }}
                    disabled={!config?.master_ticket_enabled}>
                    Configurar
                  </Btn>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Relatórios */}
        <div className="card card-pad mb-4">
          <h2 className="card-title mb-2">Relatórios</h2>
          <div className="field">
            <label className="label">Formatos de exportação</label>
            {['md', 'csv', 'json'].map((f) => (
              <label key={f} className="check-row">
                <input
                  type="checkbox"
                  checked={(config?.export_formats || []).includes(f)}
                  onChange={(e) => {
                    const current = config?.export_formats || []
                    const next = e.target.checked ? [...current, f] : current.filter((x) => x !== f)
                    setField('export_formats', next)
                  }}
                />
                <span className="check-label">{f === 'md' ? 'Markdown' : f === 'csv' ? 'CSV' : 'JSON'}</span>
              </label>
            ))}
            <span className="hint">
              Arquivo gerado: <span className="mono">relatorio-{event?.name ? event.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') : 'evento'}-AAAA-MM-DD.{config?.export_formats?.includes('md') ? 'md' : 'csv'}</span>
            </span>
          </div>
        </div>

        <div className="action-bar flex justify-end gap-2">
          <Btn variant="ghost" onClick={() => window.history.back()}>Cancelar</Btn>
          <Btn variant="primary" size="lg" loading={saving} onClick={handleSave}>Salvar configurações</Btn>
        </div>
      </div>

      <Modal open={masterOpen} onClose={() => setMasterOpen(false)}
        title="Configurar ingresso master"
        footer={
          <>
            <Btn variant="ghost" onClick={() => setMasterOpen(false)}>Cancelar</Btn>
            <Btn variant="primary" loading={saving} onClick={handleMasterSave}>Salvar</Btn>
          </>
        }>
        <div className="field">
          <label className="label">Limite de usos</label>
          <input type="number" min={1} className="input" placeholder="Vazio = ilimitado" value={masterMax}
            onChange={(e) => setMasterMax(e.target.value)} />
          <span className="hint">Deixe vazio para uso ilimitado.</span>
        </div>
        {!config?.master_ticket_enabled && (
          <p className="text-xs text-muted">Dica: habilite o "Ingresso master" na seção Check-in para liberar o uso.</p>
        )}
      </Modal>
    </div>
  )
}
