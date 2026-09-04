import type { Env } from "../env";
import { tbl } from "../bq";

/**
 * Cada fato é uma query BigQuery cujas COLUNAS já saem com o nome exato
 * da coluna da tabela D1 (facilita o upsert genérico).
 *
 * Nomes de coluna validados contra o dataset real da MCC 9123420378 em 2026-09.
 * Se uma conta trouxer schema diferente, o fato aparece com erro em
 * `meta_refresh` e o ETL segue com os outros. Descubra o nome real com
 * GET /api/introspect?table=p_ads_XxxStats_9123420378
 */

export interface FactSpec {
  fact: string;
  table: string;
  pk: string[];
  sql: (env: Env) => string;
  mode?: "replace" | "update" | "upsert";
  deleteFilter?: string;
  lookbackDays: number;
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

const LIGHT = 400;
const HEAVY = 120;

/** snapshot mais recente de uma tabela de dimensão do transfer */
const latest = (env: Env, name: string) =>
  `(SELECT MAX(_DATA_DATE) FROM ${tbl(env, name)} WHERE customer_id = @customer_id)`;

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
      WHERE customer_id = @customer_id AND _DATA_DATE = ${latest(env, "ads_Campaign")}
      GROUP BY campaign_id`,
  },
  {
    fact: "keyword",
    table: "fact_keyword_daily",
    pk: ["account_id", "day", "criterion_id"],
    lookbackDays: HEAVY,
    sql: (env) => `
      WITH k AS (
        SELECT
          segments_date AS day,
          campaign_id, ad_group_id,
          ad_group_criterion_criterion_id AS criterion_id,
          ${BASE_METRICS}
        FROM ${tbl(env, "p_ads_KeywordBasicStats")}
        ${WHERE}
        GROUP BY day, campaign_id, ad_group_id, criterion_id
        ${HAVING_NONZERO}
      ),
      d AS (
        SELECT
          ad_group_criterion_criterion_id AS criterion_id,
          ANY_VALUE(ad_group_criterion_keyword_text) AS keyword_text,
          ANY_VALUE(ad_group_criterion_keyword_match_type) AS match_type,
          ANY_VALUE(ad_group_criterion_quality_info_quality_score) AS quality_score
        FROM ${tbl(env, "ads_Keyword")}
        WHERE customer_id = @customer_id AND _DATA_DATE = ${latest(env, "ads_Keyword")}
        GROUP BY criterion_id
      )
      SELECT
        k.day,
        CAST(k.campaign_id AS STRING) AS campaign_id,
        CAST(k.ad_group_id AS STRING) AS ad_group_id,
        CAST(k.criterion_id AS STRING) AS criterion_id,
        d.keyword_text, d.match_type, d.quality_score,
        k.impressions, k.clicks, k.cost, k.conversions, k.conversions_value
      FROM k LEFT JOIN d USING (criterion_id)`,
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
        CAST(segments_geo_target_most_specific_location AS STRING) AS location_id,
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
      WITH s AS (
        SELECT
          segments_date AS day,
          campaign_id, ad_group_id,
          ad_group_ad_ad_id AS ad_id,
          ${BASE_METRICS}
        FROM ${tbl(env, "p_ads_AdBasicStats")}
        ${WHERE}
        GROUP BY day, campaign_id, ad_group_id, ad_id
        ${HAVING_NONZERO}
      ),
      d AS (
        SELECT ad_group_ad_ad_id AS ad_id,
          ANY_VALUE(ad_group_ad_ad_type) AS ad_type
        FROM ${tbl(env, "ads_Ad")}
        WHERE customer_id = @customer_id AND _DATA_DATE = ${latest(env, "ads_Ad")}
        GROUP BY ad_id
      )
      SELECT
        s.day,
        CAST(s.campaign_id AS STRING) AS campaign_id,
        CAST(s.ad_group_id AS STRING) AS ad_group_id,
        CAST(s.ad_id AS STRING) AS ad_id,
        d.ad_type,
        s.impressions, s.clicks, s.cost, s.conversions, s.conversions_value
      FROM s LEFT JOIN d USING (ad_id)`,
  },
  {
    fact: "audience_age",
    table: "fact_audience_daily",
    pk: ["account_id", "day", "campaign_id", "dimension", "bucket"],
    deleteFilter: "dimension = 'age'",
    lookbackDays: HEAVY,
    sql: (env) => audienceSql(env, "age", "p_ads_AgeRangeBasicStats"),
  },
  {
    fact: "audience_gender",
    table: "fact_audience_daily",
    pk: ["account_id", "day", "campaign_id", "dimension", "bucket"],
    deleteFilter: "dimension = 'gender'",
    lookbackDays: HEAVY,
    sql: (env) => audienceSql(env, "gender", "p_ads_GenderBasicStats"),
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
    // LandingPageStats do transfer NÃO traz conversões — só impr/cliques/custo/speed.
    fact: "landing_page",
    table: "fact_landingpage_daily",
    pk: ["account_id", "day", "url"],
    lookbackDays: HEAVY,
    sql: (env) => `
      SELECT
        segments_date AS day,
        landing_page_view_unexpanded_final_url AS url,
        CAST(ROUND(AVG(NULLIF(metrics_speed_score, 0))) AS INT64) AS mobile_speed,
        SUM(metrics_impressions) AS impressions,
        SUM(metrics_clicks)      AS clicks,
        ROUND(SUM(${M}), 4)      AS cost,
        0 AS conversions,
        0 AS conversions_value
      FROM ${tbl(env, "p_ads_LandingPageStats")}
      ${WHERE}
      GROUP BY day, url
      ${HAVING_NONZERO}`,
  },
];

function audienceSql(env: Env, dim: "age" | "gender", statsTable: string): string {
  return `
    WITH s AS (
      SELECT
        segments_date AS day,
        campaign_id,
        ad_group_criterion_criterion_id AS criterion_id,
        ${BASE_METRICS}
      FROM ${tbl(env, statsTable)}
      ${WHERE}
      GROUP BY day, campaign_id, criterion_id
      ${HAVING_NONZERO}
    ),
    d AS (
      SELECT
        ad_group_criterion_criterion_id AS criterion_id,
        ANY_VALUE(ad_group_criterion_display_name) AS bucket
      FROM ${tbl(env, "ads_AdGroupCriterion")}
      WHERE _DATA_DATE = (SELECT MAX(_DATA_DATE) FROM ${tbl(env, "ads_AdGroupCriterion")})
      GROUP BY criterion_id
    )
    SELECT
      s.day,
      CAST(s.campaign_id AS STRING) AS campaign_id,
      '${dim}' AS dimension,
      COALESCE(d.bucket, CAST(s.criterion_id AS STRING)) AS bucket,
      s.impressions, s.clicks, s.cost, s.conversions, s.conversions_value
    FROM s LEFT JOIN d USING (criterion_id)`;
}
