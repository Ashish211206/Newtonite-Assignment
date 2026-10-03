import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../lib/api";
import { formatLabel } from "../lib/cn";
import type { WorkItem } from "../lib/types";
import { PriorityBadge, StatusBadge } from "../components/ui/Badge";
import { EmptyState, ErrorState, Skeleton } from "../components/ui/States";

type Dashboard = {
  summary: {
    openWork: number;
    criticalItems: number;
    overdueItems: number;
    unassignedItems: number;
    waitingApproval: number;
  };
  priorityBreakdown: { priority: string; count: number }[];
  statusBreakdown: { status: string; count: number }[];
  myWork: WorkItem[];
  needsAttention: WorkItem[];
};

export function DashboardPage() {
  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => api<Dashboard>("/api/dashboard/summary") });
  if (q.isLoading) {
    return <div className="grid gap-4 md:grid-cols-5">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>;
  }
  if (q.error) return <ErrorState message={q.error.message} onRetry={() => q.refetch()} />;
  const data = q.data!;
  const cards = [
    ["Open work", data.summary.openWork],
    ["Critical", data.summary.criticalItems],
    ["Overdue", data.summary.overdueItems],
    ["Unassigned", data.summary.unassignedItems],
    ["Waiting approval", data.summary.waitingApproval],
  ] as const;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Operations dashboard</h1>
        <p className="text-sm text-white/50">Aggregated from the database — this view never loads the full work catalog.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-white/10 bg-ink-900 p-4">
            <div className="text-xs uppercase tracking-wide text-white/45">{label}</div>
            <div className="mt-2 text-3xl font-semibold">{value}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Priority breakdown">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.priorityBreakdown.map((r) => ({ name: formatLabel(r.priority), count: r.count }))}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="name" stroke="#8aa" fontSize={12} />
              <YAxis stroke="#8aa" fontSize={12} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "#1c2a2b", border: "1px solid #334" }} />
              <Bar dataKey="count" fill="#12b890" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Work by status">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.statusBreakdown.map((r) => ({ name: formatLabel(r.status), count: r.count }))}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="name" stroke="#8aa" fontSize={11} />
              <YAxis stroke="#8aa" fontSize={12} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "#1c2a2b", border: "1px solid #334" }} />
              <Bar dataKey="count" fill="#67e8f9" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <WorkColumn title="My work" items={data.myWork} empty="Nothing assigned to you" />
        <WorkColumn title="Needs attention" items={data.needsAttention} empty="No blocked, overdue, or critical items" />
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-ink-900 p-4">
      <h2 className="mb-3 text-sm font-medium text-white/70">{title}</h2>
      {children}
    </div>
  );
}

function WorkColumn({ title, items, empty }: { title: string; items: WorkItem[]; empty: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-ink-900 p-4">
      <h2 className="mb-3 text-sm font-medium text-white/70">{title}</h2>
      {items.length === 0 ? <EmptyState title={empty} /> : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <Link to={`/work/${item.id}`} className="block rounded-lg border border-white/5 p-3 hover:bg-white/5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-accent-400">{item.key}</span>
                  <PriorityBadge priority={item.priority} />
                </div>
                <div className="mt-1 text-sm">{item.title}</div>
                <div className="mt-2"><StatusBadge status={item.status} /></div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
