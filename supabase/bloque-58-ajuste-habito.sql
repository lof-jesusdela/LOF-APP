-- Bloque 58 · Cuándo ajustó el alumno su hábito (para avisar al coach)
alter table habitos add column if not exists ajustado_alumno_at timestamptz;
