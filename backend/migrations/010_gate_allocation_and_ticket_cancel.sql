-- Alocação de terminal a portão e cancelamento lógico de convites.
-- Mantém NULL como Portaria Única e preserva logs históricos.

ALTER TABLE terminals
  ADD COLUMN IF NOT EXISTS gate_id UUID REFERENCES gates(id) ON DELETE SET NULL;

ALTER TABLE entry_logs
  ADD COLUMN IF NOT EXISTS gate_id UUID REFERENCES gates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_terminals_gate ON terminals(gate_id);
CREATE INDEX IF NOT EXISTS idx_logs_event_gate ON entry_logs(event_id, gate_id);

ALTER TABLE tickets DROP CONSTRAINT IF EXISTS valid_status;
ALTER TABLE tickets ADD CONSTRAINT valid_status CHECK (
  status IN ('active', 'validated', 'blocked', 'cancelled')
);
