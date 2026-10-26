-- Bloque 64 · Métodos propios + método Isométrico.
-- Permite crear/editar/borrar métodos desde Ejercicios → Métodos y añade el método «Isométrico». Se puede repetir.
alter table public.metodos add column if not exists base text;     -- cómo lo registra el alumno: tandas | lados | drop | iso (vacío = series normales)
alter table public.metodos add column if not exists pausa int;      -- segundos de pausa entre tandas (solo base «tandas»)
alter table public.metodos add column if not exists propio boolean not null default false;

alter table public.metodos enable row level security;
drop policy if exists metodos_lectura on public.metodos;
create policy metodos_lectura on public.metodos for select to authenticated using (true);
drop policy if exists metodos_coach on public.metodos;
create policy metodos_coach on public.metodos for all to authenticated using (public.es_coach()) with check (public.es_coach());

do $$
begin
  update metodos set explicacion = 'Sostienes la carga, sin moverte, en la posición que te indique (por ejemplo, rodillas a 90º) durante el tiempo marcado. Aquí no cuentas repeticiones, sino segundos.', base = 'iso'
  where nombre ilike 'Isométrico';
  if not found then
    insert into metodos (nombre, explicacion, base) values ('Isométrico', 'Sostienes la carga, sin moverte, en la posición que te indique (por ejemplo, rodillas a 90º) durante el tiempo marcado. Aquí no cuentas repeticiones, sino segundos.', 'iso');
  end if;
  raise notice 'OK bloque 64';
end $$;
