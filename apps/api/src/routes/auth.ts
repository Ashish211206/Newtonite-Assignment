import { Router } from "express";
import { loginSchema } from "@opsflow/shared";
import { asyncHandler } from "../middleware/errorHandler";
import { validate } from "../middleware/validate";
import { requireAuth } from "../middleware/auth";
import { clearAuthCookie, getMe, login, setAuthCookie } from "../services/authService";

export const authRouter = Router();

authRouter.post(
  "/login",
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const result = await login(req.body.email, req.body.password);
    setAuthCookie(res, result.token);
    res.json({ data: result });
  }),
);

authRouter.post(
  "/logout",
  asyncHandler(async (_req, res) => {
    clearAuthCookie(res);
    res.json({ data: { ok: true } });
  }),
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await getMe(req.user!.id);
    res.json({ data: user });
  }),
);
