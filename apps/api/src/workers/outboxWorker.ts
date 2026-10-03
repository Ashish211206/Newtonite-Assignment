import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";

type Payload = Record<string, unknown>;

function asString(value: unknown) {
  return typeof value === "string" ? value : null;
}

async function createNotification(args: {
  userId: string;
  type: string;
  title: string;
  message: string;
  workItemId?: string | null;
  sourceEventId: string;
}) {
  try {
    await prisma.notification.create({
      data: {
        userId: args.userId,
        type: args.type,
        title: args.title,
        message: args.message,
        workItemId: args.workItemId ?? null,
        sourceEventId: args.sourceEventId,
      },
    });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "P2002") return;
    throw err;
  }
}

async function uniqueSource(eventId: string, suffix: string) {
  return `${eventId}:${suffix}`;
}

async function processEvent(event: { id: string; type: string; payload: Prisma.JsonValue }) {
  const payload = (event.payload ?? {}) as Payload;
  const workItemId = asString(payload.workItemId);
  const actorId = asString(payload.actorId);

  if (event.type === "WORK_ITEM_ASSIGNED") {
    const assigneeId = asString(payload.assigneeId);
    const previous = asString(payload.previousAssigneeId);
    if (assigneeId && assigneeId !== actorId) {
      await createNotification({
        userId: assigneeId,
        type: "ASSIGNED",
        title: "Work assigned to you",
        message: "A work item was assigned to you.",
        workItemId,
        sourceEventId: await uniqueSource(event.id, "assignee"),
      });
    }
    if (previous && previous !== assigneeId && previous !== actorId) {
      await createNotification({
        userId: previous,
        type: "UNASSIGNED",
        title: "Work reassigned",
        message: "A work item previously assigned to you was reassigned.",
        workItemId,
        sourceEventId: await uniqueSource(event.id, "previous"),
      });
    }
    return;
  }

  if (event.type === "WORK_ITEM_PRIORITY_CHANGED" && payload.newValue === "CRITICAL") {
    const assigneeId = asString(payload.assigneeId);
    if (assigneeId && assigneeId !== actorId) {
      await createNotification({
        userId: assigneeId,
        type: "PRIORITY_CRITICAL",
        title: "Priority raised to Critical",
        message: "A work item assigned to you is now Critical.",
        workItemId,
        sourceEventId: await uniqueSource(event.id, "critical"),
      });
    }
    return;
  }

  if (event.type === "WORK_ITEM_STATUS_CHANGED" && payload.newValue === "WAITING_FOR_APPROVAL" && workItemId) {
    const item = await prisma.workItem.findUnique({
      where: { id: workItemId },
      select: { teamId: true },
    });
    if (!item) return;
    const leads = await prisma.teamMembership.findMany({
      where: { teamId: item.teamId, role: { in: ["TEAM_LEAD", "ADMIN"] } },
    });
    for (const lead of leads) {
      if (lead.userId === actorId) continue;
      await createNotification({
        userId: lead.userId,
        type: "APPROVAL_REQUESTED",
        title: "Approval requested",
        message: "A work item is waiting for your approval.",
        workItemId,
        sourceEventId: await uniqueSource(event.id, lead.userId),
      });
    }
    return;
  }

  if (event.type === "WORK_ITEM_APPROVED") {
    const assigneeId = asString(payload.assigneeId);
    const reporterId = asString(payload.reporterId);
    for (const uid of [assigneeId, reporterId]) {
      if (!uid || uid === actorId) continue;
      await createNotification({
        userId: uid,
        type: "APPROVED",
        title: "Work approved",
        message: "A work item was approved and marked resolved.",
        workItemId,
        sourceEventId: await uniqueSource(event.id, uid),
      });
    }
    return;
  }

  if (event.type === "COMMENT_ADDED") {
    const body = asString(payload.body) ?? "";
    const assigneeId = asString(payload.assigneeId);
    const reporterId = asString(payload.reporterId);
    const recipients = new Set<string>();
    if (assigneeId) recipients.add(assigneeId);
    if (reporterId) recipients.add(reporterId);

    const users = await prisma.user.findMany({ select: { id: true, name: true } });
    for (const u of users) {
      const mention = `@${u.name.split(" ")[0]}`;
      if (body.toLowerCase().includes(mention.toLowerCase())) recipients.add(u.id);
    }
    recipients.delete(actorId ?? "");
    for (const uid of recipients) {
      await createNotification({
        userId: uid,
        type: "COMMENT",
        title: "New comment",
        message: "There is a new comment on a work item you follow.",
        workItemId,
        sourceEventId: await uniqueSource(event.id, uid),
      });
    }
  }
}

export async function processOutboxBatch(limit = 20) {
  return claimAndProcess(limit);
}

async function claimAndProcess(limit: number) {
  const claimed = await prisma.$transaction(async (tx) => {
    const pending = await tx.outboxEvent.findMany({
      where: {
        status: { in: ["PENDING", "FAILED"] },
        availableAt: { lte: new Date() },
      },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
    const ids = pending.map((e) => e.id);
    if (ids.length === 0) return [];
    await tx.outboxEvent.updateMany({
      where: { id: { in: ids }, status: { in: ["PENDING", "FAILED"] } },
      data: { status: "PROCESSING", attempts: { increment: 1 } },
    });
    return pending;
  });

  for (const event of claimed) {
    try {
      await processEvent(event);
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: { status: "PROCESSED", processedAt: new Date(), lastError: null },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      const attempts = event.attempts + 1;
      const delayMs = Math.min(60_000, 1000 * 2 ** attempts);
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: attempts >= 8 ? "FAILED" : "FAILED",
          lastError: message,
          availableAt: new Date(Date.now() + delayMs),
        },
      });
      logger.error({ err, eventId: event.id }, "Outbox event processing failed");
    }
  }

  return claimed.length;
}

export function startOutboxWorker(intervalMs = 1500) {
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try {
      await processOutboxBatch();
    } catch (err) {
      logger.error({ err }, "Outbox worker tick failed");
    } finally {
      if (!stopped) setTimeout(tick, intervalMs);
    }
  };
  void tick();
  return () => {
    stopped = true;
  };
}

export { processEvent };
