-- Rate limit genérico por chave (ex.: "refresh") — usado pra impedir disparo
-- repetido de operações caras (BigQuery/Ads/IA) via POST /api/refresh.
-- Ver checkRateLimit() em worker/db.ts.
CREATE TABLE rate_limits (
  key     TEXT PRIMARY KEY,
  last_at TEXT NOT NULL
);
