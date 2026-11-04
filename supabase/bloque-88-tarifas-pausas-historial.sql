-- Bloque 88 · Tarifas, pausas del proceso e historial previo
alter table servicios add column if not exists tarifa text;            -- id de la tarifa elegida (tarifas.js)
alter table servicios add column if not exists forma_pago text;        -- 'unico' | 'fracc'
alter table servicios add column if not exists pausas jsonb not null default '[]'::jsonb;  -- [{desde, hasta, nota}] alargan el proceso
alter table servicios add column if not exists sesiones_previas int;   -- sesiones presenciales hechas antes de la app
