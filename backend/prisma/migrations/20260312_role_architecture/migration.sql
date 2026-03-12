-- ─────────────────────────────────────────────────────────────────────────────
-- Sprint 2: Role Architecture Migration
--
-- Changes:
--   1. Remove ADMIN + PARTNER from UserRole enum
--   2. Add COMPANY_SECRETARY + AUDITOR to UserRole enum
--   3. Data-migrate: ADMIN → DIRECTOR + isWorkspaceAdmin=true, PARTNER → OBSERVER
--   4. Remove isChairman from company_users + invitations
--   5. Add isWorkspaceAdmin, additionalDesignation, designationLabel to company_users
--   6. Add platformRoles to users
--   7. Add DesignationEnum
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1: Add new columns to company_users before enum change
ALTER TABLE company_users ADD COLUMN IF NOT EXISTS is_workspace_admin BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE company_users ADD COLUMN IF NOT EXISTS designation_label TEXT;
-- additionalDesignation added after enum creation below

-- Step 2: Data-migrate roles BEFORE touching the enum
-- ADMIN → DIRECTOR + workspace admin flag
UPDATE company_users SET is_workspace_admin = true WHERE role = 'ADMIN';
UPDATE company_users SET role = 'DIRECTOR' WHERE role = 'ADMIN';
-- PARTNER → OBSERVER (closest equivalent)
UPDATE company_users SET role = 'OBSERVER' WHERE role = 'PARTNER';

-- Also migrate invitations table
UPDATE invitations SET role = 'DIRECTOR' WHERE role = 'ADMIN';
UPDATE invitations SET role = 'OBSERVER' WHERE role = 'PARTNER';

-- Step 3: Create new enum
CREATE TYPE "UserRole_new" AS ENUM ('DIRECTOR', 'COMPANY_SECRETARY', 'AUDITOR', 'OBSERVER');

-- Step 4: Swap column types
ALTER TABLE company_users
  ALTER COLUMN role TYPE "UserRole_new" USING role::text::"UserRole_new";

ALTER TABLE invitations
  ALTER COLUMN role TYPE "UserRole_new" USING role::text::"UserRole_new";

-- Step 5: Drop old enum, rename new one into its place
DROP TYPE "UserRole";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";

-- Step 6: Remove isChairman — chairperson is per-meeting only (lives on meetings.chairperson_id)
ALTER TABLE company_users DROP COLUMN IF EXISTS is_chairman;
ALTER TABLE invitations    DROP COLUMN IF EXISTS is_chairman;

-- Step 7: Add DesignationEnum and the additionalDesignation column
CREATE TYPE "DesignationEnum" AS ENUM (
  'EXECUTIVE_DIRECTOR',
  'NON_EXECUTIVE_DIRECTOR',
  'INDEPENDENT_DIRECTOR',
  'NOMINEE_DIRECTOR',
  'MANAGING_DIRECTOR',
  'DIRECTOR_SIMPLICITOR',
  'WHOLE_TIME_CS',
  'CS_IN_PRACTICE',
  'CS_AS_KMP',
  'STATUTORY_AUDITOR',
  'INTERNAL_AUDITOR',
  'COST_AUDITOR'
);

ALTER TABLE company_users
  ADD COLUMN IF NOT EXISTS additional_designation "DesignationEnum";

-- Step 8: Add platformRoles to users (multi-select at registration)
ALTER TABLE users ADD COLUMN IF NOT EXISTS platform_roles TEXT[] DEFAULT '{}';
