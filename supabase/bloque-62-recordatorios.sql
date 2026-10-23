-- Bloque 62 · Recordatorios de seguimiento del coach (cambios pendientes en entrenos, programa o app), en orden de prioridad
create table if not exists recordatorios (
  id bigserial primary key,
  alumno_id uuid references perfiles(id) on delete cascade,
  texto text not null,
  tipo text not null default 'entreno',
  orden int not null default 0,
  hecho_at timestamptz,
  created_at timestamptz not null default now()
);
alter table recordatorios enable row level security;
drop policy if exists recordatorios_coach on recordatorios;
create policy recordatorios_coach on recordatorios for all to authenticated using (public.es_coach()) with check (public.es_coach());
