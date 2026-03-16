-- Split resolution text into motion text and enacted resolution text.
ALTER TABLE resolutions
  ADD COLUMN IF NOT EXISTS "resolutionText" TEXT;

-- For already-approved/noted resolutions, copy text → resolutionText
UPDATE resolutions
  SET "resolutionText" = text
  WHERE status IN ('APPROVED', 'NOTED') AND "resolutionText" IS NULL;
