-- Volume de busca (Keyword Planner, Google Ads API) por conta/termo.
-- Atualizado sob demanda (nao entra no cron diario por causa de quota da API).

CREATE TABLE fact_keyword_volume (
  account_id         TEXT NOT NULL,
  keyword             TEXT NOT NULL,  -- normalizado (lower/trim), casa com o termo do cruzamento Ads x GSC
  avg_monthly_searches INTEGER,
  competition          TEXT,          -- LOW | MEDIUM | HIGH
  competition_index    INTEGER,
  updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (account_id, keyword)
);
