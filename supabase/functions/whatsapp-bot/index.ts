// Edge Function «whatsapp-bot»: tu asistente de LOF en WhatsApp (API oficial de Meta, sin IA, gratis).
// Solo atiende al número del dueño (WA_OWNER). A cualquier otro número no le responde nunca.
// Lee y escribe en la misma base de datos que la app: lo que apuntas aquí aparece en la app al momento.
// Al crearla, desactiva «Verify JWT». Secretos: WA_TOKEN, WA_PHONE_ID, WA_VERIFY_TOKEN, WA_APP_SECRET, WA_OWNER.
import { createClient } from "npm:@supabase/supabase-js@2";

const env = (k: string) => Deno.env.get(k) || "";
const OWNER = env("WA_OWNER").replace(/\D/g, "");
const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));

/* ---------- Utilidades ---------- */
const hoyISO = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date());
const sumaDias = (f: string, n: number) => { const d = new Date(f + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const lunesDe = (f: string) => { const d = new Date(f + "T12:00:00Z"), w = (d.getUTCDay() + 6) % 7; return sumaDias(f, -w); };
const fC = (f: string) => { const [, m, d] = f.split("-").map(Number); return `${d} ${["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][m - 1]}`; };
const eur = (n: number) => (Math.round(+n * 100) / 100).toLocaleString("es-ES", { minimumFractionDigits: Number.isInteger(+n) ? 0 : 2, maximumFractionDigits: 2 }) + " €";
const norm = (t: string) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
const num = (t: string) => { const v = parseFloat(String(t).replace(/\.(?=\d{3}\b)/g, "").replace(",", ".")); return isFinite(v) ? v : NaN; };
const nom1 = (n: string) => String(n || "").split(" ")[0];

async function enviar(to: string, body: string) {
  const r = await fetch(`https://graph.facebook.com/v21.0/${env("WA_PHONE_ID")}/messages`, {
    method: "POST", headers: { Authorization: `Bearer ${env("WA_TOKEN")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { preview_url: false, body: body.slice(0, 4000) } }),
  });
  if (!r.ok) console.error("WhatsApp", r.status, await r.text());
}
async function firmaOk(raw: string, sig: string | null) {
  const secret = env("WA_APP_SECRET"); if (!secret) return true;   // sin secreto configurado no se comprueba (no recomendado)
  if (!sig?.startsWith("sha256=")) return false;
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const h = [...new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(raw)))].map(b => b.toString(16).padStart(2, "0")).join("");
  return h === sig.slice(7);
}

/* ---------- Datos ---------- */
async function clientes() {
  const { data } = await db.from("perfiles").select("id,nombre,rol,activo").neq("rol", "coach");
  return (data || []).filter((p: any) => p.activo !== false);
}
/* Busca un alumno por nombre dentro del texto: nombre completo, nombre + inicial o solo nombre */
function buscaAlumno(txt: string, als: any[]) {
  const t = " " + norm(txt) + " ";
  const puntua = (p: any) => { const ps = norm(p.nombre).split(" "); if (t.includes(" " + ps.join(" ") + " ")) return 3; if (ps[1] && t.includes(` ${ps[0]} ${ps[1]}`)) return 2; return t.includes(" " + ps[0] + " ") ? 1 : 0; };
  const l = als.map(p => ({ p, s: puntua(p) })).filter(x => x.s).sort((a, b) => b.s - a.s);
  if (!l.length) return { p: null, dudas: [] as any[] };
  const top = l.filter(x => x.s === l[0].s);
  return top.length === 1 ? { p: top[0].p, dudas: [] } : { p: null, dudas: top.map(x => x.p) };
}
async function pendiente() { const { data } = await db.from("ajustes_privados").select("valor").eq("clave", "bot_pend").maybeSingle(); try { const v = JSON.parse(data?.valor || "null"); return v && v.exp > Date.now() ? v : null; } catch { return null; } }
const guardaPend = (v: any) => db.from("ajustes_privados").upsert({ clave: "bot_pend", valor: v ? JSON.stringify({ ...v, exp: Date.now() + 15 * 60e3 }) : "null" }, { onConflict: "clave" });

/* ---------- Informes ---------- */
async function informeDia() {
  const hoy = hoyISO(), L = lunesDe(hoy), als = await clientes(), nom = Object.fromEntries(als.map((p: any) => [p.id, p.nombre]));
  const [pr, ch, dv, pg, ag, ta, sa, se] = await Promise.all([
    db.from("presenciales").select("alumno_id,hora,tipo,estado").eq("fecha", hoy).neq("estado", "cancelada").order("hora"),
    db.from("checkins").select("alumno_id,semana_inicio").gte("semana_inicio", sumaDias(L, -7)),
    db.from("devoluciones").select("alumno_id,semana_inicio").gte("semana_inicio", sumaDias(L, -7)),
    db.from("pagos").select("alumno_id,importe,vence,concepto").is("pagado_at", null).lte("vence", sumaDias(hoy, 7)),
    db.from("agenda").select("titulo,estado").eq("fecha", hoy).in("estado", ["pendiente", "programada", "en_curso"]),
    db.from("tareas_coach").select("alumno_id,texto,vence").is("hecha_at", null).lte("vence", hoy),
    db.from("saldos").select("fecha,importe").order("fecha", { ascending: false }).limit(1),
    db.from("servicios").select("alumno_id,seguimiento,modalidad").eq("activo", true),
  ]);
  const conSeg = new Set((se.data || []).filter((s: any) => s.seguimiento !== false && s.modalidad !== "presencial").map((s: any) => s.alumno_id));
  const devP = (ch.data || []).filter((c: any) => nom[c.alumno_id] && conSeg.has(c.alumno_id) && !(dv.data || []).some((d: any) => d.alumno_id === c.alumno_id && d.semana_inicio === c.semana_inicio));
  const venc = (pg.data || []).filter((p: any) => p.vence < hoy), prox = (pg.data || []).filter((p: any) => p.vence >= hoy);
  const sum = (l: any[]) => l.reduce((t, p) => t + +p.importe, 0);
  const L2: string[] = [`*Buenos días, Jesús* · ${fC(hoy)}`];
  const ses = (pr.data || []).filter((p: any) => nom[p.alumno_id]);
  L2.push("", `🏋️ *Sesiones hoy: ${ses.length}*`, ...ses.map((p: any) => `· ${p.hora ? String(p.hora).slice(0, 5) : "—"} ${nom[p.alumno_id]}${p.tipo && !/^entrenamiento$/i.test(p.tipo) ? ` (${p.tipo})` : ""}`));
  if ((ag.data || []).length) L2.push("", `✅ *Elegido para hoy: ${ag.data!.length}*`, ...ag.data!.slice(0, 8).map((a: any) => `· ${a.titulo}${a.estado === "en_curso" ? " (en curso)" : ""}`));
  L2.push("", `💬 *Devoluciones pendientes: ${devP.length}*${devP.length ? "\n" + devP.slice(0, 10).map((c: any) => `· ${nom[c.alumno_id]} (semana del ${fC(c.semana_inicio)})`).join("\n") : ""}`);
  if ((ta.data || []).length) L2.push("", `📝 *Tareas con alumnos: ${ta.data!.length}*`, ...ta.data!.slice(0, 6).map((t: any) => `· ${nom[t.alumno_id] ? nom1(nom[t.alumno_id]) + ": " : ""}${t.texto}`));
  L2.push("", `💳 *Cobros vencidos: ${venc.length}*${venc.length ? ` · ${eur(sum(venc))}\n` + venc.slice(0, 8).map((p: any) => `· ${nom[p.alumno_id] || "?"} · ${eur(p.importe)} (${fC(p.vence)})`).join("\n") : ""}`);
  if (prox.length) L2.push(`📅 Vencen esta semana: ${prox.length} · ${eur(sum(prox))}`);
  const s0 = sa.data?.[0]; L2.push("", s0 ? `💰 Saldo apuntado: ${eur(s0.importe)} (${fC(s0.fecha)})` : "💰 Sin saldo apuntado. Escribe «saldo 2500» para guardarlo.");
  L2.push("", "_Escribe «ayuda» para ver lo que puedo hacer._");
  return L2.join("\n");
}
async function informeCaja() {
  const hoy = hoyISO(), fin = sumaDias(hoy, 30);
  const [sa, pg, mv] = await Promise.all([
    db.from("saldos").select("fecha,importe").order("fecha", { ascending: false }).limit(1),
    db.from("pagos").select("importe,vence").is("pagado_at", null),
    db.from("movimientos").select("tipo,importe,fecha,pagado").eq("pagado", false).lte("fecha", fin),
  ]);
  const sum = (l: any[]) => l.reduce((t, p) => t + +p.importe, 0), s0 = sa.data?.[0];
  const cob = (pg.data || []).filter((p: any) => p.vence >= hoy && p.vence <= fin), venc = (pg.data || []).filter((p: any) => p.vence < hoy);
  const ingP = (mv.data || []).filter((m: any) => m.tipo === "ingreso"), gasP = (mv.data || []).filter((m: any) => m.tipo === "gasto");
  const est = s0 ? +s0.importe + sum(cob) + sum(ingP) - sum(gasP) : null;
  return [`*Caja · próximos 30 días*`, s0 ? `Saldo real: ${eur(s0.importe)} (${fC(s0.fecha)})` : "Sin saldo real apuntado (escribe «saldo 2500»).",
    `+ Cuotas que vencen: ${eur(sum(cob))} (${cob.length})`, ingP.length ? `+ Otros ingresos pendientes: ${eur(sum(ingP))}` : "", gasP.length ? `− Gastos pendientes: ${eur(sum(gasP))}` : "",
    est != null ? `*≈ ${eur(est)}* antes de reservas de impuestos (en la app se descuentan).` : "", venc.length ? `⚠️ Cobros vencidos sin contar: ${eur(sum(venc))} (${venc.length})` : ""].filter(Boolean).join("\n");
}
async function informeSemana() {
  const hoy = hoyISO(), L = lunesDe(hoy), als = await clientes(), nom = Object.fromEntries(als.map((p: any) => [p.id, p.nombre]));
  const [pg, mv, ch, pr] = await Promise.all([
    db.from("pagos").select("importe,pagado_at").gte("pagado_at", L),
    db.from("movimientos").select("tipo,importe,fecha,pagado").gte("fecha", L).eq("pagado", true),
    db.from("checkins").select("alumno_id").eq("semana_inicio", sumaDias(L, -7)),
    db.from("presenciales").select("estado").gte("fecha", L).lte("fecha", sumaDias(L, 6)).neq("estado", "cancelada"),
  ]);
  const sum = (l: any[]) => l.reduce((t, p) => t + +p.importe, 0);
  const ing = sum(pg.data || []) + sum((mv.data || []).filter((m: any) => m.tipo === "ingreso")), gas = sum((mv.data || []).filter((m: any) => m.tipo === "gasto"));
  return [`*Semana del ${fC(L)}*`, `💶 Cobrado: ${eur(ing)}`, `🧾 Gastado: ${eur(gas)}`, `📈 Neto: ${eur(ing - gas)}`,
    `💬 Check-ins de la semana pasada: ${(ch.data || []).filter((c: any) => nom[c.alumno_id]).length}`,
    `🏋️ Sesiones presenciales: ${(pr.data || []).length} (${(pr.data || []).filter((p: any) => p.estado === "dada" || p.estado === "tarde").length} hechas)`].join("\n");
}
async function informeAlumno(p: any) {
  const hoy = hoyISO();
  const [sv, pg, ch, pr, dv] = await Promise.all([
    db.from("servicios").select("*").eq("alumno_id", p.id).eq("activo", true).order("inicio", { ascending: false }).limit(1),
    db.from("pagos").select("importe,vence,concepto").eq("alumno_id", p.id).is("pagado_at", null).order("vence"),
    db.from("checkins").select("semana_inicio,motivacion").eq("alumno_id", p.id).order("semana_inicio", { ascending: false }).limit(1),
    db.from("presenciales").select("fecha,hora,estado,tipo").eq("alumno_id", p.id).neq("estado", "cancelada").order("fecha"),
    db.from("devoluciones").select("semana_inicio").eq("alumno_id", p.id).order("semana_inicio", { ascending: false }).limit(1),
  ]);
  const s = sv.data?.[0], c = ch.data?.[0], l = pr.data || [], hechas = l.filter((x: any) => (x.estado === "dada" || x.estado === "tarde" || (x.estado === "programada" && x.fecha < hoy)) && !/valora/i.test(x.tipo || "")).length;
  const prox = l.find((x: any) => x.fecha >= hoy && x.estado === "programada"), venc = (pg.data || []).filter((x: any) => x.vence < hoy);
  const fin = s?.inicio && s?.duracion_semanas ? sumaDias(s.inicio, s.duracion_semanas * 7 - 1) : null;
  return [`*${p.nombre}*`, s ? `📋 ${s.producto || "Servicio"}${s.inicio ? ` · desde ${fC(s.inicio)}` : ""}${fin ? ` · fin aprox. ${fC(fin)}` : ""}` : "Sin servicio activo",
    s?.sesiones_incluidas ? `🏋️ Sesiones: ${hechas} de ${s.sesiones_incluidas} (quedan ${Math.max(0, s.sesiones_incluidas - hechas)})` : "",
    prox ? `📅 Próxima sesión: ${fC(prox.fecha)}${prox.hora ? " " + String(prox.hora).slice(0, 5) : ""}` : "",
    c ? `💬 Último check-in: semana del ${fC(c.semana_inicio)}${c.motivacion != null ? ` · motivación ${c.motivacion}/10` : ""}${dv.data?.[0]?.semana_inicio === c.semana_inicio ? " · devolución enviada" : " · *sin devolución*"}` : "💬 Sin check-ins",
    (pg.data || []).length ? `💳 Cuotas pendientes: ${(pg.data || []).map((x: any) => `${eur(x.importe)} (${fC(x.vence)}${x.vence < hoy ? ", vencida" : ""})`).join(", ")}` : "💳 Al día con los pagos",
    venc.length ? `⚠️ Debe ${eur(venc.reduce((t: number, x: any) => t + +x.importe, 0))}` : ""].filter(Boolean).join("\n");
}
const AYUDA = `*Lo que puedo hacer*
· *hoy* (o «buenos días») → tu día
· *+500 Laura* → apunto un cobro (si Laura tiene una cuota de 500 € pendiente, la marco como pagada)
· *+120 ayer clase suelta* → ingreso de ayer
· *-45 material* → apunto un gasto
· *saldo 2500* → guardo tu saldo real del banco
· *caja* → caja de los próximos 30 días
· *semana* → resumen de la semana
· *alumno José* → su ficha resumida
· *debe Pedro* → sus cuotas pendientes
Antes de guardar nada te pido confirmación: responde *sí* o *no*.`;

/* ---------- Órdenes que escriben: primero se proponen, luego se confirman ---------- */
async function proponer(txt: string): Promise<string | null> {
  const t = norm(txt), hoy = hoyISO();
  const fecha = /\bayer\b/.test(t) ? sumaDias(hoy, -1) : /\banteayer\b/.test(t) ? sumaDias(hoy, -2) : hoy;
  const limpia = (s: string) => s.replace(/\b(ayer|anteayer|hoy|euros?|eur|€)\b/gi, "").replace(/\s+/g, " ").trim();
  // Saldo real
  let m = /^saldo\s*(?:de|es|:)?\s*([\d.,]+)/.exec(t);
  if (m) { const v = num(m[1]); if (!(v >= 0)) return "No entiendo el importe."; await guardaPend({ a: "saldo", v, fecha: hoy }); return `¿Guardo tu saldo real de *${eur(v)}* a ${fC(hoy)}? (sí / no)`; }
  // Cobro / ingreso
  m = /^(?:\+\s*|(?:ingreso|ingrese|cobro|cobre|me pago|me han pagado)\s+(?:de\s+)?)([\d.,]+)\s*(?:€|e\b|eur\w*)?\s*(.*)$/.exec(t);
  if (m) {
    const v = num(m[1]); if (!(v > 0)) return "No entiendo el importe.";
    const resto = limpia(txt.replace(/^[^\d]*[\d.,]+\s*(€|e\b|eur\w*)?/i, "")), als = await clientes(), b = buscaAlumno(resto, als);
    if (b.dudas.length) return `Hay varios: ${b.dudas.map((p: any) => p.nombre).join(", ")}. Escríbelo con el apellido, p. ej. «+${m[1]} ${b.dudas[0].nombre}».`;
    if (b.p) {
      const { data: pg } = await db.from("pagos").select("id,importe,vence,concepto").eq("alumno_id", b.p.id).is("pagado_at", null).order("vence");
      const cu = (pg || []).find((p: any) => Math.abs(+p.importe - v) < 0.5);
      if (cu) { await guardaPend({ a: "cuota", id: cu.id, fecha, txt: `${b.p.nombre}: ${cu.concepto || "cuota"} (${eur(cu.importe)}, vence ${fC(cu.vence)})` }); return `¿Marco como *pagada* la cuota de ${b.p.nombre}: ${cu.concepto || "cuota"} · ${eur(cu.importe)} (vence ${fC(cu.vence)}), cobrada el ${fC(fecha)}? (sí / no)`; }
      const concepto = `${b.p.nombre}${norm(resto).replace(norm(b.p.nombre), "").replace(norm(nom1(b.p.nombre)), "").trim() ? " · " + resto : ""}`;
      await guardaPend({ a: "mov", tipo: "ingreso", v, fecha, concepto, cat: "Alumnos" });
      return `${(pg || []).length ? `${b.p.nombre} no tiene ninguna cuota pendiente de ${eur(v)} (tiene ${(pg || []).map((p: any) => eur(p.importe)).join(", ")}). ` : ""}¿Apunto un *ingreso* de ${eur(v)} el ${fC(fecha)} · «${concepto}»? (sí / no)`;
    }
    const concepto = resto || "Ingreso"; await guardaPend({ a: "mov", tipo: "ingreso", v, fecha, concepto });
    return `¿Apunto un *ingreso* de ${eur(v)} el ${fC(fecha)} · «${concepto}»? (sí / no)`;
  }
  // Gasto
  m = /^(?:-\s*|(?:gasto|gaste|pague|he pagado)\s+(?:de\s+)?)([\d.,]+)\s*(?:€|e\b|eur\w*)?\s*(.*)$/.exec(t);
  if (m) {
    const v = num(m[1]); if (!(v > 0)) return "No entiendo el importe.";
    const concepto = limpia(txt.replace(/^[^\d]*[\d.,]+\s*(€|e\b|eur\w*)?/i, "")).replace(/^(en|de)\s+/i, "") || "Gasto";
    await guardaPend({ a: "mov", tipo: "gasto", v, fecha, concepto });
    return `¿Apunto un *gasto* de ${eur(v)} el ${fC(fecha)} · «${concepto}»? (sí / no)`;
  }
  return null;
}
async function ejecutar(p: any): Promise<string> {
  const ahora = new Date().toISOString();
  if (p.a === "saldo") { const { error } = await db.from("saldos").insert({ fecha: p.fecha, importe: p.v, nota: "WhatsApp" }); return error ? "❌ No se ha podido guardar: " + error.message : `✅ Saldo guardado: ${eur(p.v)}.`; }
  if (p.a === "cuota") { const { error } = await db.from("pagos").update({ pagado_at: p.fecha || ahora.slice(0, 10) }).eq("id", p.id); return error ? "❌ No se ha podido marcar: " + error.message : `✅ Cuota marcada como pagada: ${p.txt}. Ya lo ves en la app.`; }
  if (p.a === "mov") {
    const row: any = { fecha: p.fecha, tipo: p.tipo, concepto: String(p.concepto).slice(0, 200), importe: p.v, pagado: true }; if (p.cat) row.categoria = p.cat;
    const { error } = await db.from("movimientos").insert(row);
    return error ? "❌ No se ha podido apuntar: " + error.message : `✅ ${p.tipo === "gasto" ? "Gasto" : "Ingreso"} apuntado: ${eur(p.v)} · ${p.concepto} (${fC(p.fecha)}). Ya está en Economía.`;
  }
  return "No había nada pendiente.";
}

/* ---------- Conversación ---------- */
async function responder(texto: string): Promise<string> {
  const t = norm(texto);
  const pend = await pendiente();
  if (pend && /^(si|sí|vale|ok|dale|confirmo|correcto|s)$/.test(t)) { await guardaPend(null); return await ejecutar(pend); }
  if (pend && /^(no|cancela|cancelar|n)$/.test(t)) { await guardaPend(null); return "Vale, no apunto nada."; }
  if (/^(ayuda|help|\?|que puedes hacer|comandos)/.test(t)) return AYUDA;
  if (/^(hola|buenos dias|buenas|hoy|dia|resumen|informe)\b/.test(t)) return await informeDia();
  if (/^caja\b/.test(t)) return await informeCaja();
  if (/^semana\b/.test(t)) return await informeSemana();
  let m = /^(?:alumno|alumna|ficha|como va)\s+(.+)$/.exec(t) || /^(?:debe|cuanto debe|deuda)\s+(.+)$/.exec(t);
  if (m) {
    const b = buscaAlumno(m[1], await clientes());
    if (b.dudas.length) return `Hay varios: ${b.dudas.map((p: any) => p.nombre).join(", ")}. Escríbelo con el apellido.`;
    if (!b.p) return `No encuentro a «${m[1]}» entre tus alumnos activos.`;
    return await informeAlumno(b.p);
  }
  const prop = await proponer(texto); if (prop) return prop;
  return `No te he entendido. ${AYUDA}`;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  // Verificación del webhook (Meta la hace una vez al configurarlo)
  if (req.method === "GET") {
    const ok = url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === env("WA_VERIFY_TOKEN");
    return ok ? new Response(url.searchParams.get("hub.challenge") || "", { status: 200 }) : new Response("No autorizado", { status: 403 });
  }
  if (req.method !== "POST") return new Response("ok");
  const raw = await req.text();
  if (!(await firmaOk(raw, req.headers.get("x-hub-signature-256")))) return new Response("Firma no válida", { status: 401 });
  let body: any; try { body = JSON.parse(raw); } catch { return new Response("ok"); }
  const msgs = (body.entry || []).flatMap((e: any) => (e.changes || []).flatMap((c: any) => c.value?.messages || []));
  for (const msg of msgs) {
    const de = String(msg.from || "").replace(/\D/g, "");
    if (!OWNER || de !== OWNER) continue;   // solo tú: a nadie más se le responde
    const { error: dup } = await db.from("bot_whatsapp").insert({ wamid: msg.id, de, texto: msg.text?.body || `[${msg.type}]` });
    if (dup) continue;                       // WhatsApp a veces reenvía el mismo mensaje: se atiende una vez
    let resp = "";
    try { resp = msg.type === "text" ? await responder(msg.text.body) : "De momento solo entiendo mensajes de texto. Escribe «ayuda»."; }
    catch (e) { console.error(e); resp = "❌ Algo ha fallado al consultar la app. Prueba otra vez en un momento."; }
    await enviar(de, resp);
    await db.from("bot_whatsapp").update({ respuesta: resp.slice(0, 4000) }).eq("wamid", msg.id);
  }
  return new Response("ok");
});
