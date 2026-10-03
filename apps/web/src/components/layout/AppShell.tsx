import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Bell,
  LayoutDashboard,
  Menu,
  Plus,
  Search,
  Settings,
  Users,
  ClipboardList,
  ListTodo,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { cn } from "../../lib/cn";
import { useUiStore } from "../../stores/ui";
import { Button } from "../ui/Button";
import { Input, Label, Select, Textarea } from "../ui/Field";
import { useMe } from "./Protected";
import { WORK_ITEM_PRIORITIES, WORK_ITEM_TYPES } from "@opsflow/shared";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/my-work", label: "My Work", icon: ClipboardList },
  { to: "/work", label: "All Work", icon: ListTodo },
  { to: "/teams", label: "Teams", icon: Users },
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/activity", label: "Activity", icon: Activity },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppShell() {
  const me = useMe();
  const { sidebarOpen, toggleSidebar, setSidebar } = useUiStore();
  const [createOpen, setCreateOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const navigate = useNavigate();
  const qc = useQueryClient();

  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<{ unread: number }>("/api/notifications"),
    refetchInterval: 15000,
  });

  useEffect(() => {
    const t = setTimeout(() => {
      if (window.location.pathname === "/work" || window.location.pathname === "/my-work") {
        const next = new URLSearchParams(searchParams);
        if (q) next.set("q", q);
        else next.delete("q");
        next.set("page", "1");
        setSearchParams(next);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    localStorage.removeItem("opsflow_token");
    qc.clear();
    navigate("/login");
  }

  return (
    <div className="flex min-h-screen bg-ink-950">
      <aside
        className={cn(
          "fixed inset-y-0 z-30 w-64 border-r border-white/10 bg-ink-900 p-4 transition-transform lg:static",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0 lg:w-20",
        )}
      >
        <Link to="/" className="mb-8 flex items-center gap-2 px-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent-500 font-mono text-sm font-bold text-ink-950">
            OF
          </div>
          {sidebarOpen ? <div>
            <div className="text-sm font-semibold">OpsFlow</div>
            <div className="text-[11px] text-white/40">Operations platform</div>
          </div> : null}
        </Link>
        <nav className="space-y-1">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-white/70 hover:bg-white/5",
                  isActive && "bg-white/10 text-white",
                )
              }
            >
              <item.icon size={18} />
              {sidebarOpen ? item.label : null}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/10 bg-ink-950/90 px-4 py-3 backdrop-blur">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={toggleSidebar}>
            <Menu size={18} />
          </Button>
          <form
            className="relative max-w-xl flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              navigate(`/work?q=${encodeURIComponent(q)}`);
            }}
          >
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-white/40" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search work, teams, assignees, OPS-0001"
              className="pl-9"
            />
          </form>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={16} /> Create
          </Button>
          <Link to="/notifications" className="relative rounded-md p-2 hover:bg-white/10">
            <Bell size={18} />
            {(notifications.data?.unread ?? 0) > 0 ? (
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-accent-400" />
            ) : null}
          </Link>
          <div className="flex items-center gap-2">
            <img src={me.data?.avatar ?? ""} alt="" className="h-8 w-8 rounded-full bg-white/10" />
            <div className="hidden text-left sm:block">
              <div className="text-sm font-medium">{me.data?.name}</div>
              <button className="text-xs text-white/50 hover:text-white" onClick={logout}>
                Sign out
              </button>
            </div>
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-6" onClick={() => setSidebar(true)}>
          <Outlet />
        </main>
      </div>
      {createOpen ? <CreateWorkDialog onClose={() => setCreateOpen(false)} /> : null}
    </div>
  );
}

function CreateWorkDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const teams = useQuery({ queryKey: ["teams"], queryFn: () => api<Array<{ id: string; name: string }>>("/api/teams") });
  const [teamId, setTeamId] = useState("");
  const members = useQuery({
    queryKey: ["users", teamId],
    queryFn: () => api<Array<{ id: string; name: string }>>(`/api/users?teamId=${teamId}`),
    enabled: Boolean(teamId),
  });

  const mutation = useMutation({
    mutationFn: (body: unknown) => api<{ id: string }>("/api/work-items", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (item: { id: string }) => {
      toast.success("Work item created");
      void qc.invalidateQueries({ queryKey: ["work-items"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
      navigate(`/work/${item.id}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const defaultTeam = teams.data?.[0]?.id;
  const effectiveTeam = teamId || defaultTeam || "";

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    mutation.mutate({
      title: data.get("title"),
      description: data.get("description"),
      type: data.get("type"),
      priority: data.get("priority"),
      teamId: data.get("teamId"),
      assigneeId: data.get("assigneeId") || null,
      dueDate: data.get("dueDate") ? new Date(String(data.get("dueDate"))).toISOString() : null,
    });
  }

  const typeOptions = useMemo(() => WORK_ITEM_TYPES, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <form onSubmit={onSubmit} className="w-full max-w-lg rounded-xl border border-white/10 bg-ink-900 p-5 shadow-2xl">
        <h2 className="mb-4 text-lg font-semibold">Create work item</h2>
        <Label>Title</Label>
        <Input name="title" required minLength={3} className="mb-3" />
        <Label>Description</Label>
        <Textarea name="description" className="mb-3" />
        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <Label>Type</Label>
            <Select name="type" defaultValue="OPERATIONS">
              {typeOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Priority</Label>
            <Select name="priority" defaultValue="MEDIUM">
              {WORK_ITEM_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <Label>Team</Label>
        <Select name="teamId" value={effectiveTeam} onChange={(e) => setTeamId(e.target.value)} className="mb-3">
          {(teams.data ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
        <Label>Assignee</Label>
        <Select name="assigneeId" className="mb-3">
          <option value="">Unassigned</option>
          {(members.data ?? []).map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
        <Label>Due date</Label>
        <Input name="dueDate" type="date" className="mb-5" />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Creating…" : "Create"}
          </Button>
        </div>
      </form>
    </div>
  );
}
