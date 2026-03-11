-- Add serial number for circular resolutions (SS-1 requirement)
ALTER TABLE "resolutions" ADD COLUMN IF NOT EXISTS "serialNumber" TEXT;

-- Add noted-at-meeting tracking (Sec. 175(2) requirement)
ALTER TABLE "resolutions" ADD COLUMN IF NOT EXISTS "notedAtMeetingId" TEXT;

-- Foreign key for notedAtMeetingId
ALTER TABLE "resolutions"
  ADD CONSTRAINT "resolutions_notedAtMeetingId_fkey"
  FOREIGN KEY ("notedAtMeetingId")
  REFERENCES "meetings"("id")
  ON DELETE SET NULL;
