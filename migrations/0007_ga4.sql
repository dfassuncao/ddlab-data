-- Fase 1 do DDLab Intelligence: fonte GA4 (nível canal).

ALTER TABLE dim_account ADD COLUMN ga4_dataset TEXT;      -- ex.: analytics_123456789 (no mesmo projeto GCP)
ALTER TABLE dim_account ADD COLUMN ga4_key_events TEXT;   -- lista separada por vírgula; default no código

CREATE TABLE fact_ga4_daily (
  account_id       TEXT NOT NULL,
  day              TEXT NOT NULL,
  channel          TEXT NOT NULL,          -- Paga / Orgânica / Direto / Referral / Social / Email / Outro
  sessions         INTEGER NOT NULL DEFAULT 0,
  engaged_sessions INTEGER NOT NULL DEFAULT 0,
  active_users     INTEGER NOT NULL DEFAULT 0,
  key_events       REAL NOT NULL DEFAULT 0,
  revenue          REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, day, channel)
);
CREATE INDEX idx_ga4_day ON fact_ga4_daily (account_id, day);

-- ai_analysis passa a guardar tanto markdown (Análise IA) quanto JSON (Diagnóstico IA)
ALTER TABLE ai_analysis ADD COLUMN kind TEXT NOT NULL DEFAULT 'markdown';
