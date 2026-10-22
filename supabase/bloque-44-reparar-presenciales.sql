-- Bloque 44 · Reparar la tabla de sesiones presenciales
-- Se puede ejecutar aunque ya estuviera bien: solo añade lo que falte.

-- 1) Columnas que usa la app
alter table public.presenciales add column if not exists hora time;
alter table public.presenciales add column if not exists estado text not null default 'programada';
alter table public.presenciales add column if not exists sesion_id bigint;
alter table public.presenciales add column if not exists nota text;
alter table public.presenciales add column if not exists tipo text;
alter table public.presenciales add column if not exists calendly_uri text;

-- 2) Estados permitidos: programada, dada (hecha), tarde (aviso < 24 h) y cancelada
do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.presenciales'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%estado%'
  loop execute format('alter table public.presenciales drop constraint %I', c.conname); end loop;
end $$;
alter table public.presenciales add constraint presenciales_estado_check
  check (estado in ('programada', 'dada', 'tarde', 'cancelada'));

-- 3) Permisos: el coach puede crear, editar y borrar; el alumno ve las suyas
alter table public.presenciales enable row level security;
drop policy if exists presenciales_coach_todo on public.presenciales;
create policy presenciales_coach_todo on public.presenciales for all
  using (exists (select 1 from public.perfiles p where p.id = auth.uid() and p.rol = 'coach'))
  with check (exists (select 1 from public.perfiles p where p.id = auth.uid() and p.rol = 'coach'));
drop policy if exists presenciales_alumno_ve on public.presenciales;
create policy presenciales_alumno_ve on public.presenciales for select using (alumno_id = auth.uid());

notify pgrst, 'reload schema';
