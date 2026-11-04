// Edge Function: sincroniza las reservas de Calendly con los bonos de la app (el alumno, las suyas; el coach, las de todos).
// Secretos necesarios: CALENDLY_TOKEN (token personal de Calendly).
import { createClient } from "npm:@supabase/supabase-js@2";

const CAL = "https://api.calendly.com";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Fecha y hora en horario de Madrid
function madrid(iso: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]),
  );
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` };
}

// Lee una respuesta de Calendly y avisa del error exacto si no es correcta
async function leer(url: string, h: Record<string, string>): Promise<any> {
  const r = await fetch(url, { headers: h });
  const t = await r.text();
  if (!r.ok) throw new Error(`Calendly ${r.status}: ${t.slice(0, 160) || "respuesta vacía"}`);
  if (!t) throw new Error("Calendly devolvió una respuesta vacía");
  return JSON.parse(t);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user }, error: ue } = await admin.auth.getUser(jwt);
    if (ue || !user?.email) return json({ error: "No autorizado" }, 401);

    const token = Deno.env.get("CALENDLY_TOKEN");
    if (!token) return json({ error: "Falta el secreto CALENDLY_TOKEN" }, 500);
    const h = { Authorization: `Bearer ${token}` };

    const me = await leer(`${CAL}/users/me`, h);
    const userUri = me.resource?.uri;
    if (!userUri) return json({ error: "Calendly no devuelve tu cuenta. Revisa el token." }, 500);

    // Eventos de los últimos 30 días y futuros (con cancelados, para poder marcarlos)
    const minStart = new Date(Date.now() - 30 * 864e5).toISOString();
    let url: string | null = `${CAL}/scheduled_events?user=${encodeURIComponent(userUri)}&min_start_time=${encodeURIComponent(minStart)}&count=100&sort=start_time:asc`;
    const eventos: any[] = [];
    while (url && eventos.length < 300) {
      const r: any = await leer(url, h);
      eventos.push(...(r.collection || []));
      url = r.pagination?.next_page || null;
    }

    // ¿Quién llama? El alumno sincroniza sus reservas; el coach, las de todos sus alumnos (por email y, si no, por nombre)
    const { data: yo } = await admin.from("perfiles").select("id,rol").eq("id", user.id).maybeSingle();
    const esCoach = yo?.rol === "coach";
    const norm = (t: string) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
    let alumnos: { id: string; email: string; nombre: string }[] = [{ id: user.id, email: user.email.toLowerCase(), nombre: "" }];
    if (esCoach) {
      const { data } = await admin.from("perfiles").select("id,email,nombre,rol,activo");
      alumnos = (data || []).filter((p: any) => p.rol !== "coach" && p.activo !== false).map((p: any) => ({ id: p.id, email: String(p.email || "").toLowerCase(), nombre: norm(p.nombre) }));
    }
    const hoy = madrid(new Date().toISOString()).fecha;
    let nuevas = 0, canceladas = 0, vinculadas = 0;
    const sinAlumno: any[] = [];
    for (const ev of eventos) {
      const uuid = String(ev.uri).split("/").pop();
      const inv: any = await leer(`${CAL}/scheduled_events/${uuid}/invitees?count=20`, h);
      const invitados = inv.collection || [];
      const al = alumnos.find((a) => invitados.some((i: any) => a.email && String(i.email || "").toLowerCase() === a.email))
        || (esCoach ? alumnos.find((a) => a.nombre && invitados.some((i: any) => norm(i.name) === a.nombre)) : undefined);
      if (!al) { if (esCoach && ev.status !== "canceled" && invitados[0]) sinAlumno.push({ nombre: invitados[0].name, email: invitados[0].email, inicio: ev.start_time }); continue; }

      if (ev.status === "canceled") {
        const { data } = await admin.from("presenciales").update({ estado: "cancelada" }).eq("calendly_uri", ev.uri).neq("estado", "cancelada").select("id");
        canceladas += data?.length || 0;
        continue;
      }
      const { data: existe } = await admin.from("presenciales").select("id").eq("calendly_uri", ev.uri).maybeSingle();
      if (existe) continue;

      const { fecha, hora } = madrid(ev.start_time);
      const tipo = /valoraci/i.test(ev.name || "") ? (/final/i.test(ev.name) ? "Valoración final" : "Valoración inicial") : null;
      // Si ya está apuntada ese día (p. ej. la entrenaste con «Entrenar con…» antes de sincronizar), se vincula en vez de duplicarla
      const { data: mismoDia } = await admin.from("presenciales").select("id").eq("alumno_id", al.id).eq("fecha", fecha).is("calendly_uri", null).neq("estado", "cancelada").limit(1);
      if (mismoDia?.length) { await admin.from("presenciales").update({ calendly_uri: ev.uri, hora, origen: "calendly" }).eq("id", mismoDia[0].id); vinculadas++; continue; }
      const pasada = fecha < hoy;
      const { error } = await admin.from("presenciales").insert({
        alumno_id: al.id, fecha, hora, estado: pasada ? "dada" : "programada", origen: "calendly", tipo,
        nota: pasada ? "Reservada en Calendly · marcada como hecha al sincronizar" : "Reservada en Calendly", calendly_uri: ev.uri,
      });
      if (!error) nuevas++;
    }
    return json({ nuevas, canceladas, vinculadas, sinAlumno });
  } catch (e) {
    return json({ error: String((e as any)?.message || e) }, 200);
  }
});
