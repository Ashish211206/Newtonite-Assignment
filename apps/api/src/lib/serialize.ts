import type { Prisma } from "@prisma/client";
import { formatWorkNumber } from "@opsflow/shared";

const userSelect = {
  id: true,
  name: true,
  email: true,
  avatar: true,
  globalRole: true,
} satisfies Prisma.UserSelect;

export function serializeUser(user: {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  globalRole?: string;
}) {
  return user;
}

export function serializeWorkItem(item: {
  id: string;
  number: number;
  title: string;
  description: string;
  status: string;
  priority: string;
  type: string;
  teamId: string;
  reporterId: string;
  assigneeId: string | null;
  dueDate: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  team?: { id: string; name: string };
  reporter?: { id: string; name: string; email: string; avatar: string | null };
  assignee?: { id: string; name: string; email: string; avatar: string | null } | null;
}) {
  return {
    id: item.id,
    number: item.number,
    key: formatWorkNumber(item.number),
    title: item.title,
    description: item.description,
    status: item.status,
    priority: item.priority,
    type: item.type,
    teamId: item.teamId,
    reporterId: item.reporterId,
    assigneeId: item.assigneeId,
    dueDate: item.dueDate?.toISOString() ?? null,
    version: item.version,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    team: item.team,
    reporter: item.reporter,
    assignee: item.assignee,
  };
}

export { userSelect };
