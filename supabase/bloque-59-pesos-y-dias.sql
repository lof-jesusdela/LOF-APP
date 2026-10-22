-- Bloque 59 · Quitar días del bloque conservando su historial, y cambios de peso que decide el alumno
-- 1) Días quitados del bloque (si ya tienen entrenos registrados no se pueden borrar: se ocultan)
alter table dias add column if not exists oculto boolean not null default false;

-- 2) Registro de cambios de peso hechos por el alumno (el coach los ve en su sesión y en sus alertas)
create table if not exists cambios_peso (
  id bigserial primary key,
  alumno_id uuid not null references perfiles(id) on delete cascade,
  ejercicio_sesion_id bigint not null,
  sesion_id bigint,
  ejercicio text,
  antes text, despues text,
  visto_at timestamptz,
  created_at timestamptz not null default now()
);
alter table cambios_peso enable row level security;
drop policy if exists cambios_peso_coach on cambios_peso;
create policy cambios_peso_coach on cambios_peso for all to authenticated using (public.es_coach()) with check (public.es_coach());
drop policy if exists cambios_peso_alumno on cambios_peso;
create policy cambios_peso_alumno on cambios_peso for select to authenticated using (alumno_id = auth.uid());

-- 3) El alumno actualiza el peso pautado de SU ejercicio (solo en sus programas) y queda registrado
create or replace function public.ajustar_peso(es bigint, pauta_nueva jsonb, peso_nuevo text, antes text, despues text, sesion bigint default null, nombre text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from ejercicios_sesion e join bloques_sesion b on b.id = e.bloque_id join dias d on d.id = b.dia_id join programas p on p.id = d.programa_id
                 where e.id = es and p.alumno_id = auth.uid()) then
    raise exception 'no permitido';
  end if;
  update ejercicios_sesion set pauta = coalesce(pauta_nueva, pauta), peso_ref = coalesce(peso_nuevo, peso_ref) where id = es;
  insert into cambios_peso (alumno_id, ejercicio_sesion_id, sesion_id, ejercicio, antes, despues) values (auth.uid(), es, sesion, nombre, antes, despues);
end $$;
revoke all on function public.ajustar_peso(bigint, jsonb, text, text, text, bigint, text) from public;
grant execute on function public.ajustar_peso(bigint, jsonb, text, text, text, bigint, text) to authenticated;

-- 4) Método de cada medición (cinta, bioimpedancia, plicómetro…)
alter table mediciones add column if not exists metodo text;
