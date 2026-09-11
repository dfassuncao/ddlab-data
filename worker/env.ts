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
  /** "production" em produção (wrangler.toml). Ausente em dev local (.dev.vars não define). */
  ENVIRONMENT?: string;

  // secrets
  GCP_SA_KEY: string;
  REFRESH_TOKEN?: string;
  ANTHROPIC_API_KEY?: string;
}
