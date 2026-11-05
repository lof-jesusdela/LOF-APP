-- Bloque 94 · Asistente de WhatsApp: registro de mensajes (evita apuntar dos veces si WhatsApp reenvía un mensaje)
-- Solo lo ve el coach. La función lo usa con su clave de servidor.
create table if not exists public.bot_whatsapp (
  wamid text primary key,
  de text not null,
  texto text,
  respuesta text,
  created_at timestamptz not null default now()
);
alter table public.bot_whatsapp enable row level security;
drop policy if exists bot_whatsapp_coach on public.bot_whatsapp;
create policy bot_whatsapp_coach on public.bot_whatsapp for select to authenticated using (public.es_coach());
