-- Permite manter eventos purgados como registro histórico.
ALTER TABLE events
  DROP CONSTRAINT IF EXISTS valid_event_status;

ALTER TABLE events
  ADD CONSTRAINT valid_event_status
  CHECK (status IN ('draft', 'active', 'closed', 'purged'));
