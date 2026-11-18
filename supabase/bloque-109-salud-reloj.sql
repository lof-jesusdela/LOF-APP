-- Bloque 109 · Datos del reloj vía Atajo de iPhone: llave personal por alumno + sueño y calorías activas en el registro diario.
alter table perfiles add column if not exists salud_token text default gen_random_uuid()::text;
update perfiles set salud_token = gen_random_uuid()::text where salud_token is null;
alter table registro_diario add column if not exists sueno_h numeric;
alter table registro_diario add column if not exists kcal_activas integer;
notify pgrst, 'reload schema';

-- Tu llave de prueba (cambia el correo por el de TU cuenta de alumno de prueba y ejecuta solo este SELECT):
-- select email, salud_token from perfiles where email = 'tu-correo@ejemplo.com';
