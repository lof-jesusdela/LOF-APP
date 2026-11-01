-- Bloque 74 · Temática de cada día de entreno (elige la imagen de portada que ve el alumno antes de empezar)
alter table dias add column if not exists tematica text;
notify pgrst, 'reload schema';
