-- Vault enums
CREATE TYPE "VaultDocType" AS ENUM ('INCORPORATION_CERT','MOA','AOA','PAN','GST_CERT','COMMON_SEAL','CUSTOM');
CREATE TYPE "ComplianceForm" AS ENUM ('DIR_2','MBP_1','DIR_8','DIR_3_KYC','CUSTOM');
CREATE TYPE "MeetingDocType" AS ENUM ('DRAFT_NOTICE','DRAFT_AGENDA','SUPPORTING_PAPER','DRAFT_RESOLUTION','CUSTOM');
CREATE TYPE "DocNoteStatus" AS ENUM ('NOTED','NOTED_WITH_EXCEPTION');

-- Company statutory document vault
CREATE TABLE "vault_documents" (
  "id"          TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "companyId"   TEXT NOT NULL,
  "docType"     "VaultDocType" NOT NULL,
  "label"       TEXT NOT NULL,
  "fileUrl"     TEXT NOT NULL,
  "fileName"    TEXT NOT NULL,
  "fileSize"    INTEGER,
  "uploadedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uploadedBy"  TEXT NOT NULL,
  CONSTRAINT "vault_documents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "vault_documents_companyId_docType_label_key" UNIQUE ("companyId","docType","label"),
  CONSTRAINT "vault_documents_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE,
  CONSTRAINT "vault_documents_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "users"("id")
);

-- Director compliance forms per FY
CREATE TABLE "director_compliance_docs" (
  "id"             TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "companyId"      TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "formType"       "ComplianceForm" NOT NULL,
  "label"          TEXT,
  "financialYear"  TEXT NOT NULL,
  "fileUrl"        TEXT,
  "fileName"       TEXT,
  "fileSize"       INTEGER,
  "submittedAt"    TIMESTAMP(3),
  "receivedAt"     TIMESTAMP(3),
  "notes"          TEXT,
  "recordedBy"     TEXT,
  CONSTRAINT "director_compliance_docs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "director_compliance_docs_unique" UNIQUE ("companyId","userId","formType","financialYear"),
  CONSTRAINT "director_compliance_docs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE,
  CONSTRAINT "director_compliance_docs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id")
);

-- Meeting pre-papers
CREATE TABLE "meeting_documents" (
  "id"         TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "meetingId"  TEXT NOT NULL,
  "companyId"  TEXT NOT NULL,
  "title"      TEXT NOT NULL,
  "docType"    "MeetingDocType" NOT NULL,
  "fileUrl"    TEXT NOT NULL,
  "fileName"   TEXT NOT NULL,
  "fileSize"   INTEGER,
  "isShared"   BOOLEAN NOT NULL DEFAULT false,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "uploadedBy" TEXT NOT NULL,
  CONSTRAINT "meeting_documents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "meeting_documents_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE,
  CONSTRAINT "meeting_documents_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id"),
  CONSTRAINT "meeting_documents_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "users"("id")
);

-- Public share link for meeting papers
CREATE TABLE "meeting_share_links" (
  "id"          TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "meetingId"   TEXT NOT NULL,
  "shareToken"  TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "isActive"    BOOLEAN NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy"   TEXT NOT NULL,
  CONSTRAINT "meeting_share_links_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "meeting_share_links_meetingId_key" UNIQUE ("meetingId"),
  CONSTRAINT "meeting_share_links_shareToken_key" UNIQUE ("shareToken"),
  CONSTRAINT "meeting_share_links_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE,
  CONSTRAINT "meeting_share_links_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id")
);

-- Chairperson noting of compliance docs at meeting
CREATE TABLE "meeting_doc_notes" (
  "id"             TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "meetingId"      TEXT NOT NULL,
  "companyId"      TEXT NOT NULL,
  "directorUserId" TEXT NOT NULL,
  "formType"       "ComplianceForm" NOT NULL,
  "status"         "DocNoteStatus" NOT NULL,
  "exception"      TEXT,
  "notedBy"        TEXT NOT NULL,
  "notedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "meeting_doc_notes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "meeting_doc_notes_unique" UNIQUE ("meetingId","directorUserId","formType"),
  CONSTRAINT "meeting_doc_notes_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE,
  CONSTRAINT "meeting_doc_notes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id"),
  CONSTRAINT "meeting_doc_notes_directorUserId_fkey" FOREIGN KEY ("directorUserId") REFERENCES "users"("id"),
  CONSTRAINT "meeting_doc_notes_notedBy_fkey" FOREIGN KEY ("notedBy") REFERENCES "users"("id")
);
