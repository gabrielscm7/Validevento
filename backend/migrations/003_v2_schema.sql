-- ============================================================
-- Migração v2 — Schema multi-tenant (Fase 1)
-- Arquivo: 003_v2_schema.sql
--
-- INCREMENTAL: apenas adiciona o que é novo na v2. Não recria
-- tabelas/colunas das migrations 01_init_schema, 02_batches e
-- 03_uuid_only.
--
-- BACKFILL AUTOMÁTICO (legado v1): as tabelas events, tickets e
-- entry_logs ganham tenant_id NOT NULL. Se a base já tiver dados
-- da v1 (sem tenant), a migração cria um cliente 'Cliente Legado
-- v1' (legado@validevento.com) e atribui os registros existentes
-- — e os usuários não-master — a ele antes de aplicar o NOT NULL.
-- Em base limpa/teste não há registros e nada é criado.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------
-- clients — Clientes da plataforma (tenants)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clients (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  VARCHAR(255) NOT NULL,
  cnpj                  VARCHAR(18),
  email                 VARCHAR(255) NOT NULL UNIQUE,
  plan                  VARCHAR(20) NOT NULL DEFAULT 'basic',
  max_admins            INTEGER NOT NULL DEFAULT 2,
  max_supervisors       INTEGER NOT NULL DEFAULT 5,
  max_validators        INTEGER NOT NULL DEFAULT 10,
  max_tickets_per_event INTEGER NOT NULL DEFAULT 3000,
  max_events_active     INTEGER NOT NULL DEFAULT 1,
  active                BOOLEAN DEFAULT true,
  created_at            TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------
-- users — Novas colunas (autenticação por CPF + tenant)
-- ------------------------------------------------------------
-- tenant_id NULL = usuário Master (proprietário do sistema)
ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES clients(id) ON DELETE CASCADE;
-- hash bcrypt do CPF (redundante/auditoria — nunca texto puro)
ALTER TABLE users ADD COLUMN IF NOT EXISTS cpf_hash VARCHAR(255);
-- SHA-256(salt fixo) para busca rápida no login — UNIQUE
ALTER TABLE users ADD COLUMN IF NOT EXISTS cpf_lookup_hash VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_token VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_token_exp TIMESTAMPTZ;

-- Usuário agora pode ser criado sem senha (ativação por e-mail)
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- Índices de users
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_cpf_hash ON users(cpf_hash);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_cpf_lookup ON users(cpf_lookup_hash);

-- ------------------------------------------------------------
-- events — Novas colunas
-- ------------------------------------------------------------
-- tenant_id adicionado nullable; NOT NULL é aplicado ao final após
-- o backfill de registros legados da v1.
ALTER TABLE events ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS expected_start TIMESTAMPTZ;
ALTER TABLE events ADD COLUMN IF NOT EXISTS responsible TEXT[];
ALTER TABLE events ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'draft';

CREATE INDEX IF NOT EXISTS idx_events_tenant ON events(tenant_id);

-- ------------------------------------------------------------
-- event_config — Configurações de validação por evento (1:1)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS event_config (
  event_id              UUID PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  qrcode_field          VARCHAR(50) NOT NULL DEFAULT 'ticket_code',
  manual_fields         TEXT[] NOT NULL DEFAULT ARRAY['display_name'],
  checkout_enabled      BOOLEAN DEFAULT false,
  reentry_mode          VARCHAR(20) NOT NULL DEFAULT 'none',
  duplicate_action      VARCHAR(10) NOT NULL DEFAULT 'warn',
  master_ticket_enabled BOOLEAN DEFAULT false,
  validation_speed_target_sec INTEGER DEFAULT 5,
  gate_tracking_enabled BOOLEAN DEFAULT true,
  export_formats        TEXT[] DEFAULT ARRAY['md','csv'],
  updated_at            TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT valid_qrcode_field CHECK (
    qrcode_field IN ('ticket_code','cpf','custom_hash')
  ),
  CONSTRAINT valid_reentry_mode CHECK (
    reentry_mode IN ('none','free','conditioned')
  )
);

-- ------------------------------------------------------------
-- event_team — Designação de usuários a eventos
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS event_team (
  event_id      UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_override VARCHAR(20),
  PRIMARY KEY (event_id, user_id)
);

-- ------------------------------------------------------------
-- gates — Abertura e fechamento de portões
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL DEFAULT 'Portão Principal',
  opened_at   TIMESTAMPTZ,
  opened_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  closed_at   TIMESTAMPTZ,
  closed_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gates_event ON gates(event_id);

-- ------------------------------------------------------------
-- master_tickets — Ingresso master por evento
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS master_tickets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  max_uses    INTEGER,
  uses_count  INTEGER NOT NULL DEFAULT 0,
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_master_tickets_event ON master_tickets(event_id);

-- ------------------------------------------------------------
-- tickets — Novas colunas (tenant + origem + checkout)
-- ------------------------------------------------------------
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS origin VARCHAR(30) NOT NULL DEFAULT 'import';
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS checkout_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tickets_tenant ON tickets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tickets_code_lower ON tickets(LOWER(ticket_code));

-- ------------------------------------------------------------
-- entry_logs — Novas colunas (tenant + checkout)
-- ------------------------------------------------------------
ALTER TABLE entry_logs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE entry_logs ADD COLUMN IF NOT EXISTS checkout_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_logs_tenant ON entry_logs(tenant_id);

-- ------------------------------------------------------------
-- audit_logs — Log de auditoria imutável
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES clients(id) ON DELETE SET NULL,
  event_id    UUID REFERENCES events(id) ON DELETE SET NULL,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  action      VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id   UUID,
  details     JSONB,
  ip_address  VARCHAR(45),
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_event  ON audit_logs(event_id);

-- ------------------------------------------------------------
-- Backfill de registros legados da v1 + aplicação do NOT NULL
-- ------------------------------------------------------------
-- Se existirem registros sem tenant (base v1 já em uso), cria um
-- cliente "legado" e vincula esses registros a ele. Depois aplica
-- a restrição NOT NULL. Em base limpa o bloco não cria nada.
DO $$
DECLARE
  v_legacy_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM events     WHERE tenant_id IS NULL)
     OR EXISTS (SELECT 1 FROM tickets    WHERE tenant_id IS NULL)
     OR EXISTS (SELECT 1 FROM entry_logs WHERE tenant_id IS NULL)
     OR EXISTS (SELECT 1 FROM users      WHERE tenant_id IS NULL AND role <> 'master')
  THEN
    SELECT id INTO v_legacy_id FROM clients WHERE email = 'legado@validevento.com' LIMIT 1;
    IF v_legacy_id IS NULL THEN
      INSERT INTO clients (name, email, cnpj, plan)
      VALUES ('Cliente Legado v1', 'legado@validevento.com', '00.000.000/0000-00', 'basic')
      RETURNING id INTO v_legacy_id;
    END IF;

    UPDATE events      SET tenant_id = v_legacy_id WHERE tenant_id IS NULL;
    UPDATE tickets     SET tenant_id = v_legacy_id WHERE tenant_id IS NULL;
    UPDATE entry_logs  SET tenant_id = v_legacy_id WHERE tenant_id IS NULL;
    -- Usuários da v1 (admin/supervisor/validator) pertencem ao cliente legado;
    -- usuários com role = 'master' permanecem com tenant_id NULL.
    UPDATE users       SET tenant_id = v_legacy_id WHERE tenant_id IS NULL AND role <> 'master';
  END IF;
END $$;

ALTER TABLE events     ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE tickets    ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE entry_logs ALTER COLUMN tenant_id SET NOT NULL;
