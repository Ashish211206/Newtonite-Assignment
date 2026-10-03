import { useMe } from "../components/layout/Protected";

export function SettingsPage() {
  const me = useMe();
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <div className="rounded-xl border border-white/10 bg-ink-900 p-5 text-sm">
        <div>Signed in as <strong>{me.data?.name}</strong></div>
        <div className="text-white/50">{me.data?.email}</div>
        <div className="mt-3 text-white/70">Global role: {me.data?.globalRole}</div>
      </div>
      <div className="rounded-xl border border-white/10 bg-ink-900 p-5 text-sm leading-6 text-white/70">
        <p className="font-medium text-white">Engineering reliability demos</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Open the same work item in two browsers. Save in A, then save in B to see a 409 version conflict.</li>
          <li>Assign with a repeated Idempotency-Key — only one audit event is written.</li>
          <li>Sign in as priya@opsflow.local and open a Restricted Audit Cell item by ID — the API returns 403.</li>
          <li>Change status or priority and confirm the activity timeline records actor, field, and values.</li>
        </ul>
      </div>
    </div>
  );
}
