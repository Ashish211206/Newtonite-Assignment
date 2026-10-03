import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { formatLabel } from "../lib/cn";
import { EmptyState, ErrorState, Skeleton } from "../components/ui/States";

type Row = {
  id: string;
  action: string;
  createdAt: string;
  actor: { name: string };
  workItem: { id: string; key: string; title: string };
};

export function ActivityPage() {
  const q = useQuery({
    queryKey: ["global-activity"],
    queryFn: () => api<{ items: Row[] }>("/api/activity"),
  });
  if (q.isLoading) return <Skeleton className="h-40" />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  if (!q.data?.items.length) return <EmptyState title="No activity yet" />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Activity</h1>
      <ul className="space-y-2">
        {q.data.items.map((row) => (
          <li key={row.id} className="rounded-xl border border-white/10 bg-ink-900 p-4 text-sm">
            <Link to={`/work/${row.workItem.id}`} className="font-mono text-accent-400">{row.workItem.key}</Link>
            <span className="text-white/70"> · {row.actor.name} {formatLabel(row.action).toLowerCase()} · {row.workItem.title}</span>
            <div className="text-xs text-white/40">{formatDistanceToNow(new Date(row.createdAt), { addSuffix: true })}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
