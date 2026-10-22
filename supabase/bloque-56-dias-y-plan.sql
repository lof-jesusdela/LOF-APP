-- Bloque 56 · Entrenos por «Día 1, Día 2…» (no futbolistas) y plan semanal del alumno
-- 1) Plan de la semana: qué días se compromete a entrenar (0 = lunes … 6 = domingo)
create table if not exists plan_semana (
  id bigserial primary key,
  alumno_id uuid not null references perfiles(id) on delete cascade,
  semana_inicio date not null,
  dias smallint[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (alumno_id, semana_inicio)
);
alter table plan_semana enable row level security;
drop policy if exists plan_semana_coach on plan_semana;
create policy plan_semana_coach on plan_semana for all to authenticated using (public.es_coach()) with check (public.es_coach());
drop policy if exists plan_semana_alumno on plan_semana;
create policy plan_semana_alumno on plan_semana for all to authenticated using (alumno_id = auth.uid()) with check (alumno_id = auth.uid());

-- 2) Pasa a «Día 1, Día 2…» los programas de alumnos que NO son futbolistas (y las plantillas que no son de fútbol).
--    Conserva el nombre del entreno (si el día no tenía título y su nombre no era un día de la semana, pasa a título).
with progs as (
  select p.id from programas p
  where (p.alumno_id is not null and not exists (select 1 from servicios s where s.alumno_id = p.alumno_id and s.activo and coalesce(s.modulo_futbol, false)))
     or (p.alumno_id is null and translate(lower(coalesce(p.categoria, '')), 'áéíóú', 'aeiou') not like '%futbol%')
), semanal as (
  select d.id, d.programa_id, d.nombre, d.titulo,
    case split_part(translate(lower(d.nombre), 'áéíóú', 'aeiou'), ' ', 1)
      when 'lunes' then 1 when 'martes' then 2 when 'miercoles' then 3 when 'jueves' then 4 when 'viernes' then 5 when 'sabado' then 6 when 'domingo' then 7 else null end as dsem
  from dias d join progs on progs.id = d.programa_id
), afectados as (
  select programa_id from semanal group by programa_id having bool_or(dsem is not null)
), orden as (
  select s.id, s.nombre, s.titulo, s.dsem, row_number() over (partition by s.programa_id order by coalesce(s.dsem, 9), d.numero, s.id) as n
  from semanal s join dias d on d.id = s.id where s.programa_id in (select programa_id from afectados)
)
update dias d set nombre = 'Día ' || o.n, numero = o.n,
  titulo = coalesce(d.titulo, case when o.dsem is null then o.nombre end)
from orden o where o.id = d.id;

-- 3) Seguimiento de pasos opcional por alumno (futbolistas, sin pasos)
alter table servicios add column if not exists pasos_activo boolean not null default true;
update servicios set pasos_activo = false where coalesce(modulo_futbol, false);
