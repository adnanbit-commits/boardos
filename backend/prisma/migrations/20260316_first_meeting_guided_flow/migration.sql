-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260316_first_meeting_guided_flow
--
-- Adds the schema foundations for:
--   1. First board meeting tracking on Company
--   2. Notice acknowledgement + roll call + quorum confirmation on Meeting
--   3. Exhibit document link on Resolution (vault doc or meeting doc)
--   4. Item type + legal metadata on AgendaItem
--   5. MeetingRollCall table for per-director roll call responses
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Company: first board meeting tracking ─────────────────────────────────

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS first_board_meeting_locked_id TEXT;

-- ── 2. Meeting: notice, roll call, quorum, first-meeting flag ────────────────

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS is_first_meeting         BOOLEAN   NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deemed_venue             TEXT,
  ADD COLUMN IF NOT EXISTS notice_sent_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notice_acknowledged_by   TEXT[]    NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS roll_call_completed_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS quorum_confirmed_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS quorum_confirmed_by      TEXT;

-- ── 3. Resolution: exhibit document link ─────────────────────────────────────
-- A NOTING resolution can reference a vault document or a meeting document
-- as its formal exhibit. The chairperson must open it before placing on record.

ALTER TABLE resolutions
  ADD COLUMN IF NOT EXISTS vault_doc_id    TEXT REFERENCES vault_documents(id)  ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS meeting_doc_id  TEXT REFERENCES meeting_documents(id) ON DELETE SET NULL;

-- ── 4. AgendaItem: item type + legal metadata ─────────────────────────────────
-- item_type drives UI behaviour — STANDARD items work as today.
-- Typed items get specialised execution surfaces.
-- legal_basis and guidance_note are shown to the CS but never appear in minutes.

ALTER TABLE agenda_items
  ADD COLUMN IF NOT EXISTS item_type     TEXT NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN IF NOT EXISTS legal_basis   TEXT,
  ADD COLUMN IF NOT EXISTS guidance_note TEXT;

-- Valid item_type values (enforced in application layer, not DB constraint
-- so future types can be added without a migration):
--   STANDARD              — normal agenda item, resolutions/noting as usual
--   ROLL_CALL             — system-managed roll call, no resolutions
--   QUORUM_CONFIRMATION   — chairperson confirms quorum after roll call
--   CHAIRPERSON_ELECTION  — election flow with nomination + confirmation
--   COMPLIANCE_NOTING     — director declarations via DocNotesPanel
--   VAULT_DOC_NOTING      — noting of a specific vault document as exhibit
--   ELECTRONIC_CONSENT    — Rule 3(7) virtual meeting authorisation resolution

-- ── 5. MeetingRollCall: per-director roll call responses ──────────────────────
-- Records each director's location, no-third-party confirmation,
-- and materials receipt at meeting opening. Required by SS-1 Rule 3(4)
-- for video conferencing meetings.

CREATE TABLE IF NOT EXISTS meeting_roll_calls (
  id                  TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  meeting_id          TEXT        NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id             TEXT        NOT NULL REFERENCES users(id),
  location            TEXT        NOT NULL,
  no_third_party      BOOLEAN     NOT NULL DEFAULT FALSE,
  materials_received  BOOLEAN     NOT NULL DEFAULT FALSE,
  responded_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(meeting_id, user_id)
);

-- Index for fast lookup by meeting
CREATE INDEX IF NOT EXISTS idx_roll_calls_meeting ON meeting_roll_calls(meeting_id);
