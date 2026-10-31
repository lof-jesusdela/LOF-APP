// Edge Function: asistente de IA de Jesús para los alumnos (chat). Responde con la API de Claude
// usando la metodología de Jesús (ajustes_privados.ia_instrucciones), sus correcciones y los datos del alumno.
// Secretos: ANTHROPIC_API_KEY (Claude, de pago) o GEMINI_API_KEY (Gemini, capa gratuita solo para pruebas con el coach). Opcional: IA_MODELO (por defecto claude-sonnet-5-5), IA_LIMITE_DIA (por defecto 30), VAPID_* para avisar al coach.
// Modos: alumno (por defecto) y coach ({ modo: "coach" }): Jesús habla con su asistente, le pregunta por los chats y le enseña ([APRENDER: …]).
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

const BASE = `Te llamas «EntrenIAdor» y eres el asistente de IA de Jesús de la Obra, entrenador personal de La Obra Fitness (LOF). NO eres Jesús y el alumno lo sabe: eres una IA entrenada con sus conocimientos, su metodología y su forma de trabajar. Si te preguntan, dilo con naturalidad.

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

const COACH = `Te llamas «EntrenIAdor» y eres el asistente de IA de Jesús de la Obra (entrenador personal, La Obra Fitness). Ahora NO hablas con un alumno: hablas con el propio Jesús, tu creador. Tutéale, sé directo, breve y útil, como un buen ayudante de confianza.

Tus funciones con Jesús:
- Contarle lo que preguntan sus alumnos al asistente: consultas que derivaste o que no les sirvieron (👎), dudas que se repiten, alumnos que parecen desmotivados o con problemas. Usa solo las conversaciones que tienes abajo; no inventes.
- Redactarle borradores de respuesta para sus alumnos con su estilo, listos para pegar en WhatsApp.
- Aprender de él: cuando Jesús te dé un criterio, una corrección, una preferencia o cualquier información de su forma de trabajar que debas recordar para responder a los alumnos, guárdala escribiendo al final de tu respuesta una línea por cada cosa con este formato exacto: [APRENDER: texto claro y autocontenido, en tercera persona sobre Jesús o como regla]. Confírmale en una frase qué has apuntado. No apuntes cosas triviales ni datos personales de alumnos.
- Hacerle preguntas para conocerle mejor cuando te lo pida o cuando veas huecos (por ejemplo, consultas que no supiste resolver): pregunta de una en una o en lista corta y numerada.`;

/* Lo que Jesús le ha enseñado (preguntas diarias, apuntes del chat y libres): lo más reciente cabe primero */
function conocimientoTxt(l: Fila[], max = 16000) {
  const out: string[] = []; let n = 0;
  for (const k of l) {
    const t = k.pregunta ? `P: ${k.pregunta}\nR (Jesús): ${k.respuesta}` : `- ${k.respuesta}`;
    if (n + t.length > max) break; out.push(t); n += t.length;
  }
  return out.reverse().join("\n\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user }, error: ue } = await admin.auth.getUser(jwt);
    if (ue || !user) return json({ error: "No autorizado" }, 401);
    const uid = user.id;
    const { data: perfil } = await admin.from("perfiles").select("*").eq("id", uid).maybeSingle();
    const body = await req.json();
    const modoCoach = body.modo === "coach";
    if (modoCoach && perfil?.rol !== "coach") return json({ error: "Solo para el coach" }, 403);
    if (!modoCoach) {
      if (!perfil?.ia_activa) return json({ error: "El asistente no está activado para ti." }, 403);
      if (perfil.acceso_pausado) return json({ error: "Tu acceso está pausado." }, 403);
      if (!perfil.ia_acepta_at) return json({ error: "Primero acepta las condiciones del EntrenIAdor." }, 403);
    }
    const canal = modoCoach ? "coach" : "alumno";
    const pregunta = String(body.mensaje || "").trim().slice(0, modoCoach ? 4000 : 2000);
    if (!pregunta) return json({ error: "Escribe tu pregunta" }, 400);
    /* Proveedor: Claude (ANTHROPIC_API_KEY) o, para probar gratis, Gemini (GEMINI_API_KEY).
       La capa gratuita de Gemini puede reutilizar los datos enviados: por seguridad solo se permite con el coach,
       salvo que se ponga IA_GEMINI_ALUMNOS=si en los secretos. */
    const key = Deno.env.get("ANTHROPIC_API_KEY"), gkey = Deno.env.get("GEMINI_API_KEY");
    const usaGemini = !key && !!gkey;
    if (!key && !gkey) return json({ error: "Falta la clave ANTHROPIC_API_KEY (o GEMINI_API_KEY para probar gratis) en los secretos de la función" }, 500);
    if (usaGemini && !modoCoach && Deno.env.get("IA_GEMINI_ALUMNOS") !== "si") return json({ error: "El asistente está en modo de pruebas y solo lo puede usar Jesús." }, 403);

    if (!modoCoach) {
      const limite = +(Deno.env.get("IA_LIMITE_DIA") || 30);
      const { count } = await admin.from("ia_mensajes").select("id", { count: "exact", head: true }).eq("alumno_id", uid).eq("canal", "alumno").eq("rol", "alumno").gte("creado_at", hoy() + "T00:00:00+01:00");
      if ((count || 0) >= limite) return json({ error: `Has llegado al máximo de ${limite} preguntas de hoy. Mañana sigo contigo, o escríbele a Jesús por WhatsApp.` }, 429);
    }

    /* Común: criterios, conocimiento, correcciones e historial de este chat */
    const [cfg, kno, corr, hist] = await Promise.all([
      admin.from("ajustes_privados").select("clave,valor").in("clave", ["ia_instrucciones"]),
      admin.from("ia_conocimiento").select("pregunta,respuesta,categoria").order("id", { ascending: false }).limit(400),
      admin.from("ia_mensajes").select("id,alumno_id,texto,correccion").eq("canal", "alumno").not("correccion", "is", null).order("id", { ascending: false }).limit(15),
      admin.from("ia_mensajes").select("rol,texto").eq("alumno_id", uid).eq("canal", canal).order("id", { ascending: false }).limit(modoCoach ? 20 : 16),
    ]);
    const ejemplos: string[] = [];
    for (const c of (corr.data || []) as Fila[]) {
      const { data: q } = await admin.from("ia_mensajes").select("texto").eq("alumno_id", c.alumno_id).eq("canal", "alumno").eq("rol", "alumno").lt("id", c.id).order("id", { ascending: false }).limit(1);
      if (q?.[0]) ejemplos.push(`Pregunta: ${q[0].texto}\nRespuesta de Jesús: ${c.correccion}`);
    }
    const instr = ((cfg.data || []) as Fila[]).find((x) => x.clave === "ia_instrucciones")?.valor as string || "";
    const saber = conocimientoTxt((kno.data || []) as Fila[]);
    const comun = `=== METODOLOGÍA Y CRITERIOS DE JESÚS ===
${instr || "(Jesús aún no ha escrito sus criterios)"}
${saber ? `\n=== LO QUE JESÚS TE HA ENSEÑADO (sus respuestas y apuntes; síguelo, manda sobre lo genérico) ===\n${saber}\n` : ""}${ejemplos.length ? `\n=== CÓMO RESPONDE JESÚS (correcciones suyas a respuestas anteriores; imita su criterio y su tono) ===\n${ejemplos.reverse().join("\n\n")}\n` : ""}`;

    let system: string;
    if (modoCoach) {
      const desde = new Date(Date.now() - 14 * 864e5).toISOString();
      const [als, conv] = await Promise.all([
        admin.from("perfiles").select("id,nombre,ia_activa,ia_acepta_at,activo,rol").neq("rol", "coach"),
        admin.from("ia_mensajes").select("alumno_id,rol,texto,derivar,valoracion,visto,creado_at").eq("canal", "alumno").gte("creado_at", desde).order("id", { ascending: false }).limit(400),
      ]);
      const nom: Record<string, string> = {};
      for (const a of (als.data || []) as Fila[]) nom[a.id as string] = (a.nombre as string) || "Alumno";
      const lineas: string[] = []; let n = 0;
      for (const m of (conv.data || []) as Fila[]) {
        const t = `[${String(m.creado_at).slice(0, 16).replace("T", " ")}] ${nom[m.alumno_id as string] || "Alumno"} · ${m.rol === "ia" ? "EntrenIAdor" : "Alumno"}: ${String(m.texto).slice(0, 600)}${m.derivar ? " (DERIVADA A JESÚS)" : ""}${m.valoracion === -1 ? " (👎 no le sirvió)" : ""}${m.rol === "ia" && !m.visto && (m.derivar || m.valoracion === -1) ? " [pendiente de revisar]" : ""}`;
        if (n + t.length > 14000) break; lineas.push(t); n += t.length;
      }
      const conIA = ((als.data || []) as Fila[]).filter((a) => a.ia_activa).map((a) => `${a.nombre}${a.ia_acepta_at ? "" : " (aún no lo ha aceptado)"}`);
      system = `${COACH}

${comun}
=== ALUMNOS CON EL ENTRENIADOR ACTIVADO ===
${conIA.join(", ") || "Ninguno todavía"}

=== CONVERSACIONES DE LOS ALUMNOS CON EL ENTRENIADOR (últimos 14 días, de más antigua a más reciente; hoy es ${hoy()}) ===
${lineas.reverse().join("\n") || "Sin conversaciones todavía."}`;
    } else {
      const SEL = "id,nombre,dias_semana,dias(*,bloques_sesion(*,ejercicios_sesion(*,ejercicios(nombre,musculo,descripcion),metodos(nombre,explicacion))))";
      const [srv, prog, ses, reg, wel, med, chk, dev, plan, ctx] = await Promise.all([
        admin.from("servicios").select("*").eq("alumno_id", uid).order("id", { ascending: false }).limit(1),
        admin.from("programas").select(SEL).eq("alumno_id", uid).eq("activo", true).is("contexto_desde", null).order("id", { ascending: false }).limit(1),
        admin.from("sesiones_hechas").select("fecha,estado,series_hechas,series_total,valoracion,notas,dias(nombre)").eq("alumno_id", uid).gte("fecha", haceDias(21)).order("fecha", { ascending: false }).limit(20),
        admin.from("registro_diario").select("*").eq("alumno_id", uid).gte("fecha", haceDias(10)).order("fecha", { ascending: false }),
        admin.from("wellness").select("fecha,tipo,datos").eq("alumno_id", uid).gte("fecha", haceDias(10)).order("fecha", { ascending: false }),
        admin.from("mediciones").select("*").eq("alumno_id", uid).order("fecha", { ascending: false }).limit(4),
        admin.from("checkins").select("*").eq("alumno_id", uid).order("semana_inicio", { ascending: false }).limit(2),
        admin.from("devoluciones").select("*").eq("alumno_id", uid).order("semana_inicio", { ascending: false }).limit(2),
        admin.from("planificacion").select("seccion,titulo,contenido,visible").eq("alumno_id", uid).order("orden"),
        // Contextos temporales activos (vacaciones, lesión…) mandan sobre el programa base
        admin.from("programas").select("contexto_nombre,contexto_desde,contexto_hasta," + SEL).eq("alumno_id", uid).lte("contexto_desde", hoy()).gte("contexto_hasta", hoy()).limit(1),
      ]);
      const medObj = ((med.data || []) as Fila[]).filter((m) => m.es_objetivo), medReal = ((med.data || []) as Fila[]).filter((m) => !m.es_objetivo);
      system = `${BASE}

${comun}
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
    }

    /* Historial alternando usuario/IA, empezando por el usuario */
    const msgs: { role: "user" | "assistant"; content: string }[] = [];
    for (const m of ((hist.data || []) as Fila[]).reverse()) {
      const role = m.rol === "ia" ? "assistant" : "user";
      if (!msgs.length && role === "assistant") continue;
      if (msgs.length && msgs[msgs.length - 1].role === role) msgs[msgs.length - 1].content += "\n" + m.texto; else msgs.push({ role, content: String(m.texto) });
    }
    if (msgs.length && msgs[msgs.length - 1].role === "user") msgs[msgs.length - 1].content += "\n" + pregunta; else msgs.push({ role: "user", content: pregunta });

    let texto = "";
    if (usaGemini) {
      const modelo = Deno.env.get("GEMINI_MODELO") || "gemini-2.5-flash";
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": gkey!, "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: msgs.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
          generationConfig: { maxOutputTokens: modoCoach ? 1500 : 900 },
        }),
      });
      const out = await r.json();
      if (!r.ok) return json({ error: "La IA no ha podido responder: " + (out?.error?.message || r.status) }, 502);
      texto = ((out.candidates?.[0]?.content?.parts || []) as Fila[]).map((p) => p.text || "").join("\n").trim();
      if (!texto) return json({ error: "La IA no ha devuelto respuesta (puede haberla bloqueado). Prueba a reformular." }, 502);
    } else {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": key!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: Deno.env.get("IA_MODELO") || "claude-sonnet-5-5", max_tokens: modoCoach ? 1500 : 900, system, messages: msgs }),
      });
      const out = await r.json();
      if (!r.ok) return json({ error: "La IA no ha podido responder: " + (out?.error?.message || r.status) }, 502);
      texto = ((out.content || []) as Fila[]).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    }

    /* Modo coach: lo que Jesús le enseña se guarda en ia_conocimiento */
    let aprendido = 0;
    if (modoCoach) {
      const apuntes = [...texto.matchAll(/\[APRENDER:\s*([^\]]+)\]/gi)].map((m) => m[1].trim()).filter(Boolean);
      if (apuntes.length) { const { error } = await admin.from("ia_conocimiento").insert(apuntes.map((a) => ({ categoria: "chat", respuesta: a }))); if (!error) aprendido = apuntes.length; }
      texto = texto.replace(/\[APRENDER:\s*[^\]]+\]/gi, "").trim() || "Apuntado.";
    }
    const derivar = !modoCoach && /\[DERIVAR\]/i.test(texto);
    if (!modoCoach) texto = texto.replace(/\[DERIVAR\]/gi, "").trim() || "Esto prefiero que lo veas con Jesús directamente.";

    const { data: ins, error: ie } = await admin.from("ia_mensajes").insert([
      { alumno_id: uid, rol: "alumno", texto: pregunta, canal },
      { alumno_id: uid, rol: "ia", texto, derivar, canal, visto: modoCoach },
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
          const payload = JSON.stringify({ titulo: `🕵🏻‍♂️ EntrenIAdor · ${perfil.nombre || "Alumno"}`, cuerpo: "Te ha pasado una consulta: " + pregunta.slice(0, 120), url: "./" });
          await Promise.all((subs || []).map((x) => webpush.sendNotification({ endpoint: x.endpoint, keys: { p256dh: x.p256dh, auth: x.auth } }, payload, { TTL: 86400 }).catch(() => {})));
        }
      } catch (_) { /* el aviso es opcional */ }
    }
    return json({ mensajes: ins, derivar, aprendido });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
