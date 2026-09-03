-- Schema do banco pré-agregado (Cloudflare D1 / SQLite).
-- Grão dos fatos: uma linha por (account_id, day, entidade[, segmento]).

CREATE TABLE dim_account (
  id            TEXT PRIMARY KEY,          -- slug curto, ex. "doin-motors"
  customer_id   TEXT NOT NULL UNIQUE,      -- ID do Google Ads sem traços
  name          TEXT NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'BRL',
  timezone      TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  target_cpa    REAL,                      -- meta de custo por conversão (moeda da conta)
  monthly_budget REAL,                     -- verba mensal planejada
  has_shopping  INTEGER NOT NULL DEFAULT 0,
  active        INTEGER NOT NULL DEFAULT 1,
  sort_order    INTEGER NOT NULL DEFAULT 100
);

CREATE TABLE dim_campaign (
  account_id    TEXT NOT NULL,
  campaign_id   TEXT NOT NULL,
  name          TEXT,
  status        TEXT,
  channel_type  TEXT,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (account_id, campaign_id)
);

CREATE TABLE fact_campaign_daily (
  account_id       TEXT NOT NULL,
  day              TEXT NOT NULL,
  campaign_id      TEXT NOT NULL,
  impressions      INTEGER NOT NULL DEFAULT 0,
  clicks           INTEGER NOT NULL DEFAULT 0,
  cost             REAL NOT NULL DEFAULT 0,
  conversions      REAL NOT NULL DEFAULT 0,
  conversions_value REAL NOT NULL DEFAULT 0,
  search_is        REAL,   -- search impression share (0..1)
  budget_lost_is   REAL,   -- IS perdido por orçamento
  rank_lost_is     REAL,   -- IS perdido por rank
  PRIMARY KEY (account_id, day, campaign_id)
);

CREATE TABLE fact_keyword_daily (
  account_id       TEXT NOT NULL,
  day              TEXT NOT NULL,
  campaign_id      TEXT NOT NULL,
  ad_group_id      TEXT NOT NULL,
  criterion_id     TEXT NOT NULL,
  keyword_text     TEXT,
  match_type       TEXT,
  impressions      INTEGER NOT NULL DEFAULT 0,
  clicks           INTEGER NOT NULL DEFAULT 0,
  cost             REAL NOT NULL DEFAULT 0,
  conversions      REAL NOT NULL DEFAULT 0,
  conversions_value REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, day, criterion_id)
);

CREATE TABLE fact_searchterm_daily (
  account_id       TEXT NOT NULL,
  day              TEXT NOT NULL,
  campaign_id      TEXT NOT NULL,
  search_term      TEXT NOT NULL,
  impressions      INTEGER NOT NULL DEFAULT 0,
  clicks           INTEGER NOT NULL DEFAULT 0,
  cost             REAL NOT NULL DEFAULT 0,
  conversions      REAL NOT NULL DEFAULT 0,
  conversions_value REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, day, campaign_id, search_term)
);

CREATE TABLE fact_geo_daily (
  account_id       TEXT NOT NULL,
  day              TEXT NOT NULL,
  campaign_id      TEXT NOT NULL,
  location_id      TEXT NOT NULL,           -- geo target constant id
  impressions      INTEGER NOT NULL DEFAULT 0,
  clicks           INTEGER NOT NULL DEFAULT 0,
  cost             REAL NOT NULL DEFAULT 0,
  conversions      REAL NOT NULL DEFAULT 0,
  conversions_value REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, day, campaign_id, location_id)
);

CREATE TABLE fact_hour_daily (
  account_id       TEXT NOT NULL,
  day              TEXT NOT NULL,
  campaign_id      TEXT NOT NULL,
  hour             INTEGER NOT NULL,        -- 0..23
  day_of_week      TEXT,                    -- MONDAY..SUNDAY
  device           TEXT,                    -- MOBILE / DESKTOP / TABLET / CONNECTED_TV
  impressions      INTEGER NOT NULL DEFAULT 0,
  clicks           INTEGER NOT NULL DEFAULT 0,
  cost             REAL NOT NULL DEFAULT 0,
  conversions      REAL NOT NULL DEFAULT 0,
  conversions_value REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, day, campaign_id, hour, device)
);

CREATE TABLE fact_ad_daily (
  account_id       TEXT NOT NULL,
  day              TEXT NOT NULL,
  campaign_id      TEXT NOT NULL,
  ad_group_id      TEXT NOT NULL,
  ad_id            TEXT NOT NULL,
  ad_type          TEXT,
  impressions      INTEGER NOT NULL DEFAULT 0,
  clicks           INTEGER NOT NULL DEFAULT 0,
  cost             REAL NOT NULL DEFAULT 0,
  conversions      REAL NOT NULL DEFAULT 0,
  conversions_value REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, day, ad_id)
);

CREATE TABLE fact_audience_daily (
  account_id       TEXT NOT NULL,
  day              TEXT NOT NULL,
  campaign_id      TEXT NOT NULL,
  dimension        TEXT NOT NULL,           -- 'age' | 'gender'
  bucket           TEXT NOT NULL,           -- ex. '25-34', 'MALE'
  impressions      INTEGER NOT NULL DEFAULT 0,
  clicks           INTEGER NOT NULL DEFAULT 0,
  cost             REAL NOT NULL DEFAULT 0,
  conversions      REAL NOT NULL DEFAULT 0,
  conversions_value REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, day, campaign_id, dimension, bucket)
);

CREATE TABLE fact_product_daily (
  account_id       TEXT NOT NULL,
  day              TEXT NOT NULL,
  product_id       TEXT NOT NULL,
  title            TEXT,
  impressions      INTEGER NOT NULL DEFAULT 0,
  clicks           INTEGER NOT NULL DEFAULT 0,
  cost             REAL NOT NULL DEFAULT 0,
  conversions      REAL NOT NULL DEFAULT 0,
  conversions_value REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, day, product_id)
);

CREATE TABLE fact_landingpage_daily (
  account_id       TEXT NOT NULL,
  day              TEXT NOT NULL,
  url              TEXT NOT NULL,
  mobile_speed     INTEGER,
  impressions      INTEGER NOT NULL DEFAULT 0,
  clicks           INTEGER NOT NULL DEFAULT 0,
  cost             REAL NOT NULL DEFAULT 0,
  conversions      REAL NOT NULL DEFAULT 0,
  conversions_value REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, day, url)
);

CREATE TABLE meta_refresh (
  account_id    TEXT NOT NULL,
  fact          TEXT NOT NULL,
  last_run_at   TEXT NOT NULL,
  status        TEXT NOT NULL,             -- 'ok' | 'error'
  rows_written  INTEGER NOT NULL DEFAULT 0,
  data_from     TEXT,
  data_to       TEXT,
  error         TEXT,
  PRIMARY KEY (account_id, fact)
);

CREATE TABLE annotations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id  TEXT NOT NULL,
  day         TEXT NOT NULL,
  text        TEXT NOT NULL,
  author      TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_campaign_day ON fact_campaign_daily (account_id, day);
CREATE INDEX idx_keyword_day ON fact_keyword_daily (account_id, day);
CREATE INDEX idx_searchterm_day ON fact_searchterm_daily (account_id, day);
CREATE INDEX idx_geo_day ON fact_geo_daily (account_id, day);
CREATE INDEX idx_hour_day ON fact_hour_daily (account_id, day);
CREATE INDEX idx_ad_day ON fact_ad_daily (account_id, day);
CREATE INDEX idx_audience_day ON fact_audience_daily (account_id, day);
CREATE INDEX idx_product_day ON fact_product_daily (account_id, day);
CREATE INDEX idx_landingpage_day ON fact_landingpage_daily (account_id, day);
CREATE INDEX idx_annotations_acc_day ON annotations (account_id, day);
