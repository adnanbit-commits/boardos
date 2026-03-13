CREATE TABLE "meeting_templates" (
  "id"          TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "companyId"   TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "category"    TEXT NOT NULL DEFAULT 'BOARD',
  "agendaItems" JSONB NOT NULL DEFAULT '[]',
  "usageCount"  INTEGER NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "meeting_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "meeting_templates_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
