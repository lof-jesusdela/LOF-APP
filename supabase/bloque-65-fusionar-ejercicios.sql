-- Bloque 65 · Integrar ejercicios duplicados en uno solo
-- fusionar_ejercicios(principal, duplicados, completar): todo lo que apuntaba a un duplicado (programas de alumnos, plantillas,
-- contextos…) pasa a apuntar al ejercicio principal y después se eliminan los duplicados. Si «completar» es true, al principal
-- se le rellena lo que le falte (vídeo, foto, imagen del músculo, músculo, descripción) con lo del primer duplicado que lo tenga.
create or replace function fusionar_ejercicios(principal bigint, duplicados bigint[], completar boolean default true) returns int
language plpgsql security definer set search_path = public as $$
declare r record; d bigint; n int := 0; dups bigint[]; c text;
begin
  if auth.uid() is not null and not es_coach() then raise exception 'Solo el coach puede integrar ejercicios'; end if;
  dups := array(select x from unnest(duplicados) x where x is distinct from principal);
  if coalesce(array_length(dups, 1), 0) = 0 then return 0; end if;
  if not exists (select 1 from ejercicios where id = principal) then raise exception 'No existe el ejercicio principal %', principal; end if;
  if completar then
    foreach d in array dups loop
      foreach c in array array['video_url', 'imagen_url', 'musculo_img_url', 'musculo', 'descripcion'] loop
        begin
          execute format('update ejercicios p set %1$I = o.%1$I from ejercicios o where p.id = $1 and o.id = $2 and coalesce(btrim(p.%1$I::text), '''') = '''' and coalesce(btrim(o.%1$I::text), '''') <> ''''', c) using principal, d;
        exception when undefined_column then null;
        end;
      end loop;
    end loop;
  end if;
  -- Todas las tablas con clave foránea hacia ejercicios
  for r in select c.conrelid::regclass as tabla, a.attname as col
           from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
           where c.contype = 'f' and c.confrelid = 'public.ejercicios'::regclass and array_length(c.conkey, 1) = 1 loop
    execute format('update %s set %I = $1 where %I = any ($2)', r.tabla, r.col, r.col) using principal, dups;
  end loop;
  delete from ejercicios where id = any (dups);
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function fusionar_ejercicios(bigint, bigint[], boolean) to authenticated;
