-- ============================================================
-- Migração Fase 3 — Imutabilidade do log de auditoria
-- Arquivo: 005_audit_immutable.sql
--
-- RF-10 / RN-07: logs de auditoria são imutáveis.
--  1. REVOKE DELETE para aplicação/roles comuns
--  2. Trigger BEFORE DELETE que bloqueia exclusão inclusive para o
--     owner (ex.: postgres no dev local), garantindo o T-audit-2.
--  TRUNCATE continua permitido (usado pelo reset/limpeza de testes).
-- ============================================================

REVOKE DELETE ON TABLE audit_logs FROM PUBLIC;

CREATE OR REPLACE FUNCTION prevent_audit_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs são imutáveis: exclusão não é permitida';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON audit_logs;
CREATE TRIGGER trg_audit_logs_immutable
  BEFORE DELETE ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_delete();
