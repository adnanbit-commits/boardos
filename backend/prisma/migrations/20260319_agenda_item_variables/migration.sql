-- Add variable system to agenda items
-- variables:       JSON array of {key, label, type} — defined at template/item creation
-- variable_values: JSON object of {key: value}      — filled before/during meeting
ALTER TABLE agenda_items
  ADD COLUMN IF NOT EXISTS "variables"       JSONB,
  ADD COLUMN IF NOT EXISTS "variable_values" JSONB;
