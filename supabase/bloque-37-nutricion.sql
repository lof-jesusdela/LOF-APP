-- Bloque 37 · Pestaña Nutrición del alumno y diario de comidas (opcional)
-- 1) El alumno puede LEER los apartados de Alimentación de su planificación que el coach marque como visibles
--    (entrenamiento y hábitos siguen siendo solo del coach) y sus imágenes/PDF.
alter table planificacion add column if not exists visible boolean not null default true;
alter table planificacion add column if not exists datos jsonb;          -- tabla de contextos: {"ctx":[{"n","d","kcal","p","c","g"}]}

drop policy if exists "planificacion_alumno_lee" on planificacion;
create policy "planificacion_alumno_lee" on planificacion for select to authenticated
  using (alumno_id = auth.uid() and seccion = 'alimentacion' and visible);

drop policy if exists "planificacion_alumno_archivos" on storage.objects;
create policy "planificacion_alumno_archivos" on storage.objects for select to authenticated
  using (bucket_id = 'planificacion' and (storage.foldername(name))[1] = auth.uid()::text and storage.filename(name) like 'alimentacion-%');

-- 2) Diario de comidas: lo apunta el alumno cuando quiere (foto y/o alimentos) y puede compartir sus creaciones.
create table if not exists comidas_registro (
  id bigint generated always as identity primary key,
  alumno_id uuid not null references auth.users(id) on delete cascade,
  fecha date not null default current_date,
  momento text,                                   -- Desayuno, Media mañana, Comida, Merienda, Cena, Otro
  alimentos jsonb not null default '[]'::jsonb,   -- [{"n":"Arroz cocido","q":"½ taza"}]
  foto text,                                      -- ruta en el bucket «comidas»
  encaja smallint,                                -- 2 sí · 1 más o menos · 0 no
  contexto text,
  nota text,
  compartido boolean not null default false,      -- creación propia que comparte con el coach
  plato text,
  coach_estado text,                              -- null (nueva) · visto · anadido
  coach_nota text,
  created_at timestamptz not null default now()
);
create index if not exists comidas_registro_alumno_fecha on comidas_registro (alumno_id, fecha);
alter table comidas_registro enable row level security;

drop policy if exists "comidas_registro_coach" on comidas_registro;
create policy "comidas_registro_coach" on comidas_registro for all to authenticated
  using (public.es_coach()) with check (public.es_coach());
drop policy if exists "comidas_registro_alumno" on comidas_registro;
create policy "comidas_registro_alumno" on comidas_registro for all to authenticated
  using (alumno_id = auth.uid()) with check (alumno_id = auth.uid());
