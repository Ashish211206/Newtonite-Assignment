import { z } from "zod";

export const WORK_ITEM_TYPES = [
  "CUSTOMER_ISSUE",
  "ENGINEERING",
  "PAYMENT",
  "INCIDENT",
  "COMPLIANCE",
  "OPERATIONS",
] as const;

export const WORK_ITEM_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "BLOCKED",
  "WAITING_FOR_APPROVAL",
  "RESOLVED",
  "CLOSED",
] as const;

export const WORK_ITEM_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

export const TEAM_ROLES = ["MEMBER", "TEAM_LEAD", "ADMIN"] as const;

export type WorkItemType = (typeof WORK_ITEM_TYPES)[number];
export type WorkItemStatus = (typeof WORK_ITEM_STATUSES)[number];
export type WorkItemPriority = (typeof WORK_ITEM_PRIORITIES)[number];
export type TeamRole = (typeof TEAM_ROLES)[number];

export const ALLOWED_STATUS_TRANSITIONS: Record<WorkItemStatus, WorkItemStatus[]> = {
  OPEN: ["IN_PROGRESS", "WAITING_FOR_APPROVAL", "BLOCKED"],
  IN_PROGRESS: ["BLOCKED", "WAITING_FOR_APPROVAL", "RESOLVED", "OPEN"],
  BLOCKED: ["IN_PROGRESS", "WAITING_FOR_APPROVAL"],
  WAITING_FOR_APPROVAL: ["IN_PROGRESS", "RESOLVED"],
  RESOLVED: ["CLOSED", "OPEN"],
  CLOSED: ["OPEN"],
};

export const ERROR_CODES = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  VERSION_CONFLICT: "VERSION_CONFLICT",
  INVALID_WORKFLOW: "INVALID_WORKFLOW",
  DUPLICATE_OPERATION: "DUPLICATE_OPERATION",
  ASSIGNMENT_CONFLICT: "ASSIGNMENT_CONFLICT",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const workItemListQuerySchema = paginationSchema.extend({
  q: z.string().optional(),
  status: z.enum(WORK_ITEM_STATUSES).optional(),
  priority: z.enum(WORK_ITEM_PRIORITIES).optional(),
  type: z.enum(WORK_ITEM_TYPES).optional(),
  teamId: z.string().optional(),
  assigneeId: z.string().optional(),
  unassigned: z.enum(["true", "false"]).optional(),
  due: z.enum(["overdue", "today", "upcoming", "none"]).optional(),
  sort: z.enum(["updatedAt", "priority", "dueDate", "createdAt"]).default("updatedAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
  mine: z.enum(["true", "false"]).optional(),
});

export const createWorkItemSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(20_000).default(""),
  type: z.enum(WORK_ITEM_TYPES),
  priority: z.enum(WORK_ITEM_PRIORITIES).default("MEDIUM"),
  teamId: z.string().min(1),
  assigneeId: z.string().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
});

export const updateWorkItemSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  description: z.string().max(20_000).optional(),
  type: z.enum(WORK_ITEM_TYPES).optional(),
  teamId: z.string().min(1).optional(),
  dueDate: z.string().datetime().nullable().optional(),
  expectedVersion: z.number().int().min(1),
});

export const expectedVersionSchema = z.object({
  expectedVersion: z.number().int().min(1),
});

export const assignSchema = expectedVersionSchema.extend({
  assigneeId: z.string().nullable(),
});

export const statusSchema = expectedVersionSchema.extend({
  status: z.enum(WORK_ITEM_STATUSES),
});

export const prioritySchema = expectedVersionSchema.extend({
  priority: z.enum(WORK_ITEM_PRIORITIES),
});

export const commentSchema = z.object({
  body: z.string().min(1).max(8000),
});

export function formatWorkNumber(number: number): string {
  return `OPS-${String(number).padStart(4, "0")}`;
}

export function parseWorkNumber(input: string): number | null {
  const trimmed = input.trim();
  const match = /^OPS-?(\d+)$/i.exec(trimmed);
  if (match) return Number(match[1]);
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  return null;
}

export const PRIORITY_RANK: Record<WorkItemPriority, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};
