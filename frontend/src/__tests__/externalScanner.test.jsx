import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useExternalScanner } from '../hooks/useExternalScanner'

function press(chars, gapMs) {
  for (const ch of chars) {
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ch }))
      vi.advanceTimersByTime(gapMs)
    })
  }
}

function pressEnter() {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
  })
}

describe('useExternalScanner (scanner USB HID)', () => {
  const onScan = vi.fn()

  beforeEach(() => {
    onScan.mockClear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('dispara onScan para digitação rápida (scanner) + Enter', () => {
    renderHook(() => useExternalScanner({ onScan, enabled: true }))
    press('550E8400E29B41D4', 1)
    pressEnter()
    expect(onScan).toHaveBeenCalledTimes(1)
    expect(onScan).toHaveBeenCalledWith('550E8400E29B41D4')
  })

  it('não dispara para digitação humana lenta', () => {
    renderHook(() => useExternalScanner({ onScan, enabled: true }))
    press('CODIGOLENTO123', 80)
    pressEnter()
    expect(onScan).not.toHaveBeenCalled()
  })

  it('ignora quando desabilitado', () => {
    renderHook(() => useExternalScanner({ onScan, enabled: false }))
    press('550E8400E29B41D4', 1)
    pressEnter()
    expect(onScan).not.toHaveBeenCalled()
  })
})
