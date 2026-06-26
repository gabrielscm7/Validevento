-- Habilitar pgcrypto para geração de UUIDs se não estiver habilitado
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Tabela: events
CREATE TABLE IF NOT EXISTS events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(255) NOT NULL,
  date          TIMESTAMPTZ NOT NULL,
  location      VARCHAR(255),
  capacity      INTEGER NOT NULL DEFAULT 1000,
  salt          VARCHAR(64) NOT NULL, -- salt único por evento para hash CPF
  active        BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Tabela: users
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(255) NOT NULL,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(20) NOT NULL DEFAULT 'validator', -- admin | supervisor | validator
  active        BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Tabela: tickets
CREATE TABLE IF NOT EXISTS tickets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  ticket_code   VARCHAR(50) NOT NULL UNIQUE, -- ex: EVT2026-004521
  batch         VARCHAR(50) NOT NULL,         -- ex: LOTE-03
  hash_cpf      VARCHAR(64),                  -- NULL se ainda não vinculado
  display_name  VARCHAR(100),                 -- ex: "Carlos S." — nome parcial
  status        VARCHAR(20) NOT NULL DEFAULT 'generated',
  imported_at   TIMESTAMPTZ DEFAULT now(),
  validated_at  TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT valid_status CHECK (
    status IN ('generated', 'linked', 'validated', 'blocked')
  )
);

CREATE INDEX IF NOT EXISTS idx_tickets_hash_cpf ON tickets(hash_cpf);
CREATE INDEX IF NOT EXISTS idx_tickets_status   ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_event    ON tickets(event_id);

-- Tabela: terminals
CREATE TABLE IF NOT EXISTS terminals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name          VARCHAR(100) NOT NULL,  -- ex: "Portaria 1 - Celular João"
  last_seen_at  TIMESTAMPTZ,
  last_sync_at  TIMESTAMPTZ,
  online        BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Tabela: entry_logs
CREATE TABLE IF NOT EXISTS entry_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id     UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  event_id      UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  hash_cpf      VARCHAR(64) NOT NULL,
  entry_type    VARCHAR(20) NOT NULL,  -- qrcode | manual
  terminal_id   UUID REFERENCES terminals(id) ON DELETE SET NULL,
  validator_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  is_duplicate  BOOLEAN DEFAULT false,
  synced        BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_logs_hash_cpf ON entry_logs(hash_cpf);
CREATE INDEX IF NOT EXISTS idx_logs_event    ON entry_logs(event_id);
CREATE INDEX IF NOT EXISTS idx_logs_synced   ON entry_logs(synced);
