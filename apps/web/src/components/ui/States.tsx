export function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-white/10 ${className ?? "h-4 w-full"}`} />;
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-white/10 p-10 text-center">
      <p className="text-sm font-medium text-white/80">{title}</p>
      {hint ? <p className="mt-1 text-sm text-white/45">{hint}</p> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6">
      <p className="text-sm text-red-200">{message}</p>
      {onRetry ? (
        <button className="mt-3 text-sm text-white underline" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}
