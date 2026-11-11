// Edge Function: sincroniza al instante las citas de la agenda con tu Google Calendar (crear, cambiar, mover, borrar).
// Solo la puede llamar el coach. Secretos: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, (opcional) GOOGLE_CALENDAR_ID (por defecto «primary»).
// Body: { ids: number[] (citas a crear/actualizar), borrar: string[] (gcal_id de eventos a eliminar), avisar: boolean (Google envía correo a los alumnos invitados) }
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const TZ = "Europe/Madrid";

async function token() {
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: Deno.env.get("GOOGLE_CLIENT_ID")!, client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!, refresh_token: Deno.env.get("GOOGLE_REFRESH_TOKEN")!, grant_type: "refresh_token" }) });
  const j = await r.json(); if (!j.access_token) throw new Error("Google no ha dado acceso: revisa GOOGLE_CLIENT_ID / SECRET / REFRESH_TOKEN (" + (j.error_description || j.error || r.status) + ")"); return j.access_token as string;
}
const hm = (h: string) => String(h).slice(0, 5);
const finDe = (f: string, h: string, min: number) => { const [a, b] = hm(h).split(":").map(Number), t = a * 60 + b + min, d = new Date(f + "T00:00:00Z"); d.setUTCMinutes(t); return d.toISOString().slice(0, 16).replace("Z", ""); };
const diaSig = (f: string) => { const d = new Date(f + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user } } = await admin.auth.getUser(jwt); if (!user) return json({ error: "No autorizado" }, 401);
    const { data: pf } = await admin.from("perfiles").select("rol").eq("id", user.id).maybeSingle(); if (pf?.rol !== "coach") return json({ error: "Solo el coach" }, 403);
    const { ids = [], borrar = [], avisar = false } = await req.json();
    const cal = encodeURIComponent(Deno.env.get("GOOGLE_CALENDAR_ID") || "primary"), at = await token(), H = { Authorization: `Bearer ${at}`, "Content-Type": "application/json" };
    const su = `sendUpdates=${avisar ? "all" : "none"}`, base = `https://www.googleapis.com/calendar/v3/calendars/${cal}/events`;
    const out: Record<string, unknown> = { ok: 0, borrados: 0, errores: [] as string[] };

    for (const g of borrar) { const r = await fetch(`${base}/${encodeURIComponent(g)}?${su}`, { method: "DELETE", headers: H }); if (r.ok || r.status === 404 || r.status === 410) (out.borrados as number)++; else (out.errores as string[]).push(`borrar ${g}: ${r.status}`); }
    if (!ids.length) return json(out);

    const { data: aj } = await admin.from("ajustes_privados").select("clave,valor").eq("clave", "agenda_min").maybeSingle();
    const minDef = Math.max(15, Math.min(240, parseInt(aj?.valor) || 60));
    let { data: rows } = await admin.from("presenciales").select("*").in("id", ids);
    const grupos = [...new Set((rows || []).map((r: any) => r.grupo).filter(Boolean))];
    if (grupos.length) { const { data: gr } = await admin.from("presenciales").select("*").in("grupo", grupos); rows = [...(rows || []), ...(gr || []).filter((x: any) => !(rows || []).some((y: any) => y.id === x.id))]; }
    const aids = [...new Set((rows || []).map((r: any) => r.alumno_id).filter(Boolean))];
    const [{ data: per }, { data: todas }, { data: srvs }] = await Promise.all([
      admin.from("perfiles").select("id,nombre,email").in("id", aids.length ? aids : ["00000000-0000-0000-0000-000000000000"]),
      admin.from("presenciales").select("id,alumno_id,fecha,hora,estado,tipo").in("alumno_id", aids.length ? aids : ["00000000-0000-0000-0000-000000000000"]).order("fecha").order("hora"),
      admin.from("servicios").select("*").in("alumno_id", aids.length ? aids : ["00000000-0000-0000-0000-000000000000"]),
    ]);
    const P = Object.fromEntries((per || []).map((p: any) => [p.id, p]));
    // Nº de entrenamiento del bono (igual que en la app)
    const noCuenta = (x: any) => /valoraci|revisi|^pti|primera|entrevista|reuni|^tarea/i.test(x.tipo || "") || ["cancelada", "falta"].includes(x.estado);
    const sv: Record<string, any> = Object.fromEntries((srvs || []).map((x: any) => [x.alumno_id, x])), num: Record<string, string> = {}, cu: Record<string, number> = {};
    for (const x of todas || []) { const s = sv[x.alumno_id]; if (!s || noCuenta(x) || (s.inicio && x.fecha < s.inicio)) continue; cu[x.alumno_id] ??= Math.max(0, +s.sesiones_previas || 0); const n = ++cu[x.alumno_id]; num[x.id] = `Entrenamiento ${n}${s.sesiones_incluidas ? ` de ${s.sesiones_incluidas}` : ""} de tu bono`; }

    const hechos = new Set<string>();
    for (const r of rows || []) {
      const clave = r.grupo || String(r.id); if (hechos.has(clave)) continue; hechos.add(clave);
      const g = r.grupo ? (rows || []).filter((x: any) => x.grupo === r.grupo) : [r], als = g.map((x: any) => P[x.alumno_id]).filter(Boolean);
      const gid = g.map((x: any) => x.gcal_id).find(Boolean);
      if (r.estado === "cancelada") { if (gid) await fetch(`${base}/${encodeURIComponent(gid)}?${su}`, { method: "DELETE", headers: H }); await admin.from("presenciales").update({ gcal_id: null }).in("id", g.map((x: any) => x.id)); continue; }
      const tipo = r.tipo || "Entrenamiento", quien = als.length ? als.map((a: any) => a.nombre).join(" + ") : r.persona || "";
      const lineas = g.map((x: any) => num[x.id] && (g.length > 1 ? (P[x.alumno_id]?.nombre || "").split(" ")[0] + ": " : "") + num[x.id]).filter(Boolean).join("\n");
      const meet = /^https?:\/\//i.test(r.lugar || "") ? r.lugar : null;
      const ev: Record<string, unknown> = {
        summary: als.length ? `${quien} · ${tipo}` : `${tipo}${quien ? " · " + quien : ""}`,
        description: [lineas && "🏋️ " + lineas, meet && "Enlace de la videollamada: " + meet, r.nota, "La Obra Fitness"].filter(Boolean).join("\n\n"),
        location: r.lugar || undefined,
        start: r.hora ? { dateTime: `${r.fecha}T${hm(r.hora)}:00`, timeZone: TZ } : { date: r.fecha },
        end: r.hora ? { dateTime: `${finDe(r.fecha, r.hora, r.duracion_min || minDef)}:00`, timeZone: TZ } : { date: diaSig(r.fecha) },
        attendees: als.filter((a: any) => a.email).map((a: any) => ({ email: a.email, displayName: a.nombre })),
        extendedProperties: { private: { lof_id: String(r.id) } },
      };
      let res = gid ? await fetch(`${base}/${encodeURIComponent(gid)}?${su}`, { method: "PATCH", headers: H, body: JSON.stringify(ev) }) : null;
      if (!res || res.status === 404 || res.status === 410) res = await fetch(`${base}?${su}`, { method: "POST", headers: H, body: JSON.stringify(ev) });
      const j = await res.json(); if (!res.ok) { (out.errores as string[]).push(`${r.id}: ${j.error?.message || res.status}`); continue; }
      if (j.id !== gid) await admin.from("presenciales").update({ gcal_id: j.id }).in("id", g.map((x: any) => x.id));
      (out.ok as number)++;
    }
    return json(out);
  } catch (e) { return json({ error: String((e as Error).message || e) }, 500); }
});
