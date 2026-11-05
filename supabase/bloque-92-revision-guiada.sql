-- Bloque 92 · Revisión mensual guiada: qué se mantiene, qué cambia, prioridad, borrador/publicada y próxima revisión
-- Un borrador no lo ve el alumno ni da la revisión por hecha.
alter table public.revisiones add column if not exists mantiene text;
alter table public.revisiones add column if not exists cambia text;
alter table public.revisiones add column if not exists prioridad text;
alter table public.revisiones add column if not exists estado text not null default 'publicada';
alter table public.revisiones drop constraint if exists revisiones_estado_check;
alter table public.revisiones add constraint revisiones_estado_check check (estado in ('borrador','publicada'));
alter table public.revisiones add column if not exists proxima date;
