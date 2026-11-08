-- Bloque 97 · Fecha de fin manual del servicio (opcional)
-- Si se rellena, manda sobre inicio + semanas. Se puede ejecutar más de una vez.
alter table servicios add column if not exists fin_manual date;
