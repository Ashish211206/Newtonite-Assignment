import type { RequestHandler } from "express";
import { ZodSchema } from "zod";

export const validate =
  (schema: ZodSchema, source: "body" | "query" = "body"): RequestHandler =>
  (req, _res, next) => {
    const parsed = schema.parse(source === "body" ? req.body : req.query);
    if (source === "query") {
      req.query = parsed as typeof req.query;
    } else {
      req.body = parsed;
    }
    next();
  };
