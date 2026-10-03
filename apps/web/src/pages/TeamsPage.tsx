import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { EmptyState, ErrorState, Skeleton } from "../components/ui/States";

type Team = {
  id: string;
  name: string;
  description: string | null;
  _count: { memberships: number; workItems: number };
};

export function TeamsPage() {
  const q = useQuery({ queryKey: ["teams"], queryFn: () => api<Team[]>("/api/teams") });
  if (q.isLoading) return <Skeleton className="h-40" />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  if (!q.data?.length) return <EmptyState title="No teams available" />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Teams</h1>
      <div className="grid gap-3 md:grid-cols-2">
        {q.data.map((team) => (
          <Link key={team.id} to={`/teams/${team.id}`} className="rounded-xl border border-white/10 bg-ink-900 p-5 hover:bg-white/5">
            <h2 className="text-lg font-medium">{team.name}</h2>
            <p className="mt-1 text-sm text-white/50">{team.description}</p>
            <p className="mt-3 text-xs text-white/40">
              {team._count.memberships} members · {team._count.workItems} work items
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
