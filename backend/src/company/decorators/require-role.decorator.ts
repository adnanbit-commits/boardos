import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const REQUIRE_ROLE_KEY = 'requiredRole';
export const RequireRole = (role: UserRole | string) =>
  SetMetadata(REQUIRE_ROLE_KEY, role);
