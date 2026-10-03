import crypto from "crypto";
import type { RequestHandler } from "express";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";

export const captureIdempotencyKey: RequestHandler = (req, _res, next) => {
  const key = req.header("Idempotency-Key") ?? req.header("idempotency-key");
  if (key) req.idempotencyKey = key;
  next();
};

export function hashRequest(body: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(body ?? {})).digest("hex");
}

export async function findIdempotentResponse(userId: string, key: string, route: string, requestHash: string) {
  const existing = await prisma.idempotencyRecord.findUnique({
    where: { userId_key: { userId, key } },
  });
  if (!existing) return null;
  if (existing.route !== route || existing.requestHash !== requestHash) {
    throw AppError.validation("Idempotency key was reused with a different request payload");
  }
  return existing;
}

export async function storeIdempotentResponse(args: {
  userId: string;
  key: string;
  route: string;
  requestHash: string;
  responseStatus: number;
  responseBody: unknown;
}) {
  await prisma.idempotencyRecord.upsert({
    where: { userId_key: { userId: args.userId, key: args.key } },
    update: {
      responseStatus: args.responseStatus,
      responseBody: args.responseBody as object,
    },
    create: {
      userId: args.userId,
      key: args.key,
      route: args.route,
      requestHash: args.requestHash,
      responseStatus: args.responseStatus,
      responseBody: args.responseBody as object,
    },
  });
}
