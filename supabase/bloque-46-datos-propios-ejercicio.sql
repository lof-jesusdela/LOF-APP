-- Bloque 46 · Nombre, vídeo e imagen del músculo propios de un ejercicio en un programa
alter table ejercicios_sesion add column if not exists nombre text;
alter table ejercicios_sesion add column if not exists video_url text;
alter table ejercicios_sesion add column if not exists musculo_img_url text;
notify pgrst, 'reload schema';
