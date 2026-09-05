-- Lista de concorrentes por conta (um por linha: nome ou termo de marca).
-- Usada para rastrear gasto/desempenho nos termos de busca que mencionam
-- esses nomes e alimentar a página "Concorrentes" e a Análise IA.
ALTER TABLE dim_account ADD COLUMN competitors TEXT;
