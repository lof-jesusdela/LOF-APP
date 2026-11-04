-- Bloque 84 · Poder quitar ejercicios de un programa aunque el alumno ya los haya entrenado.
-- Las series registradas NO se borran: se quedan en su historial con el nombre del ejercicio guardado.

-- 1) Nombre del ejercicio guardado en cada serie (para el historial cuando el ejercicio ya no está)
alter table registros_series add column if not exists ejercicio_nombre text;
alter table cambios_peso alter column ejercicio_sesion_id drop not null;

-- 2) Antes de quitar un ejercicio del programa, se copia su nombre a sus series
create or replace function guardar_nombre_ejercicio() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update registros_series r
     set ejercicio_nombre = coalesce(to_jsonb(old)->>'nombre', (select e.nombre from ejercicios e where e.id = old.ejercicio_id), r.ejercicio_nombre)
   where r.ejercicio_sesion_id = old.id;
  return old;
end $$;
drop trigger if exists trg_guardar_nombre_ejercicio on ejercicios_sesion;
create trigger trg_guardar_nombre_ejercicio before delete on ejercicios_sesion for each row execute function guardar_nombre_ejercicio();

-- 3) Todas las tablas que apuntan a ejercicios_sesion: al quitar el ejercicio, el enlace queda vacío (no se borra nada ni se bloquea)
do $$
declare r record;
begin
  for r in
    select c.conname, c.conrelid::regclass as tabla, a.attname as columna
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f' and c.confrelid = 'public.ejercicios_sesion'::regclass and array_length(c.conkey, 1) = 1
  loop
    execute format('alter table %s alter column %I drop not null', r.tabla, r.columna);
    execute format('alter table %s drop constraint %I', r.tabla, r.conname);
    execute format('alter table %s add constraint %I foreign key (%I) references ejercicios_sesion(id) on delete set null', r.tabla, r.conname, r.columna);
    raise notice 'Ajustada % (%)', r.tabla, r.columna;
  end loop;
end $$;
