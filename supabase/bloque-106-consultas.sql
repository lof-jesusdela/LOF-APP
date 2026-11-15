-- «Habla con Jesús»: consultas guiadas del alumno y respuesta dentro de la app.
create table if not exists consultas (
  id bigserial primary key,
  alumno_id uuid not null default auth.uid() references perfiles(id) on delete cascade,
  tema text not null default 'otro',         -- dolor | ejercicio | nutricion | cita | pago | otro | fin_entreno
  urgente boolean not null default false,
  ejercicio text,
  sesion_ref text,
  texto text,
  estado text not null default 'abierta',    -- abierta | respondida | cerrada
  respuesta text,
  respondida_at timestamptz,
  visto_alumno_at timestamptz,
  cerrada_at timestamptz,
  creado_at timestamptz not null default now()
);
create index if not exists consultas_alumno_idx on consultas(alumno_id, creado_at desc);
alter table consultas enable row level security;
drop policy if exists consultas_coach on consultas;
create policy consultas_coach on consultas for all to authenticated using (public.es_coach()) with check (public.es_coach());
drop policy if exists consultas_alumno_ver on consultas;
create policy consultas_alumno_ver on consultas for select to authenticated using (alumno_id = auth.uid());
drop policy if exists consultas_alumno_crear on consultas;
create policy consultas_alumno_crear on consultas for insert to authenticated with check (alumno_id = auth.uid());
drop policy if exists consultas_alumno_visto on consultas;
create policy consultas_alumno_visto on consultas for update to authenticated using (alumno_id = auth.uid()) with check (alumno_id = auth.uid());
notify pgrst, 'reload schema';
