import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getDashboardSummary, getDashboardFlow, getDashboardBatches,
  getDashboardGates, getDashboardAlerts, getDashboardTerminals,
  getDashboardTerminalsDetailed, getDashboardLiveFeed, getDashboardSpeed,
} from '../services/dashboardService'

/**
 * Busca todos os painéis do dashboard com polling a cada 30s.
 * Retorna { data, loading, error, reload }.
 *
 * includeDetailed: busca (apenas admin/master) as métricas detalhadas por
 * terminal; o endpoint exige essas roles, por isso é opcional.
 */
export function useDashboardData(eventId, { includeDetailed = false } = {}) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const mounted = useRef(true)

  const reload = useCallback(async () => {
    if (!eventId) return
    try {
      const [summary, flow, batches, gates, alerts, terminals, liveFeed, speed] = await Promise.all([
        getDashboardSummary(eventId),
        getDashboardFlow(eventId),
        getDashboardBatches(eventId),
        getDashboardGates(eventId),
        getDashboardAlerts(eventId),
        getDashboardTerminals(eventId),
        getDashboardLiveFeed(eventId),
        getDashboardSpeed(eventId),
      ])
      let terminalsDetailed = null
      if (includeDetailed) {
        try {
          terminalsDetailed = await getDashboardTerminalsDetailed(eventId)
        } catch {
          terminalsDetailed = []
        }
      }
      if (!mounted.current) return
      setData({ summary, flow, batches, gates, alerts, terminals, liveFeed, speed, terminalsDetailed })
      setError(null)
    } catch (e) {
      if (!mounted.current) return
      setError(e?.response?.data?.error || 'Erro ao carregar dashboard.')
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [eventId, includeDetailed])

  useEffect(() => {
    mounted.current = true
    if (!eventId) {
      setLoading(false)
      setData(null)
      return () => { mounted.current = false }
    }
    setLoading(true)
    reload()
    const interval = setInterval(reload, 30000)
    return () => {
      mounted.current = false
      clearInterval(interval)
    }
  }, [reload, eventId])

  return { data, loading, error, reload }
}
