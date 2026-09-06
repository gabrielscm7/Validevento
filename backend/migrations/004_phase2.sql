-- ============================================================
-- Migração Fase 2 — colunas incrementais
-- Arquivo: 004_phase2.sql
--
-- A SPEC v2 define entry_logs.beneficiary (ingresso master) e
-- batches.description (lotes). São ADD COLUMN IF NOT EXISTS e não
-- alteram nada que a Fase 1 já usa — idempotente para base limpa
-- e para a base de testes (que roda todas as migrations).
-- ============================================================

-- Nome do beneficiário digitado quando o tipo = master
ALTER TABLE entry_logs ADD COLUMN IF NOT EXISTS beneficiary VARCHAR(255);

-- Uso do ingresso master grava entry_log SEM ticket vinculado
ALTER TABLE entry_logs ALTER COLUMN ticket_id DROP NOT NULL;

-- Descrição textual opcional do lote
ALTER TABLE batches ADD COLUMN IF NOT EXISTS description TEXT;
