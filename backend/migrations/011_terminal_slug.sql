-- Acesso rápido de terminal genérico por slug (sem login obrigatório).
-- Idempotente: reexecutada a cada boot de teste.

ALTER TABLE terminals
  ADD COLUMN IF NOT EXISTS slug VARCHAR(8) UNIQUE,
  ADD COLUMN IF NOT EXISTS is_generic BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS operator_name VARCHAR(255) DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_terminals_slug ON terminals(slug)
  WHERE slug IS NOT NULL;

-- Gera slug alfanumérico de 6 chars sem caracteres ambíguos (0/O/1/I).
CREATE OR REPLACE FUNCTION generate_terminal_slug()
RETURNS VARCHAR AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INT;
BEGIN
  FOR i IN 1..6 LOOP
    result := result || substr(chars,
      floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;
