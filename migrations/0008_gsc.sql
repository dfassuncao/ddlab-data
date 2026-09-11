-- Fonte Search Console (bulk export nativo do GSC para BigQuery, um dataset por conta).

ALTER TABLE dim_account ADD COLUMN gsc_dataset TEXT;  -- ex.: searchconsole_doin (mesmo projeto GCP)

CREATE TABLE fact_gsc_query_daily (
  account_id  TEXT NOT NULL,
  day         TEXT NOT NULL,
  query       TEXT NOT NULL,
  clicks      INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  position    REAL,                        -- posição média (1-indexada)
  PRIMARY KEY (account_id, day, query)
);
CREATE INDEX idx_gsc_query_day ON fact_gsc_query_daily (account_id, day);

CREATE TABLE fact_gsc_page_daily (
  account_id  TEXT NOT NULL,
  day         TEXT NOT NULL,
  page        TEXT NOT NULL,
  clicks      INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  position    REAL,
  PRIMARY KEY (account_id, day, page)
);
CREATE INDEX idx_gsc_page_day ON fact_gsc_page_daily (account_id, day);
