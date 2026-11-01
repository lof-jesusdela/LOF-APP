-- Bloque 75 · Tareas del coach por alumno (no las ve el alumno): plazo y prioridad
create table if not exists tareas_coach (
  id bigserial primary key,
  alumno_id uuid not null references perfiles(id) on delete cascade,
  texto text not null,
  vence date,
  prioridad text not null default 'media' check (prioridad in ('alta', 'media', 'baja')),
  hecha_at timestamptz,
  creado_at timestamptz not null default now()
);
create index if not exists tareas_coach_pend on tareas_coach(alumno_id) where hecha_at is null;
alter table tareas_coach enable row level security;
drop policy if exists tareas_coach_coach on tareas_coach;
create policy tareas_coach_coach on tareas_coach for all
  using (exists (select 1 from perfiles p where p.id = auth.uid() and p.rol = 'coach'))
  with check (exists (select 1 from perfiles p where p.id = auth.uid() and p.rol = 'coach'));
notify pgrst, 'reload schema';
