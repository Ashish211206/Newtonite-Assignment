import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import type { AuthUser } from "../types/express";
import { accessibleTeamIds, assertCanViewTeam, isPlatformAdmin } from "../policies/workItemPolicy";
import { userSelect } from "../lib/serialize";

export async function listUsers(user: AuthUser, teamId?: string) {
  if (teamId) {
    assertCanViewTeam(user, teamId);
    const members = await prisma.teamMembership.findMany({
      where: { teamId },
      include: { user: { select: userSelect } },
    });
    return members.map((m) => ({ ...m.user, teamRole: m.role }));
  }
  const teams = accessibleTeamIds(user);
  const memberships = await prisma.teamMembership.findMany({
    where: teams ? { teamId: { in: teams } } : undefined,
    include: { user: { select: userSelect } },
  });
  const map = new Map<string, (typeof memberships)[number]["user"]>();
  for (const m of memberships) map.set(m.user.id, m.user);
  if (isPlatformAdmin(user)) {
    const all = await prisma.user.findMany({ select: userSelect, orderBy: { name: "asc" } });
    return all;
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function listTeams(user: AuthUser) {
  if (isPlatformAdmin(user)) {
    return prisma.team.findMany({
      include: { _count: { select: { memberships: true, workItems: true } } },
      orderBy: { name: "asc" },
    });
  }
  const ids = accessibleTeamIds(user) ?? [];
  return prisma.team.findMany({
    where: { id: { in: ids } },
    include: { _count: { select: { memberships: true, workItems: true } } },
    orderBy: { name: "asc" },
  });
}

export async function getTeam(user: AuthUser, id: string) {
  assertCanViewTeam(user, id);
  const team = await prisma.team.findUnique({
    where: { id },
    include: {
      memberships: {
        include: { user: { select: userSelect } },
      },
    },
  });
  if (!team) throw AppError.notFound("Team not found");
  return team;
}

export async function listNotifications(user: AuthUser) {
  const items = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const unread = await prisma.notification.count({
    where: { userId: user.id, readAt: null },
  });
  return { items, unread };
}

export async function markNotificationRead(user: AuthUser, id: string) {
  const n = await prisma.notification.findFirst({ where: { id, userId: user.id } });
  if (!n) throw AppError.notFound("Notification not found");
  return prisma.notification.update({
    where: { id },
    data: { readAt: new Date() },
  });
}

export async function markAllNotificationsRead(user: AuthUser) {
  await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
}
