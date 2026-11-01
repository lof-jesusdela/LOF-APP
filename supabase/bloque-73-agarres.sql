-- Bloque 73 · Tipo de agarre por ejercicio (supino, neutro, prono) con imagen común a todos los ejercicios
alter table ejercicios_sesion add column if not exists agarre text;
notify pgrst, 'reload schema';
