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
// Color del evento (colorId de Google Calendar): primero el tipo y, si es un entreno normal, su estado
const hoyMadrid = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ });
const colorDe = (x: any, _hoy: string) => {
  const t = x.tipo || "";
  if (/valora/i.test(t)) return "3";                       // Valoración · rosa (Grape, el más cercano)
  if (/revisi/i.test(t)) return "4";                       // Revisión (presencial u online) · salmón (Flamingo)
  if (/^tarea/i.test(t)) return "9";                       // Tarea · azul eléctrico (Blueberry)
  if (/^pti|entrevista/i.test(t)) return "11";             // PTI y entrevista · rojo (Tomato)
  if (/primera|reuni/i.test(t) || !x.alumno_id) return "7"; // Negocio · azul turquesa (Peacock)
  if (x.estado === "tarde" || x.estado === "falta") return "8";   // Aviso < 24 h y no vino · negro (Graphite, el más oscuro de Google)
  return "6";                                              // Entreno (reservado o hecho) · naranja (Tangerine)
};
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
    // Descripción por defecto de cada tipo (la de la app; si la cambiaste en «agenda_def», manda la tuya): se usa cuando la cita no trae descripción
    const DEF: Record<string, string> = {"Reunión de negocio":"Gracias por reservar este espacio.\n\nMi propósito es ayudar a cada vez más personas a construir un cuerpo, una salud y un estilo de vida que puedan sostener toda la vida. Y eso no se hace solo: se hace rodeándose de personas y proyectos que comparten esa misma exigencia.\n\nEn esta reunión quiero conocerte a ti y a tu proyecto, entender qué buscas y ver con claridad si podemos sumar el uno al otro. Vengo con la mente abierta, con propuestas concretas y con ganas de construir algo que tenga sentido para los dos y, sobre todo, para las personas a las que servimos.\n\nSi quieres que repasemos algo en concreto, mándamelo antes y lo traigo preparado. Así aprovechamos el tiempo al máximo y salimos con próximos pasos claros.\n\nNos vemos,\nJesús de la Obra\nLa Obra Fitness","PTI / primera sesión":"Hoy no vienes a una clase de prueba. Vienes a descubrir cómo se construye un cuerpo y una salud que duran toda la vida.\n\nDurante 30 minutos te explico mi metodología: cómo entreno, cómo planteo la alimentación y por qué la mayoría de procesos fracasan antes de empezar. Los otros 30 minutos los pasamos entrenando, para que sientas en tu propio cuerpo lo que significa entrenar con intención.\n\nAl terminar sabrás exactamente dónde estás, hacia dónde puedes ir y qué necesitas para llegar. Y tendrás la oportunidad de empezar un acompañamiento conmigo, si sientes que es tu momento.\n\nNo te pido que lo tengas todo claro. Solo que vengas con la mente abierta y con ganas de escuchar a tu mejor versión.\n\nTrae ropa cómoda, agua y toalla. El primer ladrillo lo ponemos juntos.\n\nNos vemos,\nJesús","Entrevista online":"Esta videollamada puede ser el punto de inflexión que llevas tiempo buscando.\n\nTe cuento cómo trabajo: cómo entreno, cómo planteo la alimentación y los hábitos, y por qué mis alumnos no solo cambian su cuerpo, sino su forma de vivir. Pero, sobre todo, quiero conocerte a ti: de dónde partes, qué has intentado hasta ahora y qué quieres conseguir de verdad.\n\nAl terminar tendrás claro qué te ha frenado, qué camino tiene sentido para ti y si quieres que lo recorramos juntos en un acompañamiento.\n\nNo necesitas preparar nada. Busca un sitio tranquilo, con buena conexión, y regálate este tiempo sin interrupciones. Es tiempo para ti.\n\nVen con preguntas, con dudas y con ganas. Del resto me encargo yo.\n\nNos vemos al otro lado de la pantalla,\nJesús","Entrevista presencial":"Esta entrevista puede ser el punto de inflexión que llevas tiempo buscando.\n\nTe cuento cómo trabajo: cómo entreno, cómo planteo la alimentación y los hábitos, y por qué mis alumnos no solo cambian su cuerpo, sino su forma de vivir. Pero, sobre todo, quiero conocerte a ti: de dónde partes, qué has intentado hasta ahora y qué quieres conseguir de verdad.\n\nAl terminar tendrás claro qué te ha frenado, qué camino tiene sentido para ti y si quieres que lo recorramos juntos en un acompañamiento.\n\nNo necesitas preparar nada. Llega con tiempo, sin prisas, y regálate este rato sin interrupciones. Es tiempo para ti.\n\nVen con preguntas, con dudas y con ganas. Del resto me encargo yo.\n\nNos vemos en Basic-Fit,\nJesús","Entrenamiento":"Esto no es solo una sesión de entrenamiento.\n\nCada vez que {vienes|vienes|venís} {entrenas|entrenas|entrenáis} algo más importante que un músculo: {construyes|construyes|construís} el hábito. {Te estás convirtiendo en la persona capaz|Te estás convirtiendo en la persona capaz|Os estáis convirtiendo en las personas capaces} de sostener el cuerpo y la salud que {quieres|quieres|queréis}, no durante unas semanas, sino para siempre.\n\nEsta hora es {tuya|tuya|vuestra}. Es el momento en el que {dejas|dejas|dejáis} fuera el trabajo, las prisas y las excusas, y {te dedicas tiempo a ti|te dedicas tiempo a ti|os dedicáis tiempo a vosotros}. Y no lo {haces solo|haces sola|hacéis solos}: lo {haces|haces|hacéis} con alguien obsesionado con {tus|tus|vuestros} resultados y {tus|tus|vuestros} objetivos.\n\n{Ven descansado, hidratado|Ven descansada, hidratada|Venid descansados, hidratados} y con la cabeza puesta en lo que vamos a hacer. Cada repetición bien hecha es un ladrillo más en {tu|tu|vuestra} construcción.\n\n{Trae|Trae|Traed} ropa cómoda, agua y toalla. Si no {puedes|puedes|podéis} venir, {avísame|avísame|avisadme} con al menos 24 horas.\n\nA por ello,\nJesús","Revisión (videollamada)":"Esta no es una llamada para ver qué tal vas.\n\nEs una llamada para marcar estándares. Para fijar objetivos y revisar con honestidad lo que ha funcionado y lo que no. Celebraremos lo que estás consiguiendo y ajustaremos lo que haga falta, sin juicios y sin excusas.\n\nQuiero que salgas sintiéndote {acompañado|acompañada}, visto y entendido. Porque un proceso no se sostiene solo con un plan: se sostiene cuando alguien conoce tu contexto y camina a tu lado.\n\nA partir de aquí seguimos poniendo ladrillos en esa megaconstrucción que es tu salud y el estilo de vida que quieres sostener.\n\nAntes de la llamada, rellena tu check-in en la app y apunta lo que quieras comentarme: dudas, dificultades o logros. Busca un sitio tranquilo y con buena conexión.\n\nHablamos pronto,\nJesús","Valoración inicial":"Hoy empieza todo.\n\nLa valoración inicial es tu punto de partida: toma de datos y puro análisis. Medimos, evaluamos y entendemos en qué punto exacto te encuentras.\n\nEsto es lo que diferencia un proceso individualizado de engañarte con una pauta genérica. Nadie puede llevarte a ningún sitio si no sabe de dónde partes. Es como Google Maps: antes de darte la ruta, necesita saber dónde estás.\n\nCon estos datos diseño tu camino: tu entrenamiento, tu alimentación y tus hábitos, pensados para ti y para nadie más. Y dentro de unos meses volveremos a ellos para demostrar todo lo que has avanzado.\n\nNo vengas a impresionarme: ven a ser {honesto|honesta} contigo. Los números no te juzgan, te orientan.\n\nTrae ropa cómoda, agua y toalla.\n\nEmpezamos a construir,\nJesús","Valoración final":"Hoy toca mirar atrás para ver todo lo que has construido.\n\nRepetimos las mismas mediciones que el primer día y las comparamos con tu punto de partida. Aquí no hay opiniones: hay datos. Vamos a demostrar cada mejora, cada cambio y cada esfuerzo que ha merecido la pena.\n\nY, como en todo proceso honesto, también veremos los puntos que aún puedes seguir mejorando. No como un fallo, sino como tu siguiente objetivo. Tu salud no es una meta a la que se llega: es una construcción que se sostiene.\n\nSiéntete {orgulloso|orgullosa} de haber llegado hasta aquí. Pocas personas son constantes el tiempo suficiente para ver resultados reales.\n\nTrae ropa cómoda, agua y toalla. Después hablaremos de tus próximos pasos.\n\nNos vemos para celebrarlo,\nJesús","Revisión presencial":"Esta no es una revisión para ver qué tal vas.\n\nEs un encuentro para marcar estándares. Para fijar objetivos y revisar con honestidad lo que ha funcionado y lo que no. Celebraremos lo que estás consiguiendo y ajustaremos lo que haga falta, sin juicios y sin excusas.\n\nQuiero que salgas sintiéndote {acompañado|acompañada}, visto y entendido. Porque un proceso no se sostiene solo con un plan: se sostiene cuando alguien conoce tu contexto y camina a tu lado.\n\nA partir de aquí seguimos poniendo ladrillos en esa megaconstrucción que es tu salud y el estilo de vida que quieres sostener.\n\nAntes de vernos, rellena tu check-in en la app y apunta lo que quieras comentarme: dudas, dificultades o logros.\n\nNos vemos,\nJesús"};
    const { data: ad } = await admin.from("ajustes_privados").select("valor").eq("clave", "agenda_def").maybeSingle();
    try { const g = JSON.parse(ad?.valor || "{}") || {}; for (const k in g) if (g[k]?.n) DEF[k] = g[k].n; } catch (_) { /* sin ajustes */ }
    const defDe = (t: string) => DEF[t] || DEF[String(t).split(" + ")[0]] || "";
    // Género: {hombre|mujer} o {hombre|mujer|grupo}; un alumno según su sexo, varios en plural (o masculino)
    const generoTxt = (t: string, k: string) => String(t || "").replace(/\{([^{}]*)\}/g, (a: string, b: string) => { const q = b.split("|"); return q.length < 2 ? a : k === "g" ? (q[2] ?? q[0]) : k === "m" ? q[1] : q[0]; });
    const notaDe = (n: string, k: string) => { for (const t of Object.values(DEF)) if (t && /\{[^{}]*\|/.test(t) && (n === generoTxt(t, "h") || n === t)) return generoTxt(t, k); return generoTxt(n, k); };
    let { data: rows } = await admin.from("presenciales").select("*").in("id", ids);
    const grupos = [...new Set((rows || []).map((r: any) => r.grupo).filter(Boolean))];
    if (grupos.length) { const { data: gr } = await admin.from("presenciales").select("*").in("grupo", grupos); rows = [...(rows || []), ...(gr || []).filter((x: any) => !(rows || []).some((y: any) => y.id === x.id))]; }
    const aids = [...new Set((rows || []).map((r: any) => r.alumno_id).filter(Boolean))];
    const [{ data: per }, { data: todas }, { data: srvs }] = await Promise.all([
      admin.from("perfiles").select("id,nombre,email,sexo").in("id", aids.length ? aids : ["00000000-0000-0000-0000-000000000000"]),
      admin.from("presenciales").select("id,alumno_id,fecha,hora,estado,tipo").in("alumno_id", aids.length ? aids : ["00000000-0000-0000-0000-000000000000"]).order("fecha").order("hora"),
      admin.from("servicios").select("*").in("alumno_id", aids.length ? aids : ["00000000-0000-0000-0000-000000000000"]),
    ]);
    const P = Object.fromEntries((per || []).map((p: any) => [p.id, p]));
    // Nº de entrenamiento del bono (igual que en la app)
    const noCuenta = (x: any) => /valoraci|revisi|^pti|primera|entrevista|reuni|^tarea/i.test(/^(Revisión mensual|Valoración)( \+ |$)/.test(String(x.tipo || "")) ? "" : String(x.tipo || "").split(" + ")[0]) || ["cancelada", "falta"].includes(x.estado);
    const sv: Record<string, any> = Object.fromEntries((srvs || []).map((x: any) => [x.alumno_id, x])), num: Record<string, string> = {}, cu: Record<string, number> = {};
    for (const x of todas || []) { const s = sv[x.alumno_id]; if (!s || noCuenta(x) || (s.inicio && x.fecha < s.inicio)) continue; cu[x.alumno_id] ??= Math.max(0, +s.sesiones_previas || 0); const n = ++cu[x.alumno_id]; num[x.id] = `entrenamiento ${n}${s.sesiones_incluidas ? `/${s.sesiones_incluidas}` : ""}`; }

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
        summary: r.titulo || (als.length ? `${quien} · ${tipo}` : `${tipo}${quien ? " · " + quien : ""}`),
        description: [lineas && "(" + lineas.split("\n").join(")\n(") + ")", meet && "Enlace de la videollamada: " + meet, notaDe(r.nota || defDe(tipo), als.length > 1 ? "g" : als[0]?.sexo === "mujer" ? "m" : "h"), "La Obra Fitness"].filter(Boolean).join("\n\n"),
        location: r.lugar || undefined,
        start: r.hora ? { dateTime: `${r.fecha}T${hm(r.hora)}:00`, timeZone: TZ } : { date: r.fecha },
        end: r.hora ? { dateTime: `${finDe(r.fecha, r.hora, r.duracion_min || minDef)}:00`, timeZone: TZ } : { date: diaSig(r.fecha) },
        // Invitados: los escritos en la cita (alumnos y quien no esté en la app); si la cita no los tiene, los correos de sus alumnos
        attendees: r.invitados != null
          ? String(r.invitados).split(/[\s,;]+/).map((e: string) => e.trim()).filter((e: string) => e.includes("@")).map((e: string) => { const a = als.find((x: any) => (x.email || "").toLowerCase() === e.toLowerCase()); return a ? { email: e, displayName: a.nombre } : { email: e }; })
          : als.filter((a: any) => a.email).map((a: any) => ({ email: a.email, displayName: a.nombre })),
        colorId: r.color || colorDe(r, hoyMadrid()),   // color elegido a mano en la cita; si no, el del tipo
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
