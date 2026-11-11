-- Bloque 102 · Sincronización instantánea con Google Calendar: id del evento de Google de cada cita
alter table public.presenciales add column if not exists gcal_id text;
notify pgrst, 'reload schema';
