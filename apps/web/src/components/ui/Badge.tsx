import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { formatLabel } from "../../lib/cn";

const statusClass: Record<string, string> = {
  OPEN: "bg-sky-500/15 text-sky-300",
  IN_PROGRESS: "bg-accent-500/15 text-accent-400",
  BLOCKED: "bg-orange-500/15 text-orange-300",
  WAITING_FOR_APPROVAL: "bg-violet-500/15 text-violet-300",
  RESOLVED: "bg-emerald-500/15 text-emerald-300",
  CLOSED: "bg-white/10 text-white/60",
};

const priorityClass: Record<string, string> = {
  LOW: "bg-white/10 text-white/70",
  MEDIUM: "bg-sky-500/15 text-sky-300",
  HIGH: "bg-amber-500/15 text-amber-300",
  CRITICAL: "bg-red-500/15 text-red-300",
};

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", className)}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge className={statusClass[status] ?? "bg-white/10"}>{formatLabel(status)}</Badge>;
}

export function PriorityBadge({ priority }: { priority: string }) {
  return <Badge className={priorityClass[priority] ?? "bg-white/10"}>{formatLabel(priority)}</Badge>;
}
