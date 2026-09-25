-- Fila de aprovação para mudanças no Google Ads propostas a partir das
-- análises do app (fase 1: negativar termos de busca). Nenhuma mutação é
-- enviada para a API do Ads sem status='approved' — ver worker/routes/adsActions.ts.
CREATE TABLE google_ads_actions (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL,
  action_type   TEXT NOT NULL,                    -- 'negative_keyword' (mais tipos nas próximas fases)
  description   TEXT NOT NULL,                    -- texto legível mostrado na fila
  payload       TEXT NOT NULL,                    -- JSON com os dados da mutação
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected | applied | error
  requested_by  TEXT,
  requested_at  TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_by   TEXT,
  reviewed_at   TEXT,
  applied_at    TEXT,
  error         TEXT
);
CREATE INDEX idx_ads_actions_account_status ON google_ads_actions (account_id, status);
