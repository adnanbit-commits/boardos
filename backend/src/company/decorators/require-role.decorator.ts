import { SetMetadata } from '@nestjs/common';

export const REQUIRE_ROLE_KEY           = 'requiredRole';
export const REQUIRE_WORKSPACE_ADMIN_KEY = 'requireWorkspaceAdmin';

/**
 * Gate a route to a specific role:
 *   @RequireRole('DIRECTOR')    — only directors (voting, signing)
 *   @RequireRole('PARTICIPANT') — directors + CS (meeting management, minutes)
 */
export const RequireRole = (role: string) =>
  SetMetadata(REQUIRE_ROLE_KEY, role);

/**
 * Gate a route to workspace admins only (isWorkspaceAdmin flag).
 * Used for: inviting members, workspace settings, ownership transfer.
 * This is a platform concept — never appears in legal documents.
 */
export const RequireWorkspaceAdmin = () =>
  SetMetadata(REQUIRE_WORKSPACE_ADMIN_KEY, true);
