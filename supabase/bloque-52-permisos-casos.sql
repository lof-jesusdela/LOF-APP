-- Bloque 52 · Consentimientos (RGPD + testimonio + fotos), fotos de progreso y casos de éxito
-- 1) Consentimientos: cada decisión es una fila nueva (queda el historial con fecha y versión del texto)
create table if not exists consentimientos (
  id bigserial primary key,
  alumno_id uuid not null references perfiles(id) on delete cascade,
  datos boolean not null default true,
  testimonio boolean not null default false,
  fotos boolean not null default false,
  identificacion text not null default 'pila' check (identificacion in ('anonimo','pila','completo')),
  version text not null,
  agente text,
  created_at timestamptz not null default now()
);
create index if not exists consentimientos_alumno on consentimientos (alumno_id, created_at desc);
alter table consentimientos enable row level security;
drop policy if exists consentimientos_coach on consentimientos;
create policy consentimientos_coach on consentimientos for select to authenticated using (public.es_coach());
drop policy if exists consentimientos_alumno_ver on consentimientos;
create policy consentimientos_alumno_ver on consentimientos for select to authenticated using (alumno_id = auth.uid());
drop policy if exists consentimientos_alumno_alta on consentimientos;
create policy consentimientos_alumno_alta on consentimientos for insert to authenticated with check (alumno_id = auth.uid());
-- (sin update ni delete: el historial no se modifica)

-- 2) Fotos de progreso (frente, perfil, espalda) en el bucket privado «progreso»
create table if not exists fotos_progreso (
  id bigserial primary key,
  alumno_id uuid not null references perfiles(id) on delete cascade,
  fecha date not null,
  vista text not null check (vista in ('frente','perfil','espalda','otra')),
  ruta text not null,
  created_at timestamptz not null default now()
);
create index if not exists fotos_progreso_alumno on fotos_progreso (alumno_id, fecha desc);
alter table fotos_progreso enable row level security;
drop policy if exists fotos_progreso_coach on fotos_progreso;
create policy fotos_progreso_coach on fotos_progreso for all to authenticated using (public.es_coach()) with check (public.es_coach());
drop policy if exists fotos_progreso_alumno on fotos_progreso;
create policy fotos_progreso_alumno on fotos_progreso for all to authenticated using (alumno_id = auth.uid()) with check (alumno_id = auth.uid());

insert into storage.buckets (id, name, public) values ('progreso', 'progreso', false) on conflict (id) do nothing;
drop policy if exists progreso_coach on storage.objects;
create policy progreso_coach on storage.objects for all to authenticated
  using (bucket_id = 'progreso' and public.es_coach()) with check (bucket_id = 'progreso' and public.es_coach());
drop policy if exists progreso_alumno on storage.objects;
create policy progreso_alumno on storage.objects for all to authenticated
  using (bucket_id = 'progreso' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'progreso' and (storage.foldername(name))[1] = auth.uid()::text);

-- 3) Casos de éxito: Jesús propone, el alumno aprueba o rechaza antes de publicar
create table if not exists casos_exito (
  id bigserial primary key,
  alumno_id uuid not null references perfiles(id) on delete cascade,
  tipo text not null check (tipo in ('testimonio','fotos','ambos')),
  texto text,
  rutas text[] not null default '{}',
  donde text,
  identificacion text not null default 'pila',
  estado text not null default 'pendiente' check (estado in ('pendiente','aprobado','rechazado')),
  nota_alumno text,
  respondido_at timestamptz,
  created_at timestamptz not null default now()
);
alter table casos_exito enable row level security;
drop policy if exists casos_exito_coach on casos_exito;
create policy casos_exito_coach on casos_exito for all to authenticated using (public.es_coach()) with check (public.es_coach());
drop policy if exists casos_exito_alumno on casos_exito;
create policy casos_exito_alumno on casos_exito for select to authenticated using (alumno_id = auth.uid());

-- El alumno solo puede responder (aprobar / rechazar) sus propias propuestas pendientes
create or replace function public.responder_caso(caso bigint, aprobado boolean, nota text default null) returns void
language sql security definer set search_path = public as $$
  update casos_exito set estado = case when aprobado then 'aprobado' else 'rechazado' end,
         nota_alumno = nota, respondido_at = now()
  where id = caso and alumno_id = auth.uid() and estado = 'pendiente';
$$;
revoke all on function public.responder_caso(bigint, boolean, text) from public;
grant execute on function public.responder_caso(bigint, boolean, text) to authenticated;
