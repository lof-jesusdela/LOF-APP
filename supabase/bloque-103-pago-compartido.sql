-- Bloque 103 · Pago compartido: quién paga por este alumno (pareja, familia, amigos). Sus cuotas van a la ficha de quien paga
alter table public.servicios add column if not exists paga_id uuid references public.perfiles(id) on delete set null;
notify pgrst, 'reload schema';
