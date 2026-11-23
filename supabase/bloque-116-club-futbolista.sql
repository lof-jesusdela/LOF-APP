-- Bloque 116 · Club del futbolista (nombre y escudo): sale en sus partidos, en tu calendario y en sus documentos
alter table servicios add column if not exists club_nombre text;
alter table servicios add column if not exists club_escudo text;
