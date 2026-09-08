-- Feature de concorrentes removida: o Google não expõe o Auction Insights real
-- via API/BigQuery e o proxy por termos de busca não foi mantido.
ALTER TABLE dim_account DROP COLUMN competitors;
