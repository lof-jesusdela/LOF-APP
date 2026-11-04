-- Bloque 86 · Tipo de programa del servicio
-- modalidad: 'presencial' | 'online' | 'hibrido' (vacío = la app lo deduce como antes)
-- meses: duración contratada (3, 6, 9, 10 o 12); pt_frecuencia: entrenamientos personales ('1s' 1/semana, '2s' 2/semana, '2m' 2/mes, '1m' 1/mes)
-- seguimiento: revisión mensual, check-in semanal y avisos (vacío = sí, salvo bonos de sesiones)
alter table servicios add column if not exists modalidad text;
alter table servicios add column if not exists meses int;
alter table servicios add column if not exists pt_frecuencia text;
alter table servicios add column if not exists seguimiento boolean;
