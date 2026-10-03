export type ApiError = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export class HttpError extends Error {
  constructor(
    public status: number,
    public error: ApiError,
  ) {
    super(error.message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = typeof window !== "undefined" ? localStorage.getItem("opsflow_token") : null;
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const res = await fetch(path, { ...init, headers, credentials: "include" });
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new HttpError(res.status, json.error ?? { code: "INTERNAL_ERROR", message: "Request failed" });
  }
  return json.data as T;
}

export function newIdempotencyKey() {
  return crypto.randomUUID();
}
