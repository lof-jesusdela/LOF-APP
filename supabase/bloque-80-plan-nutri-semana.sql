-- Bloque 80 · Planificador semanal de alimentación del alumno (días de entreno y trabajo, menú, comidas libres y lista de la compra)
create table if not exists plan_nutri_semana (
  id bigserial primary key,
  alumno_id uuid not null references perfiles(id) on delete cascade,
  semana_inicio date not null,
  datos jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (alumno_id, semana_inicio)
);
alter table plan_nutri_semana enable row level security;
drop policy if exists plan_nutri_semana_coach on plan_nutri_semana;
create policy plan_nutri_semana_coach on plan_nutri_semana for all to authenticated using (public.es_coach()) with check (public.es_coach());
drop policy if exists plan_nutri_semana_alumno on plan_nutri_semana;
create policy plan_nutri_semana_alumno on plan_nutri_semana for all to authenticated using (alumno_id = auth.uid()) with check (alumno_id = auth.uid());
