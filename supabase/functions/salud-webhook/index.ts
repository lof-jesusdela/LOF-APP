// Edge Function pública (desactivar «Verify JWT»): recibe desde un Atajo de iPhone los pasos, el sueño y las kcal activas del día.
// Body JSON: { token, pasos?, sueno_h?, kcal?, fecha? (AAAA-MM-DD, por defecto hoy en Madrid) }. El token es perfiles.salud_token.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
// Acepta 8432, "8432", "8.432", "8432,5", "7.5"
const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  let s = String(v).trim().replace(/[^\d.,-]/g, "");
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, ""); else s = s.replace(",", ".");
  const n = parseFloat(s); return Number.isFinite(n) ? n : null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Usa POST" }, 405);
  try {
    const b = await req.json().catch(() => ({}));
    const token = String(b.token || "").trim(); if (token.length < 20) return json({ error: "Falta la llave" }, 401);
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: pf } = await admin.from("perfiles").select("id").eq("salud_token", token).maybeSingle();
    if (!pf) return json({ error: "Llave no válida" }, 401);
    const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" });
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(b.fecha || "")) ? String(b.fecha) : hoy;
    const pasos = num(b.pasos), sueno = num(b.sueno_h), kcal = num(b.kcal);
    const row: Record<string, unknown> = { alumno_id: pf.id, fecha };
    if (pasos != null && pasos >= 0 && pasos < 100000) row.pasos = Math.round(pasos);
    if (sueno != null && sueno >= 0 && sueno <= 24) row.sueno_h = Math.round(sueno * 10) / 10;
    if (kcal != null && kcal >= 0 && kcal < 10000) row.kcal_activas = Math.round(kcal);
    if (Object.keys(row).length === 2) return json({ error: "No llegó ningún dato válido" }, 400);
    const { error } = await admin.from("registro_diario").upsert(row, { onConflict: "alumno_id,fecha" });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, fecha, pasos: row.pasos ?? null, sueno_h: row.sueno_h ?? null, kcal: row.kcal_activas ?? null });
  } catch (e) { return json({ error: String((e as Error).message || e) }, 500); }
});
