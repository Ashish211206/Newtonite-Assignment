import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { config } from "./lib/config";
import { errorHandler } from "./middleware/errorHandler";
import { requireAuth } from "./middleware/auth";
import { authRouter } from "./routes/auth";
import { workItemRouter } from "./routes/workItems";
import { catalogRouter } from "./routes/catalog";

export function createApp() {
  const app = express();
  app.use(cors({ origin: config.clientOrigin, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "opsflow-api" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/work-items", requireAuth, workItemRouter);
  app.use("/api", requireAuth, catalogRouter);

  app.use(errorHandler);
  return app;
}
