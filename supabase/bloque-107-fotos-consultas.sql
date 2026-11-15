-- Bloque 107 · Fotos en el chat «Habla con Jesús» (una por mensaje, privadas, se borran a los 60 días)
alter table consultas add column if not exists foto text;
insert into storage.buckets (id, name, public) values ('consultas', 'consultas', false) on conflict (id) do nothing;
drop policy if exists consultas_fotos_subir on storage.objects;
create policy consultas_fotos_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'consultas' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists consultas_fotos_ver on storage.objects;
create policy consultas_fotos_ver on storage.objects for select to authenticated
  using (bucket_id = 'consultas' and ((storage.foldername(name))[1] = auth.uid()::text or public.es_coach()));
drop policy if exists consultas_fotos_borrar on storage.objects;
create policy consultas_fotos_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'consultas' and public.es_coach());
notify pgrst, 'reload schema';
