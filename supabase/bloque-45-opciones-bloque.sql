-- Bloque 45 · Opciones dentro de un bloque (Tipo A, B, C, D…) y arreglo del día de carrera de Irene
alter table bloques_sesion add column if not exists variante text;
notify pgrst, 'reload schema';

-- Irene: la parte principal del Miércoles / Jueves pasa a 4 opciones
do $$
declare b record; d bigint;
begin
  select bs.* into b from bloques_sesion bs join dias di on di.id = bs.dia_id join programas p on p.id = di.programa_id
   join perfiles pf on pf.id = p.alumno_id
   where lower(pf.nombre) like '%irene%' and p.id = 47 and bs.nombre like 'Parte principal%' limit 1;
  if b.id is null then raise notice 'No encuentro la parte principal de Irene'; return; end if;
  d := b.dia_id;
  delete from bloques_sesion where dia_id = d and letra = 'C' and id <> b.id and variante is not null;
  update bloques_sesion set nombre = 'Parte principal', variante = 'Tipo A', maquina = 'Pista de atletismo', duracion = null, fc_objetivo = '165 - 185 ppm',
    detalle = E'Series de intensidad: 8 x 50 m (1/8 de vuelta) en zona 5 · 185 ppm · ritmo 5:00/km (no sprint). Recuperación: vuelvo caminando hasta el inicio.\nUmbral (ritmo controlado): 5 x 500 m (1,25 vueltas) en zona 3-4 · 165-175 ppm · ritmo 5:50/km. Recuperación: 200 m corriendo muy suave entre series.'
   where id = b.id;
  insert into bloques_sesion (dia_id, letra, nombre, tipo, variante, maquina, fc_objetivo, objetivo, detalle) values
   (d, 'C', 'Parte principal', b.tipo, 'Tipo B', 'Escaleras y cuestas', '170 - 180 ppm', b.objetivo,
    E'Escaleras (fuerza explosiva), al menos 30 escalones. 3 series de cada una, bajando caminando: (1) skipping de 1 en 1; (2) skipping de 2 en 2; (3) zancada larga de 3 en 3; (4) lateral de 1 en 1; (5) pies juntos; (6) pies juntos de 2 en 2; (7) subo 2 y bajo 1 (rápido).\nCuestas (transferencia): cuesta de al menos 50 m, 10 subidas a máxima velocidad; vuelvo caminando.\nUmbral láctico: 3 x 5 minutos en zona 4 · 170-180 ppm · ritmo 6:00/km. Recuperación: 1 minuto muy suave entre series.'),
   (d, 'C', 'Parte principal', b.tipo, 'Tipo C', 'Pista de atletismo', '170 - 185 ppm', b.objetivo,
    E'Series de intensidad: 10 x 100 m (1/4 de vuelta) en zona 5 · 185 ppm · ritmo 5:10/km (no sprint). Recuperación: vuelvo caminando hasta el inicio.\nUmbral (ritmo controlado): 3 x 1000 m (2,5 vueltas) en zona 3-4 · 170-180 ppm · ritmo 6:00/km. Recuperación: 200 m corriendo muy suave entre series.'),
   (d, 'C', 'Parte principal', b.tipo, 'Tipo D', 'Pista de atletismo', '165 - 185 ppm', b.objetivo,
    E'Series de intensidad: 6 x 200 m (1/2 vuelta) en zona 5 · 185 ppm · ritmo 5:20/km (no sprint). Recuperación: vuelvo caminando hasta el inicio.\nUmbral (ritmo controlado): 3 x 1500 m (4 vueltas) en zona 3-4 · 165-180 ppm · ritmo 6:10/km. Recuperación: 200 m corriendo muy suave entre series.');
  raise notice 'Irene: parte principal dividida en Tipo A, B, C y D';
end $$;
