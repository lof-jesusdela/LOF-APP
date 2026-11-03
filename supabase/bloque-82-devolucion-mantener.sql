-- Bloque 82 · Devolución breve del coach: «Qué mantenemos»
-- La devolución queda en: qué hemos observado (avance), qué mantenemos (mantener), qué ajustamos (ajuste)
-- y prioridad hasta la próxima revisión (prioridad). «dificultad» sigue siendo opcional.
alter table public.devoluciones add column if not exists mantener text;
