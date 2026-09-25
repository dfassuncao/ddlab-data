import type { Account } from "@shared/types";

// Sessão do Cloudflare Access expirou — recarrega para reautenticar. Uma
// navegação de página cheia não tem bloqueio de CORS (diferente de um
// fetch/XHR), então o redirect do Access para a tela de login funciona.
function reauth(): never {
  window.location.reload();
  throw new Error("sessão expirada, recarregando…");
}

async function handle<T>(req: Promise<Response>): Promise<T> {
  let res: Response;
  try {
    res = await req;
  } catch {
    // fetch() falha (TypeError) quando o navegador bloqueia por CORS a
    // resposta redirecionada para o domínio de login do Access — status
    // sequer fica acessível, então isso também conta como sessão expirada.
    reauth();
  }
  if (res.status === 401) reauth();
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

const get = <T>(path: string) =>
  handle<T>(fetch(`/api${path}`, { headers: { Accept: "application/json" } }));

const post = <T>(path: string, body?: unknown) =>
  handle<T>(
    fetch(`/api${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    }),
  );

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
  gsc: (kind: "queries" | "pages", q: RangeQuery) => get<any>(`/gsc/${kind}${qs(q)}`),
  ga4: (q: RangeQuery) => get<any>(`/ga4${qs(q)}`),
  presentationData: (q: RangeQuery & { comparar?: boolean }) =>
    get<any>(`/presentation-data${qs(q)}${q.comparar ? "&comparar=1" : ""}`),
  cruzamento: (q: RangeQuery) => get<any>(`/cruzamento${qs(q)}`),
  termClassification: (q: RangeQuery) => get<any>(`/term-classification${qs(q)}`),
  refresh: (account?: string, days?: number) =>
    post<any>(`/refresh?${account ? `account=${account}&` : ""}${days ? `days=${days}` : ""}`),
  saveAccount: (body: Record<string, unknown>) => post<any>("/settings/account", body),
  annotations: (account: string) => get<any>(`/annotations?account=${account}`),
  addAnnotation: (body: { account: string; day: string; text: string }) =>
    post<any>("/annotations", body),
  analysisLatest: (account: string) => get<any>(`/analysis?account=${account}`),
  analysisGenerate: (q: RangeQuery) => post<any>(`/analysis${qs(q)}`),
  analysisHistory: (account: string) => get<any>(`/analysis/history?account=${account}`),
  analysisById: (account: string, id: number | string) =>
    get<any>(`/analysis/${id}?account=${account}`),
  decisionCenter: (q: RangeQuery) => get<any>(`/decision-center${qs(q)}`),
  dataHealth: (account: string) => get<any>(`/data-health?account=${account}`),
  diagnosticoLatest: (account: string) => get<any>(`/diagnostico?account=${account}`),
  diagnosticoGenerate: (q: RangeQuery) => post<any>(`/diagnostico${qs(q)}`),
  diagnosticoHistory: (account: string) => get<any>(`/diagnostico/history?account=${account}`),
  diagnosticoById: (account: string, id: number | string) =>
    get<any>(`/diagnostico/${id}?account=${account}`),
  adsActions: (params?: { account?: string; status?: string }) => {
    const p = new URLSearchParams();
    if (params?.account) p.set("account", params.account);
    if (params?.status) p.set("status", params.status);
    const query = p.toString();
    return get<any>(`/ads-actions${query ? `?${query}` : ""}`);
  },
  proposeNegative: (body: { account: string; term: string; from?: string; to?: string; matchType?: string }) =>
    post<any>("/ads-actions/propose-negative", body),
  proposeCampaignStatus: (body: { account: string; campaignId: string; status: "PAUSED" | "ENABLED" }) =>
    post<any>("/ads-actions/propose-campaign-status", body),
  proposeKeywordStatus: (body: { account: string; criterionId: string; status: "PAUSED" | "ENABLED" }) =>
    post<any>("/ads-actions/propose-keyword-status", body),
  approveAdsAction: (id: string) => post<any>(`/ads-actions/${id}/approve`),
  rejectAdsAction: (id: string) => post<any>(`/ads-actions/${id}/reject`),
};
