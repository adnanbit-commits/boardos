-- Migration: 20260321_minutes_schema_additions
--
-- Adds fields required for SS-1 compliant minutes and attendance register:
--   Meeting: meetingSerialNumber, commencementTime, conclusionTime
--   Company: email, website
--
-- meetingSerialNumber — auto-assigned per company at meeting creation (1, 2, 3...)
-- commencementTime    — set when meeting transitions SCHEDULED → IN_PROGRESS
-- conclusionTime      — set when closure is confirmed (future tranche)
-- Company.email       — appears on letterhead of minutes and attendance register
-- Company.website     — appears on letterhead (optional but SS-1 best practice)

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS meeting_serial_number INTEGER,
  ADD COLUMN IF NOT EXISTS commencement_time     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS conclusion_time        TIMESTAMPTZ;

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS email   TEXT,
  ADD COLUMN IF NOT EXISTS website TEXT;
