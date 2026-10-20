-- Bloque 40 · Imagen resumen en las pruebas (movilidad articular, análisis de carrera y caminata…)
-- Una foto por prueba, en el bucket privado «planificacion» (carpeta del alumno): el alumno ve la suya, el coach todas.
alter table pruebas add column if not exists imagen_url text;   -- ruta en el bucket «planificacion»

drop policy if exists "planificacion_alumno_pruebas" on storage.objects;
create policy "planificacion_alumno_pruebas" on storage.objects for select to authenticated
  using (bucket_id = 'planificacion' and (storage.foldername(name))[1] = auth.uid()::text and storage.filename(name) like 'prueba-%');
