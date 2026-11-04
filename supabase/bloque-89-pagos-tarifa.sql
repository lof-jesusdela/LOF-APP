-- Bloque 89 · Cada cuota guarda su tarifa (para las métricas por programa)
alter table pagos add column if not exists tarifa text;
