-- Bloque 29: reservas de Calendly sincronizadas automáticamente
alter table presenciales add column if not exists calendly_uri text;
create unique index if not exists presenciales_calendly_uri_key on presenciales (calendly_uri);
