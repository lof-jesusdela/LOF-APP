-- Bloque 57 · Fase de la alimentación por alumno (recogida, preparación, activo, revisión).
-- Vacío = automática: «activo» si tiene plan visible y, si no, «en preparación». En recogida y preparación no se mide el cumplimiento.
alter table servicios add column if not exists nutri_fase text;
alter table servicios drop constraint if exists servicios_nutri_fase_check;
alter table servicios add constraint servicios_nutri_fase_check check (nutri_fase is null or nutri_fase in ('recogida','preparacion','activo','revision'));
