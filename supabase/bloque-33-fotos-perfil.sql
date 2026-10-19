-- Bloque 33 · Foto de perfil de cada alumno
-- La pone el coach desde la ficha o el propio alumno desde "Mi cuenta". Si no hay foto, se ve el icono de perfil.
alter table perfiles add column if not exists foto_url text;

-- Espacio "avatares": las fotos se ven con su enlace; cada alumno solo sube a su carpeta y el coach a cualquiera
insert into storage.buckets (id, name, public) values ('avatares', 'avatares', true)
  on conflict (id) do update set public = true;

drop policy if exists "avatares_coach_todo" on storage.objects;
drop policy if exists "avatares_alumno_sube" on storage.objects;
create policy "avatares_coach_todo" on storage.objects for all to authenticated
  using (bucket_id = 'avatares' and public.es_coach()) with check (bucket_id = 'avatares' and public.es_coach());
create policy "avatares_alumno_sube" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);

-- El alumno guarda su foto sin poder cambiar nada más de su perfil (solo enlaces de su propia carpeta)
create or replace function public.poner_mi_foto(url text) returns void
  language sql security definer set search_path = public as $$
  update perfiles set foto_url = url
   where id = auth.uid()
     and (url is null or url like '%/storage/v1/object/public/avatares/' || auth.uid()::text || '/%');
$$;
revoke all on function public.poner_mi_foto(text) from public;
grant execute on function public.poner_mi_foto(text) to authenticated;
