-- Add MCA director data storage to companies
-- Persists the director list from MCA lookup so directors can claim their seat
-- after accepting an invitation.
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS "mcaDirectors" JSONB;

-- Add DIN to company_users
-- Set when a director claims their MCA seat — links them to the legal record.
ALTER TABLE company_users
  ADD COLUMN IF NOT EXISTS "din" TEXT;
