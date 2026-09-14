export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;

  // vars
  GCP_PROJECT_ID: string;
  BQ_DATASET: string;
  BQ_MCC_SUFFIX: string;
  CF_ACCESS_TEAM_DOMAIN: string;
  CF_ACCESS_AUD: string;
  ANTHROPIC_MODEL: string;
  GEMINI_MODEL?: string;
  DEEPSEEK_MODEL?: string;
  /** "production" em produção (wrangler.toml). Ausente em dev local (.dev.vars não define). */
  ENVIRONMENT?: string;

  // secrets
  GCP_SA_KEY: string;
  REFRESH_TOKEN?: string;
  ANTHROPIC_API_KEY?: string;
  GEMINI_API_KEY?: string;
  DEEPSEEK_API_KEY?: string;

  // Google Ads API (Keyword Planner — volume de busca). OAuth2 de usuário,
  // não service account; requer developer token aprovado pelo Google.
  GOOGLE_ADS_DEVELOPER_TOKEN?: string;
  GOOGLE_ADS_CLIENT_ID?: string;
  GOOGLE_ADS_CLIENT_SECRET?: string;
  GOOGLE_ADS_REFRESH_TOKEN?: string;
  /** Customer ID (sem traços) da MCC usada no header login-customer-id. Default: BQ_MCC_SUFFIX. */
  GOOGLE_ADS_LOGIN_CUSTOMER_ID?: string;
}
