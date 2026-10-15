import { useEffect, useRef } from 'react'

/**
 * Input oculto que mantém o foco para scanners USB que exigem um campo com
 * foco. A captura real dos caracteres é feita pelo hook useExternalScanner.
 */
export function ScannerInput({ active = true }) {
  const inputRef = useRef(null)

  useEffect(() => {
    if (active) inputRef.current?.focus()
  }, [active])

  if (!active) return null

  return (
    <input
      ref={inputRef}
      type="text"
      className="scanner-usb-input"
      data-scanner-input="true"
      aria-label="Scanner de código de barras USB"
      autoComplete="off"
      autoCapitalize="off"
      autoCorrect="off"
      spellCheck="false"
    />
  )
}

export default ScannerInput
