-- Bloque 87 · Valoraciones incluidas en lo contratado (no cuentan como entrenamiento)
alter table servicios add column if not exists valoracion_inicial boolean;  -- lanzamiento presencial (presencial e híbrido)
alter table servicios add column if not exists valoracion_final boolean;    -- comparativa con la inicial (procesos de 6 y 10 meses)
