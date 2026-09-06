-- ============================================================
-- Migração Fase 4 (P5) — personalização visual por evento
-- Arquivo: 006_event_branding.sql
--
-- Adiciona banner_url/logo_url em events (URLs externas aceitas
-- pela API e com fallback da identidade padrão no frontend
-- enquanto ausentes). Idempotente (ADD COLUMN IF NOT EXISTS).
-- ============================================================

ALTER TABLE events ADD COLUMN IF NOT EXISTS banner_url TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS logo_url TEXT;
