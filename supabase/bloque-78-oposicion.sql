-- Bloque 78 · Vía oposición (pruebas físicas de Policía Nacional): oposición, fecha del examen y marcas objetivo en el servicio
alter table servicios add column if not exists oposicion text;          -- 'policia_nacional' (null = no es opositor)
alter table servicios add column if not exists oposicion_fecha date;    -- fecha del examen
alter table servicios add column if not exists oposicion_obj jsonb;     -- {"m1000": "4:00", "agil": "10,8", "barra": "70"}
notify pgrst, 'reload schema';
