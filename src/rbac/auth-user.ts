import { GlobalRole } from '@prisma/client';
import { JwtImpersonation } from '../auth/types/jwt-payload';

export type AuthUser = {
  id: string;
  realUserId: string;
  globalRole: GlobalRole;
  realGlobalRole: GlobalRole;
  jti: string;
  impersonation: JwtImpersonation | null;
};
