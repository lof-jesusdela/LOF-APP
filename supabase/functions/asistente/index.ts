// Edge Function: asistente de IA de Jesús para los alumnos (chat). Responde con la API de Claude
// usando la metodología de Jesús (ajustes_privados.ia_instrucciones), sus correcciones y los datos del alumno.
// Secretos necesarios: ANTHROPIC_API_KEY. Opcional: IA_MODELO (por defecto claude-sonnet-5-5), IA_LIMITE_DIA (por defecto 30).
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

type Fila = Record<string, unknown>;
const hoy = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
const haceDias = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" }); };
const RUIDO = /(^id$|_id$|_at$|url|foto|fotos|archivos|reloj|gps|endpoint|email|telefono|nif|iban|dni|direccion)/i;
/* Quita ids, rutas de archivos, datos personales y vacíos para no mandar ruido ni datos innecesarios */
function limpio(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(limpio).filter((v) => v != null);
  if (x && typeof x === "object") {
    const o: Fila = {};
    for (const [k, v] of Object.entries(x as Fila)) { if (RUIDO.test(k) || v == null || v === "" || (Array.isArray(v) && !v.length)) continue; o[k] = limpio(v); }
    return Object.keys(o).length ? o : null;
  }
  return x;
}
const txt = (x: unknown, max = 2500) => { const s = JSON.stringify(limpio(x)); return !s || s === "null" ? "—" : s.length > max ? s.slice(0, max) + "…" : s; };

/* Programa en texto: día → ejercicios con series, reps, RIR, peso y método */
function programaTxt(p: Fila | null) {
  if (!p) return "Sin programa activo.";
  const dias = ((p.dias as Fila[]) || []).filter((d) => !d.oculto).sort((a, b) => (a.numero as number) - (b.numero as number));
  return `«${p.nombre}» · ${p.dias_semana || "?"} días/semana\n` + dias.map((d) => {
    const bl = ((d.bloques_sesion as Fila[]) || []).sort((a, b) => String(a.letra || "").localeCompare(String(b.letra || "")));
    return `- ${d.nombre || "Día " + d.numero}: ` + bl.map((b) => {
      const ejs = ((b.ejercicios_sesion as Fila[]) || []).sort((a, c) => (a.orden as number) - (c.orden as number));
      if (b.tipo !== "fuerza" || !ejs.length) return `[${b.nombre}]`;
      return `[${b.nombre}] ` + ejs.map((e) => {
        const nom = (e.nombre as string) || ((e.ejercicios as Fila)?.nombre as string) || "Ejercicio";
        const met = (e.metodos as Fila)?.nombre;
        return `${nom} ${e.series}×${e.repeticiones}${e.rir != null ? " RIR " + e.rir : ""}${e.peso_ref ? " · " + e.peso_ref : ""}${met ? " · " + met : ""}${e.ajustes ? " (" + e.ajustes + ")" : ""}`;
      }).join("; ");
    }).join(" ");
  }).join("\n");
}

const BASE = `Te llamas «EntenIAdor» y eres el asistente de IA de Jesús de la Obra, entrenador personal de La Obra Fitness (LOF). NO eres Jesús y el alumno lo sabe: eres una IA entrenada con sus conocimientos, su metodología y su forma de trabajar. Si te preguntan, dilo con naturalidad.

Para qué estás: resolver al momento las dudas pequeñas del día a día sobre entrenamiento, alimentación, hábitos y el uso de la app, para que el alumno no se quede con la duda por miedo a molestar. Jesús responde personalmente en 24-48 h; tú das apoyo inmediato en lo sencillo.

Cómo respondes:
- En español, cercano y motivador, como hablaría Jesús: directo, práctico, sin rollos. Respuestas cortas (2-6 frases) salvo que haga falta más. Tutea.
- Usa los datos reales del alumno que tienes abajo (su programa, registros, objetivos). No inventes datos que no tengas: si no lo sabes, dilo.
- Puedes explicar ejercicios, métodos, cómo registrar, qué hacer si un día no puede entrenar, cómo cuadrar una comida con su plan, ideas para cumplir pasos o hábitos.
- No cambies su programa, sus pesos objetivo, sus calorías ni su plan de alimentación por tu cuenta: puedes orientar dentro de lo que ya tiene pautado, y si pide un cambio de verdad, dile que se lo trasladas a Jesús.
- Nunca diagnostiques ni recomiendes medicación o suplementos nuevos.

Cuándo derivar a Jesús (escribe además la etiqueta [DERIVAR] al final de tu respuesta, en una línea aparte):
- Dolor, lesión, molestias que no se van, mareos, síntomas raros, embarazo, medicación, analíticas, o cualquier tema de salud.
- Temas emocionales delicados o relación problemática con la comida.
- Peticiones de cambiar el programa, la dieta o el plan.
- Si el alumno no queda satisfecho, insiste, pide hablar con Jesús o no estás seguro de la respuesta.
En esos casos responde con empatía, da solo una orientación prudente si procede, y dile que puede escribir a Jesús por WhatsApp con el botón de abajo.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user }, error: ue } = await admin.auth.getUser(jwt);
    if (ue || !user) return json({ error: "No autorizado" }, 401);
    const uid = user.id;
    const { data: perfil } = await admin.from("perfiles").select("*").eq("id", uid).maybeSingle();
    if (!perfil?.ia_activa) return json({ error: "El asistente no está activado para ti." }, 403);
    if (perfil.acceso_pausado) return json({ error: "Tu acceso está pausado." }, 403);
    if (!perfil.ia_acepta_at) return json({ error: "Primero acepta las condiciones del EntenIAdor." }, 403);

    const { mensaje } = await req.json();
    const pregunta = String(mensaje || "").trim().slice(0, 2000);
    if (!pregunta) return json({ error: "Escribe tu pregunta" }, 400);
    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) return json({ error: "Falta la clave ANTHROPIC_API_KEY en los secretos de la función" }, 500);

    const limite = +(Deno.env.get("IA_LIMITE_DIA") || 30);
    const { count } = await admin.from("ia_mensajes").select("id", { count: "exact", head: true }).eq("alumno_id", uid).eq("rol", "alumno").gte("creado_at", hoy() + "T00:00:00+01:00");
    if ((count || 0) >= limite) return json({ error: `Has llegado al máximo de ${limite} preguntas de hoy. Mañana sigo contigo, o escríbele a Jesús por WhatsApp.` }, 429);

    const SEL = "id,nombre,dias_semana,dias(*,bloques_sesion(*,ejercicios_sesion(*,ejercicios(nombre,musculo,descripcion),metodos(nombre,explicacion))))";
    const [cfg, srv, prog, ses, reg, wel, med, chk, dev, plan, hist, corr] = await Promise.all([
      admin.from("ajustes_privados").select("clave,valor").in("clave", ["ia_instrucciones"]),
      admin.from("servicios").select("*").eq("alumno_id", uid).order("id", { ascending: false }).limit(1),
      admin.from("programas").select(SEL).eq("alumno_id", uid).eq("activo", true).is("contexto_desde", null).order("id", { ascending: false }).limit(1),
      admin.from("sesiones_hechas").select("fecha,estado,series_hechas,series_total,valoracion,notas,dias(nombre)").eq("alumno_id", uid).gte("fecha", haceDias(21)).order("fecha", { ascending: false }).limit(20),
      admin.from("registro_diario").select("*").eq("alumno_id", uid).gte("fecha", haceDias(10)).order("fecha", { ascending: false }),
      admin.from("wellness").select("fecha,tipo,datos").eq("alumno_id", uid).gte("fecha", haceDias(10)).order("fecha", { ascending: false }),
      admin.from("mediciones").select("*").eq("alumno_id", uid).order("fecha", { ascending: false }).limit(4),
      admin.from("checkins").select("*").eq("alumno_id", uid).order("semana_inicio", { ascending: false }).limit(2),
      admin.from("devoluciones").select("*").eq("alumno_id", uid).order("semana_inicio", { ascending: false }).limit(2),
      admin.from("planificacion").select("seccion,titulo,contenido,visible").eq("alumno_id", uid).order("orden"),
      admin.from("ia_mensajes").select("rol,texto").eq("alumno_id", uid).order("id", { ascending: false }).limit(16),
      admin.from("ia_mensajes").select("id,alumno_id,texto,correccion").not("correccion", "is", null).order("id", { ascending: false }).limit(15),
    ]);
    // Contextos temporales activos (vacaciones, lesión…) mandan sobre el programa base
    const ctx = await admin.from("programas").select("contexto_nombre,contexto_desde,contexto_hasta," + SEL).eq("alumno_id", uid).lte("contexto_desde", hoy()).gte("contexto_hasta", hoy()).limit(1);

    /* Correcciones de Jesús: pregunta del alumno + cómo lo habría dicho él */
    const ejemplos: string[] = [];
    for (const c of (corr.data || []) as Fila[]) {
      const { data: q } = await admin.from("ia_mensajes").select("texto").eq("alumno_id", c.alumno_id).eq("rol", "alumno").lt("id", c.id).order("id", { ascending: false }).limit(1);
      if (q?.[0]) ejemplos.push(`Pregunta: ${q[0].texto}\nRespuesta de Jesús: ${c.correccion}`);
    }

    const instr = ((cfg.data || []) as Fila[]).find((x) => x.clave === "ia_instrucciones")?.valor as string || "";
    const medObj = ((med.data || []) as Fila[]).filter((m) => m.es_objetivo), medReal = ((med.data || []) as Fila[]).filter((m) => !m.es_objetivo);
    const system = `${BASE}

=== METODOLOGÍA Y CRITERIOS DE JESÚS ===
${instr || "(Jesús aún no ha escrito sus criterios)"}
${ejemplos.length ? `\n=== CÓMO RESPONDE JESÚS (correcciones suyas a respuestas anteriores; imita su criterio y su tono) ===\n${ejemplos.reverse().join("\n\n")}` : ""}

=== DATOS DEL ALUMNO (hoy es ${hoy()}) ===
Nombre: ${perfil.nombre || "—"}
Plan contratado: ${txt(srv.data?.[0], 1200)}
${ctx.data?.[0] ? `Contexto temporal ACTIVO (manda sobre el programa base): ${(ctx.data[0] as Fila).contexto_nombre} del ${(ctx.data[0] as Fila).contexto_desde} al ${(ctx.data[0] as Fila).contexto_hasta}\n${programaTxt(ctx.data[0] as Fila)}\n` : ""}Programa de entrenamiento:
${programaTxt((prog.data?.[0] as Fila) || null)}
Sesiones de las últimas 3 semanas: ${txt(ses.data, 1800)}
Registro diario (10 días): ${txt(reg.data, 1500)}
Wellness (10 días): ${txt(wel.data, 1500)}
Mediciones recientes: ${txt(medReal, 1000)}
Objetivo de composición: ${txt(medObj, 500)}
Últimos check-ins semanales: ${txt(chk.data, 1500)}
Últimas indicaciones de Jesús: ${txt(dev.data, 1500)}
Planificación (alimentación y demás, tal como la ve el alumno): ${txt(((plan.data || []) as Fila[]).filter((p) => p.visible !== false), 3500)}`;

    /* Historial alternando alumno/IA, empezando por el alumno */
    const msgs: { role: "user" | "assistant"; content: string }[] = [];
    for (const m of ((hist.data || []) as Fila[]).reverse()) {
      const role = m.rol === "ia" ? "assistant" : "user";
      if (!msgs.length && role === "assistant") continue;
      if (msgs.length && msgs[msgs.length - 1].role === role) msgs[msgs.length - 1].content += "\n" + m.texto; else msgs.push({ role, content: String(m.texto) });
    }
    if (msgs.length && msgs[msgs.length - 1].role === "user") msgs[msgs.length - 1].content += "\n" + pregunta; else msgs.push({ role: "user", content: pregunta });

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: Deno.env.get("IA_MODELO") || "claude-sonnet-5-5", max_tokens: 900, system, messages: msgs }),
    });
    const out = await r.json();
    if (!r.ok) return json({ error: "La IA no ha podido responder: " + (out?.error?.message || r.status) }, 502);
    let texto = ((out.content || []) as Fila[]).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    const derivar = /\[DERIVAR\]/i.test(texto);
    texto = texto.replace(/\[DERIVAR\]/gi, "").trim() || "Esto prefiero que lo veas con Jesús directamente.";

    const { data: ins, error: ie } = await admin.from("ia_mensajes").insert([
      { alumno_id: uid, rol: "alumno", texto: pregunta },
      { alumno_id: uid, rol: "ia", texto, derivar },
    ]).select("id,rol,texto,derivar,creado_at");
    if (ie) return json({ error: "No se ha podido guardar la conversación: " + ie.message }, 500);
    /* Aviso al móvil de Jesús cuando la IA deriva (si están las claves VAPID) */
    if (derivar && perfil.rol !== "coach") {
      try {
        const pub = Deno.env.get("VAPID_PUBLIC"), priv = Deno.env.get("VAPID_PRIVATE");
        if (pub && priv) {
          webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com", pub, priv);
          const { data: coaches } = await admin.from("perfiles").select("id").eq("rol", "coach");
          const { data: subs } = await admin.from("push_suscripciones").select("*").in("alumno_id", (coaches || []).map((c) => c.id));
          const payload = JSON.stringify({ titulo: `EntenIAdor · ${perfil.nombre || "Alumno"}`, cuerpo: "Ha derivado una consulta a ti: " + pregunta.slice(0, 120), url: "./" });
          await Promise.all((subs || []).map((x) => webpush.sendNotification({ endpoint: x.endpoint, keys: { p256dh: x.p256dh, auth: x.auth } }, payload, { TTL: 86400 }).catch(() => {})));
        }
      } catch (_) { /* el aviso es opcional */ }
    }
    return json({ mensajes: ins, derivar });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
