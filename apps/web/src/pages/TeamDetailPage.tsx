import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { ErrorState, Skeleton } from "../components/ui/States";

type Team = {
  id: string;
  name: string;
  description: string | null;
  memberships: { id: string; role: string; user: { id: string; name: string; email: string; avatar: string | null } }[];
};

export function TeamDetailPage() {
  const { id } = useParams();
  const q = useQuery({ queryKey: ["team", id], queryFn: () => api<Team>(`/api/teams/${id}`) });
  if (q.isLoading) return <Skeleton className="h-40" />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  const team = q.data!;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{team.name}</h1>
      <p className="text-white/50">{team.description}</p>
      <div className="overflow-hidden rounded-xl border border-white/10">
        <table className="min-w-full text-sm">
          <thead className="bg-white/5 text-xs uppercase text-white/45">
            <tr>
              <th className="px-3 py-2 text-left">Member</th>
              <th className="px-3 py-2 text-left">Email</th>
              <th className="px-3 py-2 text-left">Role</th>
            </tr>
          </thead>
          <tbody>
            {team.memberships.map((m) => (
              <tr key={m.id} className="border-t border-white/5">
                <td className="px-3 py-2">{m.user.name}</td>
                <td className="px-3 py-2 text-white/60">{m.user.email}</td>
                <td className="px-3 py-2">{m.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Link className="text-sm text-accent-400" to={`/work?teamId=${team.id}`}>View team work</Link>
    </div>
  );
}
