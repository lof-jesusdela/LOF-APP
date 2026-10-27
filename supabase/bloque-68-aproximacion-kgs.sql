-- Pesos manuales de la aproximación 6·3·1 (6 rep ; 3 rep ; 1 rep), p. ej. '40;50;55'. Vacío = cálculo automático.
alter table ejercicios_sesion add column if not exists aprox_kgs text;
