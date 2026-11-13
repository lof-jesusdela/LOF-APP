-- Bloque 105 · Tareas con hora y nivel (Hoy / Próximos 3 días / Esta semana) y tareas del negocio (sin alumno)
alter table tareas_coach alter column alumno_id drop not null;
alter table tareas_coach add column if not exists hora text;
alter table tareas_coach add column if not exists nivel text check (nivel in ('hoy', '3dias', 'semana'));
notify pgrst, 'reload schema';
