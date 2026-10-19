-- Bloque 34 · Contextos temporales de entrenamiento
-- Un programa paralelo para unas semanas concretas (vacaciones, viaje, lesión…). Durante esas semanas el alumno
-- entrena sus sesiones y su cumplimiento se mide con ellas; al terminar vuelve solo a su programa.
alter table programas add column if not exists contexto_desde date;   -- lunes de la primera semana
alter table programas add column if not exists contexto_hasta date;   -- domingo de la última semana
alter table programas add column if not exists contexto_nombre text;  -- lo que ve el alumno (p. ej. "Vacaciones")
create index if not exists programas_contexto_idx on programas (alumno_id, contexto_desde) where contexto_desde is not null;
