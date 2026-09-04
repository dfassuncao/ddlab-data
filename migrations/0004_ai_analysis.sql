-- Análises geradas pela IA (sob demanda) por conta/período. Guarda histórico;
-- a API sempre lê a mais recente por account_id.
CREATE TABLE ai_analysis (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id    TEXT NOT NULL,
  range_from    TEXT NOT NULL,
  range_to      TEXT NOT NULL,
  model         TEXT NOT NULL,
  content       TEXT NOT NULL,
  input_tokens  INTEGER,
  output_tokens INTEGER,
  generated_by  TEXT,
  generated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_ai_analysis_account ON ai_analysis (account_id, generated_at DESC);
