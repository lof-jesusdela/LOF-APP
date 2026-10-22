-- Bloque 49 · Élite Player: catálogo de movilidad, tipo de día, partido completo y entrenamiento invisible
-- 1) Catálogo de vídeos de movilidad (los de tus programas y de las hojas de los futbolistas)
create table if not exists public.movilidad_catalogo (
  id bigint generated always as identity primary key,
  titulo text not null,
  video_url text,
  imagen_url text,
  zona text,
  creado_at timestamptz default now()
);
alter table public.movilidad_catalogo enable row level security;
drop policy if exists movcat_coach on public.movilidad_catalogo;
create policy movcat_coach on public.movilidad_catalogo for all
  using (exists (select 1 from public.perfiles p where p.id = auth.uid() and p.rol = 'coach'))
  with check (exists (select 1 from public.perfiles p where p.id = auth.uid() and p.rol = 'coach'));
drop policy if exists movcat_leer on public.movilidad_catalogo;
create policy movcat_leer on public.movilidad_catalogo for select using (auth.uid() is not null);
insert into public.movilidad_catalogo (titulo, video_url, imagen_url, zona)
select * from (values
  ('Activación miofascial', 'https://youtu.be/YMrYxeQgf0o', 'https://i.ytimg.com/vi/YMrYxeQgf0o/hqdefault.jpg', 'Activación'),
  ('Movilidad de psoas y flexores de cadera', 'https://youtu.be/0Tr_i3Dljuk', 'https://i.ytimg.com/vi/0Tr_i3Dljuk/hqdefault.jpg', 'Cadera'),
  ('Movilidad de cadera · 10 minutos', 'https://youtu.be/Hv5lvm-Zac4', 'https://i.ytimg.com/vi/Hv5lvm-Zac4/hqdefault.jpg', 'Cadera'),
  ('Movilidad de cadera 2', 'https://youtu.be/89My0fee3pY', 'https://i.ytimg.com/vi/89My0fee3pY/hqdefault.jpg', 'Cadera'),
  ('Movilidad activatoria general · 10 minutos', 'https://youtu.be/NBpsqBQceSU', 'https://i.ytimg.com/vi/NBpsqBQceSU/hqdefault.jpg', 'General'),
  ('Movilidad general y pliometría suave', 'https://youtu.be/vWUwAk-zr5I', 'https://i.ytimg.com/vi/vWUwAk-zr5I/hqdefault.jpg', 'General'),
  ('Movilidad general de descarga', 'https://youtu.be/fiToIQyq8RI', 'https://i.ytimg.com/vi/fiToIQyq8RI/hqdefault.jpg', 'General'),
  ('Movilidad de cintura escapular', 'https://youtu.be/OJ7oLGB8hSM', 'https://i.ytimg.com/vi/OJ7oLGB8hSM/hqdefault.jpg', 'Tren superior'),
  ('Movilidad de tren superior', 'https://youtu.be/v2xy1HsqlKk', 'https://i.ytimg.com/vi/v2xy1HsqlKk/hqdefault.jpg', 'Tren superior'),
  ('Movilidad de tren inferior', 'https://youtu.be/AhVcGCy_U_4', 'https://i.ytimg.com/vi/AhVcGCy_U_4/hqdefault.jpg', 'Tren inferior'),
  ('Movilidad de isquiotibiales', 'https://youtu.be/oaowI1evZeo', 'https://i.ytimg.com/vi/oaowI1evZeo/hqdefault.jpg', 'Tren inferior'),
  ('Drenaje y miofascial', 'https://youtu.be/rci34i2RjmY', 'https://i.ytimg.com/vi/rci34i2RjmY/hqdefault.jpg', 'Recuperación'),
  ('Drenaje y activación miofascial', 'https://youtu.be/jx_o7W4KUZE', 'https://i.ytimg.com/vi/jx_o7W4KUZE/hqdefault.jpg', 'Recuperación'),
  ('Vuelta a la calma', 'https://youtu.be/I-BPLQHPE8M', 'https://i.ytimg.com/vi/I-BPLQHPE8M/hqdefault.jpg', 'Recuperación'),
  ('Activación pre-partido', 'https://youtu.be/kILOdHiOZlE', 'https://i.ytimg.com/vi/kILOdHiOZlE/hqdefault.jpg', 'Activación')
) v(titulo, video_url, imagen_url, zona)
where not exists (select 1 from public.movilidad_catalogo c where c.video_url = v.video_url);

-- 2) Tipo de día: entreno, partido, entreno + partido o descanso
alter table public.dias add column if not exists tipo_dia text;

-- 3) Partido completo: lugar, imagen y descripción
alter table public.partidos add column if not exists lugar text;
alter table public.partidos add column if not exists descripcion text;
alter table public.partidos add column if not exists imagen_url text;

-- 4) Bloques de "entrenamiento invisible" (electroestimulación, contrastes…)
do $$
declare c record;
begin
  for c in select conname from pg_constraint where conrelid = 'public.bloques_sesion'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%tipo%'
  loop execute format('alter table public.bloques_sesion drop constraint %I', c.conname); end loop;
end $$;
alter table public.bloques_sesion add constraint bloques_sesion_tipo_check check (tipo in ('fuerza', 'cardio', 'movilidad', 'invisible'));

notify pgrst, 'reload schema';
