-- Página GA4 nova (Configurações → métricas de site): pageviews por dia/canal,
-- além das já existentes (sessões, usuários, leads/key_events, receita).
ALTER TABLE fact_ga4_daily ADD COLUMN page_views INTEGER NOT NULL DEFAULT 0;
