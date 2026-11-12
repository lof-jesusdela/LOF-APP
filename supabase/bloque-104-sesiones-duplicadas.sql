-- Bloque 104 · Sesiones duplicadas (mismo alumno, mismo día de programa, misma fecha)

-- 1) VER: quién las tiene (ejecuta solo esto primero)
select p.nombre, s.fecha, s.dia_id, count(*) as veces, array_agg(s.id order by s.id) as ids
from sesiones_hechas s left join perfiles p on p.id = s.alumno_id
where coalesce(s.previa, false) = false
group by p.nombre, s.alumno_id, s.fecha, s.dia_id
having count(*) > 1
order by s.fecha desc;

-- 2) LIMPIAR: borra solo las repetidas que NO tienen series guardadas (se queda la que más series tiene)
with r as (
  select s.id,
         row_number() over (partition by s.alumno_id, s.dia_id, s.fecha
                            order by (select count(*) from registros_series x where x.sesion_id = s.id) desc, s.id) as rn,
         (select count(*) from registros_series x where x.sesion_id = s.id) as nreg
  from sesiones_hechas s
  where coalesce(s.previa, false) = false
)
delete from sesiones_hechas where id in (select id from r where rn > 1 and nreg = 0);

-- 3) Si tras limpiar siguen saliendo en el paso 1, tienen series en las dos: dime el nombre y las unimos a mano.
