import type { AuthUser } from "../types/express";
import type { WorkItem } from "@prisma/client";
import { AppError } from "../lib/errors";

export function isPlatformAdmin(user: AuthUser) {
  return user.globalRole === "ADMIN" || user.memberships.some((m) => m.role === "ADMIN");
}

export function teamRole(user: AuthUser, teamId: string) {
  if (isPlatformAdmin(user)) return "ADMIN" as const;
  return user.memberships.find((m) => m.teamId === teamId)?.role ?? null;
}

export function accessibleTeamIds(user: AuthUser) {
  if (isPlatformAdmin(user)) return null;
  return user.memberships.map((m) => m.teamId);
}

export function assertCanViewTeam(user: AuthUser, teamId: string) {
  if (!teamRole(user, teamId)) {
    throw AppError.forbidden("You do not have access to this team");
  }
}

export function assertCanViewWorkItem(user: AuthUser, item: Pick<WorkItem, "teamId">) {
  assertCanViewTeam(user, item.teamId);
}

export function canManageTeamWork(user: AuthUser, teamId: string) {
  const role = teamRole(user, teamId);
  return role === "ADMIN" || role === "TEAM_LEAD";
}

export function canUpdateAssignedWork(user: AuthUser, item: Pick<WorkItem, "teamId" | "assigneeId">) {
  if (canManageTeamWork(user, item.teamId)) return true;
  return teamRole(user, item.teamId) === "MEMBER" && item.assigneeId === user.id;
}

export function assertCanUpdateWork(user: AuthUser, item: Pick<WorkItem, "teamId" | "assigneeId">) {
  if (!canUpdateAssignedWork(user, item)) {
    throw AppError.forbidden("You cannot update this work item");
  }
}

export function assertCanAssign(user: AuthUser, teamId: string, claimingSelf: boolean, currentlyUnassigned: boolean) {
  if (canManageTeamWork(user, teamId)) return;
  if (claimingSelf && currentlyUnassigned && teamRole(user, teamId) === "MEMBER") return;
  throw AppError.forbidden("You cannot assign this work item");
}

export function assertCanChangePriority(user: AuthUser, teamId: string) {
  if (!canManageTeamWork(user, teamId)) {
    throw AppError.forbidden("Only team leads and admins can change priority");
  }
}

export function assertCanApprove(user: AuthUser, teamId: string) {
  if (!canManageTeamWork(user, teamId)) {
    throw AppError.forbidden("Only team leads and admins can approve work");
  }
}

export function assertCanReopenClosed(user: AuthUser, teamId: string) {
  if (!canManageTeamWork(user, teamId)) {
    throw AppError.forbidden("Only team leads and admins can reopen closed work");
  }
}

export function assertCanCreateOnTeam(user: AuthUser, teamId: string) {
  if (!teamRole(user, teamId)) {
    throw AppError.forbidden("You cannot create work on this team");
  }
}

export function capabilities(user: AuthUser, item: Pick<WorkItem, "teamId" | "assigneeId" | "status">) {
  const manage = canManageTeamWork(user, item.teamId);
  const assigned = item.assigneeId === user.id;
  const member = Boolean(teamRole(user, item.teamId));
  return {
    canView: member || isPlatformAdmin(user),
    canEdit: manage || assigned,
    canAssign: manage || (!item.assigneeId && member),
    canChangePriority: manage,
    canChangeStatus: manage || assigned,
    canRequestApproval: manage || assigned,
    canApprove: manage,
    canClose: manage || assigned,
    canReopen: manage,
    canComment: member || isPlatformAdmin(user),
  };
}
