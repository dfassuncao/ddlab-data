import type { Env } from "../env";
import { tbl } from "../bq";

/**
 * Cada fato é uma query BigQuery cujas COLUNAS já saem com o nome exato
 * da coluna correspondente na tabela D1 (facilita o upsert genérico).
 *
 * Se o transfer do Google Ads usar um nome de coluna diferente numa conta,
 * o ETL registra o erro em `meta_refresh` e segue com os outros fatos.
 * Para descobrir o nome real: GET /api/introspect?table=p_ads_XxxStats
 */

export interface FactSpec {
  fact: string;
  table: string;
  pk: string[];
  sql: (env: Env) => string;
  /**
   * replace  = DELETE (account_id + day no range + deleteFilter) e reinsere  [default]
   * update   = UPDATE por PK (enriquece colunas, não apaga)
   * upsert   = INSERT OR REPLACE sem DELETE (dimensões sem data)
   */
  mode?: "replace" | "update" | "upsert";
  /** cláusula extra no DELETE quando vários fatos compartilham a mesma tabela */
  deleteFilter?: string;
  /** janela padrão de dias (o cron diário usa uma janela menor) */
  lookbackDays: number;
  /** só roda para contas com Shopping/PMax */
  shoppingOnly?: boolean;
}

const M = "metrics_cost_micros / 1e6";
const BASE_METRICS = `
  SUM(metrics_impressions)                     AS impressions,
  SUM(metrics_clicks)                          AS clicks,
  ROUND(SUM(${M}), 4)                          AS cost,
  ROUND(SUM(metrics_conversions), 4)          AS conversions,
  ROUND(SUM(metrics_conversions_value), 4)    AS conversions_value`;

const WHERE = `WHERE customer_id = @customer_id AND segments_date >= @start_date`;
const HAVING_NONZERO = `HAVING SUM(metrics_impressions) > 0`;

const LIGHT = 400; // campanha / hora — poucos registros, histórico longo
const HEAVY = 120; // keyword / termo / geo / anúncio — muitos registros

export const FACTS: FactSpec[] = [
  {
    fact: "campaign",
    table: "fact_campaign_daily",
    pk: ["account_id", "day", "campaign_id"],
    lookbackDays: LIGHT,
    sql: (env) => `
      SELECT
        segments_date AS day,
        CAST(campaign_id AS STRING) AS campaign_id,
        ${BASE_METRICS}
      FROM ${tbl(env, "p_ads_CampaignBasicStats")}
      ${WHERE}
      GROUP BY day, campaign_id`,
  },
  {
    fact: "campaign_is",
    table: "fact_campaign_daily",
    pk: ["account_id", "day", "campaign_id"],
    mode: "update",
    lookbackDays: LIGHT,
    sql: (env) => `
      SELECT
        segments_date AS day,
        CAST(campaign_id AS STRING) AS campaign_id,
        ROUND(SAFE_DIVIDE(SUM(metrics_search_impression_share * metrics_impressions), SUM(metrics_impressions)), 4)              AS search_is,
        ROUND(SAFE_DIVIDE(SUM(metrics_search_budget_lost_impression_share * metrics_impressions), SUM(metrics_impressions)), 4)  AS budget_lost_is,
        ROUND(SAFE_DIVIDE(SUM(metrics_search_rank_lost_impression_share * metrics_impressions), SUM(metrics_impressions)), 4)    AS rank_lost_is
      FROM ${tbl(env, "p_ads_CampaignStats")}
      ${WHERE}
      GROUP BY day, campaign_id`,
  },
  {
    fact: "dim_campaign",
    table: "dim_campaign",
    pk: ["account_id", "campaign_id"],
    mode: "upsert",
    lookbackDays: 0,
    sql: (env) => `
      SELECT
        CAST(campaign_id AS STRING) AS campaign_id,
        ANY_VALUE(campaign_name) AS name,
        ANY_VALUE(campaign_status) AS status,
        ANY_VALUE(campaign_advertising_channel_type) AS channel_type
      FROM ${tbl(env, "ads_Campaign")}
      WHERE customer_id = @customer_id
        AND _DATA_DATE = (SELECT MAX(_DATA_DATE) FROM ${tbl(env, "ads_Campaign")} WHERE customer_id = @customer_id)
      GROUP BY campaign_id`,
  },
  {
    fact: "keyword",
    table: "fact_keyword_daily",
    pk: ["account_id", "day", "criterion_id"],
    lookbackDays: HEAVY,
    sql: (env) => `
      SELECT
        segments_date AS day,
        CAST(campaign_id AS STRING) AS campaign_id,
        CAST(ad_group_id AS STRING) AS ad_group_id,
        CAST(ad_group_criterion_criterion_id AS STRING) AS criterion_id,
        ANY_VALUE(ad_group_criterion_keyword_text) AS keyword_text,
        ANY_VALUE(ad_group_criterion_keyword_match_type) AS match_type,
        ${BASE_METRICS}
      FROM ${tbl(env, "p_ads_KeywordBasicStats")}
      ${WHERE}
      GROUP BY day, campaign_id, ad_group_id, criterion_id
      ${HAVING_NONZERO}`,
  },
  {
    fact: "search_term",
    table: "fact_searchterm_daily",
    pk: ["account_id", "day", "campaign_id", "search_term"],
    lookbackDays: HEAVY,
    sql: (env) => `
      SELECT
        segments_date AS day,
        CAST(campaign_id AS STRING) AS campaign_id,
        search_term_view_search_term AS search_term,
        ${BASE_METRICS}
      FROM ${tbl(env, "p_ads_SearchQueryStats")}
      ${WHERE}
      GROUP BY day, campaign_id, search_term
      ${HAVING_NONZERO}`,
  },
  {
    fact: "geo",
    table: "fact_geo_daily",
    pk: ["account_id", "day", "campaign_id", "location_id"],
    lookbackDays: HEAVY,
    sql: (env) => `
      SELECT
        segments_date AS day,
        CAST(campaign_id AS STRING) AS campaign_id,
        CAST(segments_geo_target_city AS STRING) AS location_id,
        ${BASE_METRICS}
      FROM ${tbl(env, "p_ads_GeoStats")}
      ${WHERE}
      GROUP BY day, campaign_id, location_id
      ${HAVING_NONZERO}`,
  },
  {
    fact: "hour",
    table: "fact_hour_daily",
    pk: ["account_id", "day", "campaign_id", "hour", "device"],
    deleteFilter: "hour >= 0",
    lookbackDays: LIGHT,
    sql: (env) => `
      SELECT
        segments_date AS day,
        CAST(campaign_id AS STRING) AS campaign_id,
        segments_hour AS hour,
        segments_day_of_week AS day_of_week,
        'ALL' AS device,
        ${BASE_METRICS}
      FROM ${tbl(env, "p_ads_HourlyCampaignStats")}
      ${WHERE}
      GROUP BY day, campaign_id, hour, day_of_week`,
  },
  {
    fact: "device",
    table: "fact_hour_daily",
    pk: ["account_id", "day", "campaign_id", "hour", "device"],
    deleteFilter: "hour = -1",
    lookbackDays: LIGHT,
    sql: (env) => `
      SELECT
        segments_date AS day,
        CAST(campaign_id AS STRING) AS campaign_id,
        -1 AS hour,
        CAST(NULL AS STRING) AS day_of_week,
        segments_device AS device,
        ${BASE_METRICS}
      FROM ${tbl(env, "p_ads_CampaignBasicStats")}
      ${WHERE}
      GROUP BY day, campaign_id, device`,
  },
  {
    fact: "ad",
    table: "fact_ad_daily",
    pk: ["account_id", "day", "ad_id"],
    lookbackDays: HEAVY,
    sql: (env) => `
      SELECT
        segments_date AS day,
        CAST(campaign_id AS STRING) AS campaign_id,
        CAST(ad_group_id AS STRING) AS ad_group_id,
        CAST(ad_group_ad_ad_id AS STRING) AS ad_id,
        ANY_VALUE(ad_group_ad_ad_type) AS ad_type,
        ${BASE_METRICS}
      FROM ${tbl(env, "p_ads_AdBasicStats")}
      ${WHERE}
      GROUP BY day, campaign_id, ad_group_id, ad_id
      ${HAVING_NONZERO}`,
  },
  {
    fact: "audience_age",
    table: "fact_audience_daily",
    pk: ["account_id", "day", "campaign_id", "dimension", "bucket"],
    deleteFilter: "dimension = 'age'",
    lookbackDays: HEAVY,
    sql: (env) => `
      SELECT
        segments_date AS day,
        CAST(campaign_id AS STRING) AS campaign_id,
        'age' AS dimension,
        ad_group_criterion_age_range_type AS bucket,
        ${BASE_METRICS}
      FROM ${tbl(env, "p_ads_AgeRangeBasicStats")}
      ${WHERE}
      GROUP BY day, campaign_id, bucket
      ${HAVING_NONZERO}`,
  },
  {
    fact: "audience_gender",
    table: "fact_audience_daily",
    pk: ["account_id", "day", "campaign_id", "dimension", "bucket"],
    deleteFilter: "dimension = 'gender'",
    lookbackDays: HEAVY,
    sql: (env) => `
      SELECT
        segments_date AS day,
        CAST(campaign_id AS STRING) AS campaign_id,
        'gender' AS dimension,
        ad_group_criterion_gender_type AS bucket,
        ${BASE_METRICS}
      FROM ${tbl(env, "p_ads_GenderBasicStats")}
      ${WHERE}
      GROUP BY day, campaign_id, bucket
      ${HAVING_NONZERO}`,
  },
  {
    fact: "product",
    table: "fact_product_daily",
    pk: ["account_id", "day", "product_id"],
    lookbackDays: HEAVY,
    shoppingOnly: true,
    sql: (env) => `
      SELECT
        segments_date AS day,
        CAST(segments_product_item_id AS STRING) AS product_id,
        ANY_VALUE(segments_product_title) AS title,
        ${BASE_METRICS}
      FROM ${tbl(env, "p_ads_ShoppingProductStats")}
      ${WHERE}
      GROUP BY day, product_id
      ${HAVING_NONZERO}`,
  },
  {
    fact: "landing_page",
    table: "fact_landingpage_daily",
    pk: ["account_id", "day", "url"],
    lookbackDays: HEAVY,
    sql: (env) => `
      SELECT
        segments_date AS day,
        landing_page_view_unexpanded_final_url AS url,
        CAST(ROUND(AVG(NULLIF(metrics_speed_score, 0))) AS INT64) AS mobile_speed,
        ${BASE_METRICS}
      FROM ${tbl(env, "p_ads_LandingPageStats")}
      ${WHERE}
      GROUP BY day, url
      ${HAVING_NONZERO}`,
  },
];
