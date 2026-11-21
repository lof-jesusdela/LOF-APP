-- Bloque 113 · Chat en tiempo real: los mensajes llegan al momento (como en WhatsApp)
-- Cada uno sigue viendo solo lo suyo: el tiempo real respeta las mismas reglas de seguridad (RLS) de la tabla
alter publication supabase_realtime add table consultas;
