-- Bloque 35 · El alumno puede añadir nuevos resultados de sus tests (solo añadir: editar y borrar sigue siendo del coach)
alter table valoraciones add column if not exists origen text;   -- 'alumno' cuando lo registra el propio alumno

drop policy if exists "valoraciones_alumno_inserta" on valoraciones;
create policy "valoraciones_alumno_inserta" on valoraciones for insert to authenticated
  with check (alumno_id = auth.uid() and origen = 'alumno');

drop policy if exists "pruebas_alumno_inserta" on pruebas;
create policy "pruebas_alumno_inserta" on pruebas for insert to authenticated
  with check (alumno_id = auth.uid() and exists (select 1 from valoraciones v where v.id = valoracion_id and v.alumno_id = auth.uid() and v.origen = 'alumno'));
