-- Contas da MCC DDLab (912-342-0378). Ajuste target_cpa / monthly_budget / has_shopping conforme a realidade.
INSERT OR REPLACE INTO dim_account (id, customer_id, name, currency, timezone, target_cpa, monthly_budget, has_shopping, active, sort_order) VALUES
  ('doin-motors',       '5234237178', 'Doin Motors',           'BRL', 'America/Sao_Paulo', NULL, NULL, 0, 1, 10),
  ('ksc-advogados',     '2401753795', 'KSC Advogados',         'BRL', 'America/Sao_Paulo', NULL, NULL, 0, 1, 20),
  ('prime-santos',      '2597642475', 'Prime Santos',          'BRL', 'America/Sao_Paulo', NULL, NULL, 0, 1, 30),
  ('vaz-galvao',        '4913145194', 'Vaz Galvão Advocacia',  'BRL', 'America/Sao_Paulo', NULL, NULL, 0, 1, 40),
  ('ddlab-mkt-perf',    '1189685284', 'DDLab - Mkt Performance','BRL', 'America/Sao_Paulo', NULL, NULL, 0, 1, 50);
