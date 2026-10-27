-- Pesos de la aproximación 6·3·1: uno único (aprox_kg) y los tres manuales (aprox_kgs = '6rep;3rep;1rep', p. ej. '40;50;55').
alter table ejercicios_sesion add column if not exists aprox_kg numeric;
alter table ejercicios_sesion add column if not exists aprox_kgs text;
notify pgrst, 'reload schema';
