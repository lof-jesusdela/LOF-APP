-- Bloque 108 · Chat: doble check gris (mensaje recibido en el móvil del alumno). El azul (leído) ya usa visto_alumno_at.
alter table consultas add column if not exists entregado_at timestamptz;
notify pgrst, 'reload schema';
