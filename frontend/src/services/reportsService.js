import api from './api'
import { slugifyEvent } from '../lib/format'

// Relatório MD (texto) — GET /api/events/:id/reports/md
export async function getReportMarkdown(eventId) {
  const { data } = await api.get(`/api/events/${eventId}/reports/md`, {
    responseType: 'text',
  })
  return typeof data === 'string' ? data : data?.text || String(data)
}

// Baixa o CSV (blob) — GET /api/events/:id/reports/csv
export async function downloadReportCsv(event, filename) {
  const res = await api.get(`/api/events/${event.id}/reports/csv`, {
    responseType: 'blob',
  })
  const url = window.URL.createObjectURL(new Blob([res.data]))
  const a = document.createElement('a')
  const dateStr = new Date(event.date).toISOString().slice(0, 10)
  a.href = url
  a.download = filename || `log-${slugifyEvent(event.name)}-${dateStr}.csv`
  a.click()
  window.URL.revokeObjectURL(url)
}

// Baixa o relatório MD como arquivo — GET /api/events/:id/reports/md
export async function downloadReportMarkdown(event) {
  const res = await api.get(`/api/events/${event.id}/reports/md`, {
    responseType: 'blob',
  })
  const url = window.URL.createObjectURL(new Blob([res.data]))
  const a = document.createElement('a')
  const dateStr = new Date(event.date).toISOString().slice(0, 10)
  a.href = url
  a.download = `relatorio-${slugifyEvent(event.name)}-${dateStr}.md`
  a.click()
  window.URL.revokeObjectURL(url)
}

// Auditoria — GET /api/events/:id/reports/audit?limit=
export async function getAuditLog(eventId, limit = 50) {
  const { data } = await api.get(`/api/events/${eventId}/reports/audit`, {
    params: { limit },
  })
  return data
}
