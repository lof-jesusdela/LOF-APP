// Edge Function: avisos automáticos a los futbolistas. La llama Supabase cada 15 min (pg_cron, Bloque 114).
//  · Check-in del partido: 2 h después de la hora que pusiste en el partido (cuando ya ha terminado).
//  · Check-in del lunes: los lunes a las 8:00 (hora de Madrid).
// Cada aviso se envía una sola vez (tabla avisos_enviados). Secretos: VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT, CRON_SECRET.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const DESPUES_PARTIDO_MIN = 120; // minutos tras la hora del partido
const LUNES_HORA = 8;

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

/* Fecha y hora actuales en Madrid */
function ahoraMadrid() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short" }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { fecha: `${p.year}-${p.month}-${p.day}`, min: (+p.hour % 24) * 60 + +p.minute, lunes: p.weekday === "Mon" };
}

Deno.serve(async (req) => {
  if ((req.headers.get("x-cron") || "") !== (Deno.env.get("CRON_SECRET") || "sin-clave")) return json({ error: "No autorizado" }, 401);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com", Deno.env.get("VAPID_PUBLIC")!, Deno.env.get("VAPID_PRIVATE")!);
  const { fecha, min, lunes } = ahoraMadrid();
  const avisos: { clave: string; alumno_id: string; titulo: string; cuerpo: string; url: string }[] = [];

  /* Futbolistas activos */
  const { data: sv } = await admin.from("servicios").select("alumno_id").eq("modulo_futbol", true);
  const { data: pf } = await admin.from("perfiles").select("id,nombre,activo").in("id", (sv || []).map((x) => x.alumno_id));
  const fut = (pf || []).filter((p) => p.activo !== false), nombre = (id: string) => String(fut.find((p) => p.id === id)?.nombre || "").split(" ")[0];
  const ids = fut.map((p) => p.id);

  /* Partidos de hoy cuya hora + 2 h ya ha pasado */
  const { data: pts } = await admin.from("partidos").select("*").eq("fecha", fecha).in("alumno_id", ids.length ? ids : ["-"]);
  for (const p of pts || []) {
    if (!p.hora) continue; const [h, m] = String(p.hora).split(":").map(Number);
    if (min < h * 60 + (m || 0) + DESPUES_PARTIDO_MIN) continue;
    avisos.push({ clave: `partido:${p.id}`, alumno_id: p.alumno_id, titulo: "⚽ Check-in del partido", cuerpo: `${nombre(p.alumno_id) ? nombre(p.alumno_id) + ", ¿c" : "¿C"}ómo ha ido${p.rival ? " contra " + p.rival : ""}? Cuéntamelo en 1 minuto.`, url: `./?w=partido&f=${fecha}` });
  }
  /* Lunes a partir de las 8:00 */
  if (lunes && min >= LUNES_HORA * 60) for (const id of ids) avisos.push({ clave: `lunes:${fecha}:${id}`, alumno_id: id, titulo: "📝 Check-in del lunes", cuerpo: `${nombre(id) ? "Buenos días, " + nombre(id) + ". " : ""}¿Cómo empiezas la semana? Rellena tu check-in.`, url: `./?w=lunes&f=${fecha}` });

  /* Si ya ha enviado ese check-in, no hace falta avisar */
  const { data: hechos } = await admin.from("wellness").select("alumno_id,tipo").eq("fecha", fecha).in("tipo", ["partido", "lunes"]);
  const hecho = (id: string, t: string) => (hechos || []).some((w) => w.alumno_id === id && w.tipo === t);
  let enviados = 0;
  for (const a of avisos) {
    if (hecho(a.alumno_id, a.clave.split(':')[0])) continue;
    /* Una sola vez: si la clave ya existe, ya se envió */
    const { error } = await admin.from("avisos_enviados").insert({ clave: a.clave, alumno_id: a.alumno_id });
    if (error) continue;
    const { data: subs } = await admin.from("push_suscripciones").select("*").eq("alumno_id", a.alumno_id);
    const caducadas: number[] = [];
    for (const s of subs || []) {
      try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ titulo: a.titulo, cuerpo: a.cuerpo, url: a.url, tag: a.clave }), { TTL: 21600 }); enviados++; }
      catch (e) { const c = (e as { statusCode?: number }).statusCode; if (c === 404 || c === 410) caducadas.push(s.id); }
    }
    if (caducadas.length) await admin.from("push_suscripciones").delete().in("id", caducadas);
  }
  return json({ fecha, min, candidatos: avisos.length, enviados });
});
