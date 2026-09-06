import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getDashboardSummary, getDashboardFlow, getDashboardBatches,
  getDashboardAlerts, getDashboardTerminals, getDashboardLiveFeed, getDashboardSpeed,
} from '../services/dashboardService'

/**
 * Busca todos os painéis do dashboard com polling a cada 30s.
 * Retorna { data, loading, error, reload }.
 */
export function useDashboardData(eventId) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const mounted = useRef(true)

  const reload = useCallback(async () => {
    if (!eventId) return
    try {
      const [summary, flow, batches, alerts, terminals, liveFeed, speed] = await Promise.all([
        getDashboardSummary(eventId),
        getDashboardFlow(eventId),
        getDashboardBatches(eventId),
        getDashboardAlerts(eventId),
        getDashboardTerminals(eventId),
        getDashboardLiveFeed(eventId),
        getDashboardSpeed(eventId),
      ])
      if (!mounted.current) return
      setData({ summary, flow, batches, alerts, terminals, liveFeed, speed })
      setError(null)
    } catch (e) {
      if (!mounted.current) return
      setError(e?.response?.data?.error || 'Erro ao carregar dashboard.')
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [eventId])

  useEffect(() => {
    mounted.current = true
    setLoading(true)
    reload()
    const interval = setInterval(reload, 30000)
    return () => {
      mounted.current = false
      clearInterval(interval)
    }
  }, [reload])

  return { data, loading, error, reload }
}
