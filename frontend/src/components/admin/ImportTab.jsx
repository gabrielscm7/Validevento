import { useState, useRef, useCallback } from 'react'
import { Upload, FileText, CheckCircle, AlertCircle, X, File } from 'lucide-react'
import api from '../../services/api'

const ALLOWED_TYPES = ['.csv', '.json', '.xml', '.xlsx']
const ALLOWED_MIME = [
  'text/csv',
  'application/json',
  'text/xml',
  'application/xml',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function ImportTab({ eventId }) {
  const [file, setFile] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [loading, setLoading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  const isValidFile = useCallback((f) => {
    const ext = '.' + f.name.split('.').pop().toLowerCase()
    return ALLOWED_TYPES.includes(ext) || ALLOWED_MIME.includes(f.type)
  }, [])

  const handleFile = useCallback((f) => {
    setError('')
    setResult(null)
    if (!f) return
    if (!isValidFile(f)) {
      setError(`Formato não suportado: ${f.name}. Use CSV, JSON, XML ou XLSX.`)
      return
    }
    setFile(f)
  }, [isValidFile])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    handleFile(f)
  }, [handleFile])

  const handleDragOver = (e) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    setDragOver(false)
  }

  const handleRemove = () => {
    setFile(null)
    setResult(null)
    setError('')
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleSubmit = async () => {
    if (!file || !eventId) return
    setError('')
    setResult(null)
    setLoading(true)
    setUploadProgress(0)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('event_id', eventId)

    try {
      const { data } = await api.post('/api/import/csv', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (e.total) setUploadProgress(Math.round((e.loaded / e.total) * 100))
        },
      })
      setResult(data)
      setFile(null)
      setUploadProgress(100)
      if (inputRef.current) inputRef.current.value = ''
    } catch (err) {
      setError(err.response?.data?.error ?? 'Erro ao importar arquivo')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => { e.preventDefault(); handleSubmit() }}
        className="card p-5 space-y-4"
      >
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-semibold text-foreground">Importar base de ingressos</h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              Formatos aceitos: CSV, JSON, XML, XLSX (máx. 10 MB)
            </p>
          </div>
          <span className="text-[10px] text-muted-foreground bg-muted px-2 py-1 rounded-full">
            Campos: ticket_code, batch, hash_cpf, display_name, status
          </span>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl px-3 py-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Área de Drag & Drop */}
        {!file ? (
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => inputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200 ${
              dragOver
                ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10 scale-[1.01]'
                : 'border-border hover:border-muted-foreground/40 hover:bg-secondary/50'
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept={ALLOWED_TYPES.join(',')}
              onChange={(e) => handleFile(e.target.files[0])}
              className="hidden"
            />

            <Upload className={`w-10 h-10 mx-auto mb-3 transition-colors ${
              dragOver ? 'text-brand-500' : 'text-muted-foreground/60'
            }`} />
            <p className="text-sm font-medium text-foreground mb-1">
              {dragOver ? 'Solte o arquivo aqui' : 'Arraste o arquivo ou clique para selecionar'}
            </p>
            <p className="text-xs text-muted-foreground">
              CSV, JSON, XML, XLSX
            </p>
          </div>
        ) : (
          /* Arquivo selecionado */
          <div className="flex items-center gap-4 p-4 rounded-2xl bg-secondary/60 border border-border">
            <div className="w-12 h-12 rounded-xl bg-brand-100 dark:bg-brand-500/20 flex items-center justify-center flex-shrink-0">
              <FileText className="w-6 h-6 text-brand-600 dark:text-brand-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
              <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
            </div>
            <button
              type="button"
              onClick={handleRemove}
              className="btn-ghost btn-icon"
              disabled={loading}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Barra de progresso */}
        {loading && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{uploadProgress < 100 ? 'Enviando...' : 'Processando...'}</span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  uploadProgress >= 100 ? 'bg-emerald-500' : 'bg-brand-500'
                }`}
                style={{ width: `${Math.max(uploadProgress, 5)}%` }}
              />
            </div>
          </div>
        )}

        {/* Botão de ação */}
        {file && (
          <button
            type="submit"
            disabled={loading}
            className="btn-primary py-2.5 px-5 text-sm w-full sm:w-auto"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Importando…
              </span>
            ) : (
              <span className="inline-flex items-center gap-2">
                <Upload className="w-4 h-4" />
                Importar {file.name.split('.').pop().toUpperCase()}
              </span>
            )}
          </button>
        )}
      </form>

      {/* Resultado da importação */}
      {result && (
        <div className="card p-5 space-y-4 animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-500" />
            <p className="text-sm text-foreground font-medium">
              Importação concluída
              <span className="text-muted-foreground font-normal ml-1">
                · {result.total} registros · {result.format?.toUpperCase()} · {result.duration_ms}ms
              </span>
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-300">{result.inserted}</p>
              <p className="text-[10px] uppercase tracking-wide text-emerald-700/70 dark:text-emerald-400/70 font-medium">Inseridos</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-300">{result.updated}</p>
              <p className="text-[10px] uppercase tracking-wide text-blue-700/70 dark:text-blue-400/70 font-medium">Atualizados</p>
            </div>
            <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-300">{result.skipped}</p>
              <p className="text-[10px] uppercase tracking-wide text-amber-700/70 dark:text-amber-400/70 font-medium">Ignorados</p>
            </div>
            <div className="bg-muted border border-border rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-foreground">{result.errors?.length ?? 0}</p>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Erros</p>
            </div>
          </div>

          {/* Lista de erros */}
          {result.errors?.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-red-600 dark:text-red-400 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                Erros encontrados ({result.errors.length})
              </p>
              <div className="max-h-40 overflow-y-auto space-y-1 rounded-xl bg-red-50/50 dark:bg-red-500/5 border border-red-100 dark:border-red-500/10 p-3">
                {result.errors.map((e, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="text-red-400 font-mono flex-shrink-0">Linha {e.line}</span>
                    <span className="text-red-600 dark:text-red-300">{e.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
