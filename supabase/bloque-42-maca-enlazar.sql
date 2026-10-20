-- Bloque 42 · Maca: enlaza sus ejercicios con los de tu biblioteca (con foto) y borra los duplicados sin foto que creó el Bloque 41.

do $$
declare mio bigint; lib bigint; r record;
begin
  select id into lib from ejercicios where translate(lower(nombre), 'áéíóúü', 'aeiouu') = translate(lower('Flexión lateral banco inclinado'), 'áéíóúü', 'aeiouu') order by (imagen_url is not null) desc, id limit 1;
  for r in select id from ejercicios where translate(lower(nombre), 'áéíóúü', 'aeiouu') = translate(lower('Crunch lateral en banco inclinado'), 'áéíóúü', 'aeiouu') and imagen_url is null and id <> coalesce(lib, 0) loop
    if lib is not null then update ejercicios_sesion set ejercicio_id = lib where ejercicio_id = r.id; end if;
    if not exists (select 1 from ejercicios_sesion where ejercicio_id = r.id) then delete from ejercicios where id = r.id; end if;
  end loop;
  select id into lib from ejercicios where translate(lower(nombre), 'áéíóúü', 'aeiouu') = translate(lower('Extensión de cadera banco inclinado'), 'áéíóúü', 'aeiouu') order by (imagen_url is not null) desc, id limit 1;
  for r in select id from ejercicios where translate(lower(nombre), 'áéíóúü', 'aeiouu') = translate(lower('Extensión de cadera inclinado'), 'áéíóúü', 'aeiouu') and imagen_url is null and id <> coalesce(lib, 0) loop
    if lib is not null then update ejercicios_sesion set ejercicio_id = lib where ejercicio_id = r.id; end if;
    if not exists (select 1 from ejercicios_sesion where ejercicio_id = r.id) then delete from ejercicios where id = r.id; end if;
  end loop;
  select id into lib from ejercicios where translate(lower(nombre), 'áéíóúü', 'aeiouu') = translate(lower('Flexo-extensión de tobillo'), 'áéíóúü', 'aeiouu') order by (imagen_url is not null) desc, id limit 1;
  for r in select id from ejercicios where translate(lower(nombre), 'áéíóúü', 'aeiouu') = translate(lower('Flexo-extensión de tobillos'), 'áéíóúü', 'aeiouu') and imagen_url is null and id <> coalesce(lib, 0) loop
    if lib is not null then update ejercicios_sesion set ejercicio_id = lib where ejercicio_id = r.id; end if;
    if not exists (select 1 from ejercicios_sesion where ejercicio_id = r.id) then delete from ejercicios where id = r.id; end if;
  end loop;
  select id into lib from ejercicios where translate(lower(nombre), 'áéíóúü', 'aeiouu') = translate(lower('Hip thrust'), 'áéíóúü', 'aeiouu') order by (imagen_url is not null) desc, id limit 1;
  for r in select id from ejercicios where translate(lower(nombre), 'áéíóúü', 'aeiouu') = translate(lower('Hip thrust en máquina'), 'áéíóúü', 'aeiouu') and imagen_url is null and id <> coalesce(lib, 0) loop
    if lib is not null then update ejercicios_sesion set ejercicio_id = lib where ejercicio_id = r.id; end if;
    if not exists (select 1 from ejercicios_sesion where ejercicio_id = r.id) then delete from ejercicios where id = r.id; end if;
  end loop;
  select id into lib from ejercicios where translate(lower(nombre), 'áéíóúü', 'aeiouu') = translate(lower('Hip thrust a 1 pierna'), 'áéíóúü', 'aeiouu') order by (imagen_url is not null) desc, id limit 1;
  for r in select id from ejercicios where translate(lower(nombre), 'áéíóúü', 'aeiouu') = translate(lower('Hip thrust unilateral'), 'áéíóúü', 'aeiouu') and imagen_url is null and id <> coalesce(lib, 0) loop
    if lib is not null then update ejercicios_sesion set ejercicio_id = lib where ejercicio_id = r.id; end if;
    if not exists (select 1 from ejercicios_sesion where ejercicio_id = r.id) then delete from ejercicios where id = r.id; end if;
  end loop;
  select id into lib from ejercicios where translate(lower(nombre), 'áéíóúü', 'aeiouu') = translate(lower('Abducción de cadera'), 'áéíóúü', 'aeiouu') order by (imagen_url is not null) desc, id limit 1;
  for r in select id from ejercicios where translate(lower(nombre), 'áéíóúü', 'aeiouu') = translate(lower('Apertura de cadera'), 'áéíóúü', 'aeiouu') and imagen_url is null and id <> coalesce(lib, 0) loop
    if lib is not null then update ejercicios_sesion set ejercicio_id = lib where ejercicio_id = r.id; end if;
    if not exists (select 1 from ejercicios_sesion where ejercicio_id = r.id) then delete from ejercicios where id = r.id; end if;
  end loop;
  select id into lib from ejercicios where translate(lower(nombre), 'áéíóúü', 'aeiouu') = translate(lower('Adducción de cadera'), 'áéíóúü', 'aeiouu') order by (imagen_url is not null) desc, id limit 1;
  for r in select id from ejercicios where translate(lower(nombre), 'áéíóúü', 'aeiouu') = translate(lower('Cierre de cadera'), 'áéíóúü', 'aeiouu') and imagen_url is null and id <> coalesce(lib, 0) loop
    if lib is not null then update ejercicios_sesion set ejercicio_id = lib where ejercicio_id = r.id; end if;
    if not exists (select 1 from ejercicios_sesion where ejercicio_id = r.id) then delete from ejercicios where id = r.id; end if;
  end loop;
  select id into lib from ejercicios where translate(lower(nombre), 'áéíóúü', 'aeiouu') = translate(lower('Hombro posterior'), 'áéíóúü', 'aeiouu') order by (imagen_url is not null) desc, id limit 1;
  for r in select id from ejercicios where translate(lower(nombre), 'áéíóúü', 'aeiouu') = translate(lower('Hombro posterior a 1 mano'), 'áéíóúü', 'aeiouu') and imagen_url is null and id <> coalesce(lib, 0) loop
    if lib is not null then update ejercicios_sesion set ejercicio_id = lib where ejercicio_id = r.id; end if;
    if not exists (select 1 from ejercicios_sesion where ejercicio_id = r.id) then delete from ejercicios where id = r.id; end if;
  end loop;
  select id into lib from ejercicios where translate(lower(nombre), 'áéíóúü', 'aeiouu') = translate(lower('Step up'), 'áéíóúü', 'aeiouu') order by (imagen_url is not null) desc, id limit 1;
  for r in select id from ejercicios where translate(lower(nombre), 'áéíóúü', 'aeiouu') = translate(lower('Step up en máquina'), 'áéíóúü', 'aeiouu') and imagen_url is null and id <> coalesce(lib, 0) loop
    if lib is not null then update ejercicios_sesion set ejercicio_id = lib where ejercicio_id = r.id; end if;
    if not exists (select 1 from ejercicios_sesion where ejercicio_id = r.id) then delete from ejercicios where id = r.id; end if;
  end loop;
  select id into lib from ejercicios where translate(lower(nombre), 'áéíóúü', 'aeiouu') = translate(lower('Crunch abdominal en máquina'), 'áéíóúü', 'aeiouu') order by (imagen_url is not null) desc, id limit 1;
  for r in select id from ejercicios where translate(lower(nombre), 'áéíóúü', 'aeiouu') = translate(lower('Crunch en máquina'), 'áéíóúü', 'aeiouu') and imagen_url is null and id <> coalesce(lib, 0) loop
    if lib is not null then update ejercicios_sesion set ejercicio_id = lib where ejercicio_id = r.id; end if;
    if not exists (select 1 from ejercicios_sesion where ejercicio_id = r.id) then delete from ejercicios where id = r.id; end if;
  end loop;
  select id into lib from ejercicios where translate(lower(nombre), 'áéíóúü', 'aeiouu') = translate(lower('Crunch lateral con kettlebell'), 'áéíóúü', 'aeiouu') order by (imagen_url is not null) desc, id limit 1;
  for r in select id from ejercicios where translate(lower(nombre), 'áéíóúü', 'aeiouu') = translate(lower('Crunch lateral con peso libre'), 'áéíóúü', 'aeiouu') and imagen_url is null and id <> coalesce(lib, 0) loop
    if lib is not null then update ejercicios_sesion set ejercicio_id = lib where ejercicio_id = r.id; end if;
    if not exists (select 1 from ejercicios_sesion where ejercicio_id = r.id) then delete from ejercicios where id = r.id; end if;
  end loop;
  select id into lib from ejercicios where translate(lower(nombre), 'áéíóúü', 'aeiouu') = translate(lower('Press de hombro unilateral'), 'áéíóúü', 'aeiouu') order by (imagen_url is not null) desc, id limit 1;
  for r in select id from ejercicios where translate(lower(nombre), 'áéíóúü', 'aeiouu') = translate(lower('Press de hombro a 1 mano'), 'áéíóúü', 'aeiouu') and imagen_url is null and id <> coalesce(lib, 0) loop
    if lib is not null then update ejercicios_sesion set ejercicio_id = lib where ejercicio_id = r.id; end if;
    if not exists (select 1 from ejercicios_sesion where ejercicio_id = r.id) then delete from ejercicios where id = r.id; end if;
  end loop;
  select id into lib from ejercicios where translate(lower(nombre), 'áéíóúü', 'aeiouu') = translate(lower('Remo a 1 mano neutro'), 'áéíóúü', 'aeiouu') order by (imagen_url is not null) desc, id limit 1;
  for r in select id from ejercicios where translate(lower(nombre), 'áéíóúü', 'aeiouu') = translate(lower('Remo a 1 mano'), 'áéíóúü', 'aeiouu') and imagen_url is null and id <> coalesce(lib, 0) loop
    if lib is not null then update ejercicios_sesion set ejercicio_id = lib where ejercicio_id = r.id; end if;
    if not exists (select 1 from ejercicios_sesion where ejercicio_id = r.id) then delete from ejercicios where id = r.id; end if;
  end loop;
  select id into lib from ejercicios where translate(lower(nombre), 'áéíóúü', 'aeiouu') = translate(lower('Tríceps tras nuca'), 'áéíóúü', 'aeiouu') order by (imagen_url is not null) desc, id limit 1;
  for r in select id from ejercicios where translate(lower(nombre), 'áéíóúü', 'aeiouu') = translate(lower('Tríceps tras nuca en polea'), 'áéíóúü', 'aeiouu') and imagen_url is null and id <> coalesce(lib, 0) loop
    if lib is not null then update ejercicios_sesion set ejercicio_id = lib where ejercicio_id = r.id; end if;
    if not exists (select 1 from ejercicios_sesion where ejercicio_id = r.id) then delete from ejercicios where id = r.id; end if;
  end loop;
  select id into lib from ejercicios where translate(lower(nombre), 'áéíóúü', 'aeiouu') = translate(lower('Bíceps martillo'), 'áéíóúü', 'aeiouu') order by (imagen_url is not null) desc, id limit 1;
  for r in select id from ejercicios where translate(lower(nombre), 'áéíóúü', 'aeiouu') = translate(lower('Bíceps martillo en polea'), 'áéíóúü', 'aeiouu') and imagen_url is null and id <> coalesce(lib, 0) loop
    if lib is not null then update ejercicios_sesion set ejercicio_id = lib where ejercicio_id = r.id; end if;
    if not exists (select 1 from ejercicios_sesion where ejercicio_id = r.id) then delete from ejercicios where id = r.id; end if;
  end loop;
  select id into lib from ejercicios where translate(lower(nombre), 'áéíóúü', 'aeiouu') = translate(lower('Sentadilla completa'), 'áéíóúü', 'aeiouu') order by (imagen_url is not null) desc, id limit 1;
  for r in select id from ejercicios where translate(lower(nombre), 'áéíóúü', 'aeiouu') = translate(lower('Sentadilla perfecta'), 'áéíóúü', 'aeiouu') and imagen_url is null and id <> coalesce(lib, 0) loop
    if lib is not null then update ejercicios_sesion set ejercicio_id = lib where ejercicio_id = r.id; end if;
    if not exists (select 1 from ejercicios_sesion where ejercicio_id = r.id) then delete from ejercicios where id = r.id; end if;
  end loop;
end $$;
