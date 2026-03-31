-- Migration: sync_schema
-- Sincroniza banco com schema.py (adiciona colunas faltantes)

-- contacts.updated_at
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
