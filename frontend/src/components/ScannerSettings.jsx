export function ScannerSettings({ value, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-muted" htmlFor="scanner-source">Fonte:</label>
      <select
        id="scanner-source"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="select"
        style={{ minWidth: 130, padding: '4px 8px', fontSize: 12 }}
      >
        <option value="auto">Auto-detectar</option>
        <option value="camera">Apenas câmera</option>
        <option value="usb">Scanner USB</option>
      </select>
    </div>
  )
}

export default ScannerSettings
