-- Proper motion/resolution text split.
--
-- Previously the `text` column held a mix of:
--   a) Pure motion text on older records
--   b) "motion\n\n---\nFINAL RESOLUTION:\nresolved that..." on records
--      created after the bandaid sanitizer was added
--
-- New model:
--   motionText     — what is proposed ("The Board is moved to...")
--   resolutionText — enacted wording ("RESOLVED THAT...") optional until passed

-- Add new columns
ALTER TABLE resolutions
  ADD COLUMN IF NOT EXISTS "motionText"     TEXT,
  ADD COLUMN IF NOT EXISTS "resolutionText" TEXT;

-- Migrate existing data
-- Case A: merged records — split on the separator
UPDATE resolutions
SET
  "motionText"     = TRIM(SPLIT_PART(text, E'\n\n---\nFINAL RESOLUTION:\n', 1)),
  "resolutionText" = NULLIF(TRIM(SPLIT_PART(text, E'\n\n---\nFINAL RESOLUTION:\n', 2)), '')
WHERE text LIKE '%' || E'\n\n---\nFINAL RESOLUTION:\n' || '%';

-- Case B: plain records — motion text only, no resolution text yet
UPDATE resolutions
SET
  "motionText"     = TRIM(text),
  "resolutionText" = NULL
WHERE text NOT LIKE '%' || E'\n\n---\nFINAL RESOLUTION:\n' || '%';

-- Make motionText NOT NULL now that it is populated
ALTER TABLE resolutions
  ALTER COLUMN "motionText" SET NOT NULL;

-- Drop the old text column
ALTER TABLE resolutions
  DROP COLUMN IF EXISTS text;
