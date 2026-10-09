-- Nomes legíveis para location_id (geoTargetConstants/<id>) usado em
-- fact_geo_daily — a API só devolve o ID numérico. Resolvido via Google Ads
-- API (geo_target_constant, recurso global e cacheado aqui) junto do ETL
-- normal de "geo", sem custo de quota relevante (é só lookup de metadados).
CREATE TABLE dim_geo_target (
  location_id TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
