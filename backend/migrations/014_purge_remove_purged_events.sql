-- O "purge" de eventos deixou de ser soft (status 'purged') e passa a ser uma
-- exclusão definitiva (hard delete). Esta migração remove os eventos que
-- ficaram como resquício do modelo antigo, junto com seus dados operacionais.
--
-- Tabelas-filhas são removidas explicitamente (na ordem correta) e o evento por
-- último. audit_logs usa ON DELETE SET NULL: o histórico de auditoria é
-- preservado (apenas event_id vira NULL; entity_id/details permanecem).
-- Idempotente: em base sem eventos 'purged' não altera nada.

DELETE FROM entry_logs
  WHERE event_id IN (SELECT id FROM events WHERE status = 'purged');
DELETE FROM master_tickets
  WHERE event_id IN (SELECT id FROM events WHERE status = 'purged');
DELETE FROM tickets
  WHERE event_id IN (SELECT id FROM events WHERE status = 'purged');
DELETE FROM batches
  WHERE event_id IN (SELECT id FROM events WHERE status = 'purged');
DELETE FROM terminals
  WHERE event_id IN (SELECT id FROM events WHERE status = 'purged');
DELETE FROM gates
  WHERE event_id IN (SELECT id FROM events WHERE status = 'purged');
DELETE FROM event_team
  WHERE event_id IN (SELECT id FROM events WHERE status = 'purged');
DELETE FROM event_config
  WHERE event_id IN (SELECT id FROM events WHERE status = 'purged');
DELETE FROM events WHERE status = 'purged';
