-- Bloque 112 · Foco visible para el alumno (anillo dorado y tarjeta en Hoy) y «Hecho hoy»
alter table servicios add column if not exists foco jsonb;              -- { tipo, meta, texto, desde, dias }
alter table registro_diario add column if not exists foco_ok boolean;   -- el día cumple el foco (marcado por el alumno o por su foto de comida)
notify pgrst, 'reload schema';
