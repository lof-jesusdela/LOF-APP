-- Bloque 63 · Explicación de cada método (la que ve el alumno al tocar el método) según cómo los trabajamos.
-- Solo actualiza textos; crea el método si no existe. Se puede repetir.
do $$
declare m record;
begin
  for m in select * from (values
    ('Unilateral', 'Primero un lado y, sin descansar, el otro. Registras peso y repeticiones de cada lado.'),
    ('Unilateral doble', 'Doble estímulo: derecho e izquierdo y, sin parar, otra vuelta. La 1ª vuelta te acerca al fallo (RIR 1); la 2ª prolonga el estímulo con repeticiones efectivas, todas cerca del fallo (RIR 0).'),
    ('Rest-pause', 'Tandas cerca del fallo mecánico con 20 segundos de pausa entre ellas (normalmente 3; pueden ser 2 o 4). Más volumen de repeticiones efectivas.'),
    ('Cluster', 'Pesos elevados con pocas repeticiones por tanda y 30 segundos de pausa entre tandas.'),
    ('Myo reps', 'Haz las que puedas hasta quedarte a 1 del fallo, descansa 30 segundos y vuelve a hacer las que puedas. Repite hasta que ya no llegues a 4 repeticiones (normalmente 2 o 3 tandas).'),
    ('Dropset', 'Al terminar cada tanda, bajas el peso (en torno a un 20 %) y sigues sin descansar.'),
    ('Unilateral lento', 'Un lado y luego el otro a ritmo 6-3-6: 6 segundos para subir, 3 segundos aguantando y 6 segundos para bajar.'),
    ('Unilateral superlento', 'Con los dos brazos o piernas a la vez, a ritmo 6-3-6: 6 segundos para subir, 3 segundos aguantando y 6 segundos para bajar.'),
    ('Unilateral contraste', 'Con un lado, primero la parte pesada (o isométrica) y sin parar la explosiva. Después, el otro lado.'),
    ('Contrastes', 'Dos tandas seguidas sin descanso: pesado o isométrico y, a continuación, explosivo (con un 50 % menos de peso) o isométrico.'),
    ('Forzadas', 'Tienes que llegar a las repeticiones objetivo aunque no te salgan seguidas: cuando no puedas más, paras 5 segundos y sigues acumulando hasta llegar.'),
    ('Topset', 'La 1ª serie es la más pesada (un 10 % por debajo de tu 1RM). Las siguientes van con un 15 % menos de peso: en back-off set (las que puedas a 1-2 del fallo), dropset o rest-pause.'),
    ('Superserie', 'Dos o más ejercicios seguidos sin descanso entre ellos; descansas al terminar la vuelta.')
  ) as t(nombre, explicacion) loop
    update metodos set explicacion = m.explicacion where nombre ilike m.nombre;
    if not found then insert into metodos (nombre, explicacion) values (m.nombre, m.explicacion); end if;
  end loop;
  raise notice 'OK métodos actualizados';
end $$;
