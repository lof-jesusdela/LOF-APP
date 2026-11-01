-- Bloque 76 · Tipo de día (contexto) que el alumno marca en su registro diario
alter table registro_diario add column if not exists contexto text;
notify pgrst, 'reload schema';
