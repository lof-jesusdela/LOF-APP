-- Bloque 50 · Extensiones del proceso y entrenos hechos antes de la app
alter table servicios add column if not exists extensiones jsonb not null default '[]'::jsonb;
alter table sesiones_hechas add column if not exists previa boolean not null default false;
create index if not exists sesiones_hechas_previa_idx on sesiones_hechas (alumno_id) where previa;

-- Revisión: quién tiene marcada la nutrición (pestaña Nutrición y registro de comidas).
-- Para quitarla a alguien: ficha → Plan → Editar → desmarca "Nutrición".
select p.nombre, s.producto, s.modulo_nutricion
from servicios s join perfiles p on p.id = s.alumno_id
where s.activo
order by s.modulo_nutricion desc, p.nombre;
