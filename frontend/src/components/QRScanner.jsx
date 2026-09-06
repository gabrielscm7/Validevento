import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

const REGION_ID = 'qr-reader-region'

/**
 * Scanner de QRCode (câmera traseira). Monta o html5-qrcode e chama onScan
 * quando um código é decodificado.
 */
export function QRScanner({ onScan, active = true }) {
  const scannerRef = useRef(null)
  const [error, setError] = useState(null)
  const [started, setStarted] = useState(false)
  const busyRef = useRef(false)

  useEffect(() => {
    if (!active) {
      try { scannerRef.current?.stop().catch(() => {}) } catch { /* ignore */ }
      return
    }

    let cancelled = false
    const scanner = new Html5Qrcode(REGION_ID)
    scannerRef.current = scanner

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 12, qrbox: (w, h) => ({ width: Math.min(260, w - 24), height: Math.min(260, h - 24) }), aspectRatio: 1 },
        (decodedText) => {
          if (busyRef.current) return
          busyRef.current = true
          if ('vibrate' in navigator) { try { navigator.vibrate(80) } catch { /* ignore */ } }
          onScan(decodedText)
          setTimeout(() => { busyRef.current = false }, 1800)
        },
        () => { /* ignora erros por frame */ }
      )
      .then(() => { if (!cancelled) setStarted(true) })
      .catch((err) => { if (!cancelled) setError(err?.message ?? String(err)) })

    return () => {
      cancelled = true
      try { scanner.stop().catch(() => {}) } catch { /* ignore */ }
    }
  }, [active, onScan])

  return (
    <div className="scan-stage">
      <div className="scan-frame">
        <div className="scan-line" />
        <div className="scan-corners tl" />
        <div id={REGION_ID} className="qr-video" />
      </div>

      {started && !error && (
        <p className="scan-hint">Posicione o QRCode dentro da área acima</p>
      )}
      {error && (
        <div className="scan-hint" style={{ color: '#fca5a5' }}>
          <p style={{ fontWeight: 600, color: '#fff' }}>Câmera indisponível</p>
          <p>{error}</p>
          <p>Use a busca manual abaixo.</p>
        </div>
      )}
    </div>
  )
}

export default QRScanner
