-- Bloque 51 · Alertas del coach: vistas (quita la notificación) y solventadas (punto verde)
create table if not exists alertas_coach (
  alumno_id uuid primary key references perfiles(id) on delete cascade,
  vistas text[] not null default '{}',
  resueltas text[] not null default '{}',
  actualizado_at timestamptz not null default now()
);
alter table alertas_coach enable row level security;
drop policy if exists alertas_coach_coach on alertas_coach;
create policy alertas_coach_coach on alertas_coach for all
  using (exists (select 1 from perfiles p where p.id = auth.uid() and p.rol = 'coach'))
  with check (exists (select 1 from perfiles p where p.id = auth.uid() and p.rol = 'coach'));
