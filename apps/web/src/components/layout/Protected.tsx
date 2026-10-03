import { useQuery } from "@tanstack/react-query";
import { Navigate, Outlet } from "react-router-dom";
import { api } from "../../lib/api";
import type { User } from "../../lib/types";
import { Skeleton } from "../ui/States";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => api<User>("/api/auth/me"),
    retry: false,
  });
}

export function Protected() {
  const me = useMe();
  if (me.isLoading || me.isFetching) {
    return (
      <div className="flex h-screen items-center justify-center bg-ink-950">
        <Skeleton className="h-8 w-40" />
      </div>
    );
  }
  if (!me.data) return <Navigate to="/login" replace />;
  return <Outlet />;
}
