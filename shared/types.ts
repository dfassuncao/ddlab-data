// Tipos compartilhados entre Worker (API) e frontend.

export interface Account {
  id: string;
  customer_id: string;
  name: string;
  currency: string;
  timezone: string;
  target_cpa: number | null;
  monthly_budget: number | null;
  has_shopping: boolean;
  active: boolean;
}

export interface Totals {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  conversions_value: number;
  ctr: number;
  cpc: number;
  cvr: number;
  cpa: number | null;
  roas: number | null;
}

export interface PeriodComparison<T> {
  current: T;
  previous: T | null;
}

export interface TrendPoint {
  day: string;
  cost: number;
  clicks: number;
  conversions: number;
  impressions: number;
  conversions_value: number;
}

export interface CampaignRow extends Totals {
  campaign_id: string;
  name: string;
  status: string | null;
  channel_type: string | null;
  search_is: number | null;
  budget_lost_is: number | null;
  rank_lost_is: number | null;
}

export interface GenericRow extends Totals {
  key: string;
  label: string;
  [extra: string]: unknown;
}

export interface WasteItem {
  scope: "campaign" | "keyword" | "search_term" | "geo";
  label: string;
  cost: number;
  clicks: number;
  campaign?: string;
}

export interface Freshness {
  account_id: string;
  fact: string;
  last_run_at: string;
  status: string;
  rows_written: number;
  data_from: string | null;
  data_to: string | null;
  error: string | null;
}

export interface OverviewResponse {
  account: Account;
  range: { from: string; to: string };
  totals: PeriodComparison<Totals>;
  trend: TrendPoint[];
  campaigns: CampaignRow[];
  pacing: {
    month_cost: number;
    monthly_budget: number | null;
    projected_month_cost: number | null;
    target_cpa: number | null;
    cpa: number | null;
  };
  freshness: Freshness[];
}
