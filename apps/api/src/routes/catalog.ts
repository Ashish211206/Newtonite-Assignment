import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import * as catalog from "../services/catalogService";
import * as work from "../services/workItemService";

export const catalogRouter = Router();

catalogRouter.get(
  "/users",
  asyncHandler(async (req, res) => {
    const data = await catalog.listUsers(req.user!, req.query.teamId as string | undefined);
    res.json({ data });
  }),
);

catalogRouter.get(
  "/teams",
  asyncHandler(async (req, res) => {
    const data = await catalog.listTeams(req.user!);
    res.json({ data });
  }),
);

catalogRouter.get(
  "/teams/:id",
  asyncHandler(async (req, res) => {
    const data = await catalog.getTeam(req.user!, req.params.id);
    res.json({ data });
  }),
);

catalogRouter.get(
  "/teams/:id/members",
  asyncHandler(async (req, res) => {
    const data = await catalog.listUsers(req.user!, req.params.id);
    res.json({ data });
  }),
);

catalogRouter.get(
  "/notifications",
  asyncHandler(async (req, res) => {
    const data = await catalog.listNotifications(req.user!);
    res.json({ data });
  }),
);

catalogRouter.post(
  "/notifications/read-all",
  asyncHandler(async (req, res) => {
    await catalog.markAllNotificationsRead(req.user!);
    res.json({ data: { ok: true } });
  }),
);

catalogRouter.post(
  "/notifications/:id/read",
  asyncHandler(async (req, res) => {
    const data = await catalog.markNotificationRead(req.user!, req.params.id);
    res.json({ data });
  }),
);

catalogRouter.get(
  "/dashboard/summary",
  asyncHandler(async (req, res) => {
    const data = await work.getDashboard(req.user!);
    res.json({ data });
  }),
);

catalogRouter.get(
  "/activity",
  asyncHandler(async (req, res) => {
    const page = Number(req.query.page ?? 1);
    const data = await work.listGlobalActivity(req.user!, page);
    res.json({ data });
  }),
);
