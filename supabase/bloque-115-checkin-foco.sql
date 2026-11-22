-- Bloque 115 · Check-in semanal: comentario del alumno sobre su foco
-- (La organización de la semana —tipo de día, entreno y exceso— se guarda en plan_nutri_semana, que ya existe desde el Bloque 80.)
alter table checkins add column if not exists foco_comentario text;
