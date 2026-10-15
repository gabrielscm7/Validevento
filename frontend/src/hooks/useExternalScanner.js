import { useCallback, useEffect, useRef, useState } from 'react'

// Um scanner USB (HID) digita o código muito rápido e envia Enter no fim.
// Consideramos "scan" quando o intervalo médio entre teclas é baixo e o
// buffer tem tamanho mínimo de código.
const MAX_GAP_MS = 120 // intervalo máximo entre teclas do scanner
const MIN_SCAN_LENGTH = 8
const MAX_MS_PER_CHAR = 35 // digitação humana é bem mais lenta que isso
const RESET_IDLE_MS = 300

/**
 * Detecta entrada de scanner USB (emulação de teclado) escutando keydown no
 * window. Digitação humana lenta não dispara a validação.
 */
export function useExternalScanner({ onScan, enabled = true }) {
  const bufferRef = useRef('')
  const firstKeyAtRef = useRef(0)
  const lastKeyAtRef = useRef(0)
  const resetTimerRef = useRef(null)
  const [isScannerInput, setIsScannerInput] = useState(false)

  const reset = useCallback(() => {
    bufferRef.current = ''
    firstKeyAtRef.current = 0
    lastKeyAtRef.current = 0
  }, [])

  const handleKeyDown = useCallback((e) => {
    const target = e.target
    const editable = target && (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable === true
    )
    // Ignora digitação em campos comuns (busca, nome do operador etc.),
    // exceto o input oculto dedicado ao scanner.
    if (editable && target.dataset?.scannerInput !== 'true') return

    const now = Date.now()
    if (lastKeyAtRef.current && now - lastKeyAtRef.current > MAX_GAP_MS) {
      reset()
    }

    if (e.key === 'Enter') {
      const text = bufferRef.current.trim()
      const count = bufferRef.current.length
      const elapsed = firstKeyAtRef.current ? now - firstKeyAtRef.current : 0
      const fast = count > 0 && elapsed / count <= MAX_MS_PER_CHAR
      reset()
      if (text.length >= MIN_SCAN_LENGTH && fast) {
        onScan?.(text)
      }
      return
    }

    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (!firstKeyAtRef.current) firstKeyAtRef.current = now
      lastKeyAtRef.current = now
      bufferRef.current += e.key
      setIsScannerInput(true)
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
      resetTimerRef.current = setTimeout(() => {
        reset()
        setIsScannerInput(false)
      }, RESET_IDLE_MS)
    }
  }, [onScan, reset])

  useEffect(() => {
    if (!enabled) {
      reset()
      setIsScannerInput(false)
      return undefined
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
    }
  }, [enabled, handleKeyDown, reset])

  return { isScannerInput, reset }
}

export default useExternalScanner
