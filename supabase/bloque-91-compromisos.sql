-- Bloque 91 · Compromisos de seguimiento con estado compartido (Hoy, ficha, cierre y reporting)
-- La agenda guarda lo que decides sobre cada compromiso (elegido para hoy, programado, en curso, esperando respuesta)
-- con su vencimiento real, para que reprogramar no esconda retrasos. Y cada alumno puede tener un profesional responsable.
alter table public.agenda drop constraint if exists agenda_estado_check;
alter table public.agenda add constraint agenda_estado_check
  check (estado in ('pendiente','programada','en_curso','esperando','hecha','reprogramada','descartada'));
alter table public.agenda add column if not exists vence date;
alter table public.agenda add column if not exists responsable uuid references public.perfiles(id) on delete set null;
create index if not exists agenda_origen on public.agenda (origen);

-- Profesional responsable de cada alumno (vacío = tú). Prepara la delegación sin dar acceso a nadie todavía.
alter table public.perfiles add column if not exists responsable uuid references public.perfiles(id) on delete set null;
