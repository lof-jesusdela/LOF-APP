// Edge Function: sincroniza las reservas de Calendly del alumno que llama con su bono de la app.
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

    // Eventos desde ayer (con cancelados, para poder marcarlos)
    const minStart = new Date(Date.now() - 36 * 3600e3).toISOString();
    let url: string | null = `${CAL}/scheduled_events?user=${encodeURIComponent(userUri)}&min_start_time=${encodeURIComponent(minStart)}&count=100&sort=start_time:asc`;
    const eventos: any[] = [];
    while (url && eventos.length < 300) {
      const r: any = await leer(url, h);
      eventos.push(...(r.collection || []));
      url = r.pagination?.next_page || null;
    }

    const email = user.email.toLowerCase();
    let nuevas = 0, canceladas = 0;
    for (const ev of eventos) {
      // ¿Es este alumno el invitado?
      const uuid = String(ev.uri).split("/").pop();
      const inv: any = await leer(`${CAL}/scheduled_events/${uuid}/invitees?count=20`, h);
      const es = (inv.collection || []).some((i: any) => String(i.email || "").toLowerCase() === email);
      if (!es) continue;

      if (ev.status === "canceled") {
        const { data } = await admin.from("presenciales").update({ estado: "cancelada" }).eq("calendly_uri", ev.uri).select("id");
        canceladas += data?.length || 0;
        continue;
      }
      const { data: existe } = await admin.from("presenciales").select("id").eq("calendly_uri", ev.uri).maybeSingle();
      if (existe) continue;

      const { fecha, hora } = madrid(ev.start_time);
      const { error } = await admin.from("presenciales").insert({
        alumno_id: user.id, fecha, hora, estado: "programada", origen: "calendly",
        nota: "Reservada en Calendly", calendly_uri: ev.uri,
      });
      if (!error) nuevas++;
    }
    return json({ nuevas, canceladas });
  } catch (e) {
    return json({ error: String((e as any)?.message || e) }, 200);
  }
});
