-- Bloque 79 · Métodos «Series parciales» (cambio de rango o de ajuste de máquina) y «Mixto» (varios métodos en la misma serie).
-- Crea los dos métodos si no existen y actualiza su explicación. Se puede repetir.
do $$
declare m record;
begin
  for m in select * from (values
    ('Series parciales', 'La misma serie, con el mismo ejercicio, pero cambiando el rango de movimiento (o el ajuste de la máquina) en cada tramo o en cada serie. Fíjate en el rango indicado antes de empezar cada una.'),
    ('Mixto', 'Dentro de la misma serie se encadenan tramos con métodos distintos (por ejemplo, rest-pause y después isométrico). Cada tramo indica su método; haz uno detrás de otro, con la pausa indicada.')
  ) as t(nombre, explicacion) loop
    update metodos set explicacion = m.explicacion where nombre ilike m.nombre;
    if not found then insert into metodos (nombre, explicacion) values (m.nombre, m.explicacion); end if;
  end loop;
  raise notice 'OK métodos parciales y mixto';
end $$;
