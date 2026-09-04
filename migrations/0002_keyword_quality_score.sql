-- Quality Score da palavra-chave (vem de ads_Keyword no ETL).
ALTER TABLE fact_keyword_daily ADD COLUMN quality_score INTEGER;
