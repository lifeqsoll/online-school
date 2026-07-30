import { GlobalRole } from '@prisma/client';

export type JwtImpersonation = {
  impersonatorId: string;
  targetUserId: string;
};

export type AccessTokenPayload = {
  sub: string;
  globalRole: GlobalRole;
  jti: string;
  imp?: JwtImpersonation;
};
