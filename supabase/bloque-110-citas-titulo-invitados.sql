-- Bloque 110 · Citas: título propio e invitados por correo (también personas que no están en la app)
alter table presenciales add column if not exists titulo text;
alter table presenciales add column if not exists invitados text;   -- correos separados por comas; vacío = los correos de sus alumnos
notify pgrst, 'reload schema';
