-- Bloque 55 · Fase 2: devoluciones semanales, estados del alumno, seguimiento del coach y alertas atendidas con nota
-- 1) Devolución semanal (la escribe el coach a partir de un borrador; el alumno la lee en Hoy y en Tu coach)
create table if not exists devoluciones (
  id bigserial primary key,
  alumno_id uuid not null references perfiles(id) on delete cascade,
  semana_inicio date not null,
  avance text, dificultad text, ajuste text, prioridad text,
  leida_at timestamptz,
  created_at timestamptz not null default now(),
  unique (alumno_id, semana_inicio)
);
alter table devoluciones enable row level security;
drop policy if exists devoluciones_coach on devoluciones;
create policy devoluciones_coach on devoluciones for all to authenticated using (public.es_coach()) with check (public.es_coach());
drop policy if exists devoluciones_alumno on devoluciones;
create policy devoluciones_alumno on devoluciones for select to authenticated using (alumno_id = auth.uid());
create or replace function public.devolucion_leida(dev bigint) returns void
language sql security definer set search_path = public as $$
  update devoluciones set leida_at = coalesce(leida_at, now()) where id = dev and alumno_id = auth.uid();
$$;
revoke all on function public.devolucion_leida(bigint) from public;
grant execute on function public.devolucion_leida(bigint) to authenticated;

-- 2) Estado del alumno en su servicio: activo, pausado (hasta una fecha) o regreso (2 semanas suaves)
alter table servicios add column if not exists estado text not null default 'activo';
alter table servicios drop constraint if exists servicios_estado_check;
alter table servicios add constraint servicios_estado_check check (estado in ('activo','pausado','regreso'));
alter table servicios add column if not exists estado_desde date;
alter table servicios add column if not exists estado_hasta date;
alter table servicios add column if not exists estado_nota text;

-- 3) Seguimiento privado del coach: próxima acción con fecha
create table if not exists seguimiento (
  alumno_id uuid primary key references perfiles(id) on delete cascade,
  proxima_accion text,
  proxima_fecha date,
  actualizado_at timestamptz not null default now()
);
alter table seguimiento enable row level security;
drop policy if exists seguimiento_coach on seguimiento;
create policy seguimiento_coach on seguimiento for all to authenticated using (public.es_coach()) with check (public.es_coach());

-- 4) Alertas atendidas con nota ("hablado por WhatsApp el 22/10")
alter table alertas_coach add column if not exists notas jsonb not null default '{}'::jsonb;
