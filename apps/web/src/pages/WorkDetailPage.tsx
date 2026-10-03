import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { WORK_ITEM_PRIORITIES, WORK_ITEM_STATUSES } from "@opsflow/shared";
import { api, HttpError, newIdempotencyKey } from "../lib/api";
import type { WorkItem } from "../lib/types";
import { formatLabel } from "../lib/cn";
import { PriorityBadge, StatusBadge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Select, Textarea } from "../components/ui/Field";
import { EmptyState, ErrorState, Skeleton } from "../components/ui/States";
import { useMe } from "../components/layout/Protected";

type Activity = {
  id: string;
  action: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  actor: { name: string };
};

type Comment = {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  author: { id: string; name: string };
};

export function WorkDetailPage() {
  const { id } = useParams();
  const me = useMe();
  const qc = useQueryClient();
  const [conflict, setConflict] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState<string | null>(null);
  const [draftBody, setDraftBody] = useState("");

  const itemQ = useQuery({
    queryKey: ["work-item", id],
    queryFn: () => api<WorkItem>(`/api/work-items/${id}`),
  });
  const activityQ = useQuery({
    queryKey: ["activity", id],
    queryFn: () => api<Activity[]>(`/api/work-items/${id}/activity`),
  });
  const commentsQ = useQuery({
    queryKey: ["comments", id],
    queryFn: () => api<Comment[]>(`/api/work-items/${id}/comments`),
  });
  const usersQ = useQuery({
    queryKey: ["users", itemQ.data?.teamId],
    queryFn: () => api<Array<{ id: string; name: string }>>(`/api/users?teamId=${itemQ.data?.teamId}`),
    enabled: Boolean(itemQ.data?.teamId),
  });

  function onError(err: unknown) {
    if (err instanceof HttpError && err.error.code === "VERSION_CONFLICT") {
      setConflict(err.message);
      toast.error(err.message);
      void itemQ.refetch();
      return;
    }
    toast.error(err instanceof Error ? err.message : "Request failed");
  }

  function invalidate() {
    void qc.invalidateQueries({ queryKey: ["work-item", id] });
    void qc.invalidateQueries({ queryKey: ["activity", id] });
    void qc.invalidateQueries({ queryKey: ["comments", id] });
    void qc.invalidateQueries({ queryKey: ["work-items"] });
    void qc.invalidateQueries({ queryKey: ["dashboard"] });
    void qc.invalidateQueries({ queryKey: ["notifications"] });
  }

  const mutate = (path: string, body: unknown, headers?: HeadersInit) =>
    api(`/api/work-items/${id}${path}`, {
      method: "POST",
      body: JSON.stringify(body),
      headers,
    });

  const assignM = useMutation({
    mutationFn: (assigneeId: string | null) =>
      mutate("/assign", { assigneeId, expectedVersion: itemQ.data!.version }, { "Idempotency-Key": newIdempotencyKey() }),
    onSuccess: () => { setConflict(null); invalidate(); toast.success("Assignment updated"); },
    onError,
  });
  const statusM = useMutation({
    mutationFn: (status: string) => mutate("/status", { status, expectedVersion: itemQ.data!.version }),
    onSuccess: () => { setConflict(null); invalidate(); toast.success("Status updated"); },
    onError,
  });
  const priorityM = useMutation({
    mutationFn: (priority: string) => mutate("/priority", { priority, expectedVersion: itemQ.data!.version }),
    onSuccess: () => { setConflict(null); invalidate(); toast.success("Priority updated"); },
    onError,
  });
  const saveM = useMutation({
    mutationFn: () =>
      api(`/api/work-items/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          expectedVersion: itemQ.data!.version,
          title: draftTitle ?? itemQ.data!.title,
          description: itemQ.data!.description,
        }),
      }),
    onSuccess: () => { setConflict(null); setDraftTitle(null); invalidate(); toast.success("Saved"); },
    onError,
  });
  const commentM = useMutation({
    mutationFn: () =>
      api(`/api/work-items/${id}/comments`, { method: "POST", body: JSON.stringify({ body: draftBody }) }),
    onSuccess: () => { setDraftBody(""); invalidate(); },
    onError,
  });
  const approveM = useMutation({
    mutationFn: () => mutate("/approve", { expectedVersion: itemQ.data!.version }, { "Idempotency-Key": newIdempotencyKey() }),
    onSuccess: () => { invalidate(); toast.success("Approved"); },
    onError,
  });
  const rejectM = useMutation({
    mutationFn: () => mutate("/reject", { expectedVersion: itemQ.data!.version }),
    onSuccess: () => { invalidate(); toast.success("Returned to in progress"); },
    onError,
  });

  if (itemQ.isLoading) return <Skeleton className="h-96" />;
  if (itemQ.error) return <ErrorState message={itemQ.error.message} onRetry={() => itemQ.refetch()} />;
  const item = itemQ.data!;
  const cap = item.capabilities ?? {};
  const pending = assignM.isPending || statusM.isPending || priorityM.isPending || saveM.isPending || approveM.isPending;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {conflict ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100">
          <p className="font-medium">Version conflict</p>
          <p className="mt-1">{conflict} Your unsaved title is still in the editor so you can reconcile it.</p>
          <Button className="mt-3" variant="secondary" size="sm" onClick={() => { setConflict(null); void itemQ.refetch(); }}>
            Review latest version
          </Button>
        </div>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="font-mono text-sm text-accent-400">{item.key}</div>
          <input
            className="mt-1 w-full max-w-3xl bg-transparent text-2xl font-semibold outline-none"
            value={draftTitle ?? item.title}
            disabled={!cap.canEdit}
            onChange={(e) => setDraftTitle(e.target.value)}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusBadge status={item.status} />
            <PriorityBadge priority={item.priority} />
            <span className="text-sm text-white/50">{item.team?.name}</span>
            <span className="text-sm text-white/50">v{item.version}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {cap.canEdit ? (
            <Button variant="secondary" disabled={pending || draftTitle === null} onClick={() => saveM.mutate()}>
              Save title
            </Button>
          ) : null}
          {item.status === "WAITING_FOR_APPROVAL" && cap.canApprove ? (
            <>
              <Button disabled={pending} onClick={() => approveM.mutate()}>Approve</Button>
              <Button variant="outline" disabled={pending} onClick={() => rejectM.mutate()}>Reject</Button>
            </>
          ) : null}
          {cap.canRequestApproval && item.status !== "WAITING_FOR_APPROVAL" && item.status !== "CLOSED" && item.status !== "RESOLVED" ? (
            <Button variant="outline" disabled={pending} onClick={() => statusM.mutate("WAITING_FOR_APPROVAL")}>
              Request approval
            </Button>
          ) : null}
          {cap.canClose && item.status === "RESOLVED" ? (
            <Button variant="outline" disabled={pending} onClick={() => statusM.mutate("CLOSED")}>Close</Button>
          ) : null}
          {cap.canReopen && item.status === "CLOSED" ? (
            <Button variant="outline" disabled={pending} onClick={() => statusM.mutate("OPEN")}>Reopen</Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-6">
          <section className="rounded-xl border border-white/10 bg-ink-900 p-5">
            <h2 className="mb-3 text-sm font-medium text-white/60">Description</h2>
            <pre className="whitespace-pre-wrap font-sans text-sm leading-6 text-white/80">{item.description || "No description"}</pre>
          </section>
          <section className="rounded-xl border border-white/10 bg-ink-900 p-5">
            <h2 className="mb-3 text-sm font-medium text-white/60">Comments</h2>
            <div className="space-y-3">
              {(commentsQ.data ?? []).map((c) => (
                <CommentRow key={c.id} comment={c} workItemId={item.id} canEdit={c.author.id === me.data?.id} onChanged={invalidate} />
              ))}
              {(commentsQ.data ?? []).length === 0 ? <EmptyState title="No comments yet" /> : null}
            </div>
            {cap.canComment ? (
              <form
                className="mt-4 space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (draftBody.trim()) commentM.mutate();
                }}
              >
                <Textarea value={draftBody} onChange={(e) => setDraftBody(e.target.value)} placeholder="Write a comment. Mentions like @Priya notify teammates." />
                <Button disabled={commentM.isPending || !draftBody.trim()}>
                  {commentM.isPending ? "Posting…" : "Add comment"}
                </Button>
              </form>
            ) : null}
          </section>
          <section className="rounded-xl border border-white/10 bg-ink-900 p-5">
            <h2 className="mb-3 text-sm font-medium text-white/60">Activity timeline</h2>
            <ol className="space-y-3">
              {(activityQ.data ?? []).map((event) => (
                <li key={event.id} className="border-l border-white/10 pl-3 text-sm">
                  <div>{describeActivity(event)}</div>
                  <div className="text-xs text-white/40">{format(new Date(event.createdAt), "PPpp")}</div>
                </li>
              ))}
            </ol>
          </section>
        </div>
        <aside className="space-y-4">
          <Field label="Assignee">
            <Select
              disabled={!cap.canAssign || pending}
              value={item.assigneeId ?? ""}
              onChange={(e) => assignM.mutate(e.target.value || null)}
            >
              <option value="">Unassigned</option>
              {(usersQ.data ?? []).map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select
              disabled={!cap.canChangeStatus || pending}
              value={item.status}
              onChange={(e) => statusM.mutate(e.target.value)}
            >
              {WORK_ITEM_STATUSES.map((s) => (
                <option key={s} value={s}>{formatLabel(s)}</option>
              ))}
            </Select>
          </Field>
          <Field label="Priority">
            <Select
              disabled={!cap.canChangePriority || pending}
              value={item.priority}
              onChange={(e) => priorityM.mutate(e.target.value)}
            >
              {WORK_ITEM_PRIORITIES.map((s) => (
                <option key={s} value={s}>{formatLabel(s)}</option>
              ))}
            </Select>
          </Field>
          <Field label="Due date">
            <div className="text-sm">{item.dueDate ? format(new Date(item.dueDate), "PP") : "None"}</div>
          </Field>
          <Field label="Reporter">
            <div className="text-sm">{item.reporter?.name}</div>
          </Field>
          <Field label="Type">
            <div className="text-sm">{formatLabel(item.type)}</div>
          </Field>
          <Link to="/work" className="block text-sm text-accent-400">Back to all work</Link>
        </aside>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-ink-900 p-4">
      <div className="mb-2 text-xs uppercase tracking-wide text-white/40">{label}</div>
      {children}
    </div>
  );
}

function describeActivity(event: Activity) {
  const meta = event.metadata ?? {};
  const actor = event.actor.name;
  switch (event.action) {
    case "CREATED":
      return `${actor} created this item`;
    case "ASSIGNED":
      return `${actor} changed assignee`;
    case "STATUS_CHANGED":
      return `${actor} changed status from ${formatLabel(String(meta.oldValue))} to ${formatLabel(String(meta.newValue))}`;
    case "PRIORITY_CHANGED":
      return `${actor} changed priority from ${formatLabel(String(meta.oldValue))} to ${formatLabel(String(meta.newValue))}`;
    case "COMMENT_ADDED":
      return `${actor} added a comment`;
    case "APPROVED":
      return `${actor} approved this item`;
    case "REJECTED":
      return `${actor} rejected the approval request`;
    case "CLOSED":
      return `${actor} closed this item`;
    case "REOPENED":
      return `${actor} reopened this item`;
    case "APPROVAL_REQUESTED":
      return `${actor} requested approval`;
    default:
      return `${actor} ${formatLabel(event.action).toLowerCase()}`;
  }
}

function CommentRow({
  comment,
  workItemId,
  canEdit,
  onChanged,
}: {
  comment: Comment;
  workItemId: string;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(comment.body);
  const save = useMutation({
    mutationFn: () =>
      api(`/api/work-items/${workItemId}/comments/${comment.id}`, {
        method: "PATCH",
        body: JSON.stringify({ body }),
      }),
    onSuccess: () => { setEditing(false); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: () => api(`/api/work-items/${workItemId}/comments/${comment.id}`, { method: "DELETE" }),
    onSuccess: onChanged,
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="rounded-lg bg-white/5 p-3">
      <div className="flex justify-between text-xs text-white/45">
        <span>{comment.author.name}</span>
        <span>{format(new Date(comment.createdAt), "PP p")}</span>
      </div>
      {editing ? (
        <div className="mt-2 space-y-2">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <p className="mt-2 whitespace-pre-wrap text-sm">{comment.body}</p>
      )}
      {canEdit && !editing ? (
        <div className="mt-2 flex gap-3 text-xs">
          <button className="text-accent-400" onClick={() => setEditing(true)}>Edit</button>
          <button
            className="text-red-300"
            onClick={() => {
              if (confirm("Delete this comment?")) del.mutate();
            }}
          >
            Delete
          </button>
        </div>
      ) : null}
    </div>
  );
}
