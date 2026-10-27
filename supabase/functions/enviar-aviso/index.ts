// Edge Function: envía una notificación push a los móviles de uno o varios alumnos. Solo puede llamarla el coach.
// Secretos necesarios: VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT (p. ej. mailto:tu@email.com).
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user }, error: ue } = await admin.auth.getUser(jwt);
    if (ue || !user) return json({ error: "No autorizado" }, 401);
    const { data: perfil } = await admin.from("perfiles").select("rol").eq("id", user.id).maybeSingle();
    if (perfil?.rol !== "coach") return json({ error: "Solo el coach puede enviar avisos" }, 403);

    const { alumno_ids, titulo, cuerpo, url } = await req.json();
    if (!Array.isArray(alumno_ids) || !alumno_ids.length || !titulo) return json({ error: "Faltan datos" }, 400);
    const pub = Deno.env.get("VAPID_PUBLIC"), priv = Deno.env.get("VAPID_PRIVATE");
    if (!pub || !priv) return json({ error: "Faltan las claves VAPID en los secretos de la función" }, 500);
    webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com", pub, priv);

    const { data: subs } = await admin.from("push_suscripciones").select("*").in("alumno_id", alumno_ids);
    const payload = JSON.stringify({ titulo, cuerpo: cuerpo || "", url: url || "./" });
    let enviados = 0; const conMovil = new Set<string>(); const caducadas: number[] = [];
    await Promise.all((subs || []).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400 });
        enviados++; conMovil.add(s.alumno_id);
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) caducadas.push(s.id);
      }
    }));
    if (caducadas.length) await admin.from("push_suscripciones").delete().in("id", caducadas);
    return json({ enviados, alumnos_con_movil: [...conMovil], sin_movil: alumno_ids.filter((a: string) => !conMovil.has(a)) });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
