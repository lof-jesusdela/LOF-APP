-- Bloque 114 · Avisos automáticos a futbolistas (check-in del partido y del lunes)
-- Ejecútalo DESPUÉS de crear la función avisos-programados y el secreto CRON_SECRET.

-- 1) Registro de avisos ya enviados (cada aviso sale una sola vez)
create table if not exists avisos_enviados (
  clave text primary key,
  alumno_id uuid,
  enviado_at timestamptz default now()
);
alter table avisos_enviados enable row level security;   -- solo la función (service role) la usa

-- 2) Extensiones para programar llamadas
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 3) Cada 15 minutos Supabase llama a la función
select cron.unschedule('avisos-futbol') where exists (select 1 from cron.job where jobname = 'avisos-futbol');
select cron.schedule('avisos-futbol', '*/15 * * * *', $$
  select net.http_post(
    url := 'https://dywdqrcmfglesqfbqaff.supabase.co/functions/v1/avisos-programados',
    headers := '{"Content-Type":"application/json","x-cron":"c6b7669cd496cb88d81258e7d86b6486"}'::jsonb,
    body := '{}'::jsonb
  );
$$);
