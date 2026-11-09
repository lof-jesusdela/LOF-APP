-- Bloque 98 · Agenda: PTIs, revisiones y reuniones de negocio
-- Las citas sin alumno (PTI / primera sesión, reunión con partners) van en la misma tabla de sesiones,
-- con «persona» (con quién) y su duración. No gastan bono de ningún alumno.
alter table public.presenciales alter column alumno_id drop not null;
alter table public.presenciales add column if not exists persona text;
alter table public.presenciales add column if not exists duracion_min int;
notify pgrst, 'reload schema';
