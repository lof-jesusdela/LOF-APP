-- Bloque 36 · Frase motivadora de cada alumno (la ve en el saludo de Hoy; si está vacía sale la frase general)
alter table perfiles add column if not exists frase_motivacion text;
