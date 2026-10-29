-- Bloque 70: poder quitar el acceso a un alumno sin borrar su perfil
alter table perfiles add column if not exists acceso_pausado boolean not null default false;
notify pgrst, 'reload schema';
