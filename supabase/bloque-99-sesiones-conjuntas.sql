-- Bloque 99 · Sesiones conjuntas (p. ej. dos alumnas que entrenan juntas)
-- Una fila por alumno (a cada uno le cuenta en su bono) unidas por el mismo «grupo».
alter table public.presenciales add column if not exists grupo uuid;
create index if not exists presenciales_grupo_idx on public.presenciales (grupo);
notify pgrst, 'reload schema';
