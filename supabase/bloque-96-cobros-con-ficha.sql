-- Bloque 96 · Enlazar los cobros del histórico con la ficha del alumno + sexo para estadísticas
-- Se puede ejecutar más de una vez sin problema.
alter table movimientos add column if not exists alumno_id uuid references perfiles(id) on delete set null;
alter table movimientos add column if not exists sexo text;   -- hombre · mujer (para alumnos antiguos sin ficha)
create index if not exists movimientos_alumno_idx on movimientos (alumno_id);
