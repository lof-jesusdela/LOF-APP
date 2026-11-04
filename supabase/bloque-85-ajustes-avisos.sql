-- Bloque 85 · Ajustes de avisos por alumno
-- 1) Lo que te llega a ti de cada alumno (tipos apagados) y si está silenciado: en el estado de alertas del coach
alter table alertas_coach add column if not exists config jsonb;
-- 2) Lo que el alumno ve en su app (Pendiente, Hoy y entreno). Vacío = todo encendido
alter table servicios add column if not exists avisos_alumno jsonb not null default '{}'::jsonb;
