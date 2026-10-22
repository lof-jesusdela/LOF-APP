-- Bloque 54 · Canjes de puntos (los puntos se calculan solos a partir de fotos y reflexiones mensuales)
create table if not exists canjes (
  id bigserial primary key,
  alumno_id uuid not null references perfiles(id) on delete cascade,
  premio text not null check (premio in ('nutri','pt','mes')),
  puntos int not null check (puntos > 0),
  estado text not null default 'pendiente' check (estado in ('pendiente','aplicado','rechazado')),
  resuelto_at timestamptz,
  created_at timestamptz not null default now()
);
alter table canjes enable row level security;
drop policy if exists canjes_coach on canjes;
create policy canjes_coach on canjes for all to authenticated using (public.es_coach()) with check (public.es_coach());
drop policy if exists canjes_alumno_ver on canjes;
create policy canjes_alumno_ver on canjes for select to authenticated using (alumno_id = auth.uid());
drop policy if exists canjes_alumno_pedir on canjes;
create policy canjes_alumno_pedir on canjes for insert to authenticated with check (alumno_id = auth.uid() and estado = 'pendiente');
