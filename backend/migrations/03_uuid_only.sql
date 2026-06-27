-- Migração: CPF → UUID v4
-- Remove toda a lógica de hash de CPF, simplifica o schema

-- 1. events: remover salt (não usado mais)
ALTER TABLE events DROP COLUMN IF EXISTS salt;

-- 2. tickets: remover hash_cpf, simplificar status
ALTER TABLE tickets DROP COLUMN IF EXISTS hash_cpf;
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS valid_status;

UPDATE tickets SET status = 'active' WHERE status IN ('generated', 'linked');

ALTER TABLE tickets ADD CONSTRAINT valid_status CHECK (
  status IN ('active', 'validated', 'blocked')
);

DROP INDEX IF EXISTS idx_tickets_hash_cpf;

-- 3. entry_logs: remover hash_cpf
ALTER TABLE entry_logs DROP COLUMN IF EXISTS hash_cpf;

DROP INDEX IF EXISTS idx_logs_hash_cpf;
