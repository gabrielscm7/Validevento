-- Normaliza eventos legados sem status
UPDATE events
SET status = 'closed'
WHERE status IS NULL OR status = '';

-- Cria event_config padrão para eventos sem configuração
INSERT INTO event_config (event_id)
SELECT e.id FROM events e
LEFT JOIN event_config ec ON ec.event_id = e.id
WHERE ec.event_id IS NULL
ON CONFLICT (event_id) DO NOTHING;

-- Associa tenant_id a eventos legados sem tenant
-- (seguro apenas em ambiente single-tenant — 1 cliente ativo)
UPDATE events e
SET tenant_id = (
  SELECT id FROM clients WHERE active = true ORDER BY created_at LIMIT 1
)
WHERE e.tenant_id IS NULL
  AND (SELECT COUNT(*) FROM clients WHERE active = true) = 1;

-- Índice de performance para markOfflineTerminals
CREATE INDEX IF NOT EXISTS idx_terminals_online_last_seen
  ON terminals(online, last_seen_at)
  WHERE online = true;
