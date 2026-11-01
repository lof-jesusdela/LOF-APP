-- Bloque 77 · Registro de comidas con foto: hora y número de ingesta del día
alter table comidas_registro add column if not exists hora time;
alter table comidas_registro add column if not exists n_ingesta smallint;
notify pgrst, 'reload schema';
