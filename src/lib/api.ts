import type { Account } from "@shared/types";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`, { headers: { Accept: "application/json" } });
  if (res.status === 401) {
    // Sessão do Cloudflare Access expirou — recarrega para reautenticar.
    window.location.reload();
    throw new Error("401");
  }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export interface RangeQuery {
  account: string;
  from?: string;
  to?: string;
}

const qs = (q: RangeQuery) =>
  `?account=${encodeURIComponent(q.account)}` +
  (q.from ? `&from=${q.from}` : "") +
  (q.to ? `&to=${q.to}` : "");

export const api = {
  accounts: () => get<Account[]>("/accounts"),
  me: () => get<{ email: string; name?: string }>("/me"),
  overview: (q: RangeQuery) => get<any>(`/overview${qs(q)}`),
  report: (kind: string, q: RangeQuery) => get<any>(`/report/${kind}${qs(q)}`),
  schedule: (q: RangeQuery) => get<any>(`/schedule${qs(q)}`),
  waste: (q: RangeQuery) => get<any>(`/waste${qs(q)}`),
  opportunities: (q: RangeQuery) => get<any>(`/opportunities${qs(q)}`),
  freshness: (account?: string) => get<any>(`/freshness${account ? `?account=${account}` : ""}`),
  refresh: (account?: string, days?: number) =>
    post<any>(`/refresh?${account ? `account=${account}&` : ""}${days ? `days=${days}` : ""}`),
  saveAccount: (body: Record<string, unknown>) => post<any>("/settings/account", body),
  annotations: (account: string) => get<any>(`/annotations?account=${account}`),
  addAnnotation: (body: { account: string; day: string; text: string }) =>
    post<any>("/annotations", body),
};
