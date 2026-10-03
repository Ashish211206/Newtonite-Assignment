import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, HttpError } from "../lib/api";
import { Button } from "../components/ui/Button";
import { Input, Label } from "../components/ui/Field";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export function LoginPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: "admin@opsflow.local", password: "Password123!" },
  });
  const mutation = useMutation({
    mutationFn: (values: z.infer<typeof schema>) =>
      api<{ token: string; user: unknown }>("/api/auth/login", { method: "POST", body: JSON.stringify(values) }),
    onSuccess: async (res) => {
      if (res?.token) {
        localStorage.setItem("opsflow_token", res.token);
      }
      await qc.refetchQueries({ queryKey: ["me"] });
      nav("/");
    },
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950 p-6">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-ink-900 p-8">
        <div className="mb-6">
          <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-md bg-accent-500 font-mono font-bold text-ink-950">
            OF
          </div>
          <h1 className="text-2xl font-semibold">Sign in to OpsFlow</h1>
          <p className="mt-1 text-sm text-white/50">Internal operations work management</p>
        </div>
        <form
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
          className="space-y-4"
        >
          <div>
            <Label>Email</Label>
            <Input type="email" {...form.register("email")} />
          </div>
          <div>
            <Label>Password</Label>
            <Input type="password" {...form.register("password")} />
          </div>
          {mutation.error ? (
            <p className="text-sm text-red-300">
              {mutation.error instanceof HttpError ? mutation.error.message : "Login failed"}
            </p>
          ) : null}
          <Button className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <div className="mt-6 rounded-lg bg-white/5 p-3 text-xs text-white/60">
          Demo: admin@opsflow.local / Password123! · priya@opsflow.local (member) · isolated@opsflow.local (restricted team)
        </div>
      </div>
    </div>
  );
}
