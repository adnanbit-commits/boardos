-- Document noting foundation
-- Adds meeting caller tracking and document evidence fields for NOTING resolutions.

-- Meeting: store who called/created this meeting (chairperson authority gate)
ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS called_by TEXT;

-- Resolution: document evidence paths for NOTING type
-- Path A (existing): vault_doc_id / meeting_doc_id
-- Path B (new): external URL + platform label
-- Path C (new): physical presence confirmation
ALTER TABLE resolutions
  ADD COLUMN IF NOT EXISTS external_doc_url      TEXT,
  ADD COLUMN IF NOT EXISTS external_doc_platform TEXT,
  ADD COLUMN IF NOT EXISTS physically_present    BOOLEAN,
  ADD COLUMN IF NOT EXISTS physical_evidence     TEXT;
