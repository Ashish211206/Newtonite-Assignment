import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Button } from "../components/ui/Button";
import { EmptyState, ErrorState, Skeleton } from "../components/ui/States";

type Notification = {
  id: string;
  title: string;
  message: string;
  workItemId: string | null;
  readAt: string | null;
  createdAt: string;
};

export function NotificationsPage() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<{ items: Notification[]; unread: number }>("/api/notifications"),
  });
  const readAll = useMutation({
    mutationFn: () => api("/api/notifications/read-all", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const readOne = useMutation({
    mutationFn: (id: string) => api(`/api/notifications/${id}/read`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
  if (q.isLoading) return <Skeleton className="h-40" />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Notifications</h1>
        <Button variant="secondary" size="sm" onClick={() => readAll.mutate()}>Mark all read</Button>
      </div>
      {q.data?.items.length === 0 ? <EmptyState title="No notifications" hint="Assignment, approval, and mention events appear here after the outbox worker processes them." /> : (
        <ul className="space-y-2">
          {q.data?.items.map((n) => (
            <li key={n.id} className={`rounded-xl border border-white/10 p-4 ${n.readAt ? "opacity-60" : "bg-ink-900"}`}>
              <div className="font-medium">{n.title}</div>
              <p className="text-sm text-white/60">{n.message}</p>
              <div className="mt-2 flex gap-3 text-xs text-white/40">
                <span>{formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}</span>
                {n.workItemId ? <Link className="text-accent-400" to={`/work/${n.workItemId}`}>Open item</Link> : null}
                {!n.readAt ? (
                  <button className="text-white" onClick={() => readOne.mutate(n.id)}>
                    Mark read
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
