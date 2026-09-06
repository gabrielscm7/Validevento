import '@testing-library/jest-dom/vitest'
import { vi, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import 'fake-indexeddb/auto'

afterEach(() => {
  cleanup()
})

// ── Mocks globais de navegador ──────────────────────────────

// html5-qrcode: nunca acessa câmera real em teste.
vi.mock('html5-qrcode', () => {
  class Html5QrcodeStub {
    constructor() { this._started = false }
    start(_config, _options, onSuccess) {
      this._started = true
      this.onSuccess = onSuccess
      return Promise.resolve()
    }
    stop() { this._started = false; return Promise.resolve() }
    pause() {}
    resume() {}
  }
  return { Html5Qrcode: Html5QrcodeStub, Html5QrcodeScanner: class {}, Html5QrcodeSupportedFormats: {} }
})

// ResizeObserver (recharts ResponsiveContainer)
if (typeof window !== 'undefined' && !window.ResizeObserver) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver = ResizeObserverStub
}

// matchMedia (next-themes / mídia)
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
}

// scrollIntoView não existe no jsdom
if (typeof window !== 'undefined' && !window.HTMLElement.prototype.scrollIntoView) {
  window.HTMLElement.prototype.scrollIntoView = vi.fn()
}

// Limpa localStorage entre testes para não vazar sessão
afterEach(() => {
  try { window.localStorage.clear() } catch { /* ignore */ }
})
