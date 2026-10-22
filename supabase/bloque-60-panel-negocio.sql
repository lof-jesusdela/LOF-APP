-- Bloque 60 · Panel del coach: agenda del día, capacidad, cierre de jornada, mejoras y economía (todo privado del coach)
create table if not exists agenda (
  id bigserial primary key,
  fecha date not null,
  origen text,                         -- clave de la propuesta automática (p. ej. 'devoluciones') o null si es una tarea tuya
  titulo text not null,
  motivo text, accion text,
  minutos int not null default 15,
  estado text not null default 'pendiente' check (estado in ('pendiente','hecha','reprogramada','descartada')),
  prioridad boolean not null default false,
  alumno_id uuid references perfiles(id) on delete set null,
  nota text,
  hecho_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists agenda_fecha on agenda (fecha);
create table if not exists cierres (
  fecha date primary key,
  cerrado_at timestamptz not null default now(),
  proximo text,
  pendientes jsonb not null default '[]'::jsonb
);
create table if not exists mejoras (
  id bigserial primary key,
  titulo text not null,
  estado text not null default 'abierta' check (estado in ('idea','abierta','hecha')),
  created_at timestamptz not null default now()
);
-- Economía: saldo real (lo apuntas tú), movimientos y reservas con los criterios de tu gestor
create table if not exists saldos (
  id bigserial primary key,
  fecha date not null,
  importe numeric(12,2) not null,
  nota text,
  created_at timestamptz not null default now()
);
create table if not exists movimientos (
  id bigserial primary key,
  fecha date not null,
  tipo text not null check (tipo in ('ingreso','gasto','personal')),
  categoria text,
  concepto text not null,
  importe numeric(12,2) not null check (importe >= 0),
  pagado boolean not null default true,
  recurrente boolean not null default false,   -- se repite cada mes (alquiler, software, cuota…)
  created_at timestamptz not null default now()
);
create table if not exists reservas (
  id bigserial primary key,
  concepto text not null,                      -- IVA, IRPF, cuota de autónomo…
  modo text not null check (modo in ('importe','porcentaje')),
  valor numeric(12,2) not null,                -- € o % sobre lo cobrado, según te indique tu gestor
  periodicidad text not null default 'mensual' check (periodicidad in ('mensual','trimestral','anual')),
  proxima date,
  nota text,
  created_at timestamptz not null default now()
);
do $$ declare t text; begin
  foreach t in array array['agenda','cierres','mejoras','saldos','movimientos','reservas'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_coach', t);
    execute format('create policy %I on %I for all to authenticated using (public.es_coach()) with check (public.es_coach())', t || '_coach', t);
  end loop;
end $$;
