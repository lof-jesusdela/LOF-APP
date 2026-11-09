-- Bloque 100 · Horario de la semana del futbolista (para que lo vea en su app)
-- { eq: {díaSemana 0-6: hora}, plan: {nº de día del programa: díaSemana 0-6} }
alter table public.servicios add column if not exists horario jsonb;
notify pgrst, 'reload schema';
