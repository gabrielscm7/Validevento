import { useState, useEffect, useCallback } from 'react'
import api from '../../services/api'
import { Input } from '../ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table'
import { Badge } from '../ui/badge'

const STATUS_OPTIONS = [
  { value: '', label: 'Todos os status' },
  { value: 'active', label: 'Ativos' },
  { value: 'validated', label: 'Validados' },
  { value: 'blocked', label: 'Bloqueados' },
]

const STATUS_BADGE = {
  active: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
  validated: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  blocked: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300',
}

const STATUS_LABEL = {
  active: 'Ativo',
  validated: 'Validado',
  blocked: 'Bloqueado',
}

export default function TicketsTab({ eventId }) {
  const [tickets, setTickets] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [batchFilter, setBatchFilter] = useState('')
  const [batchOptions, setBatchOptions] = useState([])
  const [error, setError] = useState('')
  const [cancelDialog, setCancelDialog] = useState({ open: false, ticket: null })
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    if (!eventId) return
    api.get('/api/dashboard/batches', { params: { event_id: eventId } })
      .then(({ data }) => setBatchOptions(data))
      .catch(() => {})
  }, [eventId])

  const fetchTickets = useCallback(async (p = page) => {
    if (!eventId) return
    setLoading(true)
    setError('')
    try {
      const params = { event_id: eventId, page: p, limit: 30 }
      if (search) params.search = search
      if (statusFilter) params.status = statusFilter
      if (batchFilter) params.batch = batchFilter
      const { data } = await api.get('/api/dashboard/tickets', { params })
      setTickets(data.tickets)
      setTotal(data.total)
      setPage(data.page)
      setTotalPages(data.totalPages)
    } catch (e) {
      setError(e.response?.data?.error ?? 'Erro ao carregar ingressos')
    } finally {
      setLoading(false)
    }
  }, [eventId, search, statusFilter, batchFilter, page])

  useEffect(() => {
    if (!eventId) return
    let mounted = true
    ;(async () => {
      if (!mounted) return
      await fetchTickets(1)
    })()
    return () => { mounted = false }
  }, [eventId]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleSearch() {
    setPage(1)
    fetchTickets(1)
  }

  function handleStatusChange(value) {
    setStatusFilter(value)
    setPage(1)
  }

  function handleBatchChange(value) {
    setBatchFilter(value)
    setPage(1)
  }

  function goToPage(p) {
    if (p < 1 || p > totalPages) return
    fetchTickets(p)
  }

  async function handleCancelTicket() {
    const ticket = cancelDialog.ticket
    if (!ticket) return
    setCancelling(true)
    try {
      await api.post('/api/admin/cancel-tickets', {
        event_id: eventId,
        ticket_codes: [ticket.ticket_code],
      })
      setCancelDialog({ open: false, ticket: null })
      fetchTickets(page)
    } catch (e) {
      setError(e.response?.data?.error ?? 'Erro ao cancelar ingresso')
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div className="card p-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-5">
        <h3 className="text-sm font-semibold text-foreground">
          Ingressos <span className="text-muted-foreground font-normal">({total} total)</span>
        </h3>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <Input
            placeholder="Buscar por código ou nome…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="w-full sm:w-56 h-9 text-xs"
          />
          <Select value={statusFilter} onValueChange={handleStatusChange}>
            <SelectTrigger className="w-[140px] h-9 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={batchFilter} onValueChange={handleBatchChange}>
            <SelectTrigger className="w-[140px] h-9 text-xs">
              <SelectValue placeholder="Lote" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Todos os lotes</SelectItem>
              {batchOptions.map((b) => (
                <SelectItem key={b.batch} value={b.batch}>{b.batch}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl px-4 py-2 text-sm text-red-600 dark:text-red-300 mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="animate-pulse space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-10 bg-muted rounded" />
          ))}
        </div>
      ) : tickets.length === 0 ? (
        <p className="text-muted-foreground text-sm text-center py-8">Nenhum ingresso encontrado</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Lote</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Validação</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-xs">{t.ticket_code}</TableCell>
                    <TableCell className="text-sm">{t.display_name || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{t.batch}</TableCell>
                    <TableCell>
                      <Badge className={`text-[10px] font-medium ${STATUS_BADGE[t.status] || 'bg-muted text-muted-foreground'}`}>
                        {STATUS_LABEL[t.status] || t.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {t.validated_at ? new Date(t.validated_at).toLocaleString('pt-BR') : <span className="text-muted-foreground/50">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      {t.status !== 'validated' && t.status !== 'blocked' && (
                        <button
                          onClick={() => setCancelDialog({ open: true, ticket: t })}
                          className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors"
                        >
                          Cancelar
                        </button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-xs text-muted-foreground">
                Página {page} de {totalPages}
              </p>
              <div className="flex gap-1">
                <button
                  onClick={() => goToPage(page - 1)}
                  disabled={page <= 1}
                  className="btn-ghost py-1 px-2 text-xs disabled:opacity-30"
                >
                  ‹ Anterior
                </button>
                <button
                  onClick={() => goToPage(page + 1)}
                  disabled={page >= totalPages}
                  className="btn-ghost py-1 px-2 text-xs disabled:opacity-30"
                >
                  Próximo ›
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <Dialog open={cancelDialog.open} onOpenChange={(open) => setCancelDialog({ open, ticket: cancelDialog.ticket })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar ingresso</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja cancelar o ingresso <strong>{cancelDialog.ticket?.ticket_code}</strong>?
              {cancelDialog.ticket?.display_name && (
                <> (<span className="text-foreground">{cancelDialog.ticket.display_name}</span>)</>
              )}
              <br /><br />
              Ingressos validados não podem ser cancelados. Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={() => setCancelDialog({ open: false, ticket: null })}
              className="btn-ghost py-2 px-4 text-sm"
              disabled={cancelling}
            >
              Voltar
            </button>
            <button
              onClick={handleCancelTicket}
              disabled={cancelling}
              className="btn-danger py-2 px-4 text-sm"
            >
              {cancelling ? 'Cancelando…' : 'Sim, cancelar'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
