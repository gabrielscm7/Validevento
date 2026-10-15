-- Suporte a desfazer (undo) de validações.
-- Os entry_logs permanecem imutáveis em conteúdo: o desfazer marca o log como
-- revertido (auditoria preservada) e devolve o ingresso ao estado anterior.
-- Idempotente: seguro para rodar sobre a base de testes limpa.

ALTER TABLE entry_logs
  ADD COLUMN IF NOT EXISTS reversed BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE entry_logs
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ;

ALTER TABLE entry_logs
  ADD COLUMN IF NOT EXISTS reversed_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_logs_ticket_active
  ON entry_logs(ticket_id, created_at DESC)
  WHERE reversed = false;
