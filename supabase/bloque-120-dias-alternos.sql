-- Bloque 120 · Días que alternan (A/B): el día con alterna_con = n se turna cada semana con el Día n
alter table dias add column if not exists alterna_con smallint;
