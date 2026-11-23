-- Bloque 117 · Futbolistas: de momento sin plan de hábitos (primero check-ins, luego nutrición, luego hábitos).
-- Cuando quieras activárselo a uno, hazlo desde su ficha (Plan · Editar · Hábitos): le llegará el cuestionario de temperamento.
update servicios set modulo_habitos = false where modulo_futbol = true and modulo_habitos = true;
