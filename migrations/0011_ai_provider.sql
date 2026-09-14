-- Provedor de IA usado nas gerações (Análise IA, Diagnóstico IA, Classificação
-- de termos), configurável por conta em Configurações.

ALTER TABLE dim_account ADD COLUMN ai_provider TEXT NOT NULL DEFAULT 'gemini';
