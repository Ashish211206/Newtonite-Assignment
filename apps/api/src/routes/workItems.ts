import { Router, type Request, type Response } from "express";
import {
  assignSchema,
  commentSchema,
  createWorkItemSchema,
  expectedVersionSchema,
  prioritySchema,
  statusSchema,
  updateWorkItemSchema,
  workItemListQuerySchema,
} from "@opsflow/shared";
import { asyncHandler } from "../middleware/errorHandler";
import { validate } from "../middleware/validate";
import { captureIdempotencyKey, findIdempotentResponse, hashRequest, storeIdempotentResponse } from "../middleware/idempotency";
import * as work from "../services/workItemService";

export const workItemRouter = Router();

workItemRouter.get(
  "/",
  validate(workItemListQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const data = await work.listWorkItems(req.user!, req.query as never);
    res.json({ data });
  }),
);

workItemRouter.post(
  "/",
  validate(createWorkItemSchema),
  asyncHandler(async (req, res) => {
    const data = await work.createWorkItem(req.user!, req.body);
    res.status(201).json({ data });
  }),
);

workItemRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = await work.getWorkItem(req.user!, req.params.id);
    res.json({ data });
  }),
);

workItemRouter.patch(
  "/:id",
  validate(updateWorkItemSchema),
  asyncHandler(async (req, res) => {
    const data = await work.updateWorkItem(req.user!, req.params.id, req.body);
    res.json({ data });
  }),
);

async function withIdempotency(
  req: Request,
  res: Response,
  route: string,
  handler: () => Promise<unknown>,
) {
  const key = req.idempotencyKey;
  const requestHash = hashRequest(req.body);
  if (key) {
    const existing = await findIdempotentResponse(req.user!.id, key, route, requestHash);
    if (existing) {
      res.status(existing.responseStatus).json(existing.responseBody);
      return;
    }
  }
  const data = await handler();
  const body = { data };
  if (key) {
    await storeIdempotentResponse({
      userId: req.user!.id,
      key,
      route,
      requestHash,
      responseStatus: 200,
      responseBody: body,
    });
  }
  res.json(body);
}

workItemRouter.post(
  "/:id/assign",
  captureIdempotencyKey,
  validate(assignSchema),
  asyncHandler(async (req, res) => {
    await withIdempotency(req as never, res, `POST /work-items/${req.params.id}/assign`, async () =>
      work.assignWorkItem(req.user!, req.params.id, req.body.assigneeId, req.body.expectedVersion),
    );
  }),
);

workItemRouter.post(
  "/:id/status",
  captureIdempotencyKey,
  validate(statusSchema),
  asyncHandler(async (req, res) => {
    await withIdempotency(req as never, res, `POST /work-items/${req.params.id}/status`, async () =>
      work.changeStatus(req.user!, req.params.id, req.body.status, req.body.expectedVersion),
    );
  }),
);

workItemRouter.post(
  "/:id/priority",
  validate(prioritySchema),
  asyncHandler(async (req, res) => {
    const data = await work.changePriority(req.user!, req.params.id, req.body.priority, req.body.expectedVersion);
    res.json({ data });
  }),
);

workItemRouter.post(
  "/:id/approve",
  captureIdempotencyKey,
  validate(expectedVersionSchema),
  asyncHandler(async (req, res) => {
    await withIdempotency(req as never, res, `POST /work-items/${req.params.id}/approve`, async () =>
      work.approveWorkItem(req.user!, req.params.id, req.body.expectedVersion),
    );
  }),
);

workItemRouter.post(
  "/:id/reject",
  validate(expectedVersionSchema),
  asyncHandler(async (req, res) => {
    const data = await work.rejectWorkItem(req.user!, req.params.id, req.body.expectedVersion);
    res.json({ data });
  }),
);

workItemRouter.post(
  "/:id/request-approval",
  validate(expectedVersionSchema),
  asyncHandler(async (req, res) => {
    const data = await work.requestApproval(req.user!, req.params.id, req.body.expectedVersion);
    res.json({ data });
  }),
);

workItemRouter.post(
  "/:id/reopen",
  validate(expectedVersionSchema),
  asyncHandler(async (req, res) => {
    const data = await work.changeStatus(req.user!, req.params.id, "OPEN", req.body.expectedVersion);
    res.json({ data });
  }),
);

workItemRouter.post(
  "/:id/close",
  validate(expectedVersionSchema),
  asyncHandler(async (req, res) => {
    const data = await work.changeStatus(req.user!, req.params.id, "CLOSED", req.body.expectedVersion);
    res.json({ data });
  }),
);

workItemRouter.get(
  "/:id/activity",
  asyncHandler(async (req, res) => {
    const data = await work.listActivity(req.user!, req.params.id);
    res.json({ data });
  }),
);

workItemRouter.get(
  "/:id/comments",
  asyncHandler(async (req, res) => {
    const data = await work.listComments(req.user!, req.params.id);
    res.json({ data });
  }),
);

workItemRouter.post(
  "/:id/comments",
  validate(commentSchema),
  asyncHandler(async (req, res) => {
    const data = await work.addComment(req.user!, req.params.id, req.body.body);
    res.status(201).json({ data });
  }),
);

workItemRouter.patch(
  "/:id/comments/:commentId",
  validate(commentSchema),
  asyncHandler(async (req, res) => {
    const data = await work.updateComment(req.user!, req.params.id, req.params.commentId, req.body.body);
    res.json({ data });
  }),
);

workItemRouter.delete(
  "/:id/comments/:commentId",
  asyncHandler(async (req, res) => {
    await work.deleteComment(req.user!, req.params.id, req.params.commentId);
    res.status(204).send();
  }),
);
