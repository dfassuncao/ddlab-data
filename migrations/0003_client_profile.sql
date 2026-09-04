-- Perfil do cliente ideal por conta: usado para contextualizar a análise
-- (Oportunidades) e não só olhar CPA isolado.
ALTER TABLE dim_account ADD COLUMN profile_notes TEXT;
ALTER TABLE dim_account ADD COLUMN ideal_ticket_min REAL;
ALTER TABLE dim_account ADD COLUMN lead_goal_monthly INTEGER;
