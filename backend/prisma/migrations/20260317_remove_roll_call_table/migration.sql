-- Roll call is now handled as part of attendance recording during IN_PROGRESS.
-- The meeting_roll_calls table is no longer used.
DROP TABLE IF EXISTS meeting_roll_calls;

-- Remove rollCallCompletedAt column if it exists
ALTER TABLE meetings DROP COLUMN IF EXISTS roll_call_completed_at;
