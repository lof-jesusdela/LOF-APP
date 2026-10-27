-- Avisos al alumno («Tu semana está lista») y suscripciones push de cada móvil.
create table if not exists avisos (
  id bigserial primary key,
  alumno_id uuid not null references perfiles(id) on delete cascade,
  tipo text not null default 'semana',
  semana_inicio date,
  titulo text,
  cuerpo text,
  creado_at timestamptz not null default now(),
  visto_at timestamptz
);
alter table avisos enable row level security;
drop policy if exists avisos_coach on avisos;
create policy avisos_coach on avisos for all to authenticated using (public.es_coach()) with check (public.es_coach());
drop policy if exists avisos_alumno_ver on avisos;
create policy avisos_alumno_ver on avisos for select to authenticated using (alumno_id = auth.uid());
drop policy if exists avisos_alumno_visto on avisos;
create policy avisos_alumno_visto on avisos for update to authenticated using (alumno_id = auth.uid()) with check (alumno_id = auth.uid());

create table if not exists push_suscripciones (
  id bigserial primary key,
  alumno_id uuid not null default auth.uid() references perfiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  creado_at timestamptz not null default now()
);
alter table push_suscripciones enable row level security;
drop policy if exists push_alumno on push_suscripciones;
create policy push_alumno on push_suscripciones for all to authenticated using (alumno_id = auth.uid()) with check (alumno_id = auth.uid());
drop policy if exists push_coach_ver on push_suscripciones;
create policy push_coach_ver on push_suscripciones for select to authenticated using (public.es_coach());
notify pgrst, 'reload schema';
