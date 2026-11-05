// Edge Function «gestion-acceso»: dar de alta alumnos y gestionar su acceso sin entrar en Supabase. Solo la puede usar el coach.
// Acciones: estado (cuenta confirmada, último acceso), crear (alta ya confirmada), clave (nueva contraseña), confirmar.
// Mantén «Verify JWT» activado: la llama la app con tu sesión.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: { user }, error: ue } = await admin.auth.getUser(jwt);
    if (ue || !user) return json({ error: "No autorizado" }, 401);
    const { data: yo } = await admin.from("perfiles").select("rol").eq("id", user.id).maybeSingle();
    if (yo?.rol !== "coach") return json({ error: "Solo el coach puede gestionar accesos" }, 403);

    const { accion, alumno_id, email, password, nombre } = await req.json();
    const okClave = (p: string) => typeof p === "string" && p.length >= 8;
    // Nunca se toca la cuenta de otro coach desde aquí
    const esAlumno = async (id: string) => { const { data } = await admin.from("perfiles").select("rol").eq("id", id).maybeSingle(); return data && data.rol !== "coach"; };

    if (accion === "estado") {
      if (!alumno_id || !(await esAlumno(alumno_id))) return json({ error: "Alumno no encontrado" }, 404);
      const { data, error } = await admin.auth.admin.getUserById(alumno_id); if (error || !data?.user) return json({ error: "No tiene cuenta de acceso" }, 404);
      const u = data.user;
      return json({ email: u.email, confirmada: !!u.email_confirmed_at, ultimo_acceso: u.last_sign_in_at, creada: u.created_at, bloqueada: !!(u as any).banned_until && new Date((u as any).banned_until) > new Date() });
    }
    if (accion === "clave") {
      if (!alumno_id || !(await esAlumno(alumno_id))) return json({ error: "Alumno no encontrado" }, 404);
      if (!okClave(password)) return json({ error: "La contraseña necesita al menos 8 caracteres" }, 400);
      const { error } = await admin.auth.admin.updateUserById(alumno_id, { password, email_confirm: true });
      return error ? json({ error: error.message }, 400) : json({ ok: true });
    }
    if (accion === "confirmar") {
      if (!alumno_id || !(await esAlumno(alumno_id))) return json({ error: "Alumno no encontrado" }, 404);
      const { error } = await admin.auth.admin.updateUserById(alumno_id, { email_confirm: true });
      return error ? json({ error: error.message }, 400) : json({ ok: true });
    }
    if (accion === "crear") {
      const mail = String(email || "").trim().toLowerCase(), nom = String(nombre || "").trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return json({ error: "El email no es válido" }, 400);
      if (!nom) return json({ error: "Falta el nombre" }, 400);
      if (!okClave(password)) return json({ error: "La contraseña necesita al menos 8 caracteres" }, 400);
      const { data, error } = await admin.auth.admin.createUser({ email: mail, password, email_confirm: true, user_metadata: { nombre: nom } });
      if (error) return json({ error: /already|registered|exists/i.test(error.message) ? "Ya existe una cuenta con ese email" : error.message }, 400);
      const id = data.user!.id;
      // Su perfil: si un disparador ya lo creó, se completa; si no, se crea como alumno activo
      const { data: p } = await admin.from("perfiles").select("id").eq("id", id).maybeSingle();
      let r = p ? await admin.from("perfiles").update({ nombre: nom, activo: true }).eq("id", id) : await admin.from("perfiles").insert({ id, nombre: nom, email: mail, rol: "alumno", activo: true });
      if (r.error && !p) r = await admin.from("perfiles").insert({ id, nombre: nom, rol: "alumno" });
      if (r.error) return json({ id, aviso: "Cuenta creada, pero su perfil no: " + r.error.message });
      return json({ id, ok: true });
    }
    return json({ error: "Acción desconocida" }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
