// Edge Function: calendario de sesiones presenciales para suscribirse desde Google Calendar (o Apple/Outlook).
// Lo pide Google sin iniciar sesión, así que se protege con un código secreto en la URL (?t=…) que la app
// guarda en ajustes_privados (clave «agenda_token»). Al crearla, desactiva «Verify JWT».
import { createClient } from "npm:@supabase/supabase-js@2";

const esc = (t: string) => String(t || "").replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const f8 = (d: string) => d.replace(/-/g, "");
const hm = (h: string) => String(h || "").slice(0, 5).replace(":", "") + "00";
function sumaMin(fecha: string, hora: string, min: number) {
  const [y, m, d] = fecha.split("-").map(Number), [H, M] = String(hora).slice(0, 5).split(":").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d, H, M + min));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}${p(t.getUTCMonth() + 1)}${p(t.getUTCDate())}T${p(t.getUTCHours())}${p(t.getUTCMinutes())}00`;
}
function diaSig(fecha: string) { const t = new Date(fecha + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10).replace(/-/g, ""); }

Deno.serve(async (req) => {
  const url = new URL(req.url), tok = url.searchParams.get("t") || "";
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: aj } = await admin.from("ajustes_privados").select("clave,valor").in("clave", ["agenda_token", "agenda_min"]);
  const cfg = Object.fromEntries((aj || []).map((x: any) => [x.clave, x.valor]));
  if (!cfg.agenda_token || tok !== cfg.agenda_token) return new Response("No autorizado", { status: 401 });
  const min = Math.max(15, Math.min(240, parseInt(cfg.agenda_min) || 60));

  const desde = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10);
  const [{ data: pres }, { data: per }] = await Promise.all([
    admin.from("presenciales").select("id,alumno_id,fecha,hora,estado,tipo,nota,persona,duracion_min,grupo,lugar").gte("fecha", desde).neq("estado", "cancelada").order("fecha"),
    admin.from("perfiles").select("id,nombre"),
  ]);
  // Nº de entrenamiento del bono de cada sesión (como en la app): desde el inicio de su servicio, + las hechas antes de la app
  const [{ data: todas }, { data: srvs }] = await Promise.all([
    admin.from("presenciales").select("id,alumno_id,fecha,hora,estado,tipo").not("alumno_id", "is", null).order("fecha").order("hora"),
    admin.from("servicios").select("*"),
  ]);
  const noCuenta = (x: any) => /valoraci|revisi|^pti|primera|entrevista|reuni|^tarea/i.test(x.tipo || "") || ["cancelada", "falta"].includes(x.estado);
  const sv: Record<string, any> = Object.fromEntries((srvs || []).map((x: any) => [x.alumno_id, x])), num: Record<string, string> = {}, cuenta: Record<string, number> = {};
  for (const x of todas || []) { const s = sv[x.alumno_id]; if (!s || noCuenta(x) || (s.inicio && x.fecha < s.inicio)) continue;
    cuenta[x.alumno_id] ??= Math.max(0, +s.sesiones_previas || 0); const n = ++cuenta[x.alumno_id];
    num[x.id] = `Entrenamiento ${n}${s.sesiones_incluidas ? ` de ${s.sesiones_incluidas}` : ""} de tu bono`; }
  const nom = Object.fromEntries((per || []).map((p: any) => [p.id, p.nombre || "Alumno"]));
  const ahora = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//La Obra Fitness//Sesiones//ES", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:LOF · Sesiones", "X-WR-TIMEZONE:Europe/Madrid", "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H"];
  // Sesiones conjuntas: las filas del mismo «grupo» salen como un solo evento con los dos nombres
  const vistos = new Set<string>(), gnom: Record<string, string[]> = {};
  for (const p of pres || []) if (p.grupo) (gnom[p.grupo] ||= []).push(nom[p.alumno_id] || "Alumno");
  for (const p of pres || []) {
    if (!p.fecha) continue;
    if (p.grupo) { if (vistos.has(p.grupo)) continue; vistos.add(p.grupo); }
    const tipo = p.tipo || "Entrenamiento", quien = p.grupo ? gnom[p.grupo].join(" + ") : p.alumno_id ? nom[p.alumno_id] || "Alumno" : p.persona || "", dur = p.duracion_min || min;
    const hecho = p.estado === "dada" || p.estado === "tarde";
    L.push("BEGIN:VEVENT", `UID:pres-${p.id}@laobrafitness`, `DTSTAMP:${ahora}`);
    if (p.hora) L.push(`DTSTART;TZID=Europe/Madrid:${f8(p.fecha)}T${hm(p.hora)}`, `DTEND;TZID=Europe/Madrid:${sumaMin(p.fecha, p.hora, dur)}`);
    else L.push(`DTSTART;VALUE=DATE:${f8(p.fecha)}`, `DTEND;VALUE=DATE:${diaSig(p.fecha)}`);
    L.push(`SUMMARY:${esc(`${hecho ? "✓ " : ""}${p.alumno_id ? `${quien} · ${tipo}` : `${tipo}${quien ? " · " + quien : ""}`}`)}`, `DESCRIPTION:${esc([(p.grupo ? (pres || []).filter((y: any) => y.grupo === p.grupo) : [p]).map((y: any) => num[y.id] && (p.grupo ? (nom[y.alumno_id] || "").split(" ")[0] + ": " : "") + num[y.id]).filter(Boolean).join("\n"), /^https?:\/\//i.test(p.lugar || "") && "Videollamada: " + p.lugar, p.nota, "Programada en la app de La Obra Fitness"].filter(Boolean).join("\n"))}`, ...(p.lugar ? [`LOCATION:${esc(p.lugar)}`] : []), "STATUS:CONFIRMED", "END:VEVENT");
  }
  L.push("END:VCALENDAR");
  return new Response(L.join("\r\n") + "\r\n", { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-cache" } });
});
