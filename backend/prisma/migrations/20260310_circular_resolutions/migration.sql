-- Add ResolutionType and CircularSignatureValue enums
CREATE TYPE "ResolutionType" AS ENUM ('MEETING', 'CIRCULAR');
CREATE TYPE "CircularSignatureValue" AS ENUM ('FOR', 'OBJECT');

-- Add circular resolution fields to resolutions table
ALTER TABLE "resolutions" ADD COLUMN IF NOT EXISTS "type"            "ResolutionType" NOT NULL DEFAULT 'MEETING';
ALTER TABLE "resolutions" ADD COLUMN IF NOT EXISTS "deadline"        TIMESTAMP(3);
ALTER TABLE "resolutions" ADD COLUMN IF NOT EXISTS "circulationNote" TEXT;

-- meetingId is now optional
ALTER TABLE "resolutions" ALTER COLUMN "meetingId" DROP NOT NULL;

-- CircularSignature table
CREATE TABLE IF NOT EXISTS "circular_signatures" (
  "id"           TEXT NOT NULL,
  "resolutionId" TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "value"        "CircularSignatureValue" NOT NULL,
  "remarks"      TEXT,
  "signedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "circular_signatures_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "circular_signatures_resolutionId_userId_key" UNIQUE ("resolutionId", "userId"),
  CONSTRAINT "circular_signatures_resolutionId_fkey"
    FOREIGN KEY ("resolutionId") REFERENCES "resolutions"("id") ON DELETE CASCADE,
  CONSTRAINT "circular_signatures_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT
);
