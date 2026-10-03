import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Link, useSearchParams } from "react-router-dom";
import { WORK_ITEM_PRIORITIES, WORK_ITEM_STATUSES, WORK_ITEM_TYPES } from "@opsflow/shared";
import { api } from "../lib/api";
import type { Paged, WorkItem } from "../lib/types";
import { PriorityBadge, StatusBadge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Input, Select } from "../components/ui/Field";
import { EmptyState, ErrorState, Skeleton } from "../components/ui/States";

export function WorkListPage({ mine = false }: { mine?: boolean }) {
  const [params, setParams] = useSearchParams();
  const teams = useQuery({ queryKey: ["teams"], queryFn: () => api<Array<{ id: string; name: string }>>("/api/teams") });
  const users = useQuery({ queryKey: ["users"], queryFn: () => api<Array<{ id: string; name: string }>>("/api/users") });

  const query = new URLSearchParams(params);
  if (mine) query.set("mine", "true");
  const list = useQuery({
    queryKey: ["work-items", query.toString()],
    queryFn: () => api<Paged<WorkItem>>(`/api/work-items?${query.toString()}`),
  });

  function set(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.set("page", "1");
    setParams(next);
  }

  const page = Number(params.get("page") ?? 1);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{mine ? "My work" : "All work"}</h1>
        <p className="text-sm text-white/50">Server-side search, filters, sort, and pagination. Filters persist in the URL.</p>
      </div>
      <div className="grid gap-2 md:grid-cols-4 xl:grid-cols-8">
        <Input
          defaultValue={params.get("q") ?? ""}
          placeholder="Search"
          onChange={(e) => set("q", e.target.value)}
        />
        <Select value={params.get("status") ?? ""} onChange={(e) => set("status", e.target.value)}>
          <option value="">All statuses</option>
          {WORK_ITEM_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Select value={params.get("priority") ?? ""} onChange={(e) => set("priority", e.target.value)}>
          <option value="">All priorities</option>
          {WORK_ITEM_PRIORITIES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Select value={params.get("type") ?? ""} onChange={(e) => set("type", e.target.value)}>
          <option value="">All types</option>
          {WORK_ITEM_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Select value={params.get("teamId") ?? ""} onChange={(e) => set("teamId", e.target.value)}>
          <option value="">All teams</option>
          {(teams.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
        <Select value={params.get("assigneeId") ?? ""} onChange={(e) => set("assigneeId", e.target.value)}>
          <option value="">All assignees</option>
          {(users.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </Select>
        <Select value={params.get("due") ?? ""} onChange={(e) => set("due", e.target.value)}>
          <option value="">Any due date</option>
          <option value="overdue">Overdue</option>
          <option value="today">Today</option>
          <option value="upcoming">Upcoming</option>
          <option value="none">No due date</option>
        </Select>
        <Select value={`${params.get("sort") ?? "updatedAt"}:${params.get("order") ?? "desc"}`} onChange={(e) => {
          const [sort, order] = e.target.value.split(":");
          const next = new URLSearchParams(params);
          next.set("sort", sort);
          next.set("order", order);
          setParams(next);
        }}>
          <option value="updatedAt:desc">Updated ↓</option>
          <option value="updatedAt:asc">Updated ↑</option>
          <option value="priority:desc">Priority ↓</option>
          <option value="dueDate:asc">Due date ↑</option>
          <option value="dueDate:desc">Due date ↓</option>
        </Select>
      </div>
      <Button variant="ghost" onClick={() => setParams(mine ? new URLSearchParams({ mine: "true" }) : new URLSearchParams())}>
        Clear filters
      </Button>
      {list.isLoading ? <Skeleton className="h-64" /> : null}
      {list.error ? <ErrorState message={list.error.message} onRetry={() => list.refetch()} /> : null}
      {list.data && list.data.items.length === 0 ? <EmptyState title="No work items match these filters" /> : null}
      {list.data && list.data.items.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-white/5 text-xs uppercase tracking-wide text-white/45">
              <tr>
                {["ID", "Title", "Type", "Status", "Priority", "Team", "Assignee", "Due", "Updated", ""].map((h) => (
                  <th key={h} className="px-3 py-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((item) => (
                <tr key={item.id} className="border-t border-white/5 hover:bg-white/5">
                  <td className="px-3 py-2 font-mono text-xs text-accent-400">{item.key}</td>
                  <td className="px-3 py-2">
                    <Link className="hover:underline" to={`/work/${item.id}`}>{item.title}</Link>
                  </td>
                  <td className="px-3 py-2 text-white/60">{item.type}</td>
                  <td className="px-3 py-2"><StatusBadge status={item.status} /></td>
                  <td className="px-3 py-2"><PriorityBadge priority={item.priority} /></td>
                  <td className="px-3 py-2">{item.team?.name}</td>
                  <td className="px-3 py-2">{item.assignee?.name ?? "Unassigned"}</td>
                  <td className="px-3 py-2 text-white/60">{item.dueDate ? new Date(item.dueDate).toLocaleDateString() : "—"}</td>
                  <td className="px-3 py-2 text-white/60">{formatDistanceToNow(new Date(item.updatedAt), { addSuffix: true })}</td>
                  <td className="px-3 py-2"><Link className="text-accent-400" to={`/work/${item.id}`}>Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {list.data ? (
        <div className="flex items-center justify-between text-sm text-white/60">
          <span>{list.data.total} items</span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => set("page", String(page - 1))}>Previous</Button>
            <Button variant="secondary" size="sm" disabled={page >= list.data.totalPages} onClick={() => {
              const next = new URLSearchParams(params);
              next.set("page", String(page + 1));
              setParams(next);
            }}>Next</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
