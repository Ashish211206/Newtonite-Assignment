import type { GlobalRole, TeamRole } from "@prisma/client";

export type AuthMembership = {
  teamId: string;
  role: TeamRole;
};

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  globalRole: GlobalRole;
  memberships: AuthMembership[];
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      idempotencyKey?: string;
    }
  }
}

export {};
