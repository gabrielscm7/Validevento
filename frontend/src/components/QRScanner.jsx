import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

const REGION_ID = 'qr-reader-region'

export function QRScanner({ onScan, active = true }) {
  const scannerRef = useRef(null)
  const [error, setError] = useState(null)
  const [started, setStarted] = useState(false)

  useEffect(() => {
    if (!active) {
      try { scannerRef.current?.stop().catch(() => { /* scanner ja parou */ }) } catch { /* ignore */ }
      return
    }

    let cancelled = false
    const scanner = new Html5Qrcode(REGION_ID)
    scannerRef.current = scanner

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 12, qrbox: { width: 260, height: 260 }, aspectRatio: 1 },
        (decodedText) => {
          if ('vibrate' in navigator) navigator.vibrate(80)
          try { onScan(decodedText) } catch { /* onScan error */ }
        },
        () => { /* ignore erros por frame */ }
      )
      .then(() => { if (!cancelled) setStarted(true) })
      .catch((err) => { if (!cancelled) setError(err?.message ?? String(err)) })

    return () => {
      cancelled = true
      try { scanner.stop().catch(() => { /* scanner ja parou */ }) } catch { /* ignore */ }
    }
  }, [active]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative w-full flex flex-col items-center gap-3">
      <div
        id={REGION_ID}
        className="w-full max-w-xs rounded-2xl overflow-hidden bg-card border border-border"
        style={{ aspectRatio: '1 / 1' }}
      />
      {started && (
        <p className="text-muted-foreground text-sm text-center">
          Posicione o QRCode dentro da área acima
        </p>
      )}
      {error && (
        <div className="text-red-600 dark:text-red-400 text-sm text-center px-4">
          <p className="font-semibold">Câmera indisponível</p>
          <p className="text-xs opacity-70">{error}</p>
          <p className="text-xs mt-1 opacity-60">Use a busca manual abaixo</p>
        </div>
      )}
    </div>
  )
}
