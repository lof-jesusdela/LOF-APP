-- Bloque 81 · Comprobación breve de aplicación del plan en el check-in semanal
-- «He podido aplicar lo acordado» / «Lo he aplicado en parte» / «Necesito ayuda para adaptarlo».
-- El motivo va en «dificultades» (ya existe). No se convierte en porcentaje.
alter table public.checkins add column if not exists aplicacion_plan text;
do $$ begin
  alter table public.checkins add constraint checkins_aplicacion_plan_chk check (aplicacion_plan is null or aplicacion_plan in ('aplicado','parte','ayuda'));
exception when duplicate_object then null; end $$;
