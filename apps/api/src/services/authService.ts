import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { signToken } from "../middleware/auth";
import { config } from "../lib/config";
import type { Response } from "express";

const COOKIE = "opsflow_token";

export function setAuthCookie(res: Response, token: string) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.cookieSecure,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(COOKIE, { path: "/" });
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { memberships: { include: { team: true } } },
  });
  if (!user) throw AppError.unauthorized("Invalid email or password");
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw AppError.unauthorized("Invalid email or password");
  const token = signToken(user.id);
  return { token, user: publicUser(user) };
}

export function publicUser(user: {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  globalRole: string;
  memberships?: { teamId: string; role: string; team?: { id: string; name: string } }[];
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    globalRole: user.globalRole,
    memberships: user.memberships?.map((m) => ({
      teamId: m.teamId,
      role: m.role,
      team: m.team,
    })),
  };
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { memberships: { include: { team: { select: { id: true, name: true } } } } },
  });
  if (!user) throw AppError.unauthorized();
  return publicUser(user);
}
