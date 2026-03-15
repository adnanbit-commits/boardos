-- Chairperson nomination: persisted so all directors see the same pending nomination
-- across their browser sessions. Cleared once chairperson is elected.
ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS chair_nominee_id           TEXT,
  ADD COLUMN IF NOT EXISTS chair_nominee_proposed_by  TEXT,
  ADD COLUMN IF NOT EXISTS chair_nominee_confirmed_by TEXT[] NOT NULL DEFAULT '{}';
