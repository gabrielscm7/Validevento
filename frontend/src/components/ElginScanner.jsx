import { useEffect, useRef } from 'react'

export function ElginScanner({ onScan, active = true }) {
  const bufferRef = useRef('')
  const lastKeyTime = useRef(0)
  const timeoutRef = useRef(null)

  useEffect(() => {
    if (!active) return

    function handleKeyDown(e) {
      if (e.key === 'Enter') {
        const code = bufferRef.current.trim()
        if (code.length > 3) {
          if ('vibrate' in navigator) navigator.vibrate(50)
          try { onScan(code) } catch { /* onScan error */ }
        }
        bufferRef.current = ''
        clearTimeout(timeoutRef.current)
        return
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const now = Date.now()
        if (now - lastKeyTime.current > 100) bufferRef.current = ''
        lastKeyTime.current = now
        bufferRef.current += e.key

        clearTimeout(timeoutRef.current)
        timeoutRef.current = setTimeout(() => {
          bufferRef.current = ''
        }, 200)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      clearTimeout(timeoutRef.current)
    }
  }, [active]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="w-full flex flex-col items-center gap-3 py-8">
      <div className="w-20 h-20 rounded-2xl bg-brand-600/20 border border-brand-500/30 flex items-center justify-center">
        <span className="text-4xl">📟</span>
      </div>
      <p className="text-foreground font-medium">Leitor USB (Elgin EL250)</p>
      <p className="text-muted-foreground text-sm text-center max-w-xs">
        Aponte o leitor para o código de barras ou QRCode.
        O scanner está aguardando leitura…
      </p>
    </div>
  )
}
