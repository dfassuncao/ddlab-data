import type { Env } from "./env";

/**
 * Volume de busca (Keyword Planner) via Google Ads API — API separada do
 * BigQuery Data Transfer (que é só leitura de relatório). Exige OAuth2 de
 * usuário (não service account) + developer token aprovado pelo Google.
 */

let cachedToken: { token: string; exp: number } | null = null;

async function getGoogleAdsAccessToken(env: Env): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: env.GOOGLE_ADS_CLIENT_ID!,
      client_secret: env.GOOGLE_ADS_CLIENT_SECRET!,
      refresh_token: env.GOOGLE_ADS_REFRESH_TOKEN!,
    }),
  });
  const json = (await res.json()) as { access_token: string; expires_in: number; error?: string; error_description?: string };
  if (!res.ok) throw new Error(`OAuth Google Ads ${res.status}: ${json.error_description ?? json.error ?? JSON.stringify(json)}`);

  cachedToken = { token: json.access_token, exp: now + json.expires_in };
  return json.access_token;
}

export interface KeywordVolume {
  keyword: string;
  avg_monthly_searches: number | null;
  competition: string | null;
  competition_index: number | null;
}

const API_VERSION = "v17";
// Brasil / Português — ajuste se alguma conta tiver mercado diferente.
const GEO_TARGET_BRASIL = "geoTargetConstants/2076";
const LANGUAGE_PT = "languageConstants/1014";

/** Google limita ~10 termos por chamada de generateKeywordHistoricalMetrics. */
const BATCH_SIZE = 10;

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/** Busca volume/competição para os termos exatos informados, para UMA conta (customerId sem traços). */
export async function fetchKeywordVolumes(
  env: Env,
  customerId: string,
  keywords: string[],
): Promise<KeywordVolume[]> {
  if (!env.GOOGLE_ADS_DEVELOPER_TOKEN || !env.GOOGLE_ADS_CLIENT_ID || !env.GOOGLE_ADS_CLIENT_SECRET || !env.GOOGLE_ADS_REFRESH_TOKEN) {
    throw new Error(
      "Google Ads API não configurada (GOOGLE_ADS_DEVELOPER_TOKEN/CLIENT_ID/CLIENT_SECRET/REFRESH_TOKEN ausentes)",
    );
  }
  const token = await getGoogleAdsAccessToken(env);
  const out: KeywordVolume[] = [];

  for (const batch of chunk([...new Set(keywords.filter((k) => k.trim()))], BATCH_SIZE)) {
    const res = await fetch(
      `https://googleads.googleapis.com/${API_VERSION}/customers/${customerId}:generateKeywordHistoricalMetrics`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "developer-token": env.GOOGLE_ADS_DEVELOPER_TOKEN,
          "login-customer-id": env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? env.BQ_MCC_SUFFIX,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          keywords: batch,
          keywordPlanNetwork: "GOOGLE_SEARCH",
          geoTargetConstants: [GEO_TARGET_BRASIL],
          language: LANGUAGE_PT,
        }),
      },
    );
    const json = (await res.json()) as any;
    if (!res.ok) {
      throw new Error(`Google Ads API ${res.status}: ${JSON.stringify(json.error ?? json)}`);
    }
    for (const r of json.results ?? []) {
      const m = r.keywordMetrics ?? {};
      out.push({
        keyword: r.text,
        avg_monthly_searches: m.avgMonthlySearches != null ? Number(m.avgMonthlySearches) : null,
        competition: m.competition ?? null,
        competition_index: m.competitionIndex != null ? Number(m.competitionIndex) : null,
      });
    }
  }
  return out;
}
