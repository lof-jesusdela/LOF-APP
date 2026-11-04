-- Bloque 90 · Historial de programas del alumno
-- Cuando un alumno cambia de programa (p. ej. bono de sesiones → Ruta Integral), el anterior se guarda aquí
-- con sus fechas, para que Economía → Programas cuente cada cuota en el programa que tenía en ese momento.
-- Cada elemento: { "linea", "tarifa", "producto", "desde", "hasta", "sesiones" }
alter table public.servicios add column if not exists historial jsonb not null default '[]'::jsonb;
