-- Bloque 43 · Foto propia por programa y ejercicios solo para un programa
-- Foto de un ejercicio solo en este programa/plantilla (manda sobre la de la biblioteca)
alter table ejercicios_sesion add column if not exists imagen_url text;
-- Ejercicios creados "solo para este programa": no salen en la biblioteca ni en el buscador
alter table ejercicios add column if not exists privado boolean not null default false;
notify pgrst, 'reload schema';
