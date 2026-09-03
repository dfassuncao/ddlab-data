import type { Totals } from "../shared/types";

export interface RawMetrics {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  conversions_value: number;
}

export function withKpis(raw: Partial<RawMetrics>): Totals {
  const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const m: RawMetrics = {
    impressions: n(raw.impressions),
    clicks: n(raw.clicks),
    cost: n(raw.cost),
    conversions: n(raw.conversions),
    conversions_value: n(raw.conversions_value),
  };
  const div = (a: number, b: number) => (b > 0 ? a / b : 0);
  return {
    impressions: m.impressions,
    clicks: m.clicks,
    cost: round(m.cost),
    conversions: round(m.conversions, 2),
    conversions_value: round(m.conversions_value),
    ctr: round(div(m.clicks, m.impressions) * 100, 2),
    cpc: round(div(m.cost, m.clicks), 2),
    cvr: round(div(m.conversions, m.clicks) * 100, 2),
    cpa: m.conversions > 0 ? round(m.cost / m.conversions, 2) : null,
    roas: m.cost > 0 ? round(m.conversions_value / m.cost, 2) : null,
  };
}

export function round(n: number, d = 2): number {
  const f = 10 ** d;
  return Math.round((n + Number.EPSILON) * f) / f;
}

export function emptyMetrics(): RawMetrics {
  return { impressions: 0, clicks: 0, cost: 0, conversions: 0, conversions_value: 0 };
}

export function addMetrics(a: RawMetrics, b: Partial<RawMetrics>): RawMetrics {
  return {
    impressions: a.impressions + (b.impressions ?? 0),
    clicks: a.clicks + (b.clicks ?? 0),
    cost: a.cost + (b.cost ?? 0),
    conversions: a.conversions + (b.conversions ?? 0),
    conversions_value: a.conversions_value + (b.conversions_value ?? 0),
  };
}

/** Datas do período: default últimos 30 dias (encerrando ontem). */
export function resolveRange(from?: string, to?: string): { from: string; to: string } {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const end = to ?? iso(new Date(Date.now() - 86_400_000));
  const start =
    from ?? iso(new Date(new Date(end).getTime() - 29 * 86_400_000));
  return { from: start, to: end };
}

/** Período anterior de mesmo tamanho, imediatamente antes. */
export function previousRange(from: string, to: string): { from: string; to: string } {
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  const span = b - a + 86_400_000;
  const iso = (d: number) => new Date(d).toISOString().slice(0, 10);
  return { from: iso(a - span), to: iso(a - 86_400_000) };
}
