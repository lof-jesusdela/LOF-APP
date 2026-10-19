-- Bloque 38 · Imágenes de ejercicios y de bloques desde el editor de entrenamientos
-- Asegura el bucket público «ejercicios», que el coach pueda subir y reemplazar fotos y que los bloques guarden su imagen.
insert into storage.buckets (id, name, public) values ('ejercicios', 'ejercicios', true)
  on conflict (id) do update set public = true;

drop policy if exists "ejercicios_coach_todo" on storage.objects;
create policy "ejercicios_coach_todo" on storage.objects for all to authenticated
  using (bucket_id = 'ejercicios' and public.es_coach()) with check (bucket_id = 'ejercicios' and public.es_coach());
drop policy if exists "ejercicios_lectura" on storage.objects;
create policy "ejercicios_lectura" on storage.objects for select
  using (bucket_id = 'ejercicios');

alter table bloques_sesion add column if not exists imagen_url text;
