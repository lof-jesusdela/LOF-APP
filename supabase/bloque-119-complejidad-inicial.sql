-- Bloque 119 · Complejidad inicial (Baja / Media / Alta) de TODOS los entrenos de todos los alumnos y plantillas.
-- Se guarda en dias.intensidad (en la app se llama «Complejidad»). Después la corriges a mano donde no cuadre.
-- Puntos (0-10):
--   Tiempo: el volumen en minutos si lo pusiste; si no, estimado (series × ~2,5 min + bloques de cardio/movilidad) → <45: 0 · 45-70: 1 · >70: 2
--   Series totales → <12: 0 · 12-20: 1 · >20: 2
--   Nº de ejercicios → <5: 0 · 5-7: 1 · >7: 2
--   Ejercicios técnicos (barra libre, peso muerto, sentadilla, dominadas, zancadas/búlgaras, olímpicos, pliometría, unilaterales…) → <20 %: 0 · 20-45 %: 1 · >45 %: 2
--   Métodos exigentes (dropset, rest-pause, topset, myo, cluster, contrastes, series mixtas…) → 0: 0 · 1-2 ejercicios: 1 · 3 o más: 2
-- Resultado: 0-3 Baja · 4-6 Media · 7-10 Alta

with ej as (
  select b.dia_id,
         greatest(1, coalesce(nullif(regexp_replace(coalesce(es.series::text, '1'), '\D', '', 'g'), '')::int, 1)) as ser,
         translate(lower(coalesce(e.nombre, '')), 'áéíóúü', 'aeiouu') as nom,
         translate(lower(coalesce(m.nombre, '')), 'áéíóúü', 'aeiouu') as met
    from ejercicios_sesion es
    join bloques_sesion b on b.id = es.bloque_id
    left join ejercicios e on e.id = es.ejercicio_id
    left join metodos m on m.id = es.metodo_id
),
agg as (
  select dia_id,
         count(*) as n_ej,
         sum(ser) as n_ser,
         avg(case when nom ~ '(barra libre|con barra|peso muerto|sentadilla|dominad|zancada|bulgar|split|arrancada|cargada|clean|snatch|thruster|pistol|nordic|salto|pliometr|kettlebell swing|landmine|turkish|unilateral|a una pierna|a 1 pierna|press militar|hip thrust)' then 1.0 else 0 end) as pct_tec,
         sum(case when met ~ '(drop|rest.?pause|top ?set|myo|cluster|contraste|mixt|doble|parcial)' then 1 else 0 end) as n_met
    from ej group by dia_id
),
otros as (
  select dia_id, count(*) filter (where tipo <> 'fuerza') as n_otros,
         sum(case when tipo <> 'fuerza' then coalesce(nullif(substring(coalesce(duracion, '') from '(\d+)'), '')::int, 10) else 0 end) as min_otros
    from bloques_sesion group by dia_id
),
pts as (
  select d.id,
         coalesce(nullif(substring(coalesce(d.volumen, '') from '(\d+)'), '')::int,
                  round(coalesce(a.n_ser, 0) * 2.5 + coalesce(o.min_otros, 0))::int) as minutos,
         coalesce(a.n_ser, 0) as n_ser, coalesce(a.n_ej, 0) as n_ej, coalesce(a.pct_tec, 0) as pct_tec, coalesce(a.n_met, 0) as n_met
    from dias d
    left join agg a on a.dia_id = d.id
    left join otros o on o.dia_id = d.id
   where coalesce(a.n_ej, 0) + coalesce(o.n_otros, 0) > 0          -- solo días con contenido (los de descanso vacíos no se tocan)
),
nota as (
  select id,
         (case when minutos > 70 then 2 when minutos >= 45 then 1 else 0 end)
       + (case when n_ser > 20 then 2 when n_ser >= 12 then 1 else 0 end)
       + (case when n_ej > 7 then 2 when n_ej >= 5 then 1 else 0 end)
       + (case when pct_tec > 0.45 then 2 when pct_tec >= 0.20 then 1 else 0 end)
       + (case when n_met >= 3 then 2 when n_met >= 1 then 1 else 0 end) as p
    from pts
)
update dias d
   set intensidad = case when n.p <= 3 then 'Baja' when n.p <= 6 then 'Media' else 'Alta' end
  from nota n
 where n.id = d.id;

-- Para revisar el reparto:
select intensidad as complejidad, count(*) from dias where intensidad in ('Baja', 'Media', 'Alta') group by 1 order by 1;
