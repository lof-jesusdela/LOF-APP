-- Bloque 111 · Citas: color elegido a mano (colorId de Google Calendar, 1–11); vacío = color automático por tipo
alter table presenciales add column if not exists color text;
notify pgrst, 'reload schema';
