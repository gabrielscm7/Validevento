-- Suporte a terminais suspensos e soft-delete.
-- Idempotente: reexecutada a cada boot de teste.

ALTER TABLE terminals
  ADD COLUMN IF NOT EXISTS suspended BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS suspended_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS session_token UUID DEFAULT gen_random_uuid();

CREATE INDEX IF NOT EXISTS idx_terminals_active
  ON terminals(event_id)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN terminals.suspended IS 'Terminal temporariamente bloqueado (pode reativar)';
COMMENT ON COLUMN terminals.deleted_at IS 'Soft-delete: dados preservados mas terminal inacessível';
