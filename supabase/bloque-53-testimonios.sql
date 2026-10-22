-- Bloque 53 · Testimonio mensual del alumno (cómo se siente y qué opina del servicio)
create table if not exists testimonios (
  id bigserial primary key,
  alumno_id uuid not null references perfiles(id) on delete cascade,
  fecha date not null,
  texto text not null,
  created_at timestamptz not null default now()
);
create index if not exists testimonios_alumno on testimonios (alumno_id, fecha desc);
alter table testimonios enable row level security;
drop policy if exists testimonios_coach on testimonios;
create policy testimonios_coach on testimonios for all to authenticated using (public.es_coach()) with check (public.es_coach());
drop policy if exists testimonios_alumno on testimonios;
create policy testimonios_alumno on testimonios for all to authenticated using (alumno_id = auth.uid()) with check (alumno_id = auth.uid());
