-- Drop the orphaned resolutionText column.
--
-- History:
--   20260320_resolution_text_split added this column intending to store
--   enacted resolution wording separately from motion text.
--   The Prisma schema was never updated to include it, so the Prisma client
--   never knew about the column — any write attempt threw "Unknown argument".
--
-- Resolution:
--   The backend sanitizer now merges resolutionText into the `text` field
--   before writing (see sanitizeResolutionInput in resolution.service.ts).
--   This column is safe to drop — it has never been written to by the app.

ALTER TABLE resolutions DROP COLUMN IF EXISTS "resolutionText";
