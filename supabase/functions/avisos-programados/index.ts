// Edge Function: avisos automáticos de check-in a los alumnos. La llama Supabase cada 15 min (pg_cron, Bloque 114).
//  · Check-in del partido: 2 h después de la hora que pusiste en el partido (sin hora, a las 21:00). Es cuando la app lo empieza a exigir.
//  · Futbolistas: check-in diario de martes a viernes a las 7:00 (no el día de partido ni el siguiente); cierre de semana el día después del partido a las 8:00
//    (si no hubo partido el fin de semana, el lunes); post-partido 2 h después del partido.
//  · Resto de alumnos: check-in semanal los lunes a las 8:00 y, a las 21:30, aviso si llevan 2 días sin registrar (máx. cada 2 días).
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
  const dRel = (n: number) => { const d = new Date(fecha + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const dw = (new Date(fecha + "T12:00:00Z").getUTCDay() + 6) % 7;
  const avisos: { clave: string; alumno_id: string; titulo: string; cuerpo: string; url: string }[] = [];
  const CORTE_FUT = "2026-11-28";   // futbolistas: ningún aviso de check-in antes de esta fecha (igual que en la app)

  /* Futbolistas activos */
  const { data: sv } = await admin.from("servicios").select("alumno_id").eq("modulo_futbol", true);
  const { data: pf } = await admin.from("perfiles").select("id,nombre,activo").in("id", (sv || []).map((x) => x.alumno_id));
  const fut = (pf || []).filter((p) => p.activo !== false), nombre = (id: string) => String(fut.find((p) => p.id === id)?.nombre || "").split(" ")[0];
  const todosFut = fut.map((p) => p.id), ids = fecha < CORTE_FUT ? [] : todosFut;

  /* Partidos de hoy cuya hora + 2 h ya ha pasado */
  const { data: pts } = await admin.from("partidos").select("*").eq("fecha", fecha).in("alumno_id", ids.length ? ids : ["-"]);
  for (const p of pts || []) {
    const [h, m] = (p.hora ? String(p.hora) : "19:00").split(":").map(Number);   /* sin hora: a las 21:00, igual que en la app */
    if (min < h * 60 + (m || 0) + DESPUES_PARTIDO_MIN) continue;
    avisos.push({ clave: `partido:${p.id}`, alumno_id: p.alumno_id, titulo: "⚽ Check-in del partido", cuerpo: `${nombre(p.alumno_id) ? nombre(p.alumno_id) + ", ¿c" : "¿C"}ómo ha ido${p.rival ? " contra " + p.rival : ""}? Cuéntamelo en 1 minuto.`, url: `./?w=partido&f=${fecha}` });
  }
  /* Lunes a partir de las 8:00 */
  /* Futbolistas · cierre de semana: el día después del partido (o el lunes si no hubo partido el fin de semana) */
  const { data: ptsR } = await admin.from("partidos").select("alumno_id,fecha").gte("fecha", dRel(-2)).lte("fecha", dRel(-1)).in("alumno_id", ids.length ? ids : ["-"]);
  const jugo = (id: string, f: string) => (ptsR || []).some((p) => p.alumno_id === id && p.fecha === f) || (pts || []).some((p) => p.alumno_id === id && p.fecha === f);
  const tocaCierre = (id: string) => jugo(id, dRel(-1)) || (dw === 0 && !jugo(id, dRel(-2)) && !(pts || []).some((p) => p.alumno_id === id));
  if (min >= LUNES_HORA * 60) for (const id of ids) if (tocaCierre(id)) avisos.push({ clave: `lunes:${fecha}:${id}`, alumno_id: id, titulo: "📝 Check-in · cierre de semana", cuerpo: `${nombre(id) ? "Buenos días, " + nombre(id) + ". " : ""}¿Cómo estás después del partido? Cuéntamelo y pásame tu semana con el equipo.`, url: `./?w=lunes&f=${fecha}` });

  /* Lunes a las 8:00 · resto de alumnos: check-in semanal de la semana que acaba de terminar (si no lo han enviado) */
  if (lunes && min >= LUNES_HORA * 60) {
    const dia = (f: string, n: number) => { const d = new Date(f + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
    const sem = dia(fecha, -7), domingo = dia(fecha, -1);
    const { data: sa } = await admin.from("servicios").select("*").or("modulo_futbol.is.null,modulo_futbol.eq.false");
    const vivos = (sa || []).filter((x) => !(x.estado === "pausado" && (!x.estado_hasta || x.estado_hasta >= fecha)) && (!x.inicio || x.inicio <= domingo) && (!x.fin || x.fin >= sem));
    const { data: pa } = await admin.from("perfiles").select("id,nombre,activo,rol").in("id", vivos.map((x) => x.alumno_id).concat("00000000-0000-0000-0000-000000000000"));
    const { data: ck } = await admin.from("checkins").select("alumno_id").eq("semana_inicio", sem);
    for (const p of pa || []) {
      if (p.activo === false || p.rol === "coach" || todosFut.includes(p.id) || (ck || []).some((c) => c.alumno_id === p.id)) continue;
      const n = String(p.nombre || "").split(" ")[0];
      avisos.push({ clave: `semanal:${sem}:${p.id}`, alumno_id: p.id, titulo: "✅ Check-in semanal", cuerpo: `${n ? "Buenos días, " + n + ". " : ""}¿Qué tal tu semana? Son 2 minutos y con ello preparo tu plan.`, url: `./?k=${sem}` });
    }
  }
  const diaRel = (f: string, n: number) => { const d = new Date(f + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  /* Futbolistas · 7:00: check-in diario de martes a viernes (no el día de partido ni el siguiente) */
  if (dw >= 1 && dw <= 4 && min >= 7 * 60) for (const id of ids) {
    if ((pts || []).some((p) => p.alumno_id === id) || jugo(id, dRel(-1))) continue;
    avisos.push({ clave: `diario:${fecha}:${id}`, alumno_id: id, titulo: "⚽ Tu check-in de hoy", cuerpo: `${nombre(id) ? "Buenos días, " + nombre(id) + ". " : ""}Tu check-in diario: cómo has dormido y el entreno de ayer. 1 minuto. Sin él no podrás empezar tu entreno.`, url: `./?w=diario&f=${fecha}` });
  }
  /* Resto de alumnos · 21:30: si llevan 2 días sin registrar (ayer y anteayer), como mucho un aviso cada 2 días */
  if (min >= 21 * 60 + 30) {
    const ayer = diaRel(fecha, -1), anteayer = diaRel(fecha, -2);
    const { data: sr } = await admin.from("servicios").select("*").or("modulo_futbol.is.null,modulo_futbol.eq.false");
    const vivos = (sr || []).filter((x) => !(x.estado === "pausado" && (!x.estado_hasta || x.estado_hasta >= fecha)) && (!x.inicio || x.inicio <= anteayer));
    const vid = vivos.map((x) => x.alumno_id).concat("00000000-0000-0000-0000-000000000000");
    const [{ data: pr }, { data: rg }, { data: ya }] = await Promise.all([
      admin.from("perfiles").select("id,nombre,activo,rol").in("id", vid),
      admin.from("registro_diario").select("alumno_id,fecha,pasos,ingestas,comidas_hechas,alimentacion,observacion").in("alumno_id", vid).gte("fecha", anteayer).lte("fecha", ayer),
      admin.from("avisos_enviados").select("clave").like("clave", `registro:${ayer}:%`)]);
    const hechoDia = (id: string, f: string) => (rg || []).some((r) => r.alumno_id === id && r.fecha === f && (r.pasos != null || r.ingestas != null || r.comidas_hechas != null || !!r.alimentacion || !!r.observacion));
    for (const p of pr || []) {
      if (p.activo === false || p.rol === "coach" || todosFut.includes(p.id)) continue;
      if (hechoDia(p.id, ayer) || hechoDia(p.id, anteayer) || (ya || []).some((x) => x.clave === `registro:${ayer}:${p.id}`)) continue;
      const n = String(p.nombre || "").split(" ")[0];
      avisos.push({ clave: `registro:${fecha}:${p.id}`, alumno_id: p.id, titulo: "📝 Marca tu día", cuerpo: `${n ? n + ", llevas" : "Llevas"} 2 días sin registrar. Son 10 segundos y con eso te sigo de cerca.`, url: "./?r=1" });
    }
  }
  /* Si ya ha enviado ese check-in, no hace falta avisar */
  const { data: hechos } = await admin.from("wellness").select("alumno_id,tipo").eq("fecha", fecha).in("tipo", ["partido", "lunes", "diario"]);
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
