import { useEffect, useState } from 'react'
import { Modal } from '../ui'
import api from '../../services/api'
import { toast } from 'sonner'

export function TerminalQRModal({ terminal, onClose }) {
  const [qrDataUrl, setQrDataUrl] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!terminal?.slug) return
    let mounted = true
    setLoading(true)
    api.get(`/api/terminal/${terminal.slug}/qr`)
      .then(({ data }) => { if (mounted) setQrDataUrl(data.qrcode) })
      .catch(() => toast.error('Erro ao gerar QR code'))
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [terminal?.slug])

  function handleDownload() {
    if (!qrDataUrl) return
    const link = document.createElement('a')
    link.download = `terminal-${terminal.slug}.png`
    link.href = qrDataUrl
    link.click()
  }

  async function handleCopyLink() {
    const url = `${window.location.origin}/terminal/join/${terminal.slug}`
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copiado!')
    } catch {
      toast.error('Não foi possível copiar o link.')
    }
  }

  return (
    <Modal open onClose={onClose} title={`QR Code - ${terminal?.name}`}>
      {loading ? (
        <div className="text-center py-4">Gerando QR code…</div>
      ) : qrDataUrl ? (
        <div className="text-center">
          <img
            src={qrDataUrl}
            alt="QR Code do Terminal"
            className="mx-auto rounded-lg"
            style={{ width: 280, height: 280, maxWidth: '100%' }}
          />
          <p className="text-sm text-muted mt-4 break-all px-4">
            {window.location.origin}/terminal/join/{terminal?.slug}
          </p>
          <div className="flex gap-3 justify-center mt-6">
            <button type="button" className="btn btn-primary" onClick={handleDownload}>
              Baixar PNG
            </button>
            <button type="button" className="btn btn-outline" onClick={handleCopyLink}>
              Copiar Link
            </button>
          </div>
        </div>
      ) : (
        <p className="text-muted text-sm text-center py-4">
          Não foi possível gerar o QR code.
        </p>
      )}
    </Modal>
  )
}

export default TerminalQRModal
