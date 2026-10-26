-- Bloque 66 · Hábitos como servicio contratable (bonus por pago único o proceso largo), independiente de los pasos
alter table servicios add column if not exists modulo_habitos boolean not null default false;
-- Quien ya tiene hábitos creados lo conserva activado
update servicios s set modulo_habitos = true where exists (select 1 from habitos h where h.alumno_id = s.alumno_id);
