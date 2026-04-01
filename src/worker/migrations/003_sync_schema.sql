-- Migration: sync_schema
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
