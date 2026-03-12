-- ── Enum additions ────────────────────────────────────────────────────────────

ALTER TYPE "ResolutionType"   ADD VALUE IF NOT EXISTS 'NOTING';
ALTER TYPE "ResolutionStatus" ADD VALUE IF NOT EXISTS 'NOTED';
ALTER TYPE "MeetingStatus"    ADD VALUE IF NOT EXISTS 'MINUTES_CIRCULATED';

CREATE TYPE "DeclarationFormType" AS ENUM ('DIR_2', 'DIR_8', 'MBP_1');

-- ── Company: minutes custodian ────────────────────────────────────────────────

ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "minutesCustodianId" TEXT;

-- ── Meeting: chairperson + recorder + circulation timestamp ───────────────────

ALTER TABLE "meetings"
  ADD COLUMN IF NOT EXISTS "chairpersonId"        TEXT,
  ADD COLUMN IF NOT EXISTS "minutesRecorderId"     TEXT,
  ADD COLUMN IF NOT EXISTS "minutesCirculatedAt"   TIMESTAMP(3);

-- ── AgendaItem: AOB flag ──────────────────────────────────────────────────────

ALTER TABLE "agenda_items"
  ADD COLUMN IF NOT EXISTS "isAob" BOOLEAN NOT NULL DEFAULT false;

-- ── DirectorDeclaration table ─────────────────────────────────────────────────

CREATE TABLE "director_declarations" (
  "id"         TEXT NOT NULL,
  "meetingId"  TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  "formType"   "DeclarationFormType" NOT NULL,
  "received"   BOOLEAN NOT NULL DEFAULT false,
  "notes"      TEXT,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "director_declarations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "director_declarations_meetingId_userId_formType_key"
    UNIQUE ("meetingId", "userId", "formType"),
  CONSTRAINT "director_declarations_meetingId_fkey"
    FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE,
  CONSTRAINT "director_declarations_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT
);
