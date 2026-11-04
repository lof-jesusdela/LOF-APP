-- Bloque 83 · Cuestionario de estilo de vida y lista de alimentos (preferencias) dentro de la app
-- Un registro por alumno y tipo ('estilo' | 'preferencias'). Se puede guardar a medias (enviado_at vacío) y enviar a Jesús.
create table if not exists cuestionarios (
  id bigserial primary key,
  alumno_id uuid not null references perfiles(id) on delete cascade,
  tipo text not null check (tipo in ('estilo', 'preferencias')),
  datos jsonb not null default '{}'::jsonb,
  enviado_at timestamptz,
  actualizado_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (alumno_id, tipo)
);
alter table cuestionarios enable row level security;
drop policy if exists cuestionarios_coach on cuestionarios;
create policy cuestionarios_coach on cuestionarios for all to authenticated using (public.es_coach()) with check (public.es_coach());
drop policy if exists cuestionarios_alumno on cuestionarios;
create policy cuestionarios_alumno on cuestionarios for all to authenticated using (alumno_id = auth.uid()) with check (alumno_id = auth.uid());
