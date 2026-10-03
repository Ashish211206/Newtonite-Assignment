import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";
import { config } from "../lib/config";
import { AppError } from "../lib/errors";
import type { AuthUser } from "../types/express";

export function signToken(userId: string) {
  return jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: config.jwtExpiresIn } as jwt.SignOptions);
}

export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const header = req.headers.authorization;
    const bearer = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    const token = bearer ?? req.cookies?.opsflow_token;
    if (!token) throw AppError.unauthorized();

    const payload = jwt.verify(token, config.jwtSecret) as { sub: string };
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: { memberships: { select: { teamId: true, role: true } } },
    });
    if (!user) throw AppError.unauthorized("Session is no longer valid");

    const authUser: AuthUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      globalRole: user.globalRole,
      memberships: user.memberships,
    };
    req.user = authUser;
    next();
  } catch (err) {
    next(err instanceof AppError ? err : AppError.unauthorized("Invalid or expired session"));
  }
};
