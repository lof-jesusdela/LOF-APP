-- Bloque 101 · Citas que se repiten (cada día, semana, mes…): todas las de la serie comparten «serie»
alter table public.presenciales add column if not exists serie uuid;
create index if not exists presenciales_serie_idx on public.presenciales (serie);
notify pgrst, 'reload schema';
