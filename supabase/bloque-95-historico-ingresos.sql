-- Bloque 95 · Histórico de ingresos (importar la facturación desde un CSV)
-- Añade a «movimientos» los datos de cada factura o cobro en efectivo del histórico.
-- «ref» es una huella única por fila del CSV: si importas el mismo archivo dos veces, no se duplica nada.
-- Se puede ejecutar más de una vez sin problema.

alter table movimientos add column if not exists ref text;
alter table movimientos add column if not exists emisor text;          -- SL · Autónomo · Efectivo
alter table movimientos add column if not exists programa text;        -- tipo de programa (Ruta Integral, Bono…)
alter table movimientos add column if not exists alumno_nombre text;
alter table movimientos add column if not exists forma_pago text;      -- Transferencia · Bizum · Efectivo · Pendiente
alter table movimientos add column if not exists base numeric(12,2);
alter table movimientos add column if not exists iva numeric(12,2);
alter table movimientos add column if not exists nota text;

create unique index if not exists movimientos_ref_unico on movimientos (ref) where ref is not null;

-- Detalle del programa de cada cobro (para ver ingresos por modalidad y qué incluía)
alter table movimientos add column if not exists modalidad text;       -- Presencial · Online · Híbrido
alter table movimientos add column if not exists entreno boolean;
alter table movimientos add column if not exists alimentacion boolean;
alter table movimientos add column if not exists meses int;
alter table movimientos add column if not exists gimnasio text;        -- Torrejón · Alcalá
