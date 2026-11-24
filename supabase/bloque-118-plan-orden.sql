-- Bloque 118 · El alumno puede elegir qué día hace cada sesión de la semana (y cambiar el orden)
alter table plan_semana add column if not exists asig jsonb;
