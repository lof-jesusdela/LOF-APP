-- Bloque 47 · Sesiones de carrera: fases (calentamiento, parte principal, enfriamiento) con sus tramos e indicadores
alter table bloques_sesion add column if not exists carrera jsonb;
notify pgrst, 'reload schema';
