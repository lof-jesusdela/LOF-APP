-- Bloque 71: cuántas comidas ha hecho el alumno en el día (puede ser más o menos que las del plan)
alter table registro_diario add column if not exists comidas_hechas integer;
notify pgrst, 'reload schema';
