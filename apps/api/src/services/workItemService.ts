import type { Prisma, WorkItemStatus } from "@prisma/client";
import {
  ALLOWED_STATUS_TRANSITIONS,
  parseWorkNumber,
  type WorkItemPriority,
} from "@opsflow/shared";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import type { AuthUser } from "../types/express";
import {
  accessibleTeamIds,
  assertCanApprove,
  assertCanAssign,
  assertCanChangePriority,
  assertCanCreateOnTeam,
  assertCanReopenClosed,
  assertCanUpdateWork,
  assertCanViewWorkItem,
  capabilities,
  canManageTeamWork,
} from "../policies/workItemPolicy";
import { serializeWorkItem, userSelect } from "../lib/serialize";

const workItemInclude = {
  team: { select: { id: true, name: true } },
  reporter: { select: userSelect },
  assignee: { select: userSelect },
} satisfies Prisma.WorkItemInclude;

type Tx = Prisma.TransactionClient;

async function writeAudit(
  tx: Tx,
  args: {
    workItemId: string;
    actorId: string;
    action: Prisma.AuditLogCreateInput["action"];
    metadata?: Prisma.InputJsonObject;
  },
) {
  await tx.auditLog.create({
    data: {
      workItemId: args.workItemId,
      actorId: args.actorId,
      action: args.action,
      entityType: "WorkItem",
      metadata: (args.metadata ?? {}) as Prisma.InputJsonObject,
    },
  });
}

async function writeOutbox(
  tx: Tx,
  type: string,
  payload: Prisma.InputJsonObject,
) {
  await tx.outboxEvent.create({
    data: { type, payload },
  });
}

async function loadItem(tx: Tx | typeof prisma, id: string) {
  const item = await tx.workItem.findUnique({ where: { id }, include: workItemInclude });
  if (!item) throw AppError.notFound("Work item not found");
  return item;
}

async function bumpVersion(
  tx: Tx,
  id: string,
  expectedVersion: number,
  data: Prisma.WorkItemUpdateManyMutationInput,
) {
  const result = await tx.workItem.updateMany({
    where: { id, version: expectedVersion },
    data: {
      ...data,
      version: { increment: 1 },
    },
  });
  if (result.count === 0) {
    const exists = await tx.workItem.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw AppError.notFound("Work item not found");
    throw AppError.versionConflict();
  }
}

export async function createWorkItem(user: AuthUser, input: {
  title: string;
  description: string;
  type: Prisma.WorkItemCreateInput["type"];
  priority: Prisma.WorkItemCreateInput["priority"];
  teamId: string;
  assigneeId?: string | null;
  dueDate?: string | null;
}) {
  assertCanCreateOnTeam(user, input.teamId);
  if (input.assigneeId) {
    const membership = await prisma.teamMembership.findUnique({
      where: { userId_teamId: { userId: input.assigneeId, teamId: input.teamId } },
    });
    if (!membership) throw AppError.validation("Assignee must belong to the selected team");
  }

  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.workItem.create({
      data: {
        title: input.title,
        description: input.description,
        type: input.type,
        priority: input.priority,
        teamId: input.teamId,
        reporterId: user.id,
        assigneeId: input.assigneeId ?? null,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
      },
      include: workItemInclude,
    });
    await writeAudit(tx, {
      workItemId: created.id,
      actorId: user.id,
      action: "CREATED",
      metadata: { title: created.title, status: created.status, priority: created.priority },
    });
    await writeOutbox(tx, "WORK_ITEM_CREATED", {
      workItemId: created.id,
      actorId: user.id,
      assigneeId: created.assigneeId,
      priority: created.priority,
    });
    if (created.assigneeId) {
      await writeAudit(tx, {
        workItemId: created.id,
        actorId: user.id,
        action: "ASSIGNED",
        metadata: { assigneeId: created.assigneeId },
      });
      await writeOutbox(tx, "WORK_ITEM_ASSIGNED", {
        workItemId: created.id,
        actorId: user.id,
        assigneeId: created.assigneeId,
        previousAssigneeId: null,
      });
    }
    return created;
  });

  return serializeWorkItem(item);
}

export async function listWorkItems(user: AuthUser, query: {
  page: number;
  pageSize: number;
  q?: string;
  status?: Prisma.WorkItemWhereInput["status"];
  priority?: Prisma.WorkItemWhereInput["priority"];
  type?: Prisma.WorkItemWhereInput["type"];
  teamId?: string;
  assigneeId?: string;
  unassigned?: string;
  due?: string;
  sort: "updatedAt" | "priority" | "dueDate" | "createdAt";
  order: "asc" | "desc";
  mine?: string;
}) {
  const teams = accessibleTeamIds(user);
  const where: Prisma.WorkItemWhereInput = {};
  if (teams) where.teamId = { in: teams };
  if (query.teamId) {
    if (teams && !teams.includes(query.teamId)) throw AppError.forbidden();
    where.teamId = query.teamId;
  }
  if (query.status) where.status = query.status;
  if (query.priority) where.priority = query.priority;
  if (query.type) where.type = query.type;
  if (query.mine === "true") where.assigneeId = user.id;
  if (query.assigneeId) where.assigneeId = query.assigneeId;
  if (query.unassigned === "true") where.assigneeId = null;

  const now = new Date();
  if (query.due === "overdue") {
    where.dueDate = { lt: now };
    where.status = where.status ?? { notIn: ["RESOLVED", "CLOSED"] };
  } else if (query.due === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    where.dueDate = { gte: start, lt: end };
  } else if (query.due === "upcoming") {
    where.dueDate = { gte: now };
  } else if (query.due === "none") {
    where.dueDate = null;
  }

  if (query.q?.trim()) {
    const q = query.q.trim();
    const number = parseWorkNumber(q);
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { team: { name: { contains: q, mode: "insensitive" } } },
      { assignee: { name: { contains: q, mode: "insensitive" } } },
      ...(number ? [{ number }] : []),
    ];
  }

  const orderBy: Prisma.WorkItemOrderByWithRelationInput =
    query.sort === "priority"
      ? { priority: query.order }
      : query.sort === "dueDate"
        ? { dueDate: query.order }
        : query.sort === "createdAt"
          ? { createdAt: query.order }
          : { updatedAt: query.order };

  const [total, items] = await prisma.$transaction([
    prisma.workItem.count({ where }),
    prisma.workItem.findMany({
      where,
      include: workItemInclude,
      orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  return {
    items: items.map(serializeWorkItem),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.ceil(total / query.pageSize),
  };
}

export async function getWorkItem(user: AuthUser, id: string) {
  const item = await loadItem(prisma, id);
  assertCanViewWorkItem(user, item);
  return {
    ...serializeWorkItem(item),
    capabilities: capabilities(user, item),
  };
}

export async function updateWorkItem(
  user: AuthUser,
  id: string,
  input: {
    expectedVersion: number;
    title?: string;
    description?: string;
    type?: Prisma.WorkItemUpdateInput["type"];
    teamId?: string;
    dueDate?: string | null;
  },
) {
  const item = await loadItem(prisma, id);
  assertCanUpdateWork(user, item);
  if (input.teamId && input.teamId !== item.teamId && !canManageTeamWork(user, item.teamId)) {
    throw AppError.forbidden("Only team leads can move work between teams");
  }

  const updated = await prisma.$transaction(async (tx) => {
    await bumpVersion(tx, id, input.expectedVersion, {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.teamId !== undefined ? { teamId: input.teamId } : {}),
      ...(input.dueDate !== undefined ? { dueDate: input.dueDate ? new Date(input.dueDate) : null } : {}),
    });

    if (input.title !== undefined && input.title !== item.title) {
      await writeAudit(tx, {
        workItemId: id,
        actorId: user.id,
        action: "UPDATED",
        metadata: { field: "title", oldValue: item.title, newValue: input.title },
      });
    }
    if (input.description !== undefined && input.description !== item.description) {
      await writeAudit(tx, {
        workItemId: id,
        actorId: user.id,
        action: "UPDATED",
        metadata: { field: "description" },
      });
    }
    if (input.teamId && input.teamId !== item.teamId) {
      await writeAudit(tx, {
        workItemId: id,
        actorId: user.id,
        action: "TEAM_CHANGED",
        metadata: { field: "teamId", oldValue: item.teamId, newValue: input.teamId },
      });
    }
    if (input.dueDate !== undefined) {
      const next = input.dueDate ? new Date(input.dueDate).toISOString() : null;
      const prev = item.dueDate?.toISOString() ?? null;
      if (next !== prev) {
        await writeAudit(tx, {
          workItemId: id,
          actorId: user.id,
          action: "DUE_DATE_CHANGED",
          metadata: { field: "dueDate", oldValue: prev, newValue: next },
        });
      }
    }

    await writeOutbox(tx, "WORK_ITEM_UPDATED", { workItemId: id, actorId: user.id });
    return loadItem(tx, id);
  });

  return serializeWorkItem(updated);
}

export async function assignWorkItem(
  user: AuthUser,
  id: string,
  assigneeId: string | null,
  expectedVersion: number,
) {
  const item = await loadItem(prisma, id);
  const claimingSelf = assigneeId === user.id;
  assertCanAssign(user, item.teamId, claimingSelf, item.assigneeId === null);

  if (assigneeId) {
    const membership = await prisma.teamMembership.findUnique({
      where: { userId_teamId: { userId: assigneeId, teamId: item.teamId } },
    });
    if (!membership) throw AppError.validation("Assignee must belong to the work item's team");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const where: Prisma.WorkItemWhereInput = { id, version: expectedVersion };
    if (item.assigneeId === null && assigneeId) {
      where.assigneeId = null;
    }

    const result = await tx.workItem.updateMany({
      where,
      data: {
        assigneeId,
        version: { increment: 1 },
      },
    });

    if (result.count === 0) {
      const current = await tx.workItem.findUnique({ where: { id } });
      if (!current) throw AppError.notFound("Work item not found");
      if (current.version !== expectedVersion) throw AppError.versionConflict();
      if (item.assigneeId === null && current.assigneeId) {
        throw AppError.assignmentConflict(
          "This work item was already assigned to another user. Refresh to see the latest assignment.",
        );
      }
      throw AppError.assignmentConflict("The assignment could not be completed because the item changed.");
    }

    await writeAudit(tx, {
      workItemId: id,
      actorId: user.id,
      action: assigneeId ? "ASSIGNED" : "UNASSIGNED",
      metadata: {
        field: "assigneeId",
        oldValue: item.assigneeId,
        newValue: assigneeId,
      },
    });
    await writeOutbox(tx, "WORK_ITEM_ASSIGNED", {
      workItemId: id,
      actorId: user.id,
      assigneeId,
      previousAssigneeId: item.assigneeId,
    });
    return loadItem(tx, id);
  });

  return serializeWorkItem(updated);
}

function assertTransition(from: WorkItemStatus, to: WorkItemStatus) {
  const allowed = ALLOWED_STATUS_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw AppError.workflow(`Cannot change status from ${from} to ${to}`, {
      from,
      to,
      allowed,
    });
  }
}

export async function changeStatus(
  user: AuthUser,
  id: string,
  status: WorkItemStatus,
  expectedVersion: number,
) {
  const item = await loadItem(prisma, id);
  assertCanUpdateWork(user, item);
  assertTransition(item.status, status);

  if (item.status === "CLOSED" && status === "OPEN") {
    assertCanReopenClosed(user, item.teamId);
  }
  if (item.status === "WAITING_FOR_APPROVAL" && status === "RESOLVED") {
    assertCanApprove(user, item.teamId);
  }
  if (status === "WAITING_FOR_APPROVAL") {
    // members and leads may request approval via status change
  }

  const action =
    status === "CLOSED"
      ? "CLOSED"
      : status === "OPEN" && item.status === "CLOSED"
        ? "REOPENED"
        : status === "WAITING_FOR_APPROVAL"
          ? "APPROVAL_REQUESTED"
          : "STATUS_CHANGED";

  const updated = await prisma.$transaction(async (tx) => {
    await bumpVersion(tx, id, expectedVersion, { status });
    await writeAudit(tx, {
      workItemId: id,
      actorId: user.id,
      action,
      metadata: { field: "status", oldValue: item.status, newValue: status },
    });
    await writeOutbox(tx, "WORK_ITEM_STATUS_CHANGED", {
      workItemId: id,
      actorId: user.id,
      oldValue: item.status,
      newValue: status,
    });
    return loadItem(tx, id);
  });

  return serializeWorkItem(updated);
}

export async function changePriority(
  user: AuthUser,
  id: string,
  priority: WorkItemPriority,
  expectedVersion: number,
) {
  const item = await loadItem(prisma, id);
  assertCanChangePriority(user, item.teamId);

  const updated = await prisma.$transaction(async (tx) => {
    await bumpVersion(tx, id, expectedVersion, { priority });
    await writeAudit(tx, {
      workItemId: id,
      actorId: user.id,
      action: "PRIORITY_CHANGED",
      metadata: { field: "priority", oldValue: item.priority, newValue: priority },
    });
    await writeOutbox(tx, "WORK_ITEM_PRIORITY_CHANGED", {
      workItemId: id,
      actorId: user.id,
      oldValue: item.priority,
      newValue: priority,
      assigneeId: item.assigneeId,
    });
    return loadItem(tx, id);
  });

  return serializeWorkItem(updated);
}

export async function requestApproval(user: AuthUser, id: string, expectedVersion: number) {
  return changeStatus(user, id, "WAITING_FOR_APPROVAL", expectedVersion);
}

export async function approveWorkItem(user: AuthUser, id: string, expectedVersion: number) {
  const item = await loadItem(prisma, id);
  assertCanApprove(user, item.teamId);
  if (item.status !== "WAITING_FOR_APPROVAL") {
    throw AppError.workflow("Only items waiting for approval can be approved", {
      status: item.status,
    });
  }

  const updated = await prisma.$transaction(async (tx) => {
    await bumpVersion(tx, id, expectedVersion, { status: "RESOLVED" });
    await writeAudit(tx, {
      workItemId: id,
      actorId: user.id,
      action: "APPROVED",
      metadata: { field: "status", oldValue: item.status, newValue: "RESOLVED" },
    });
    await writeOutbox(tx, "WORK_ITEM_APPROVED", {
      workItemId: id,
      actorId: user.id,
      reporterId: item.reporterId,
      assigneeId: item.assigneeId,
    });
    return loadItem(tx, id);
  });
  return serializeWorkItem(updated);
}

export async function rejectWorkItem(user: AuthUser, id: string, expectedVersion: number) {
  const item = await loadItem(prisma, id);
  assertCanApprove(user, item.teamId);
  if (item.status !== "WAITING_FOR_APPROVAL") {
    throw AppError.workflow("Only items waiting for approval can be rejected", {
      status: item.status,
    });
  }

  const updated = await prisma.$transaction(async (tx) => {
    await bumpVersion(tx, id, expectedVersion, { status: "IN_PROGRESS" });
    await writeAudit(tx, {
      workItemId: id,
      actorId: user.id,
      action: "REJECTED",
      metadata: { field: "status", oldValue: item.status, newValue: "IN_PROGRESS" },
    });
    await writeOutbox(tx, "WORK_ITEM_REJECTED", {
      workItemId: id,
      actorId: user.id,
      assigneeId: item.assigneeId,
    });
    return loadItem(tx, id);
  });
  return serializeWorkItem(updated);
}

export async function listActivity(user: AuthUser, id: string) {
  const item = await loadItem(prisma, id);
  assertCanViewWorkItem(user, item);
  const logs = await prisma.auditLog.findMany({
    where: { workItemId: id },
    include: { actor: { select: userSelect } },
    orderBy: { createdAt: "asc" },
  });
  return logs.map((log) => ({
    id: log.id,
    action: log.action,
    entityType: log.entityType,
    metadata: log.metadata,
    createdAt: log.createdAt.toISOString(),
    actor: log.actor,
  }));
}

export async function addComment(user: AuthUser, id: string, body: string) {
  const item = await loadItem(prisma, id);
  assertCanViewWorkItem(user, item);

  const comment = await prisma.$transaction(async (tx) => {
    const created = await tx.comment.create({
      data: { workItemId: id, authorId: user.id, body },
      include: { author: { select: userSelect } },
    });
    await writeAudit(tx, {
      workItemId: id,
      actorId: user.id,
      action: "COMMENT_ADDED",
      metadata: { commentId: created.id },
    });
    await writeOutbox(tx, "COMMENT_ADDED", {
      workItemId: id,
      actorId: user.id,
      commentId: created.id,
      body,
      assigneeId: item.assigneeId,
      reporterId: item.reporterId,
    });
    return created;
  });

  return {
    id: comment.id,
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
    author: comment.author,
  };
}

export async function listComments(user: AuthUser, id: string) {
  const item = await loadItem(prisma, id);
  assertCanViewWorkItem(user, item);
  const comments = await prisma.comment.findMany({
    where: { workItemId: id },
    include: { author: { select: userSelect } },
    orderBy: { createdAt: "asc" },
  });
  return comments.map((c) => ({
    id: c.id,
    body: c.body,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    author: c.author,
  }));
}

export async function updateComment(user: AuthUser, workItemId: string, commentId: string, body: string) {
  const item = await loadItem(prisma, workItemId);
  assertCanViewWorkItem(user, item);
  const comment = await prisma.comment.findFirst({ where: { id: commentId, workItemId } });
  if (!comment) throw AppError.notFound("Comment not found");
  if (comment.authorId !== user.id && user.globalRole !== "ADMIN") {
    throw AppError.forbidden("You can only edit your own comments");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.comment.update({
      where: { id: commentId },
      data: { body },
      include: { author: { select: userSelect } },
    });
    await writeAudit(tx, {
      workItemId,
      actorId: user.id,
      action: "COMMENT_EDITED",
      metadata: { commentId },
    });
    return next;
  });

  return {
    id: updated.id,
    body: updated.body,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
    author: updated.author,
  };
}

export async function deleteComment(user: AuthUser, workItemId: string, commentId: string) {
  const item = await loadItem(prisma, workItemId);
  assertCanViewWorkItem(user, item);
  const comment = await prisma.comment.findFirst({ where: { id: commentId, workItemId } });
  if (!comment) throw AppError.notFound("Comment not found");
  if (comment.authorId !== user.id && user.globalRole !== "ADMIN") {
    throw AppError.forbidden("You can only delete your own comments");
  }

  await prisma.$transaction(async (tx) => {
    await tx.comment.delete({ where: { id: commentId } });
    await writeAudit(tx, {
      workItemId,
      actorId: user.id,
      action: "COMMENT_DELETED",
      metadata: { commentId },
    });
  });
}

export async function getDashboard(user: AuthUser) {
  const teams = accessibleTeamIds(user);
  const scope: Prisma.WorkItemWhereInput = teams ? { teamId: { in: teams } } : {};
  const openStatuses: WorkItemStatus[] = ["OPEN", "IN_PROGRESS", "BLOCKED", "WAITING_FOR_APPROVAL"];
  const now = new Date();

  const [
    openWork,
    criticalItems,
    overdueItems,
    unassignedItems,
    waitingApproval,
    byPriority,
    byStatus,
    myWork,
    needsAttention,
  ] = await Promise.all([
    prisma.workItem.count({ where: { ...scope, status: { in: openStatuses } } }),
    prisma.workItem.count({ where: { ...scope, priority: "CRITICAL", status: { in: openStatuses } } }),
    prisma.workItem.count({
      where: { ...scope, dueDate: { lt: now }, status: { in: openStatuses } },
    }),
    prisma.workItem.count({ where: { ...scope, assigneeId: null, status: { in: openStatuses } } }),
    prisma.workItem.count({ where: { ...scope, status: "WAITING_FOR_APPROVAL" } }),
    prisma.workItem.groupBy({
      by: ["priority"],
      where: { ...scope, status: { in: openStatuses } },
      _count: { _all: true },
    }),
    prisma.workItem.groupBy({
      by: ["status"],
      where: scope,
      _count: { _all: true },
    }),
    prisma.workItem.findMany({
      where: { ...scope, assigneeId: user.id, status: { in: openStatuses } },
      include: workItemInclude,
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
      take: 8,
    }),
    prisma.workItem.findMany({
      where: {
        ...scope,
        status: { in: openStatuses },
        OR: [
          { priority: "CRITICAL" },
          { dueDate: { lt: now } },
          { status: "BLOCKED" },
          { status: "WAITING_FOR_APPROVAL" },
        ],
      },
      include: workItemInclude,
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
  ]);

  return {
    summary: {
      openWork,
      criticalItems,
      overdueItems,
      unassignedItems,
      waitingApproval,
    },
    priorityBreakdown: byPriority.map((row) => ({
      priority: row.priority,
      count: row._count._all,
    })),
    statusBreakdown: byStatus.map((row) => ({
      status: row.status,
      count: row._count._all,
    })),
    myWork: myWork.map(serializeWorkItem),
    needsAttention: needsAttention.map(serializeWorkItem),
  };
}

export async function listGlobalActivity(user: AuthUser, page = 1, pageSize = 30) {
  const teams = accessibleTeamIds(user);
  const where: Prisma.AuditLogWhereInput = teams
    ? { workItem: { teamId: { in: teams } } }
    : {};
  const [total, items] = await prisma.$transaction([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: {
        actor: { select: userSelect },
        workItem: { select: { id: true, number: true, title: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return {
    total,
    page,
    pageSize,
    items: items.map((log) => ({
      id: log.id,
      action: log.action,
      metadata: log.metadata,
      createdAt: log.createdAt.toISOString(),
      actor: log.actor,
      workItem: {
        id: log.workItem.id,
        key: `OPS-${String(log.workItem.number).padStart(4, "0")}`,
        title: log.workItem.title,
      },
    })),
  };
}
