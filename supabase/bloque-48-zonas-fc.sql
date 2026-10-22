-- Bloque 48 · Modelo de zonas de FC (3 o 5) y zonas ajustadas a mano por alumno
alter table servicios add column if not exists fc_modelo int;
alter table servicios add column if not exists fc_zonas jsonb;
notify pgrst, 'reload schema';
