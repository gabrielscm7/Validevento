/**
 * Botão do rodapé do terminal: visível apenas quando o ingresso master está
 * habilitado no event_config.
 */
export function MasterTicketButton({ enabled, onClick }) {
  return (
    <button
      type="button"
      className="t-btn primary"
      style={{ display: enabled ? 'inline-flex' : 'none' }}
      onClick={onClick}
      data-testid="master-ticket-btn"
    >
      🎟 Ingresso master
    </button>
  )
}

export default MasterTicketButton
