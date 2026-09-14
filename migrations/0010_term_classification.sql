-- Classificação por IA de cada termo de busca (Ads) / consulta (GSC) por conta.
-- Atualizado sob demanda (?facts=term_classification), como o keyword_volume —
-- consome a API da Anthropic, então não entra no cron diário.

CREATE TABLE fact_term_classification (
  account_id             TEXT NOT NULL,
  term                    TEXT NOT NULL,  -- normalizado (lower/trim), casa com o termo do cruzamento Ads x GSC
  classificacao_principal TEXT,
  etiquetas               TEXT,           -- lista separada por vírgula
  intencao_busca          TEXT,
  etapa_funil             TEXT,
  temperatura             TEXT,
  relevancia              TEXT,
  adequacao_publico       TEXT,
  localidade              TEXT,
  relacionamento_marca    TEXT,
  potencial_conversao     TEXT,
  origem_dados            TEXT,           -- Google Ads | Search Console | Ambas (calculado, não vem da IA)
  cobertura_atual         TEXT,
  acao_recomendada        TEXT,
  updated_at              TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (account_id, term)
);
