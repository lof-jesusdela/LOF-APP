/* App de alumnos LOF · La Obra Fitness
   Una sola página: alumno (Hoy, Entreno, Progreso, Check-in) y coach (Alumnos, Pagos). */
'use strict';

const sb = window.supabase.createClient(window.LOF_CONFIG.url, window.LOF_CONFIG.key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

/* ---------- Utilidades ---------- */
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hoyISO = () => new Date().toLocaleDateString('sv-SE');
const isoDe = d => d.toLocaleDateString('sv-SE');
const fecha = iso => new Date(iso + 'T00:00:00');
const sumaDias = (iso, n) => { const d = fecha(iso); d.setDate(d.getDate() + n); return isoDe(d); };
const lunesDe = iso => { const d = fecha(iso); const w = (d.getDay() + 6) % 7; d.setDate(d.getDate() - w); return isoDe(d); };
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const fCorta = iso => fecha(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
const fLarga = iso => fecha(iso).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtNum = (n, d = 1) => n == null ? '—' : Number(n).toLocaleString('es-ES', { maximumFractionDigits: d });
const numero = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(n) ? null : n; };
const seg = s => s >= 60 ? (s % 60 ? `${Math.floor(s / 60)}' ${s % 60}''` : `${s / 60}'`) : `${s}''`;

function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => el.hidden = true, 2600); }
function abrirSheet(html) { $('#sheet-in').innerHTML = html; $('#sheet').hidden = false; }
function cerrarSheet() { $('#sheet').hidden = true; $('#sheet-in').innerHTML = ''; }
$('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet') cerrarSheet(); });
function fallo(err, msg) { console.error(err); toast(msg || 'No se ha podido guardar. Revisa tu conexión e inténtalo de nuevo.'); }

const IC = {
  hoy: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  entreno: '<path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12"/>',
  nutri: '<path d="M12 21c-4 0-7-3-7-7 0-5 4-8 7-8s7 3 7 8c0 4-3 7-7 7z"/><path d="M12 6c0-2 1-3 3-3"/>',
  progreso: '<path d="M4 19h16M6 15l4-4 3 3 5-6"/>',
  checkin: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM9 13l2 2 4-4"/>',
  alumnos: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c.8-3.2 3.2-5 6-5s5.2 1.8 6 5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.2c2.5.2 4.3 1.9 5 4.8"/>',
  pagos: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18M7 15h3"/>',
  ejercicios: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 15l3-3 2 2 3-4M8 8h.01"/>',
  pasos: '<path d="M8 4c1.5 0 2.5 2 2.5 4.5S9.5 13 8 13s-2.5-2-2.5-4.5S6.5 4 8 4zM16 10c1.5 0 2.5 2 2.5 4.5S17.5 19 16 19s-2.5-2-2.5-4.5S14.5 10 16 10z"/>',
  tests: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3"/><path d="M7.5 15h9"/>',
  cal: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  plantillas: '<rect x="4" y="3" width="12" height="15" rx="2"/><path d="M8 21h10a2 2 0 0 0 2-2V7M7 8h6M7 12h6"/>'
};
const svg = k => `<svg viewBox="0 0 24 24" aria-hidden="true">${IC[k]}</svg>`;
const CHK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

/* ---------- Estado ---------- */
const S = {
  user: null, perfil: null, modo: 'alumno', tab: 'hoy', ctab: 'alumnos',
  d: null,            // datos del alumno que se muestra (yo)
  dia: null,          // día de entreno abierto
  sesion: null,       // { id, regs: { 'esId-serie': regId } }
  c: null,            // datos del panel coach
  ficha: null,        // alumno abierto en el panel
  chips: new Set()
};

/* ---------- Arranque y sesión ---------- */
sb.auth.onAuthStateChange((ev, session) => {
  if (ev === 'PASSWORD_RECOVERY') return vistaNuevaClave();
  if (ev === 'SIGNED_OUT') { S.user = null; vistaLogin(); }
});

async function arrancar() {
  const { data } = await sb.auth.getSession();
  if (location.hash.includes('type=recovery')) return;
  if (!data.session) return vistaLogin();
  S.user = data.session.user;
  await cargarPerfil();
}

async function cargarPerfil() {
  const { data, error } = await sb.from('perfiles').select('*').eq('id', S.user.id).maybeSingle();
  if (error || !data) return vistaMensaje('Tu cuenta aún no está activa', 'Avisa a Jesús para que active tu perfil.', true);
  S.perfil = data;
  if (!data.consentimiento_at) return vistaConsentimiento();
  S.modo = data.rol === 'coach' ? 'coach' : 'alumno';
  await Promise.all([cargarAlumno(S.user.id), cargarAjustes()]);
  avisoCheckin();
  if (S.modo === 'coach') await cargarCoach();
  render();
}

function vistaLogin(msg = '') {
  $('#tabs').hidden = true;
  $('#app').innerHTML = `<form class="login" id="f-login" novalidate>
    <img src="icons/logo-96.jpg" alt="La Obra Fitness">
    <div class="stack" style="text-align:center;gap:6px"><span class="eyebrow">La Obra Fitness</span><h1>Tu proceso</h1><p class="muted">Entra con el email y la contraseña que te ha dado Jesús.</p></div>
    <div class="card stack">
      <label class="f">Email<input id="l-email" type="email" autocomplete="email" inputmode="email" required></label>
      <label class="f">Contraseña<input id="l-pass" type="password" autocomplete="current-password" required></label>
      <p class="err" id="l-err">${esc(msg)}</p>
      <button class="btn full" type="submit">Entrar</button>
      <button class="btn ghost sm" type="button" id="l-olvido" style="align-self:center">He olvidado mi contraseña</button>
    </div></form>`;
  $('#f-login').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('#f-login button[type=submit]'); btn.disabled = true;
    const { data, error } = await sb.auth.signInWithPassword({ email: $('#l-email').value.trim(), password: $('#l-pass').value });
    btn.disabled = false;
    if (error) { $('#l-err').textContent = error.message.includes('Invalid') ? 'Email o contraseña incorrectos.' : 'No se ha podido entrar. Revisa tu conexión.'; return; }
    S.user = data.user; await cargarPerfil();
  });
  $('#l-olvido').addEventListener('click', async () => {
    const email = $('#l-email').value.trim();
    if (!email) { $('#l-err').textContent = 'Escribe tu email y vuelve a pulsar.'; return; }
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    $('#l-err').textContent = error ? 'No se ha podido enviar el email. Inténtalo en unos minutos.' : '';
    if (!error) toast('Te hemos enviado un email para cambiar la contraseña');
  });
}

function vistaNuevaClave() {
  $('#tabs').hidden = true;
  $('#app').innerHTML = `<form class="login" id="f-clave"><img src="icons/logo-96.jpg" alt="LOF">
    <div class="card stack"><h2>Nueva contraseña</h2>
    <label class="f">Contraseña nueva (mínimo 8 caracteres)<input id="n-pass" type="password" autocomplete="new-password" minlength="8"></label>
    <p class="err" id="n-err"></p><button class="btn full" type="submit">Guardar</button></div></form>`;
  $('#f-clave').addEventListener('submit', async e => {
    e.preventDefault();
    const p = $('#n-pass').value;
    if (p.length < 8) { $('#n-err').textContent = 'Usa al menos 8 caracteres.'; return; }
    const { data, error } = await sb.auth.updateUser({ password: p });
    if (error) { $('#n-err').textContent = 'No se ha podido cambiar. Pide un email nuevo.'; return; }
    history.replaceState(null, '', location.pathname);
    S.user = data.user; toast('Contraseña cambiada'); await cargarPerfil();
  });
}

function vistaConsentimiento() {
  $('#tabs').hidden = true;
  $('#app').innerHTML = `<div class="login"><img src="icons/logo-96.jpg" alt="LOF">
    <div class="card stack"><span class="eyebrow">Antes de empezar</span><h2>Tus datos, protegidos</h2>
    <p class="small">En esta app registrarás tus entrenamientos, tu actividad diaria, tus mediciones corporales y cómo te sientes con el proceso. Son datos de salud y los tratamos con cuidado:</p>
    <ul class="small" style="margin:0;padding-left:18px;display:grid;gap:4px">
      <li>Solo los ves tú y tu coach, Jesús de la Obra.</li>
      <li>Se guardan en servidores de la Unión Europea.</li>
      <li>Se usan únicamente para acompañarte en tu proceso. No se venden ni se ceden.</li>
      <li>Puedes pedir verlos, corregirlos o borrarlos cuando quieras escribiendo a Jesús.</li>
    </ul>
    <label class="row small" style="align-items:flex-start;gap:10px"><input type="checkbox" id="c-ok" style="width:22px;height:22px;flex:none;margin-top:1px"> Acepto el tratamiento de mis datos de salud para mi proceso de acompañamiento.</label>
    <button class="btn full" id="c-btn" disabled>Empezar</button></div></div>`;
  $('#c-ok').addEventListener('change', e => $('#c-btn').disabled = !e.target.checked);
  $('#c-btn').addEventListener('click', async () => {
    const { error } = await sb.from('perfiles').update({ consentimiento_at: new Date().toISOString() }).eq('id', S.user.id);
    if (error) return fallo(error);
    await cargarPerfil();
  });
}

function vistaMensaje(t, m, salir) {
  $('#tabs').hidden = true;
  $('#app').innerHTML = `<div class="login"><img src="icons/logo-96.jpg" alt="LOF"><div class="card stack" style="text-align:center"><h2>${esc(t)}</h2><p class="muted">${esc(m)}</p>${salir ? '<button class="btn ghost" data-act="salir">Salir</button>' : ''}</div></div>`;
}

/* ---------- Carga de datos ---------- */
// Si la base de datos aún no tiene las columnas nuevas, repite la consulta en su versión anterior.
async function conRespaldo(a, b) { const r = await a(); if (r.error) { console.warn('Usando consulta anterior:', r.error.message); return await b(); } return r; }
const SIN_NUEVAS = sel => sel.replace(',imagen_url,musculo_img_url', '').replace(',musculo_img_url', '');
const SEL_PROGRAMA = 'id,nombre,dias_semana,dias(id,numero,nombre,objetivo,volumen,intensidad,foco,bloques_sesion(*,ejercicios_sesion(id,orden,series,repeticiones,rir,peso_ref,descanso_seg,ajustes,aproximacion_631,grupo,pauta,ejercicios(nombre,video_url,imagen_url,musculo_img_url,musculo,descripcion),metodos(nombre,explicacion))))';

async function cargarAlumno(uid) {
  const desde = sumaDias(hoyISO(), -60);
  const [srv, prog, med, reg, ses, chk, ruta, met, val, pres] = await Promise.all([
    sb.from('servicios').select('*').eq('alumno_id', uid).eq('activo', true).order('id', { ascending: false }).limit(1),
    conRespaldo(() => sb.from('programas').select(SEL_PROGRAMA).eq('alumno_id', uid).eq('activo', true).order('id', { ascending: false }).limit(1),
      () => sb.from('programas').select(SIN_NUEVAS(SEL_PROGRAMA)).eq('alumno_id', uid).eq('activo', true).order('id', { ascending: false }).limit(1)),
    sb.from('mediciones').select('*').eq('alumno_id', uid).eq('es_objetivo', false).order('fecha'),
    sb.from('registro_diario').select('*').eq('alumno_id', uid).gte('fecha', desde),
    sb.from('sesiones_hechas').select('*').eq('alumno_id', uid).gte('fecha', desde).order('fecha'),
    sb.from('checkins').select('*').eq('alumno_id', uid).order('semana_inicio', { ascending: false }).limit(12),
    sb.from('hoja_ruta').select('*').eq('alumno_id', uid).order('orden'),
    sb.from('metodos').select('nombre,explicacion'),
    sb.from('valoraciones').select('*,pruebas(*)').eq('alumno_id', uid).order('fecha', { ascending: false }),
    sb.from('presenciales').select('*').eq('alumno_id', uid).order('fecha')
  ]);
  const p = prog.data?.[0] || null;
  if (p) {
    (p.dias ||= []).sort((a, b) => a.numero - b.numero);
    p.dias.forEach(d => { d.bloques_sesion.sort((a, b) => a.letra.localeCompare(b.letra)); d.bloques_sesion.forEach(b => b.ejercicios_sesion.sort((a, b) => a.orden - b.orden)); });
  }
  S.d = {
    servicio: srv.data?.[0] || null, programa: p, mediciones: med.data || [], diario: reg.data || [],
    sesiones: ses.data || [], checkins: chk.data || [], ruta: ruta.data || [],
    metodos: Object.fromEntries((met.data || []).map(m => [m.nombre, m.explicacion])),
    valoraciones: ordenarValoraciones(val.data || []),
    presenciales: pres.data || []
  };
  if (S.d.servicio) S.d.servicio._bloques = bloquesDe(S.d.ruta);
  if (S.d.servicio?.modulo_futbol) await cargarFutbol(uid, S.d);
  { const r = await sb.from('revisiones').select('*').eq('alumno_id', uid).order('fecha', { ascending: false }); S.d.revisiones = r.data || []; S.d.revisionesErr = !!r.error; }
}

/* ---------- Render principal ---------- */
function tabsAlumno() {
  const s = S.d.servicio || {};
  return [['hoy', 'Hoy'], (s.modulo_entreno ?? true) && ['entreno', 'Entreno'], s.modulo_nutricion && ['nutri', 'Nutrición'], ['progreso', 'Progreso'], ['checkin', 'Check-in'], ['tests', 'Tests']].filter(Boolean);
}

/* Escritorio (iPad / Mac): barra lateral con la lista de alumnos y fichas a dos columnas */
const ANCHO = matchMedia('(min-width: 900px)');
ANCHO.addEventListener?.('change', () => { if (S.modo === 'coach' && S.perfil) render(); });
function claseMain() {
  if (S.factura || S.obj || S.editor || S.verPlan || S.verSes || S.valEd) return '';
  if (S.reporte) return S.reporte.alumno ? '' : 'rejilla';
  if (S.ficha) return !S.fichaSub || S.fichaSub === 'plan' ? 'dos' : '';
  return '';
}
function vLateral(actual) {
  if (!S.c?.perfiles) return '';
  const orden = { bad: 0, warn: 1, ok: 2 };
  const als = S.c.perfiles.filter(p => p.activo !== false && p.rol !== 'coach').map(a => ({ a, e: estadoAlumno(a) })).sort((x, y) => orden[x.e.nivel] - orden[y.e.nivel] || (x.a.nombre || '').localeCompare(y.a.nombre || ''));
  const nav = [['alumnos', 'Alumnos'], ['plantillas', 'Plantillas'], ['ejercicios', 'Ejercicios'], ['pagos', 'Pagos']];
  return `<aside class="lateral" aria-label="Navegación del coach">
    <nav class="lat-nav">${nav.map(([k, l]) => `<button data-act="ctab" data-t="${k}" ${actual === k && !S.ficha && !S.reporte && !S.editor && !S.obj ? 'aria-current="page"' : ''}>${svg(k)}<span>${l}</span></button>`).join('')}<button data-act="abrirReporte" ${S.reporte && !S.reporte.alumno ? 'aria-current="page"' : ''}>${svg('checkin')}<span>Reporting semanal</span></button></nav>
    <div class="eyebrow" style="margin:18px 12px 6px">Alumnos · ${als.length}</div>
    <div class="lat-al">${als.map(({ a, e }) => `<button data-act="ficha" data-id="${a.id}" ${S.ficha?.id === a.id ? 'aria-current="page"' : ''}><i class="al-dot" data-act="verAlertas" data-id="${a.id}" role="button" aria-label="Ver alertas de ${esc(a.nombre)}" style="background:var(--${e.nivel})"></i><span class="grow">${esc(a.nombre)}</span>${e.control ? '<b class="small" style="color:var(--gold-ink)">●</b>' : ''}</button>`).join('')}</div>
  </aside>`;
}
function render() {
  const coach = S.modo === 'coach';
  const tabs = coach ? [['alumnos', 'Alumnos'], ['plantillas', 'Plantillas'], ['ejercicios', 'Ejercicios'], ['pagos', 'Pagos']] : tabsAlumno();
  const actual = coach ? S.ctab : S.tab;
  const esCoach = S.perfil.rol === 'coach';
  const vistas = { hoy: vHoy, entreno: vEntreno, nutri: vNutri, progreso: vProgreso, checkin: vCheckin, tests: vTests, alumnos: vAlumnos, pagos: vPagos, ejercicios: vEjercicios, plantillas: vPlantillas };
  $('#app').innerHTML = `<header class="top">
      <div class="badge"><img src="icons/logo-96.jpg" alt=""><div class="t">La Obra Fitness<strong>${coach ? 'Panel coach' : esc(S.perfil.metodologia || 'Tu proceso')}</strong></div></div>
      <div class="row" style="gap:8px">${esCoach ? `<div class="seg" role="group" aria-label="Vista"><button data-act="modo" data-v="alumno" aria-pressed="${!coach}">Yo</button><button data-act="modo" data-v="coach" aria-pressed="${coach}">Coach</button></div>` : ''}
      <button class="avatar" data-act="cuenta" aria-label="Mi cuenta">${esCoach ? '<img src="icons/coach.jpg" alt="">' : esc((S.perfil.nombre || '?').slice(0, 2).toUpperCase())}</button></div>
    </header>${S.prueba ? vBannerPrueba() : ''}${coach && ANCHO.matches ? vLateral(actual) : ''}<main id="main" class="${coach ? claseMain() : ''}">${(S.factura && coach) ? vFacturaDoc() : (S.obj && coach) ? vEntreno() : (S.reporte && coach) ? vReporte() : (S.editor && coach) ? vEditor() : (S.ficha && S.verPlan && coach) ? vPlanDia() : (S.ficha && S.verSes && coach) ? vSesionCerrada() : (S.ficha && S.valEd && coach) ? vValoracionCoach() : (S.ficha && coach) ? vFicha() : vistas[actual]()}</main>`;
  document.body.classList.toggle('modo-coach', coach);
  $('#tabs').hidden = false;
  $('#tabs-in').innerHTML = tabs.map(([k, l]) => `<button data-act="${coach ? 'ctab' : 'tab'}" data-t="${k}" ${actual === k && !((S.ficha || S.editor || S.obj) && coach) ? 'aria-current="page"' : ''}>${svg(k)}<span>${l}</span>${!coach && ((k === 'checkin' && tocaCheckin()) || (k === 'hoy' && pendientesFutbol().length)) ? '<i class="badge-dot"></i>' : ''}</button>`).join('');
  if (S.dia && ((!coach && S.tab === 'entreno') || (coach && S.obj))) rellenarSesion();
}

/* ---------- Métricas ---------- */
function semana(iniISO) {
  const fin = sumaDias(iniISO, 6);
  const ses = S.d.sesiones.filter(s => s.fecha >= iniISO && s.fecha <= fin);
  const reg = S.d.diario.filter(r => r.fecha >= iniISO && r.fecha <= fin);
  const pasos = reg.filter(r => r.pasos != null).map(r => r.pasos);
  const ali = reg.filter(r => r.alimentacion);
  return {
    entrenos: new Set(ses.map(s => s.fecha + '-' + s.dia_id)).size,
    diasEntreno: new Set(ses.map(s => s.fecha)),
    pasosMedia: pasos.length ? Math.round(pasos.reduce((a, b) => a + b, 0) / pasos.length) : null,
    diasPasos: new Set(reg.filter(r => r.pasos != null).map(r => r.fecha)),
    aliPct: ali.length ? Math.round(ali.reduce((t, r) => t + (r.alimentacion === 'si' ? 1 : r.alimentacion === 'parcial' ? .5 : 0), 0) / ali.length * 100) : null,
    aliDias: Object.fromEntries(ali.map(r => [r.fecha, r.alimentacion]))
  };
}
/* Alimentación por ingestas: comidas al día × 7. ≥85 % bien, 60–85 % regular, <60 % mal */
const comidasDia = srv => srv?.comidas_dia || 3;
const evalNutri = pct => pct == null ? null : pct >= 85 ? ['ok', 'Bien'] : pct >= 60 ? ['warn', 'Regular'] : ['bad', 'Mal'];
function ingestasSemana(reg, ini, srv) {
  const fin = sumaDias(ini, 6), n = comidasDia(srv), l = reg.filter(r => r.fecha >= ini && r.fecha <= fin && r.ingestas != null);
  const hechas = l.reduce((t, r) => t + Math.min(n, r.ingestas), 0), total = n * 7;
  return { n, total, hechas, dias: l.length, pct: l.length ? Math.round(hechas / total * 100) : null, porDia: Object.fromEntries(l.map(r => [r.fecha, r.ingestas])) };
}
/* Recordatorio del check-in: sábado por la tarde y domingo, si aún no se ha enviado */
function tocaCheckin() {
  const now = new Date(), dow = now.getDay();
  if (!((dow === 6 && now.getHours() >= 15) || dow === 0)) return false;
  return !(S.d?.checkins || []).some(c => c.semana_inicio === lunesDe(hoyISO()));
}
async function avisoCheckin() {
  if (!tocaCheckin() || !('Notification' in window) || Notification.permission !== 'granted') return;
  const k = 'lof-aviso-chk-' + hoyISO(); try { if (localStorage.getItem(k)) return; localStorage.setItem(k, '1'); } catch (e) { }
  try { const reg = await navigator.serviceWorker?.ready; const op = { body: 'Es fin de semana: rellena tu check-in semanal para Jesús. Tarda 2 minutos.', icon: 'icons/icon-192.png', tag: 'checkin' }; reg ? reg.showNotification('Check-in semanal', op) : new Notification('Check-in semanal', op); } catch (e) { }
}
/* Barra de la semana (lunes a domingo): cada comida saludable suma. El color depende del % que lleva
   respecto a lo que podría llevar hasta hoy: verde ≥85 %, naranja 60–85 %, rojo <60 %. */
function vBarraIngestas(diario, srv) {
  const lunes = lunesDe(hoyISO()), I = ingestasSemana(diario, lunes, srv), hoy = hoyISO();
  const dias = Math.floor((fecha(hoy) - fecha(lunes)) / 864e5) + (I.porDia[hoy] != null ? 1 : 0), posibles = Math.max(1, dias) * I.n;
  const ritmo = dias ? Math.round(I.hechas / posibles * 100) : null, ev = evalNutri(ritmo), ancho = Math.round(I.hechas / I.total * 100);
  const col = { ok: 'var(--ok)', warn: 'var(--warn)', bad: 'var(--bad)' }[ev?.[0]] || 'var(--line)';
  return `<div class="stack" style="gap:8px"><div class="row"><span class="grow small">Alimentación esta semana</span>${ev ? `<span class="pill ${ev[0]}">${ev[1]}</span>` : ''}<b class="num" style="font-family:var(--display);font-size:20px">${I.hechas}/${I.total}</b></div>
    <div class="track gordo ing"><i style="width:${ancho}%;background:${col}"></i></div>
    <div class="small muted">${dias ? `Llevas ${I.hechas} de ${posibles} comidas posibles hasta hoy (${ritmo} %). Objetivo: 85 % o más de las ${I.total} de la semana.` : `Cada comida saludable de tu plan suma. Objetivo: 85 % o más de las ${I.total} de la semana.`}</div></div>`;
}
function vProcesoGlobal(srv) {
  const P = proceso(srv); if (!P) return '';
  const fF = iso => fecha(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  const fin = P.ciclos[P.ciclos.length - 1].fin, quedan = Math.max(0, P.total - P.semana + (P.antes ? 0 : 1) - 1);
  return `<section class="section"><div class="card stack"><div class="row"><div class="grow"><span class="eyebrow">Tu proceso de acompañamiento</span><h3>${P.antes ? `Empieza el ${fF(srv.inicio)}` : P.fuera ? 'Proceso completado' : `Semana ${P.semana}${P.sinFin ? '' : ' de ' + P.total}`}</h3></div>${P.sinFin ? '' : `<b class="num" style="font-family:var(--display);font-size:26px">${P.pctTotal} %</b>`}</div>
    ${P.sinFin ? '' : `<div class="track gordo"><i style="width:${P.pctTotal}%"></i></div><div class="row small muted"><span class="grow">Inicio ${esc(fF(srv.inicio))}</span><span>Final ${esc(fF(fin))}</span></div>${!P.antes && !P.fuera ? `<div class="small">${quedan ? `Te quedan <b>${quedan} semanas</b>.` : 'Estás en la última semana.'} Tus ciclos de entrenamiento están en la pestaña <b>Entreno</b>.</div>` : ''}`}
  </div></section>`;
}
function tira(iniISO, claseDe) {
  const ds = [...Array(7)].map((_, i) => sumaDias(iniISO, i));
  return `<div class="days">${ds.map(d => `<span class="${claseDe(d)}"></span>`).join('')}</div><div class="days-l">${ds.map(d => `<span>${DIAS[fecha(d).getDay()].slice(0, 1)}</span>`).join('')}</div>`;
}

/* ---------- Hoy ---------- */
function diaDeHoy() {
  const p = S.d.programa; if (!p) return null;
  const n = norm(DIAS[new Date().getDay()]);
  return p.dias.find(d => norm(d.nombre) === n) || null;
}
function proximoDia() {
  const p = S.d.programa; if (!p) return null;
  for (let i = 1; i <= 7; i++) { const d = new Date(); d.setDate(d.getDate() + i); const n = norm(DIAS[d.getDay()]); const x = p.dias.find(z => norm(z.nombre) === n); if (x) return x; }
  return null;
}
function hechoHoy(diaId) { return S.d.sesiones.some(s => s.fecha === hoyISO() && s.dia_id === diaId); }

/* ---------- Registro de los últimos 7 días (pasos y comidas), con fotos opcionales ---------- */
const DIA3 = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
/* Días que se pueden rellenar: desde el lunes de esta semana hasta hoy (el domingo cierra la semana) */
const ventanaRegistro = () => { const hoy = hoyISO(), l = lunesDe(hoy); return [...Array(7)].map((_, k) => sumaDias(l, k)).filter(d => d <= hoy); };
const FOTOS = {};
const fotoUrl = p => FOTOS[p] || null;
async function pedirFotos(rutas) {
  const faltan = [...new Set(rutas || [])].filter(r => r && !(r in FOTOS));
  if (!faltan.length) return;
  const r = await sb.storage.from('comidas').createSignedUrls(faltan, 6 * 3600);
  faltan.forEach(p => { FOTOS[p] = null; });
  (r.data || []).forEach(x => { if (x.signedUrl) FOTOS[x.path] = x.signedUrl; });
  render();
}
const miniFotos = rutas => rutas.map(p => fotoUrl(p) ? `<button class="img" data-act="verImagen" data-src="${esc(fotoUrl(p))}" aria-label="Ver foto"><img src="${esc(fotoUrl(p))}" alt="" loading="lazy"></button>` : '').join('');
function vRegistroDia(s) {
  const hoy = hoyISO(), sel = ventanaRegistro().includes(S.regDia) ? S.regDia : hoy;
  const r = S.d.diario.find(x => x.fecha === sel) || {}, esHoy = sel === hoy, rutas = r.fotos || [];
  if (rutas.some(p => !(p in FOTOS))) pedirFotos(rutas);
  return `<section class="section"><div class="section-head"><h2>Registro del día</h2><span class="small muted">${esHoy ? 'Hoy' : esc(fLarga(sel))}</span></div><div class="card stack">
    <div class="stack" style="gap:6px"><span class="small muted">Puedes rellenar los días de esta semana, hasta el domingo.</span>
      <div class="reg-dias" role="group" aria-label="Día a registrar">${ventanaRegistro().map(f => { const x = S.d.diario.find(y => y.fecha === f), hecho = !!x && (x.pasos != null || x.ingestas != null || !!x.alimentacion); return `<button type="button" data-act="regDia" data-f="${f}" aria-pressed="${f === sel}" class="${hecho ? 'hecho' : ''}"><small>${DIA3[fecha(f).getDay()]}</small><b class="num">${fecha(f).getDate()}</b></button>`; }).join('')}</div></div>
    <div class="row"><div class="ico">${svg('pasos')}</div><label class="f grow">Pasos${objPasos(s) ? ` <span class="muted">(objetivo ${fmtNum(objPasos(s), 0)})</span>` : ''}<input id="r-pasos" type="number" inputmode="numeric" min="0" value="${r.pasos ?? ''}" placeholder="Ej. 8500"></label></div>
    ${s.modulo_nutricion ? `<div class="stack" style="gap:6px"><span class="small">Comidas de tu plan cumplidas ${esHoy ? 'hoy' : 'ese día'} <span class="muted">(de ${comidasDia(s)})</span></span><div class="choice ing" role="group">${[...Array(comidasDia(s) + 1)].map((_, k) => `<button data-act="ingestas" data-v="${k}" aria-pressed="${r.ingestas === k}">${k}</button>`).join('')}</div></div>
    <div class="stack" style="gap:8px"><label class="btn ghost full fotos-b"><input type="file" id="r-fotos" accept="image/*" multiple hidden>📷 Añadir fotos de lo que has comido (opcional)</label>${rutas.length ? `<div class="plan-imgs">${miniFotos(rutas)}</div>` : ''}</div>` : ''}
    <label class="f">Observaciones${esHoy ? ' del día' : ' de ese día'}<textarea id="r-obs" rows="2" placeholder="Si no llegaste al objetivo, cuéntame por qué; o cualquier cosa del día que quieras que sepa">${esc(r.observacion || '')}</textarea></label>
    <button class="btn" data-act="guardarDiario">Guardar registro ${esHoy ? 'de hoy' : 'de ese día'}</button>
    <p class="note">Apúntalo al final del día, o antes del domingo si se te ha pasado. Tarda 10 segundos y es lo que permite a Jesús ver tu semana real.</p>
  </div></section>`;
}
async function subirFotosComida(input) {
  const files = [...(input?.files || [])]; if (!files.length) return;
  const f = ventanaRegistro().includes(S.regDia) ? S.regDia : hoyISO(), prev = S.d.diario.find(x => x.fecha === f) || {};
  const rutas = [...(prev.fotos || [])];
  toast(`Subiendo ${files.length === 1 ? 'foto' : files.length + ' fotos'}…`);
  try {
    for (const fl of files) {
      const blob = await reducirImagen(fl, 1280), ruta = `${S.user.id}/${f}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}.jpg`;
      const up = await sb.storage.from('comidas').upload(ruta, blob, { contentType: 'image/jpeg' }); if (up.error) throw up.error;
      rutas.push(ruta);
    }
  } catch (err) { return fallo(err, /bucket|not found/i.test(err.message || '') ? 'Falta ejecutar el Bloque 26 en Supabase.' : 'No se han podido subir las fotos.'); }
  input.value = '';
  await guardarDiario({ fotos: rutas });
}
function vDiasSinCheck(W) {
  const hoy = hoyISO(), f = ventanaRegistro().filter(d => d < hoy && !wDe(W, d, 'diario'));
  if (!f.length) return '';
  return `<div class="stack" style="gap:6px"><span class="small muted">Días sin check diario: rellénalos si se te pasaron</span><div class="chips">${f.map(d => `<button class="pill warn" data-act="wellness" data-t="diario" data-f="${d}">${DIA3[fecha(d).getDay()]} ${fecha(d).getDate()} · rellenar</button>`).join('')}</div></div>`;
}
/* ---------- Zonas de frecuencia cardiaca (visual; el detalle se abre al tocar una zona) ---------- */
const ZONAS_FC = [
  { n: 1, nom: 'Zona 1 · predominio aeróbico', corto: 'Predominio aeróbico', desde: .65, hasta: .80, col: '#7DBE6B', desc: 'Es la zona de la base y los cimientos de tu capacidad cardiovascular. La demanda es sobre todo oxidativa: grasas y metabolismo aeróbico. La fatiga que genera es muy baja y puedes mantenerla mucho tiempo, aunque la intensidad tiene que ser baja.' },
  { n: 2, nom: 'Zona 2 · umbral', corto: 'Umbral', desde: .80, hasta: .90, col: '#E0B43A', desc: 'Empieza a predominar el metabolismo glucolítico, es decir, los hidratos de carbono. Se reduce la participación de las grasas y el oxidativo, y el ácido láctico y la fatiga empiezan a aparecer más rápido.' },
  { n: 3, nom: 'Zona 3 · predominio anaeróbico', corto: 'Predominio anaeróbico', desde: .90, hasta: 1, col: '#D9473B', desc: 'Zona de potencia: el cuerpo no puede mantenerla más que unos pocos segundos o minutos. El metabolismo es casi 100 % anaeróbico y depende de tu VO2max, la capacidad de transportar y absorber oxígeno. Es el motor de tu cuerpo, frente a la zona 1, que es el depósito.' }
];
const fcMaxDe = () => {
  const pr = (S.d?.valoraciones || []).flatMap(v => v.pruebas || []).filter(p => p.tipo === 'fc');
  const medida = numDe(pr[0]?.datos?.[0]?.valor); if (medida) return Math.round(medida);
  const e = edadDe(S.perfil?.fecha_nacimiento); return e ? Math.round(208.75 - 0.7 * e) : null;
};
function vZonasFC() {
  const mx = fcMaxDe(); if (!mx) return '';
  const ppm = x => Math.round(mx * x);
  return `<section class="section"><div class="card stack zonas-fc"><div class="row"><span class="eyebrow grow">Tus zonas de frecuencia cardiaca</span><span class="pill num">FC máx ${mx} ppm</span></div>
    <img src="img/zonas-fc.jpg" alt="Gráfico de zonas: Z1 hasta el 80 %, Z2 del 80 al 87 %, Z3 del 87 al 100 % de la FC máxima" loading="lazy" style="width:100%;border-radius:12px;display:block">
    <div class="zonas-bar" role="group" aria-label="Zonas de frecuencia cardiaca">${ZONAS_FC.map(z => `<button type="button" data-act="zonaFC" data-z="${z.n}" style="background:${z.col}" aria-label="${esc(z.nom)}, de ${ppm(z.desde)} a ${ppm(z.hasta)} ppm"><b>${z.n}</b><span class="num">${ppm(z.desde)}–${ppm(z.hasta)}</span></button>`).join('')}</div>
    <div class="zonas-lab">${ZONAS_FC.map(z => `<span>${esc(z.corto)}</span>`).join('')}</div>
    <p class="small muted">Toca una zona para saber qué significa.</p></div></section>`;
}
function zonaFC(n) {
  const z = ZONAS_FC.find(x => x.n === n), mx = fcMaxDe(); if (!z || !mx) return;
  abrirSheet(`<div class="stack"><span class="eyebrow">Zona ${n}</span><h2>${esc(z.nom)}</h2><div class="pill num" style="align-self:flex-start">${Math.round(mx * z.desde)}–${Math.round(mx * z.hasta)} ppm · ${Math.round(z.desde * 100)}–${Math.round(z.hasta * 100)} % de tu FC máxima</div><p class="small pre">${esc(z.desc)}</p><button class="btn ghost full" data-act="cerrarSheet">Cerrar</button></div>`);
}
function vHoy() {
  const s = S.d.servicio || {}, p = S.d.programa, hoy = hoyISO();
  const d = diaDeHoy(), prox = proximoDia();
  const r = S.d.diario.find(x => x.fecha === hoy) || {};
  const ini = sumaDias(hoy, -6), w = semana(ini);
  let toca = '';
  if (!p) toca = '<div class="empty">Jesús está preparando tu programa. Aparecerá aquí en cuanto esté listo.</div>';
  else if (d) toca = `<div class="line"><div class="ico">${svg('entreno')}</div><div class="grow"><h3>${esc(d.nombre)} · ${esc(d.foco || '')}</h3><div class="small muted">${d.bloques_sesion.length} bloques · ${d.bloques_sesion.reduce((t, b) => t + b.ejercicios_sesion.length, 0)} ejercicios</div></div>${hechoHoy(d.id) ? '<span class="pill ok">Hecho</span>' : `<button class="btn sm" data-act="abrirDia" data-id="${d.id}">Empezar</button>`}</div>`;
  else toca = `<div class="line"><div class="ico">${svg('cal')}</div><div class="grow"><h3>Hoy toca descanso</h3><div class="small muted">${prox ? `Próximo entreno: ${esc(prox.nombre)}` : 'Aprovecha para moverte y cumplir tus pasos.'}</div></div></div>`;
  const _ali = s.modulo_nutricion ? `<div class="stack" style="gap:8px"><span class="small muted">¿Cómo ha ido hoy la alimentación?</span><div class="choice" role="group">${[['si', 'Cumplido'], ['parcial', 'A medias'], ['no', 'No cumplido']].map(([v, l]) => `<button data-act="ali" data-v="${v}" aria-pressed="${r.alimentacion === v}">${l}</button>`).join('')}</div></div>` : '';
  const dur = s.duracion_semanas, semN = s.inicio ? Math.floor((fecha(hoy) - fecha(s.inicio)) / 6048e5) + 1 : null;
  return `<section class="card hero stack">
    <span class="eyebrow">${esc(fLarga(hoy))}</span>
    <h1>Hola, ${esc((S.perfil.nombre || '').split(' ')[0])}</h1>
    <div class="small muted">${esc(s.producto || 'Tu proceso')}${(() => { const P = proceso(s); return P && !P.antes && !P.fuera ? ` · Semana ${P.semana}${P.sinFin ? '' : ' de ' + P.total}` : ''; })()}</div>
    ${objetivoDe(S.d.ruta) ? `<div style="border-top:1px solid rgba(255,255,255,.14);padding-top:12px" class="stack"><span class="eyebrow">Tu objetivo</span><div class="small">${esc(objetivoDe(S.d.ruta))}</div></div>` : ''}
  </section>
  ${S.perfil.rol !== 'coach' ? vChatCoach() : ''}
  ${tocaCheckin() ? `<section class="section"><div class="card aviso-chk stack"><div class="row"><div class="ico gold">${svg('checkin')}</div><div class="grow"><b>Toca rellenar tu check-in</b><div class="small muted">Es fin de semana: cuéntale a Jesús cómo ha ido tu semana.</div></div></div><button class="btn full" data-act="tab" data-t="checkin">Rellenar check-in</button>${'Notification' in window && Notification.permission === 'default' ? '<button class="btn ghost full" data-act="permisoAvisos">Activar avisos en el móvil</button>' : ''}</div></section>` : ''}
  ${s.modulo_futbol ? vFutbolHoy() : ''}
  ${vEventos(s, S.d.presenciales)}
  ${vProcesoGlobal(s)}
  <section class="section"><h2>Lo que toca hoy</h2><div class="card">${toca}</div></section>
  ${s.modulo_futbol ? vSemanaFutbol(ini, w, p) : `${vRegistroDia(s)}
  <section class="section"><div class="section-head"><h2>Últimos 7 días</h2><span class="small muted">${esc(fCorta(ini))} – ${esc(fCorta(hoy))}</span></div><div class="card stack" style="gap:18px">
    ${(s.modulo_entreno ?? true) ? `<div class="stack" style="gap:8px"><div class="row"><span class="grow small">Entrenamientos</span><b class="num" style="font-family:var(--display);font-size:20px">${w.entrenos}${p?.dias_semana ? ' / ' + p.dias_semana : ''}</b></div>${tira(ini, x => w.diasEntreno.has(x) ? 'ok' : '')}</div>` : ''}
    ${s.modulo_nutricion ? vBarraIngestas(S.d.diario, s) : ''}
    <div class="stack" style="gap:8px"><div class="row"><span class="grow small">Pasos (media · objetivo ${fmtNum(objPasos(s), 0)})</span><b class="num" style="font-family:var(--display);font-size:20px;color:${w.pasosMedia == null ? 'inherit' : w.pasosMedia >= objPasos(s) ? 'var(--ok)' : 'var(--warn)'}">${w.pasosMedia == null ? '—' : fmtNum(w.pasosMedia, 0)}</b></div>${tira(ini, x => w.diasPasos.has(x) ? 'ok' : '')}</div>
  </div></section>`}
  ${vPresenciales(S.d.servicio, S.d.presenciales, false)}
  `;
}

async function guardarDiario(extra = {}) {
  const f = ventanaRegistro().includes(S.regDia) ? S.regDia : hoyISO();
  const prev = S.d.diario.find(x => x.fecha === f) || {};
  const row = { alumno_id: S.user.id, fecha: f, pasos: numero($('#r-pasos')?.value), observacion: $('#r-obs')?.value.trim() || null, ...(prev.ingestas != null ? { ingestas: prev.ingestas } : {}), ...extra };
  let { data, error } = await sb.from('registro_diario').upsert(row, { onConflict: 'alumno_id,fecha' }).select().single();
  if (error && /ingestas/.test(error.message || '')) return fallo(error, 'Falta ejecutar el Bloque 11 en Supabase.');
  if (error && /fotos/.test(error.message || '')) return fallo(error, 'Falta ejecutar el Bloque 26 en Supabase.');
  if (error && /observacion/.test(error.message || '')) { delete row.observacion; ({ data, error } = await sb.from('registro_diario').upsert(row, { onConflict: 'alumno_id,fecha' }).select().single()); }
  if (error) return fallo(error);
  S.d.diario = S.d.diario.filter(x => x.fecha !== row.fecha).concat(data);
  toast(extra.ingestas != null ? 'Ingestas guardadas' : 'Registro de hoy guardado'); render();
}

/* ---------- Entreno ---------- */
function vEntreno() {
  const p = S.d.programa;
  if (!p) return '<div class="empty">Jesús está preparando tu programa.</div>';
  if (S.dia) return vSesion();
  const como = S.obj ? `<div class="cerrada" style="margin-bottom:10px"><span class="pill gold">Entrenando a</span><span class="small grow">${esc(S.obj.nombre)} · ${S.obj.fecha && S.obj.fecha !== hoyISO() ? esc(fLarga(S.obj.fecha)) + ' · ' : ''}${S.obj.presencial ? 'canjea 1 sesión presencial al terminar' : 'lo que apuntes se guarda en su ficha'}</span><button class="btn sm ghost" data-act="editarProgramaObj" style="background:#fff">✎ Programa</button><button class="btn sm ghost" data-act="salirComo" style="background:#fff">Salir</button></div>` : '';
  const lunes = lunesDe(hoyISO()), hoyN = norm(DIAS[new Date().getDay()]);
  const hechoSemana = id => S.d.sesiones.some(s => s.dia_id === id && s.fecha >= lunes);
  const P = proceso(S.d.servicio), Pn = P && !P.antes ? S.d.sesiones.filter(x => x.fecha >= P.cc.ini && x.fecha <= P.cc.fin).length : null;
  return como + `<section class="stack"><span class="eyebrow">${esc(p.nombre)}</span><h1>Entreno</h1>${P && !P.antes && !P.fuera ? `<div class="row" style="flex-wrap:wrap;gap:6px"><span class="pill blue">Ciclo ${P.ciclo}</span><span class="pill gold">Semana ${P.semCiclo} de ${P.cc.sem}</span><span class="pill">${Pn} ${p.dias_semana ? 'de ' + p.dias_semana * P.cc.sem + ' ' : ''}entrenos del ciclo</span></div>` : ''}</section>
  ${vZonasFC()}<section class="section"><div class="card">${p.dias.map(d => `<div class="wk ${norm(d.nombre) === hoyN ? 'today' : ''}"><span class="d">${esc(d.nombre.slice(0, 3))}</span><div class="grow"><h3>${esc(d.foco || d.nombre)}</h3><div class="small muted">${esc(d.volumen || '')} volumen · ${esc(d.intensidad || '')} intensidad</div></div>${hechoSemana(d.id) ? '<span class="pill ok">Hecho</span>' : ''}<button class="btn sm ${norm(d.nombre) === hoyN ? '' : 'ghost'}" data-act="abrirDia" data-id="${d.id}">Abrir</button></div>`).join('')}</div></section>
  ${vLineaTiempo(S.d.servicio, 'Tus ciclos de entrenamiento', false, p)}
  ${vCalendarioPres()}`;
}

function gruposDe(pauta) {
  const g = [];
  (pauta || []).forEach(t => { if (t.s || !g.length) g.push({ s: t.s || 1, tramos: [t] }); else g[g.length - 1].tramos.push(t); });
  return g;
}
const txtTramo = t => [t.r && `${t.r}${/^\d/.test(String(t.r)) && !/rep|lado|''|por/i.test(t.r) ? ' rep' : ''}`, t.rir != null && t.rir !== '' && `RIR ${t.rir}`, t.kg].filter(Boolean).join(' · ');

const SIN_PESO = /^(sin peso|no|-)?$/i;
function esSinPeso(e) {
  const ks = (e.pauta || []).map(t => t.kg).filter(Boolean);
  return (ks.length ? ks : [e.peso_ref]).every(k => SIN_PESO.test(String(k || '').trim()));
}
const kgDe = t => { const s = String(t?.kg || '').trim(); const m = s.match(/(\d+(?:[.,]\d+)?)\s*kg/i) || s.match(/^(\d+(?:[.,]\d+)?)$/); return m ? m[1] : ''; };

/* "A tu medida": solo ajustes de máquina y material (polea, silla, banco, agarre…); los consejos de ejecución van en el vídeo */
const AJUSTE_RE = /(polea|silla|asiento|banco|inclinaci|respaldo|agarre|material|barra|mancuerna|kettlebell|m[aá]quina|almohadilla|rodillo|cuerda|disco|prono|supino|neutro|\btabla\b|\bpin\b|smith|el[aá]stic|goma|caj[oó]n|flecha|tobillera|plataforma|soporte)/i;
function ajustesMaquina(txt) {
  // Se queda con los ajustes de máquina y material: "Silla: 3", "Polea: 16", "Rodilla: 1 respaldo: 8", "Agarre neutro", "Barra Z"…
  return String(txt || '').split(/\s*·\s*/).map(x => x.trim()).filter(x => x && !/^sin descanso/i.test(x)
    && (AJUSTE_RE.test(x) || /^[a-záéíóúñ ]{2,22}:\s*[\w\d]/i.test(x) || /^\d+\s*[ºª°]\s*(y\s*\d+\s*[ºª°]\s*)?(serie|miniserie)/i.test(x)));
}
/* Lo planificado aparece dentro de cada casilla; si el alumno no escribe nada, al marcar "Hecha" se guarda eso */
const repsPh = r => { const t = String(r ?? '').trim(); if (!t) return ''; if (/^m[aá]x/i.test(t) || /^rir/i.test(t)) return 'Máx'; const m = t.match(/^(\d+)\s*(?:[-–a]\s*(\d+))?/i); return m ? (m[2] ? `${m[1]}–${m[2]}` : m[1]) : ''; };
const valPh = el => el ? numero(String(el.placeholder || '').split('–')[0]) : null;
const MULTI = { 'Dropset': [2, 0], 'Rest-pause': [2, 20], 'Cluster': [3, 30], 'Myo reps': [3, 30], 'Unilateral doble': [2, 0], 'Unilateral contraste': [2, 0] };
const kgTxt = x => /^\d+([.,]\d+)?$/.test(x.trim()) ? x.trim() + ' kg' : x.trim();
function trocear(t, metodo, forzar) {
  const r = String(t.r || ''), pausaTxt = r.match(/\((\d+)\s*(?:''|´´|"|seg)[^)]*\)/i);
  const limpio = r.replace(/\([^)]*entre[^)]*\)/gi, '').trim();
  let partes = /\s\by\s\b/.test(limpio) && /\(RIR/i.test(limpio) ? limpio.split(/\s+y\s+/) : limpio.split(/\s*[+/]\s*/);
  partes = partes.map(x => x.replace(/^por lado:\s*/i, '').trim()).filter(Boolean);
  const rirs = String(t.rir ?? '').split(/\s*(?:\by\b|·|,|\/)\s*/).map(x => x.trim()).filter(x => x !== '');
  const kgs = String(t.kg || '').split(/\s*(?:→|\+|\s-\s)\s*/).map(x => x.trim()).filter(Boolean);
  const def = MULTI[metodo] || [1, 0];
  const n = Math.max(partes.length, rirs.length, kgs.filter(k => /\d/.test(k)).length > 1 ? kgs.length : 1, forzar ? def[0] : 1);
  if (n < 2) return [t];
  const pausa = pausaTxt ? +pausaTxt[1] : def[1];
  return [...Array(n)].map((_, k) => {
    const p = partes[Math.min(k, partes.length - 1)] || r, enP = p.match(/RIR\s*(\d)/i);
    const rp = /^R(IR)?\s*\d/i.test(p) ? (partes.find(x => !/^R(IR)?\s*\d/i.test(x)) || r) : p.replace(/\([^)]*\)/g, '').trim();
    const x = { r: rp, d: k === n - 1 ? (t.d ?? 60) : pausa };
    if (k === 0) x.s = t.s || 1;
    const rir = enP ? +enP[1] : rirs.length ? rirs[Math.min(k, rirs.length - 1)] : /^R(IR)?\s*(\d)/i.test(p) ? +p.match(/\d/)[0] : (k === 0 ? t.rir : undefined);
    if (rir !== undefined && rir !== '') x.rir = isNaN(+rir) ? rir : +rir;
    const kg = kgs.length > 1 ? kgs[Math.min(k, kgs.length - 1)] : (k && metodo === 'Dropset' ? '' : t.kg);
    if (kg) x.kg = kgTxt(kg); else if (kg === '') x.kg = ''; // bajada de peso sin indicar: la casilla muestra ↓
    return x;
  });
}
function pautaEfectiva(e) {
  const met = e.metodos?.nombre, g = gruposDe(e.pauta);
  // Topset en una sola línea ("4 / 8+8 / 8+8"): la 1ª serie pesada y el resto en mini-bloques
  if (met === 'Topset' && g.length === 1 && g[0].tramos.length === 1 && g[0].s > 1 && String(g[0].tramos[0].r).split('/').length === g[0].s) {
    const t = g[0].tramos[0], ps = String(t.r).split('/').map(x => x.trim());
    return ps.flatMap((p, k) => trocear({ ...t, s: 1, r: p }, 'Dropset', false));
  }
  return g.flatMap((gr, gi) => {
    if (gr.tramos.length > 1) return gr.tramos;
    const t = { ...gr.tramos[0], s: gr.s }, forzar = met === 'Topset' ? gi > 0 : !!MULTI[met];
    return trocear(t, met === 'Topset' ? (/''|´´|seg/.test(t.r || '') ? 'Rest-pause' : 'Dropset') : met, forzar);
  });
}
function vEjercicio(e, i, ro) {
  const grupos = gruposDe(pautaEfectiva(e)), sp = esSinPeso(e), ej = e.ejercicios || {}, plan = ro?.plan;
  const kg0 = kgDe(grupos[0]?.tramos[0]) || kgDe({ kg: e.peso_ref });
  let n = 0;
  const filas = grupos.map(g => {
    const tr = g.tramos, descanso = tr[tr.length - 1].d ?? e.descanso_seg ?? 60, T = tr.length, t0 = tr[0];
    return [...Array(g.s)].map(() => {
      n++; const r = `${e.id}-${n}`;
      if (ro && !plan) return filaCerrada(ro, r, n, T, sp);
      return tr.map((t, k) => {
        const ult = k === T - 1, id = `${r}-${k}`, kgP = t.kg === '' ? '↓' : kgDe(t) || kgDe(t0) || kg0, rpP = repsPh(t.r || t0.r), riP = t.rir ?? (ult ? t0.rir ?? e.rir ?? '' : '');
        const pausa = !ult && t.d ? (plan ? `<span class="small muted">${seg(t.d)}</span>` : `<button class="pausa" data-act="tramo" data-d="${t.d}" data-lbl="${esc(ej.nombre)} · pausa">${seg(t.d)}</button>`) : '<span></span>';
        const nc = `<span class="num muted nlab" data-row="${r}" ${k === 0 && !plan ? `id="row-${r}"` : ''}>${k === 0 ? n : t.lado ? '' : '↳'}${t.lado ? `<i>${t.lado}</i>` : ''}</span>`;
        if (plan) return nc + `<span class="cas">${sp ? '—' : esc(kgP || '—')}</span><span class="cas">${esc(rpP || '—')}</span><span class="cas">${esc(riP === '' || riP == null ? '—' : String(riP))}</span>` + (ult ? '<span></span>' : pausa);
        return nc
          + (sp ? `<span class="small muted" data-row="${r}" style="text-align:center">—</span>` : `<input id="kg-${id}" data-row="${r}" type="text" inputmode="decimal" placeholder="${esc(kgP)}" aria-label="Kg serie ${n}${T > 1 ? ' tramo ' + (k + 1) : ''}">`)
          + `<input id="rp-${id}" data-row="${r}" type="text" inputmode="numeric" placeholder="${esc(rpP)}" aria-label="Repeticiones serie ${n}${T > 1 ? ' tramo ' + (k + 1) : ''}">`
          + `<input id="ri-${id}" data-row="${r}" type="text" inputmode="numeric" placeholder="${esc(String(riP ?? ''))}" aria-label="RIR serie ${n}${T > 1 ? ' tramo ' + (k + 1) : ''}">`
          + (ult ? `<button class="chk" id="ck-${r}" data-act="serie" data-es="${e.id}" data-n="${n}" data-t="${T}" data-sp="${sp ? 1 : 0}" data-d="${descanso}" data-lbl="${esc(ej.nombre)} · serie ${n}" aria-label="Serie ${n} hecha">${CHK}</button>` : pausa);
      }).join('');
    }).join('');
  }).join('');
  const vid = ej.video_url ? `<a class="btn sm" href="${esc(ej.video_url)}" target="_blank" rel="noopener">▶ Vídeo</a>` : `<button class="btn sm ghost" data-act="sinVideo">▶ Vídeo</button>`;
  const om = ro ? (ro.ses?.omitidos || []).find(o => o.es === e.id) : (S.sesion?.omitidos || []).find(o => o.es === e.id);
  const desc = grupos.length ? grupos[grupos.length - 1].tramos.slice(-1)[0].d ?? e.descanso_seg : e.descanso_seg;
  const cadena = !ro && S.nav?.cadena?.[e.id];
  const sup = cadena && cadena.length > 1 ? (cadena[cadena.length - 1] === e.id ? 'Superserie · último' : 'Superserie') : '';
  const aj = ajustesMaquina(e.ajustes);
  const com = ((ro ? ro.ses?.comentarios : S.sesion?.comentarios) || []).find(c => c.es === e.id)?.texto;
  return `<div class="card ex ${om ? 'omitido' : ''}" id="ex-${e.id}">
    ${om ? bannerOmitido(om, !ro) : ''}
    ${ej.imagen_url || ej.musculo_img_url ? `<div class="imgs">${ej.imagen_url ? `<button class="img" data-act="verImagen" data-src="${esc(ej.imagen_url)}" aria-label="Ver imagen del ejercicio"><img src="${esc(ej.imagen_url)}" alt="${esc(ej.nombre)}" loading="lazy" onerror="this.parentNode.hidden=true"><span>Ejercicio</span></button>` : ''}${ej.musculo_img_url ? `<button class="img" data-act="verImagen" data-src="${esc(ej.musculo_img_url)}" aria-label="Ver músculo trabajado"><img src="${esc(ej.musculo_img_url)}" alt="Músculo trabajado" loading="lazy" onerror="this.parentNode.hidden=true"><span>Músculo</span></button>` : ''}</div>` : ''}
    <div class="row" style="align-items:flex-start"><span class="exn num">${i}</span><div class="grow"><h3>${esc(ej.nombre)}</h3>${!ej.musculo_img_url && ej.musculo ? `<div class="small muted">${esc(ej.musculo)}</div>` : ''}</div><div class="stack" style="gap:6px;align-items:flex-end">${vid}${ro ? '' : `<button class="btn sm ghost omitir-b" data-act="omitir" data-es="${e.id}" data-n="${esc(ej.nombre)}">No lo hago</button>`}</div></div>
    <div class="chips ex-chips"><span class="pill">${e.series} ${e.series === 1 ? 'serie' : 'series'}</span><span class="pill">${desc ? 'Descanso ' + seg(desc) : 'Sin descanso'}</span>${e.metodos ? `<button class="pill gold" data-act="metodo" data-n="${esc(e.metodos.nombre)}">${esc(e.metodos.nombre)} ⓘ</button>` : ''}${e.aproximacion_631 ? '<button class="pill gold" data-act="metodo" data-n="Aproximación 6·3·1">Aproximación 6·3·1 ⓘ</button>' : ''}</div>
    ${aj.length ? `<div class="small a-medida"><b>A tu medida:</b> ${aj.map(esc).join(' · ')}</div>` : ''}
    ${e.aproximacion_631 && !ro ? vAprox(e) : ''}
    ${ro && !plan ? resumenEjCerrado(ro, e) : ''}
    <div class="sets"><span class="h">Nº</span><span class="h">Kg</span><span class="h">Reps</span><span class="h">RIR</span><span class="h">${plan ? '' : 'Hecha'}</span>${filas}</div>
    ${plan ? '' : ro ? (com ? `<div class="ex-com small"><b>Comentario:</b> ${esc(com)}</div>` : '') : `<div class="ex-com-w" id="com-${e.id}">${com ? `<div class="ex-com small">${esc(com)} <button class="linkbtn small" data-act="comentarEj" data-es="${e.id}">Editar</button></div>` : `<button class="linkbtn small" data-act="comentarEj" data-es="${e.id}">＋ Comentario sobre este ejercicio</button>`}</div>`}
  </div>`;
}
/* Comentario opcional del alumno sobre un ejercicio */
function formComentarioEj(es) {
  const z = S.sesion; if (!z) return;
  const e = S.dia.bloques_sesion.flatMap(b => b.ejercicios_sesion).find(x => x.id === es), nombre = e?.ejercicios?.nombre || 'Ejercicio';
  const act = (z.comentarios || []).find(c => c.es === es)?.texto || '';
  abrirSheet(`<form class="stack" id="f-cej"><h2>Comentario</h2><p class="small"><b>${esc(nombre)}</b></p>
    <label class="f">¿Algo que quieras contarle a Jesús de este ejercicio?<textarea id="cej-t" rows="4" placeholder="Ej. la polea 16 se me queda corta, me molesta un poco el hombro…">${esc(act)}</textarea></label>
    <button class="btn full" type="submit">Guardar</button>${act ? '<button class="btn ghost full" type="button" id="cej-del">Borrar comentario</button>' : ''}</form>`);
  const guardar = async texto => {
    const antes = z.comentarios || [];
    z.comentarios = antes.filter(c => c.es !== es).concat(texto ? [{ es, nombre, texto }] : []);
    try {
      const id = await asegurarSesion();
      const { error } = await sb.from('sesiones_hechas').update({ comentarios: z.comentarios }).eq('id', id); if (error) throw error;
      const ses = S.d.sesiones.find(x => x.id === id); if (ses) ses.comentarios = z.comentarios;
      cerrarSheet(); toast(texto ? 'Comentario guardado' : 'Comentario borrado');
      const w = document.getElementById('com-' + es);
      if (w) w.innerHTML = texto ? `<div class="ex-com small">${esc(texto)} <button class="linkbtn small" data-act="comentarEj" data-es="${es}">Editar</button></div>` : `<button class="linkbtn small" data-act="comentarEj" data-es="${es}">＋ Comentario sobre este ejercicio</button>`;
    } catch (err) { z.comentarios = antes; fallo(err, /comentarios/.test(err.message || '') ? 'Falta ejecutar el Bloque 19 en Supabase.' : 'No se ha podido guardar el comentario.'); }
  };
  $('#f-cej').addEventListener('submit', ev => { ev.preventDefault(); guardar($('#cej-t').value.trim()); });
  $('#cej-del')?.addEventListener('click', () => guardar(''));
}
/* Ejercicio no realizado, con su motivo */
const MOTIVOS = ['Falta de tiempo', 'Dolor o molestia', 'Máquina ocupada', 'Cansancio', 'Lo cambié por otro'];
const bannerOmitido = (o, editable) => `<div class="omit-b"><b class="small">No realizado</b><div class="small">${esc(o.motivo)}</div>${editable ? `<button class="linkbtn small" data-act="deshacerOmitir" data-es="${o.es}">Deshacer</button>` : ''}</div>`;
function formOmitir(es, nombre) {
  abrirSheet(`<form class="stack" id="f-om"><h2>No hago este ejercicio</h2><p class="small"><b>${esc(nombre)}</b></p>
    <div class="chips">${MOTIVOS.map(m => `<button type="button" data-mot="${esc(m)}" aria-pressed="false">${esc(m)}</button>`).join('')}</div>
    <label class="f">Cuéntale a Jesús el motivo<textarea id="om-t" rows="3" placeholder="Ej. me molesta el hombro derecho y prefiero ser precavida"></textarea></label>
    <button class="btn full" type="submit">Guardar</button><button class="btn ghost full" type="button" data-act="cerrarSheet">Cancelar</button></form>`);
  const f = $('#f-om');
  f.addEventListener('click', ev => { const c = ev.target.closest('[data-mot]'); if (!c) return; f.querySelectorAll('[data-mot]').forEach(x => x.setAttribute('aria-pressed', x === c)); });
  f.addEventListener('submit', async ev => {
    ev.preventDefault();
    const chip = f.querySelector('[data-mot][aria-pressed="true"]')?.dataset.mot, txt = $('#om-t').value.trim();
    if (!chip && !txt) return toast('Indica el motivo');
    const motivo = [chip, txt].filter(Boolean).join(': ');
    const z = S.sesion; z.omitidos = (z.omitidos || []).filter(o => o.es !== es).concat({ es, nombre, motivo });
    if (await guardarOmitidos()) { cerrarSheet(); marcarOmitido(es); toast('Anotado: no realizado'); }
  });
}
async function guardarOmitidos() {
  try {
    const id = await asegurarSesion();
    const { error } = await sb.from('sesiones_hechas').update({ omitidos: S.sesion.omitidos }).eq('id', id);
    if (error) throw error;
    const ses = S.d.sesiones.find(x => x.id === id); if (ses) ses.omitidos = S.sesion.omitidos;
    return true;
  } catch (err) { fallo(err, /omitidos/.test(err.message || '') ? 'Falta ejecutar el Bloque 10 en Supabase.' : undefined); return false; }
}
function marcarOmitido(es) {
  const card = document.getElementById('ex-' + es); if (!card) return;
  const o = (S.sesion.omitidos || []).find(x => x.es === es);
  card.querySelector('.omit-b')?.remove(); card.classList.toggle('omitido', !!o);
  if (o) card.insertAdjacentHTML('afterbegin', bannerOmitido(o, true));
}
async function deshacerOmitir(es) {
  S.sesion.omitidos = (S.sesion.omitidos || []).filter(o => o.es !== es);
  if (await guardarOmitidos()) { marcarOmitido(es); toast('Ejercicio recuperado'); }
}

/* Orden de la sesión y cadenas de superseries (ejercicios unidos por descanso 0) */
/* Superseries: un ejercicio se encadena con el anterior si este no tenía descanso o su nota dice "juntos/superserie";
   una nota de superserie nueva abre su propio grupo. Devuelve los grupos de ejercicios de un bloque. */
function cadenasDe(L) {
  const junta = g => /juntos|super\s*(serie|set)|circuito/i.test(g || ''), out = [];
  L.forEach((e, i) => {
    const p = L[i - 1];
    const enlaza = p && ((p.descanso_seg ?? 60) === 0 || junta(p.grupo)) && !(junta(e.grupo) && e.grupo !== p.grupo);
    if (enlaza) out[out.length - 1].push(e); else out.push([e]);
  });
  return out;
}
function prepararNavegacion(d) {
  const orden = [], cadena = {}, series = {};
  d.bloques_sesion.filter(b => b.tipo === 'fuerza').forEach(b => cadenasDe(b.ejercicios_sesion).forEach(g => {
    const ids = g.map(e => e.id);
    g.forEach(e => { cadena[e.id] = ids; orden.push(e.id); series[e.id] = e.series; });
  }));
  S.nav = { orden, cadena, series };
}
function siguienteFila(es, n) {
  const { orden, cadena, series } = S.nav, c = cadena[es], i = c.indexOf(es);
  if (c.length > 1) {
    for (let j = i + 1; j < c.length; j++) if (series[c[j]] >= n) return [c[j], n];
    for (let j = 0; j < c.length; j++) if (series[c[j]] >= n + 1) return [c[j], n + 1];
  } else if (series[es] >= n + 1) return [es, n + 1];
  const ultimo = c[c.length - 1], k = orden.indexOf(ultimo);
  return orden[k + 1] ? [orden[k + 1], 1] : null;
}
function enfocarFila(es, n) {
  const el = document.getElementById(`row-${es}-${n}`); if (!el) return;
  setTimeout(() => {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.querySelectorAll(`[data-row="${es}-${n}"]`).forEach(x => { x.classList.add('foco'); setTimeout(() => x.classList.remove('foco'), 2200); });
  }, 250);
}
/* Peso de referencia de la 6·3·1: el objetivo de la 1.ª serie (si no hay, el peso del ejercicio) */
const kgRef = e => { const n = parseFloat(String(kgDe(gruposDe(pautaEfectiva(e))[0]?.tramos[0]) || kgDe({ kg: e.peso_ref })).replace(',', '.')); return n > 0 ? n : null; };
function vAprox(e) {
  const ref = kgRef(e);
  const filas = [[6, 0.7, 'Peso ligero'], [3, 1, 'Peso objetivo'], [1, 1.1, 'Por encima del objetivo']];
  return `<div class="aprox"><span class="eyebrow">Aproximación 6·3·1 · antes de empezar</span>
    <div class="small">Al terminar la repetición única, descansa 1 minuto y empieza tus series.</div>
    ${filas.map(([n, f, t], j) => `<div class="ap-row"><span class="ap-n num">${n}</span><span class="small">${n === 1 ? '1 repetición' : n + ' repeticiones'}<br><span class="muted">${t}</span></span><b class="ap-kg num">${ref ? Math.round(ref * f) + ' kg' : 'como 1.ª serie'}</b><button class="chk" data-act="aprox" data-j="${j}" aria-label="Hecha">${CHK}</button></div>`).join('')}
  </div>`;
}
/* El coach entra en el entreno de un alumno (en directo o para corregir una sesión) */
async function entrarComo(alumnoId) {
  const a = S.c.perfiles.find(p => p.id === alumnoId) || { id: alumnoId, nombre: 'Alumno' };
  S.propio = { d: S.d, dia: S.dia, sesion: S.sesion, tab: S.tab };
  S.obj = { id: a.id, nombre: a.nombre, ficha: S.ficha };
  stopTimer(); S.dia = null; S.sesion = null;
  await cargarAlumno(a.id);
}
async function salirComo() {
  if (!S.obj) return;
  const ficha = S.obj.ficha; stopTimer();
  Object.assign(S, { d: S.propio.d, dia: S.propio.dia, sesion: S.propio.sesion, tab: S.propio.tab, obj: null, propio: null, verSes: null });
  await cargarCoach(); await abrirFicha(ficha.id);
}
async function editarSesionCerrada() {
  const v = S.verSes; await entrarComo(S.ficha.id);
  await abrirDia(v.dia.id, { dia: v.dia, fecha: v.ses.fecha, sesionId: v.ses.id, editar: true });
}
async function entrenarAhora(alumnoId, op = {}) {
  await entrarComo(alumnoId);
  Object.assign(S.obj, { fecha: op.fecha || hoyISO(), presencial: !!op.presencial, presProg: op.presProg || null });
  if (!S.d.programa) { toast('Este alumno aún no tiene programa'); return salirComo(); }
  render(); window.scrollTo(0, 0);
}
const ordenarDia = d => { d.bloques_sesion.sort((a, b) => a.letra.localeCompare(b.letra)); d.bloques_sesion.forEach(b => b.ejercicios_sesion.sort((a, b) => a.orden - b.orden)); };
/* Vista del coach: sesión ya cerrada, tal como la vio el alumno pero sin poder tocar nada */
function filaCerrada(ro, r, n, T, sp) {
  const v = k => ro.valores[`${r}-${k}`], a = k => ro.ant[`${r}-${k}`];
  const hecha = [...Array(T)].some((_, k) => v(k));
  const kg = x => x?.kg == null ? '—' : fmtNum(x.kg, 2), rp = x => x?.repeticiones ?? '—';
  let html = '';
  for (let k = 0; k < T; k++) {
    const ult = k === T - 1, cls = v(k) ? 'on' : 'vacio';
    html += `<span class="num muted">${k === 0 ? n : '↳'}</span>`
      + (sp ? `<span class="small muted" style="text-align:center">Sin peso</span>` : `<span class="ro num ${cls}">${kg(v(k))}</span>`)
      + `<span class="ro num ${cls}">${rp(v(k))}</span>`
      + `<span class="ro num ${cls}">${v(k)?.rir ?? (ult ? '—' : '')}</span>` + (ult ? `<span class="chk ${hecha ? 'on' : ''}" aria-label="${hecha ? 'Hecha' : 'No registrada'}">${CHK}</span>` : '<span></span>');
    if (a(k)) html += `<span></span><span class="ant num">Anterior: ${sp ? '' : kg(a(k)) + ' kg × '}${rp(a(k))} rep${a(k).rir != null ? ' · RIR ' + a(k).rir : ''}</span><span></span>`;
  }
  return html;
}
function resumenEjCerrado(ro, e) {
  const vol = m => Object.entries(m).filter(([k]) => k.startsWith(e.id + '-')).reduce((t, [, x]) => t + (+x.kg || 0) * (+x.repeticiones || 0), 0);
  const nS = m => new Set(Object.keys(m).filter(k => k.startsWith(e.id + '-')).map(k => k.split('-')[1])).size;
  const hoy = nS(ro.valores), ant = nS(ro.ant), vh = vol(ro.valores), va = vol(ro.ant);
  if (!hoy && !ant) return '';
  const dif = va ? Math.round((vh - va) / va * 100) : null;
  return `<div class="small">${hoy} de ${e.series} series hechas${vh ? ` · volumen ${fmtNum(vh, 0)} kg` : ''}${dif != null && hoy ? ` <b style="color:var(--${dif >= 0 ? 'ok' : 'bad'})">(${dif >= 0 ? '+' : ''}${dif} % vs anterior)</b>` : ''}</div>`;
}
const CANS = ['', 'Muy fresc@', 'Fresc@', 'Normal', 'Cansad@', 'Agotad@'], POD = ['', 'Sin fuerza', 'Flojo', 'Normal', 'Poderos@', 'Imparable'];
function vValoracionSesion(s) {
  if (!s.cansancio && !s.poderio && !s.nota && !s.nota_revision) return '';
  return `<div class="card stack"><span class="eyebrow">Cómo se sintió</span>
    ${s.cansancio || s.poderio ? `<div class="kpis" style="grid-template-columns:1fr 1fr"><div class="kpi"><div class="l">Cansancio</div><b>${s.cansancio ? s.cansancio + '/5 · ' + CANS[s.cansancio] : '—'}</b></div><div class="kpi"><div class="l">Poderío</div><b>${s.poderio ? s.poderio + '/5 · ' + POD[s.poderio] : '—'}</b></div></div>` : ''}
    ${s.nota ? `<div class="small"><span class="muted">Comentario de la sesión:</span> "${esc(s.nota)}"</div>` : ''}
    ${s.nota_revision ? `<div class="small rev"><span class="muted">Para la revisión:</span> "${esc(s.nota_revision)}"</div>` : ''}</div>`;
}
function vSesionCerrada() {
  const v = S.verSes, d = v.dia, cont = { n: 0 }, a = S.c.perfiles.find(p => p.id === S.ficha.id) || {};
  const total = d.bloques_sesion.filter(b => b.tipo === 'fuerza').flatMap(b => b.ejercicios_sesion).reduce((t, e) => t + (+e.series || 0), 0);
  const hechas = new Set(Object.keys(v.valores).map(k => k.split('-').slice(0, 2).join('-'))).size;
  return `<div class="cerrada"><span class="pill ok">Sesión cerrada</span><span class="small grow">${esc(fLarga(v.ses.fecha))}${v.ses.duracion_min ? ` · ${v.ses.duracion_min} min` : ''} · ${hechas} de ${total} series</span><button class="btn sm" data-act="editarSesion">✎ Editar</button></div>
  <section class="stack" style="margin-top:12px"><button class="btn sm ghost" data-act="cerrarVerSesion" style="align-self:flex-start">← Ficha de ${esc((a.nombre || '').split(' ')[0])}</button>
    <span class="eyebrow">${esc(a.nombre || '')} · ${esc(d.nombre)}</span><h1>${esc(d.foco || d.nombre)}</h1>
    ${(() => { const x = numEntreno(S.ficha.todas, S.ficha.srv, v.ses.fecha, v.ses.id, S.ficha.prog?.dias_semana); return x && !x.fuera ? `<div class="row" style="flex-wrap:wrap;gap:6px"><span class="pill blue">Ciclo ${x.ciclo}</span><span class="pill gold">Semana ${x.semCiclo} de ${x.cc.sem}</span><span class="pill">Entreno ${x.n}${x.previstos ? ' de ' + x.previstos : ''} del ciclo</span></div>` : ''; })()}
    ${vValoracionSesion(v.ses)}
    <div class="card stack"><span class="eyebrow">Objetivo del día</span><div class="small">${esc(d.objetivo || '')}</div>
    <div class="kpis"><div class="kpi"><div class="l">Volumen</div><b>${esc(d.volumen || '—')}</b></div><div class="kpi"><div class="l">Intensidad</div><b>${esc(d.intensidad || '—')}</b></div><div class="kpi"><div class="l">Foco</div><b>${esc(d.foco || '—')}</b></div></div></div>
    ${v.antFecha ? `<p class="note">Debajo de cada serie ves lo que hizo la vez anterior (${esc(fCorta(v.antFecha))}).</p>` : ''}</section>
  <section class="section">${vBloquesDia(d, cont, v)}
  ${v.huerfanas.length ? `<div class="card stack"><span class="eyebrow">Ejercicios que ya no están en el programa</span>${v.huerfanas.map(r => `<div class="small num">Serie ${r.serie}: ${r.kg == null ? '—' : fmtNum(r.kg, 2) + ' kg'} × ${r.repeticiones ?? '—'} · RIR ${r.rir ?? '—'}</div>`).join('')}</div>` : ''}
  <button class="btn full ghost" data-act="cerrarVerSesion">Volver a la ficha</button></section>`;
}
/* Imagen ilustrativa de cardio y movilidad: la de la hoja o, si no hay, un dibujo propio */
const ILU = {
  cardio: `<svg viewBox="0 0 320 150" role="img" aria-label="Cardio"><rect width="320" height="150" fill="#EEF4FF"/><path d="M40 118h210l30-38" stroke="#0B0B0C" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M60 118l-8 18M240 118l8 18" stroke="#0B0B0C" stroke-width="6" stroke-linecap="round"/><circle cx="160" cy="28" r="13" fill="#0066FF"/><path d="M158 44l-6 36 22 34M152 80l-24 34M156 52l26 16 22-8M156 52l-22 18" stroke="#0066FF" stroke-width="9" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M230 40c10-12 30-12 34 4 4 16-20 30-34 40-14-10-38-24-34-40 4-16 24-16 34-4z" fill="#D4AF37"/><path d="M212 54h12l5-8 6 16 5-8h12" stroke="#fff" stroke-width="3" fill="none" stroke-linejoin="round"/></svg>`,
  movilidad: `<svg viewBox="0 0 320 150" role="img" aria-label="Movilidad"><rect width="320" height="150" fill="#EEF4FF"/><rect x="40" y="122" width="240" height="10" rx="5" fill="#D4AF37"/><circle cx="104" cy="58" r="13" fill="#0066FF"/><path d="M116 70l52 26 48 26M168 96l-10 26M140 82l-14 40M118 74l-28 24" stroke="#0066FF" stroke-width="9" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M214 40a40 40 0 0 1 40 40" stroke="#0B0B0C" stroke-width="4" fill="none" stroke-dasharray="6 7" stroke-linecap="round"/><path d="M250 70l4 12 10-8" stroke="#0B0B0C" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`
};
function imgBloque(b) {
  const ilu = (ILU[b.tipo] || '').replace('<svg', '<svg class="ilu"');
  if (!b.imagen_url) return ilu;
  return `<div class="bimg"><button class="img" data-act="verImagen" data-src="${esc(b.imagen_url)}" aria-label="Ver imagen"><img src="${esc(b.imagen_url)}" alt="${esc(b.nombre)}" loading="lazy" onerror="this.closest('.bimg').classList.add('roto')"></button>${ilu}</div>`;
}
/* Bloques del día; en día de partido se separan "Antes del partido" y "Después del partido" */
const MOMENTOS = { pre: ['🏟️ Antes del partido', 'Activación: hazlo antes de salir al campo'], post: ['🏁 Después del partido', 'Recuperación: al terminar el partido'] };
function vBloquesDia(d, cont, ro) {
  let act = null;
  return d.bloques_sesion.map(b => {
    const m = MOMENTOS[b.momento] ? b.momento : null, cab = m && m !== act ? `<div class="momento ${m}"><b>${MOMENTOS[m][0]}</b><span class="small">${MOMENTOS[m][1]}</span></div>` : '';
    act = m || act; return cab + vBloque(b, cont, ro);
  }).join('');
}
function vBloque(b, cont, ro) {
  if (b.tipo !== 'fuerza') {
    return `<div class="card stack"><div class="row"><span class="pill gold">${esc(b.letra)}</span><h3 class="grow">${esc(b.nombre)}</h3></div>
      ${imgBloque(b)}
      ${b.tipo === 'cardio' ? `<div class="kpis" style="grid-template-columns:1fr 1fr"><div class="kpi"><div class="l">Duración</div><b>${esc(b.duracion || '—')}</b></div><div class="kpi"><div class="l">Frecuencia cardiaca</div><b style="color:var(--bad)">${esc(b.fc_objetivo || '—')}</b></div></div><div class="small muted">${esc([b.maquina, b.objetivo].filter(Boolean).join(' · '))}</div>` : ''}
      ${b.detalle ? `<p class="note">${esc(b.detalle)}</p>` : ''}
      ${b.video_url ? `<a class="btn sm ghost" style="align-self:flex-start" href="${esc(b.video_url)}" target="_blank" rel="noopener">Ver vídeo</a>` : ''}</div>`;
  }
  const grupos = cadenasDe(b.ejercicios_sesion);
  return `<div class="stack"><div class="row"><span class="pill gold">${esc(b.letra)}</span><h3 class="grow">${esc(b.nombre)}</h3></div>${grupos.length === b.ejercicios_sesion.length && b.agrupacion ? `<p class="note">${esc(b.agrupacion)}</p>` : ''}${grupos.map(g => {
    if (g.length === 1) return vEjercicio(g[0], ++cont.n, ro);
    const ult = g[g.length - 1], d = ult.descanso_seg ?? 60, n0 = cont.n + 1;
    const cards = g.map((e, k) => vEjercicio(e, ++cont.n, ro) + (k < g.length - 1 ? '<div class="ss-sig">↓ Sin descanso, sigue con el siguiente</div>' : '')).join('');
    return `<div class="superserie"><div class="ss-cab"><b>Superserie · ejercicios ${n0} a ${cont.n}</b><span class="small">Hazlos seguidos, sin descanso entre ellos. Al terminar el último, descansa ${d ? seg(d) : 'lo justo'} y repite la secuencia.</span></div>${cards}</div>`;
  }).join('')}</div>`;
}
function cicloSesion() {
  const x = numEntreno(S.d.sesiones, S.d.servicio, S.sesion?.fecha || hoyISO(), S.sesion?.id, S.d.programa?.dias_semana);
  return x && !x.fuera ? `<div class="row" style="flex-wrap:wrap;gap:6px"><span class="pill blue">Ciclo ${x.ciclo}</span><span class="pill gold">Semana ${x.semCiclo} de ${x.cc.sem}</span><span class="pill">Entreno ${x.n}${x.previstos ? ' de ' + x.previstos : ''} del ciclo</span></div>` : '';
}
function vSesion() {
  const d = S.dia, cont = { n: 0 };
  prepararNavegacion(d);
  const ini = S.sesion?.inicio;
  const como = S.obj ? `<div class="cerrada" style="margin-bottom:10px"><span class="pill gold">${S.sesion?.editar ? 'Editando' : 'Entrenando a'}</span><span class="small grow">${esc(S.obj.nombre)}${S.sesion?.editar ? ' · sesión del ' + esc(fCorta(S.sesion.fecha)) : ''}</span><button class="btn sm ghost" data-act="${S.sesion?.editar ? 'terminar' : 'salirComo'}" style="background:#fff">${S.sesion?.editar ? 'Listo' : 'Salir'}</button></div>` : '';
  if (S.sesion?.editar) return como + `<section class="stack"><span class="eyebrow">${esc(S.dia.nombre)}</span><h1>${esc(S.dia.foco || S.dia.nombre)}</h1>${cicloSesion()}
    <p class="note">Corrige kg, repeticiones o RIR: los cambios de una serie ya marcada se guardan solos al salir de la casilla. Para añadir una serie que no apuntó, rellénala y marca el check. Para borrarla, quita el check.</p></section>
  <section class="section">${vBloquesDia(d, cont)}
  <button class="btn full dark" data-act="terminar">Listo, ver sesión</button></section>`;
  return como + `<div class="crono" id="crono">${ini ? `<span class="crono-t num" id="crono-t">${fmtCrono(Date.now() - ini)}</span><span class="small">Entrenamiento en curso</span>` : `<button class="btn sm" data-act="empezarCrono">⏱ Empezar entrenamiento</button><span class="small muted">El cronómetro mide tu sesión completa</span>`}</div>
  <section class="stack"><button class="btn sm ghost" data-act="cerrarDia" style="align-self:flex-start">← Semana</button>
    <span class="eyebrow">${esc(S.d.programa?.nombre || '')} · ${esc(d.nombre)}</span><h1>${esc(d.foco || d.nombre)}</h1>
    ${cicloSesion()}
    <div class="card stack"><span class="eyebrow">Objetivo de hoy</span><div class="small">${esc(d.objetivo || '')}</div>
    <div class="kpis"><div class="kpi"><div class="l">Volumen</div><b>${esc(d.volumen || '—')}</b></div><div class="kpi"><div class="l">Intensidad</div><b>${esc(d.intensidad || '—')}</b></div><div class="kpi"><div class="l">Foco</div><b>${esc(d.foco || '—')}</b></div></div></div></section>
  <section class="section">${vBloquesDia(d, cont)}
  <button class="btn full dark" data-act="terminar">Terminar sesión</button></section>`;
}

/* Cronómetro de la sesión completa (sobrevive a cerrar la app) */
const uidSes = () => S.obj?.id || S.user.id;
const claveCrono = () => `lof-ini-${uidSes()}-${S.dia.id}-${S.sesion?.fecha || hoyISO()}`;
const fmtCrono = ms => { const t = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60; return (h ? h + ':' : '') + String(m).padStart(h ? 2 : 1, '0') + ':' + String(s).padStart(2, '0'); };
function empezarCrono() {
  if (S.sesion.inicio) return;
  S.sesion.inicio = Date.now();
  try { localStorage.setItem(claveCrono(), String(S.sesion.inicio)); } catch (e) { }
  audio(); pintarCrono();
}
function pintarCrono() {
  const el = $('#crono'); if (!el || !S.sesion?.inicio) return;
  el.innerHTML = `<span class="crono-t num" id="crono-t">${fmtCrono(Date.now() - S.sesion.inicio)}</span><span class="small">Entrenamiento en curso</span>`;
}
setInterval(() => { const t = $('#crono-t'); if (t && S.sesion?.inicio) t.textContent = fmtCrono(Date.now() - S.sesion.inicio); }, 1000);

async function abrirDia(id, op = {}) {
  S.dia = op.dia || S.d.programa.dias.find(d => d.id === id);
  const fechaS = op.fecha || S.obj?.fecha || hoyISO(), editar = !!op.editar;
  S.sesion = { id: null, regs: {}, valores: {}, ultimos: {}, inicio: null, fecha: fechaS, editar };
  if (!editar) try { const v = +localStorage.getItem(claveCrono()); if (v) S.sesion.inicio = v; } catch (e) { }
  S.tab = 'entreno'; window.scrollTo(0, 0);
  const ids = S.dia.bloques_sesion.flatMap(b => b.ejercicios_sesion.map(e => e.id));
  const hoyS = op.sesionId ? (S.d.sesiones.find(s => s.id === op.sesionId) || { id: op.sesionId, fecha: fechaS, dia_id: id }) : S.d.sesiones.find(s => s.fecha === fechaS && s.dia_id === id);
  const fechaDe = sid => (S.d.sesiones.find(s => s.id === sid) || {}).fecha;
  if (hoyS) { S.sesion.omitidos = hoyS.omitidos || []; S.sesion.comentarios = hoyS.comentarios || [];
    S.sesion.id = hoyS.id; if (!S.sesion.inicio && hoyS.inicio_at) S.sesion.inicio = new Date(hoyS.inicio_at).getTime(); }
  if (ids.length) {
    const { data } = await conRespaldo(() => sb.from('registros_series').select('id,sesion_id,ejercicio_sesion_id,serie,tramo,kg,repeticiones,rir,creado_at').eq('alumno_id', uidSes()).in('ejercicio_sesion_id', ids).order('creado_at', { ascending: false }).limit(1500),
      () => sb.from('registros_series').select('id,sesion_id,ejercicio_sesion_id,serie,kg,repeticiones,rir,creado_at').eq('alumno_id', uidSes()).in('ejercicio_sesion_id', ids).order('creado_at', { ascending: false }).limit(1500));
    (data || []).forEach(r => {
      const fila = `${r.ejercicio_sesion_id}-${r.serie}`, k = `${fila}-${(r.tramo || 1) - 1}`;
      if (hoyS && r.sesion_id === hoyS.id) { (S.sesion.regs[fila] ||= []).push(r.id); S.sesion.valores[k] = r; }
      else if (!S.sesion.ultimos[k] && !(editar && (fechaDe(r.sesion_id) || '9') >= fechaS)) S.sesion.ultimos[k] = r;
    });
  }
  render();
}
function rellenarSesion() {
  const z = S.sesion; if (!z) return;
  document.querySelectorAll('.chk[data-act="serie"]').forEach(b => {
    const fila = `${b.dataset.es}-${b.dataset.n}`, T = +b.dataset.t;
    for (let k = 0; k < T; k++) {
      const v = z.valores[`${fila}-${k}`], u = z.ultimos[`${fila}-${k}`];
      const kg = document.getElementById(`kg-${fila}-${k}`), rp = document.getElementById(`rp-${fila}-${k}`);
      if (u) { if (kg && u.kg != null && !kg.placeholder) kg.placeholder = fmtNum(u.kg, 2); if (u.repeticiones != null && !rp.placeholder) rp.placeholder = u.repeticiones; }
      if (v) { if (kg && v.kg != null) kg.value = fmtNum(v.kg, 2); if (v.repeticiones != null) rp.value = v.repeticiones; }
      const ri = document.getElementById(`ri-${fila}-${k}`);
      if (ri) { if (u?.rir != null && !ri.placeholder) ri.placeholder = u.rir; if (v?.rir != null) ri.value = v.rir; }
    }
    if (z.regs[fila]) marcar(b, fila, true);
  });
}
function marcar(b, fila, on) {
  b.classList.toggle('on', on);
  document.querySelectorAll(`input[data-row="${fila}"]`).forEach(x => x.classList.toggle('on', on));
}
async function asegurarSesion() {
  if (S.sesion.id) return S.sesion.id;
  const fila = { alumno_id: uidSes(), dia_id: S.dia.id, fecha: S.sesion.fecha || hoyISO() };
  if (S.sesion.inicio) fila.inicio_at = new Date(S.sesion.inicio).toISOString();
  const { data, error } = await conRespaldo(() => sb.from('sesiones_hechas').insert(fila).select().single(),
    () => { delete fila.inicio_at; return sb.from('sesiones_hechas').insert(fila).select().single(); });
  if (error) throw error;
  S.sesion.id = data.id; S.d.sesiones.push(data); return data.id;
}
async function toggleSerie(b) {
  const es = +b.dataset.es, n = +b.dataset.n, T = +b.dataset.t, fila = `${es}-${n}`, z = S.sesion;
  if (b.classList.contains('on')) {
    const ids = z.regs[fila] || []; marcar(b, fila, false); delete z.regs[fila];
    if (ids.length) { const { error } = await sb.from('registros_series').delete().in('id', ids); if (error) fallo(error); }
    return;
  }
  if (!z.inicio && !z.editar) empezarCrono();
  const rows = [...Array(T)].map((_, k) => {
    const u = z.ultimos[`${fila}-${k}`] || {}, kg = document.getElementById(`kg-${fila}-${k}`), rp = document.getElementById(`rp-${fila}-${k}`);
    return { alumno_id: uidSes(), ejercicio_sesion_id: es, serie: n, tramo: k + 1,
      kg: kg ? (numero(kg.value) ?? valPh(kg) ?? u.kg ?? null) : null, repeticiones: numero(rp.value) ?? valPh(rp) ?? u.repeticiones ?? null,
      rir: (() => { const ri = document.getElementById(`ri-${fila}-${k}`); return ri ? numero(ri.value) ?? valPh(ri) ?? u.rir ?? null : null; })() };
  });
  marcar(b, fila, true);
  const d = z.editar ? 0 : +b.dataset.d;
  if (z.editar) { } else if (d > 0) startTimer(d, 'Descanso · ' + b.dataset.lbl); else toast('Sin descanso: sigue con el siguiente');
  const sig = siguienteFila(es, n); if (sig) enfocarFila(sig[0], sig[1]);
  try {
    const sid = await asegurarSesion(); rows.forEach(r => r.sesion_id = sid);
    const { data, error } = await conRespaldo(() => sb.from('registros_series').insert(rows).select('id'),
      () => sb.from('registros_series').insert(rows.map(({ tramo, ...x }) => x)).select('id'));
    if (error) throw error;
    z.regs[fila] = data.map(x => x.id);
    rows.forEach((r, k) => {
      r.id = data[k]?.id; z.valores[`${fila}-${k}`] = r;
      const kg = document.getElementById(`kg-${fila}-${k}`), rp = document.getElementById(`rp-${fila}-${k}`);
      if (kg && r.kg != null && !kg.value) kg.value = fmtNum(r.kg, 2);
      if (r.repeticiones != null && !rp.value) rp.value = r.repeticiones;
    });
  } catch (err) { marcar(b, fila, false); fallo(err, 'No se ha guardado la serie. Revisa tu conexión.'); }
}
function terminar() {
  if (S.obj && S.sesion?.editar) return guardarSesion();
  const min = S.sesion?.inicio ? Math.max(1, Math.round((Date.now() - S.sesion.inicio) / 60000)) : null;
  const escala = (id, txt, ext) => `<div class="stack" style="gap:6px"><span class="small"><b>${txt}</b></span><div class="escala" role="group" id="${id}">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-act="escala" data-g="${id}" data-v="${n}" aria-pressed="false">${n}</button>`).join('')}</div><div class="row small muted"><span class="grow">${ext[0]}</span><span>${ext[1]}</span></div></div>`;
  const el = S.obj ? 'se ha sentido' : 'te has sentido';
  abrirSheet(`<div class="stack"><h2>Sesión terminada</h2>${min ? `<p class="small">${S.obj ? 'Ha' : 'Has'} entrenado <b>${min} minutos</b>.</p>` : ''}
    ${escala('s-cans', `Valora de 1 a 5 ${S.obj ? 'su' : 'tu'} nivel de cansancio`, ['1 · Muy fresc@', '5 · Agotad@'])}
    ${escala('s-pod', `Valora de 1 a 5 cómo de poderos@ ${el}`, ['1 · Sin fuerza', '5 · Imparable'])}
    <label class="f">Comentarios de la sesión (opcional)<textarea id="s-nota" placeholder="Molestias, sensaciones, máquinas ocupadas…"></textarea></label>
    <label class="f">Para la revisión semanal o mensual (opcional)<textarea id="s-rev" placeholder="Algo que quieras que revisemos juntos: progreso, dudas, ajustes…"></textarea></label>
    <button class="btn full" data-act="guardarSesion">Guardar y salir</button></div>`);
}
async function guardarSesion() {
  try {
    if (S.obj && S.sesion?.editar) { const sid = S.sesion.id; cerrarSheet(); stopTimer(); await salirComo(); toast('Cambios guardados'); if (sid) await verSesion(sid); return; }
    const id = await asegurarSesion(), nota = $('#s-nota').value.trim(), rev = $('#s-rev')?.value.trim(), cambios = {};
    if (nota) cambios.nota = nota;
    const val = g => { const b = document.querySelector(`#${g} [aria-pressed="true"]`); return b ? +b.dataset.v : null; };
    const extra = {}; if (val('s-cans')) extra.cansancio = val('s-cans'); if (val('s-pod')) extra.poderio = val('s-pod'); if (rev) extra.nota_revision = rev;
    if (S.sesion.inicio) { cambios.duracion_min = Math.max(1, Math.round((Date.now() - S.sesion.inicio) / 60000)); cambios.inicio_at = new Date(S.sesion.inicio).toISOString(); }
    if (Object.keys(extra).length) {
      const r = await sb.from('sesiones_hechas').update(extra).eq('id', id);
      if (r.error) { console.warn(r.error.message); if (extra.nota_revision) cambios.nota = [nota, 'Para la revisión: ' + extra.nota_revision].filter(Boolean).join('\n'); }
      else Object.assign(S.d.sesiones.find(s => s.id === id) || {}, extra);
    }
    if (Object.keys(cambios).length) { const { error } = await conRespaldo(() => sb.from('sesiones_hechas').update(cambios).eq('id', id), () => sb.from('sesiones_hechas').update({ nota: cambios.nota ?? null }).eq('id', id)); if (error) throw error; Object.assign(S.d.sesiones.find(s => s.id === id) || {}, cambios); }
    try { localStorage.removeItem(claveCrono()); } catch (e) { }
    if (S.obj) { const canj = S.obj.presencial; await registrarPresencial(id); cerrarSheet(); stopTimer(); await salirComo(); toast(canj ? 'Sesión guardada y presencial canjeada' : 'Sesión guardada en su ficha'); await verSesion(id); return; }
    cerrarSheet(); stopTimer(); S.dia = null; S.sesion = null; S.tab = 'hoy'; toast('Sesión guardada. ¡Buen trabajo!'); render(); window.scrollTo(0, 0);
  } catch (err) { fallo(err); }
}

/* ---------- Nutrición (pendiente de cargar planes) ---------- */
function vNutri() { return `<section class="stack"><span class="eyebrow">Tu plan de alimentación</span><h1>Nutrición</h1></section><div class="section card empty">Tu plan de alimentación aparecerá aquí muy pronto.</div>`; }

/* ---------- Progreso ---------- */
document.addEventListener('click', e => {
  const h = e.target.closest && e.target.closest('.spark-hit'); if (!h) return;
  const t = h.closest('.spark-w')?.querySelector('.spark-tip'); if (t) { t.textContent = h.dataset.tip; t.classList.add('on'); }
});
function spark(pts, { unit = '', dec = 1, color = 'var(--blue)' } = {}) {
  if (pts.length < 2) return '<p class="small muted">Hace falta al menos dos mediciones para ver la evolución.</p>';
  const vals = pts.map(p => p.v), W = 320, H = 120, pl = 8, pr = 50, pt = 14, pb = 24;
  const mn = Math.min(...vals), mx = Math.max(...vals), r = (mx - mn) || 1;
  const x = i => pl + i * (W - pl - pr) / (pts.length - 1), y = v => pt + (mx - v) / r * (H - pt - pb);
  const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  const grid = [...new Set([mx, mn])].map(v => `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-dasharray="3 4"/><text x="${W - pr + 6}" y="${y(v) + 4}" fill="var(--muted)" font-size="11">${fmtNum(v, dec)}${unit}</text>`).join('');
  let ult = -99; const xl = x(pts.length - 1);
  const ver = pts.map((p, i) => { const ok = i === 0 || i === pts.length - 1 || (x(i) - ult >= 64 && xl - x(i) >= 64); if (ok) ult = x(i); return ok; });
  const lbl = pts.map((p, i) => ver[i] ? `<text x="${x(i)}" y="${H - 6}" fill="var(--muted)" font-size="10" text-anchor="${i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle'}">${esc(fecha(p.f).toLocaleDateString('es-ES', { day: 'numeric', month: 'numeric', year: '2-digit' }))}</text>` : '').join('');
  const hit = pts.map((p, i) => `<circle class="spark-hit" cx="${x(i)}" cy="${y(p.v)}" r="14" fill="transparent" data-tip="${esc(fecha(p.f).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) + ': ' + fmtNum(p.v, dec) + unit)}"/>`).join('');
  return `<div class="spark-w"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolución">${grid}<polygon points="${x(0)},${H - pb} ${line} ${x(pts.length - 1)},${H - pb}" fill="${color}" opacity=".1"/><polyline points="${line}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>${pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.v)}" r="${i === pts.length - 1 ? 4.5 : 2.5}" fill="${color}" stroke="var(--surface)" stroke-width="1.5"/>`).join('')}${lbl}${hit}</svg><div class="spark-tip small muted">Toca un punto para ver su dato</div></div>`;
}
function serie(med, campo) { return med.slice().sort((x, y) => x.fecha.localeCompare(y.fecha)).filter(m => m[campo] != null).map(m => ({ f: m.fecha, v: Number(m[campo]) })); }
function delta(pts) { if (pts.length < 2) return null; return pts[pts.length - 1].v - pts[0].v; }
/* ---------- % de grasa: método US Navy (el de la calculadora de Fit Generation) y percentiles por sexo y edad ---------- */
const RANGOS_GRASA = { mujer: [[39, 21, 33, 39], [59, 23, 35, 40], [999, 24, 36, 42]], hombre: [[39, 8, 20, 25], [59, 11, 22, 28], [999, 13, 25, 30]] };
const edadDe = (nac, en = hoyISO()) => { if (!nac) return null; const a = fecha(nac), b = fecha(en); let e = b.getFullYear() - a.getFullYear(); if (b.getMonth() < a.getMonth() || (b.getMonth() === a.getMonth() && b.getDate() < a.getDate())) e--; return e; };
function grasaNavy({ sexo, estatura, cuello, cintura, cadera }) {
  if (!sexo || !estatura || !cuello || !cintura) return null;
  const L = Math.log10;
  let pct;
  if (sexo === 'hombre') { if (cintura <= cuello) return null; pct = 495 / (1.0324 - 0.19077 * L(cintura - cuello) + 0.15456 * L(estatura)) - 450; }
  else { if (!cadera || cintura + cadera <= cuello) return null; pct = 495 / (1.29579 - 0.35004 * L(cintura + cadera - cuello) + 0.22100 * L(estatura)) - 450; }
  return pct > 2 && pct < 70 ? Math.round(pct * 10) / 10 : null;
}
function clasifGrasa(pct, sexo, edad) {
  if (pct == null || !sexo) return null;
  const [, b, s2, o] = RANGOS_GRASA[sexo].find(r => (edad ?? 30) <= r[0]);
  const tramo = (edad ?? 30) < 40 ? '20-39' : edad < 60 ? '40-59' : '60-79';
  if (pct < b) return { l: 'Bajo en grasa', n: 'warn', r: `< ${b} %`, tramo };
  if (pct <= s2) return { l: 'Saludable', n: 'ok', r: `${b}–${s2} %`, tramo };
  if (pct <= o) return { l: 'Sobrepeso', n: 'warn', r: `${s2}–${o} %`, tramo };
  return { l: 'Obesidad', n: 'bad', r: `> ${o} %`, tramo };
}
const conKgGrasa = med => med.map(m => ({ ...m, grasa_kg: m.grasa_kg ?? (m.peso && m.grasa_pct ? Math.round(m.peso * m.grasa_pct) / 100 : null) }));
function vResumenGrasa(med, perfil) {
  const l = med.filter(m => m.grasa_pct != null); if (!l.length) return '';
  const u = l[l.length - 1], p0 = l[0], c = clasifGrasa(u.grasa_pct, perfil?.sexo, edadDe(perfil?.fecha_nacimiento, u.fecha));
  const kg = u.grasa_kg, dkg = l.length > 1 && kg != null && p0.grasa_kg != null ? kg - p0.grasa_kg : null;
  const mm = u.peso && kg != null ? u.peso - kg : null, mm0 = p0.peso && p0.grasa_kg != null ? p0.peso - p0.grasa_kg : null;
  return `<div class="grasa-res"><div class="row" style="gap:8px;flex-wrap:wrap"><span class="small"><b>${fmtNum(u.grasa_pct)} % de grasa</b>${kg != null ? ` = ${fmtNum(kg)} kg de grasa` : ''}</span>${c ? `<span class="pill ${c.n}">${c.l}</span>` : ''}</div>
    ${c ? `<div class="small muted">Rango saludable para ${perfil.sexo === 'mujer' ? 'mujeres' : 'hombres'} de ${c.tramo} años: ${esc(RANGOS_GRASA[perfil.sexo].find(r => (edadDe(perfil.fecha_nacimiento, u.fecha) ?? 30) <= r[0]).slice(1, 3).join('–'))} %</div>` : (perfil && !perfil.sexo ? '<div class="small muted">Indica sexo y fecha de nacimiento para ver su percentil.</div>' : '')}
    ${dkg != null ? `<div class="small">Desde el inicio: <b style="color:var(--${dkg <= 0 ? 'ok' : 'bad'})">${dkg > 0 ? '+' : ''}${fmtNum(dkg)} kg de grasa</b>${mm != null && mm0 != null ? ` · ${mm - mm0 >= 0 ? '+' : ''}${fmtNum(mm - mm0)} kg de masa magra` : ''}</div>` : ''}</div>`;
}
/* Cálculo en vivo dentro de los formularios de medición */
function enganchaCalcGrasa(form, perfil, alCambiar) {
  const v = k => numero(form.querySelector(`[data-campo="${k}"]`)?.value), out = form.querySelector('.calc-grasa');
  const upd = () => {
    const sexo = form.querySelector('[data-perfil="sexo"]')?.value || perfil.sexo, estatura = numero(form.querySelector('[data-perfil="estatura_cm"]')?.value) || perfil.estatura_cm;
    const nac = form.querySelector('[data-perfil="fecha_nacimiento"]')?.value || perfil.fecha_nacimiento, edad = edadDe(nac);
    const pct = grasaNavy({ sexo, estatura, cuello: v('cuello'), cintura: v('cintura'), cadera: v('cadera') }), peso = v('peso');
    form.dataset.grasaPct = pct ?? ''; form.dataset.grasaKg = pct != null && peso ? Math.round(peso * pct) / 100 : '';
    if (alCambiar) alCambiar(pct, peso);
    if (!out) return;
    if (pct == null) { out.innerHTML = `<span class="small muted">Para calcular el % de grasa hacen falta: sexo, estatura, cuello, cintura${sexo !== 'hombre' ? ' y cadera' : ''}.</span>`; return; }
    const c = clasifGrasa(pct, sexo, edad);
    out.innerHTML = `<div class="row" style="gap:8px;flex-wrap:wrap"><b>${fmtNum(pct)} % de grasa</b>${peso ? `<span class="small">${fmtNum(peso * pct / 100)} kg de grasa · ${fmtNum(peso - peso * pct / 100)} kg de masa magra</span>` : ''}${c ? `<span class="pill ${c.n}">${c.l}</span>` : ''}</div><div class="small muted">Método US Navy${c ? ` · ${sexo === 'mujer' ? 'mujer' : 'hombre'} de ${c.tramo} años: saludable ${RANGOS_GRASA[sexo].find(r => (edad ?? 30) <= r[0]).slice(1, 3).join('–')} %` : ''}</div>`;
  };
  form.addEventListener('input', upd); upd();
}
const camposPerfil = perfil => `${!perfil.sexo || !perfil.estatura_cm || !perfil.fecha_nacimiento ? `<div class="card stack" style="padding:12px;gap:8px"><span class="small"><b>Datos para calcular el % de grasa</b> (solo la primera vez)</span><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
  <label class="f">Sexo<select data-perfil="sexo"><option value="">—</option><option value="mujer" ${perfil.sexo === 'mujer' ? 'selected' : ''}>Mujer</option><option value="hombre" ${perfil.sexo === 'hombre' ? 'selected' : ''}>Hombre</option></select></label>
  <label class="f">Estatura (cm)<input type="text" inputmode="decimal" data-perfil="estatura_cm" value="${perfil.estatura_cm || ''}"></label>
  <label class="f">Nacimiento<input type="date" data-perfil="fecha_nacimiento" value="${perfil.fecha_nacimiento || ''}"></label></div></div>` : ''}`;
async function guardarDatosPerfil(form, id, perfil) {
  const upd = {}; form.querySelectorAll('[data-perfil]').forEach(i => { const k = i.dataset.perfil, v = k === 'estatura_cm' ? numero(i.value) : i.value || null; if (v != null && v !== perfil[k]) upd[k] = v; });
  if (!Object.keys(upd).length) return;
  const { error } = await sb.from('perfiles').update(upd).eq('id', id);
  if (!error) Object.assign(perfil, upd);
}

/* Composición corporal: una sola gráfica con desplegable (peso, % grasa, cintura, abdomen) */
const COMP = [['peso', 'Peso', ' kg', 'var(--blue)'], ['grasa_pct', '% de grasa', ' %', 'var(--gold)'], ['grasa_kg', 'Kilos de grasa', ' kg', 'var(--bad)'], ['cintura', 'Contorno de cintura', ' cm', 'var(--ink)'], ['abd_bajo', 'Contorno de abdomen', ' cm', 'var(--blue)']];
function vGraficaComp(med, perfil) {
  med = conKgGrasa(med);
  const disp = COMP.filter(([c]) => serie(med, c).length);
  if (!disp.length) return '';
  const sel = disp.find(([c]) => c === S.grafComp) || disp[0], [c, t, u, col] = sel, p = serie(med, c), dl = delta(p);
  return `<div class="card stack chart"><div class="row" style="gap:8px"><select class="grow" data-graf="comp" aria-label="Qué medida ver">${disp.map(([k, l]) => `<option value="${k}" ${k === c ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="row"><b class="num grow" style="font-family:var(--display);font-size:26px">${fmtNum(p[p.length - 1].v)}${u}</b>${dl != null ? `<span class="pill num ${dl <= 0 ? 'ok' : 'warn'}">${dl > 0 ? '+' : ''}${fmtNum(dl)}${u} desde el inicio</span>` : ''}</div>
    ${spark(p, { unit: u, color: col })}
    ${vResumenGrasa(med, perfil)}</div>`;
}
function vProgreso() {
  const med = S.d.mediciones;
  const campos = [['peso', 'Peso', ' kg', 'var(--blue)'], ['grasa_pct', '% de grasa', ' %', 'var(--gold)'], ['cintura', 'Cintura', ' cm', 'var(--ink)'], ['cadera', 'Cadera', ' cm', 'var(--blue)'], ['abd_bajo', 'Abdomen bajo', ' cm', 'var(--ink)']];
  const k = c => { const p = serie(med, c), dl = delta(p); return dl == null ? '—' : (dl > 0 ? '+' : '') + fmtNum(dl); };
  const semanas = [...Array(8)].map((_, i) => lunesDe(sumaDias(hoyISO(), -7 * (7 - i))));
  const porSem = semanas.map(l => semana(l).entrenos), maxS = Math.max(S.d.programa?.dias_semana || 1, ...porSem);
  return `<section class="stack"><span class="eyebrow">Tu evolución</span><h1>Progreso</h1><button class="btn" data-act="misMedidas" style="align-self:flex-start">＋ Añadir mis medidas</button></section>
  ${objetivoDe(S.d.ruta) ? `<section class="section"><div class="card stack"><span class="eyebrow">Tu objetivo</span><div class="small">${esc(objetivoDe(S.d.ruta))}</div></div></section>` : ''}
  ${med.length ? `<section class="section"><div class="kpis"><div class="kpi"><div class="v num">${k('peso')}</div><div class="l">kg de peso</div></div><div class="kpi"><div class="v num">${k('grasa_pct')}</div><div class="l">% de grasa</div></div><div class="kpi"><div class="v num">${k('cintura')}</div><div class="l">cm de cintura</div></div></div><p class="small muted">Cambio desde tu primera medición (${esc(fCorta(med[0].fecha))} ${fecha(med[0].fecha).getFullYear()}).</p></section>` : ''}
  <section class="section">${vGraficaComp(med, S.perfil) || '<div class="card empty">Aún no hay mediciones. Jesús las añadirá en tu próximo control mensual.</div>'}
  <div class="card stack chart"><h3>Entrenamientos por semana</h3><svg viewBox="0 0 320 110" role="img" aria-label="Entrenamientos por semana">${porSem.map((v, i) => { const bw = 304 / 8, h = v / maxS * 76; return `<rect x="${8 + i * bw + 6}" y="${86 - h}" width="${bw - 12}" height="${Math.max(h, 1)}" rx="4" fill="${v >= (S.d.programa?.dias_semana || 99) ? 'var(--ok)' : v ? 'var(--blue)' : 'var(--line)'}"/><text x="${8 + i * bw + bw / 2}" y="${82 - h}" fill="var(--fg)" font-size="11" text-anchor="middle">${v || ''}</text><text x="${8 + i * bw + bw / 2}" y="104" fill="var(--muted)" font-size="10" text-anchor="middle">${esc(fecha(semanas[i]).toLocaleDateString('es-ES', { day: 'numeric', month: 'numeric' }))}</text>`; }).join('')}</svg></div></section>
  ${med.length ? `<section class="section"><h2>Mediciones</h2><div class="card tbl"><table><thead><tr><th>Fecha</th><th>Peso</th><th>% grasa</th><th>Cintura</th><th>Cadera</th></tr></thead><tbody>${med.slice().reverse().map(m => `<tr><td>${esc(fCorta(m.fecha))} ${String(fecha(m.fecha).getFullYear()).slice(2)}</td><td class="num">${fmtNum(m.peso)}</td><td class="num">${fmtNum(m.grasa_pct)}</td><td class="num">${fmtNum(m.cintura)}</td><td class="num">${fmtNum(m.cadera)}</td></tr>`).join('')}</tbody></table></div></section>` : ''}`;
}

/* ---------- Check-in ---------- */
function vCheckin() {
  const lunes = lunesDe(hoyISO()), w = semana(lunes), c = S.d.checkins.find(x => x.semana_inicio === lunes);
  if (!S.chipsCargados && c) { S.chips = new Set(c.proxima_semana_etiquetas || []); S.chipsCargados = true; }
  const s = S.d.servicio || {}, p = S.d.programa;
  const mot = c?.motivacion ?? 7, imp = c?.implicacion ?? 7;
  const etiquetas = ['Viaje', 'Turnos de trabajo', 'Evento social', 'Enfermedad', 'Semana tranquila'];
  return `<section class="stack"><span class="eyebrow">Semana del ${esc(fCorta(lunes))} al ${esc(fCorta(sumaDias(lunes, 6)))}</span><h1>Check-in</h1><p class="small muted">${c ? 'Ya lo enviaste esta semana. Puedes corregirlo si algo ha cambiado.' : 'Lo que registras cada día se rellena solo. Aquí solo te pregunto lo que falta.'}</p></section>
  <section class="section"><div class="card stack"><span class="eyebrow">Tu semana en datos</span>
    ${(s.modulo_entreno ?? true) ? `<div class="row small"><span class="grow">Entrenamientos</span><span class="pill ${p && w.entrenos >= p.dias_semana ? 'ok' : 'warn'} num">${w.entrenos}${p ? ' de ' + p.dias_semana : ''}</span></div>` : ''}

    <div class="row small"><span class="grow">Pasos (media)</span><span class="pill num">${w.pasosMedia == null ? 'Sin registros' : fmtNum(w.pasosMedia, 0)}</span></div>
  </div>
  ${s.modulo_nutricion ? `<div class="card stack">${(() => { const I = ingestasSemana(S.d.diario, lunes, s), ev = evalNutri(I.pct); return `<div class="row small"><span class="grow">Alimentación: ${I.hechas} de ${I.total} ingestas</span><span class="pill ${ev ? ev[0] : ''} num">${I.pct == null ? 'Sin registros' : I.pct + ' % · ' + ev[1]}</span></div>`; })()}
    <label class="f">Comidas o situaciones a destacar (opcional)<textarea id="k-nali" placeholder="Ej. cena fuera el sábado, semana de vacaciones con la familia…">${esc(c?.nota_alimentacion || '')}</textarea></label></div>` : ''}
  <div class="card stack"><label class="f">¿Qué te ha dificultado aplicar el plan esta semana?<textarea id="k-dif" placeholder="Cambios de horario, comidas fuera, cansancio…">${esc(c?.dificultades || '')}</textarea></label></div>
  <div class="card stack"><span class="small muted">¿Cómo se presenta la semana que viene?</span>
    <div class="chips">${etiquetas.map(t => `<button data-act="chip" data-v="${t}" aria-pressed="${S.chips.has(t)}">${t}</button>`).join('')}</div>
    <label class="f">Cuéntame más si hace falta<textarea id="k-prox" placeholder="Ej. jueves cena de empresa, viernes viajo">${esc(c?.proxima_semana || '')}</textarea></label></div>
  <div class="card stack">
    <label class="f"><span class="row"><span class="grow">Motivación con el proceso</span><b class="num" id="k-mot-v" style="color:var(--blue-text)">${mot}/10</b></span><input id="k-mot" type="range" min="1" max="10" value="${mot}"></label>
    <label class="f"><span class="row"><span class="grow">Implicación con el plan</span><b class="num" id="k-imp-v" style="color:var(--blue-text)">${imp}/10</b></span><input id="k-imp" type="range" min="1" max="10" value="${imp}"></label></div>
  <button class="btn full" data-act="enviarCheckin">${c ? 'Actualizar check-in' : 'Enviar check-in'}</button></section>`;
}
async function enviarCheckin() {
  const row = { alumno_id: S.user.id, semana_inicio: lunesDe(hoyISO()), dificultades: $('#k-dif').value.trim() || null,
    proxima_semana_etiquetas: [...S.chips], proxima_semana: $('#k-prox').value.trim() || null,
    motivacion: +$('#k-mot').value, implicacion: +$('#k-imp').value, enviado_at: new Date().toISOString() };
  if ($('#k-nali')) { row.nota_alimentacion = $('#k-nali').value.trim() || null; const I = ingestasSemana(S.d.diario, row.semana_inicio, S.d.servicio); if (I.pct != null) row.nutricion_pct = I.pct; }
  let { data, error } = await sb.from('checkins').upsert(row, { onConflict: 'alumno_id,semana_inicio' }).select().single();
  if (error && /nutricion_pct|nota_alimentacion/.test(error.message || '')) { delete row.nutricion_pct; delete row.nota_alimentacion; ({ data, error } = await sb.from('checkins').upsert(row, { onConflict: 'alumno_id,semana_inicio' }).select().single()); }
  if (error) return fallo(error);
  S.d.checkins = [data, ...S.d.checkins.filter(x => x.semana_inicio !== row.semana_inicio)];
  toast('Check-in enviado a Jesús'); S.tab = 'hoy'; render(); window.scrollTo(0, 0);
}

/* =====================================================================
   PANEL DEL COACH
   ===================================================================== */
async function cargarCoach() {
  const desde = sumaDias(hoyISO(), -56);
  const [per, srv, ses, chk, reg, pag, prg, ejs, rut] = await Promise.all([
    sb.from('perfiles').select('*').order('nombre'),
    sb.from('servicios').select('*').eq('activo', true),
    sb.from('sesiones_hechas').select('*,dias(nombre,foco)').gte('fecha', desde).order('fecha', { ascending: false }),
    sb.from('checkins').select('*').gte('semana_inicio', sumaDias(desde, -7)).order('semana_inicio', { ascending: false }),
    sb.from('registro_diario').select('*').gte('fecha', sumaDias(hoyISO(), -21)),
    sb.from('pagos').select('*').order('vence'),
    sb.from('programas').select('alumno_id,nombre,dias_semana').eq('activo', true),
    sb.from('ejercicios').select('*').order('nombre'),
    sb.from('hoja_ruta').select('*').order('orden')
  ]);
  S.c = { perfiles: per.data || [], servicios: srv.data || [], sesiones: ses.data || [], checkins: chk.data || [], diario: reg.data || [], pagos: pag.data || [], programas: prg.data || [], ejercicios: ejs.data || [] };
  S.c.servicios.forEach(x => x._bloques = bloquesDe((rut.data || []).filter(r => r.alumno_id === x.alumno_id)));
  const [fa, ap] = await Promise.all([sb.from('facturas').select('*').order('numero', { ascending: false }), sb.from('ajustes_privados').select('*')]);
  await cargarPlantillas();
  if (S.c.servicios.some(x => x.modulo_futbol)) await cargarFutbolCoach();
  { const r = await sb.from('revisiones').select('*').order('fecha', { ascending: false }); S.c.revisiones = r.data || []; S.c.revisionesErr = !!r.error; }
  S.c.facturas = fa.data || []; S.c.facturasError = !!fa.error; S.c.fiscal = Object.fromEntries((ap.data || []).map(x => [x.clave, x.valor]));
}
/* Datos de una semana (lunes a domingo) de un alumno */
function semanaDatos(aid, lunes, src) {
  const fin = sumaDias(lunes, 6), dentro = f => f >= lunes && f <= fin;
  const ses = (src.sesiones || []).filter(x => x.alumno_id === aid && dentro(x.fecha)).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const reg = (src.diario || []).filter(r => r.alumno_id === aid && dentro(r.fecha)).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const pasos = reg.filter(r => r.pasos != null).map(r => r.pasos);
  const chk = (src.checkins || []).find(k => k.alumno_id === aid && k.semana_inicio === lunes);
  const media = k => { const v = ses.filter(x => x[k]).map(x => x[k]); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const ing = ingestasSemana(reg, lunes, (S.c?.servicios || []).find(x => x.alumno_id === aid));
  return { lunes, fin, ses, entrenos: new Set(ses.map(x => x.fecha + x.dia_id)).size, reg, pasosMedia: pasos.length ? Math.round(pasos.reduce((a, b) => a + b, 0) / pasos.length) : null, diasPasos: pasos.length, chk, ing, nutri: ing.pct ?? chk?.nutricion_pct ?? null, cansancio: media('cansancio'), poderio: media('poderio') };
}
/* Alertas: semana anterior incumplida, o semana en curso por debajo del 50 % a partir del sábado */
function estadoAlumno(a) {
  const c = S.c, hoy = hoyISO(), lunes = lunesDe(hoy), dow = (fecha(hoy).getDay() + 6) % 7; // 0 = lunes … 6 = domingo
  const srv = c.servicios.find(x => x.alumno_id === a.id), dpw = (c.programas.find(p => p.alumno_id === a.id) || {}).dias_semana || 0, obj = objPasos(srv);
  const ses = c.sesiones.filter(s => s.alumno_id === a.id);
  const chks = c.checkins.filter(k => k.alumno_id === a.id), ult = chks[0], ant = chks[1];
  const motivos = []; let nivel = 'ok';
  const sube = n => { if (n === 'bad' || nivel === 'ok') nivel = n; };
  const vencidos = c.pagos.filter(p => p.alumno_id === a.id && !p.pagado_at && p.vence < hoy);
  if (vencidos.length) { sube('bad'); motivos.push(`Pago vencido: ${vencidos.map(p => p.importe + ' €').join(', ')}`); }
  const enProceso = !srv?.inicio || srv.inicio <= sumaDias(lunes, -7);
  const pre = semanaDatos(a.id, sumaDias(lunes, -7), c);
  if (enProceso) {
    if (dpw && pre.entrenos < dpw) { sube(pre.entrenos <= dpw / 2 ? 'bad' : 'warn'); motivos.push(`Semana pasada: ${pre.entrenos} de ${dpw} entrenos`); }
    if (pre.pasosMedia == null) { sube('warn'); motivos.push('Semana pasada: sin registro de pasos'); }
    else if (pre.pasosMedia < obj) { sube('warn'); motivos.push(`Semana pasada: ${fmtNum(pre.pasosMedia, 0)} pasos de media (objetivo ${fmtNum(obj, 0)})`); }
    if (srv?.modulo_nutricion && pre.nutri != null && pre.nutri < 85) { sube(pre.nutri < 60 ? 'bad' : 'warn'); motivos.push(`Semana pasada: alimentación ${evalNutri(pre.nutri)[1].toLowerCase()} (${pre.nutri} % de ingestas)`); }
  }
  if (dow >= 5) {
    const cur = semanaDatos(a.id, lunes, c), dias = dow + 1;
    if (dpw && cur.entrenos < dpw * 0.5) { sube('bad'); motivos.push(`Esta semana: solo ${cur.entrenos} de ${dpw} entrenos y ya es ${dow === 5 ? 'sábado' : 'domingo'}`); }
    if (cur.diasPasos < dias * 0.5 || (cur.pasosMedia != null && cur.pasosMedia < obj * 0.5)) { sube('warn'); motivos.push(`Esta semana: pasos registrados ${cur.diasPasos} de ${dias} días${cur.pasosMedia != null ? `, media ${fmtNum(cur.pasosMedia, 0)}` : ''}`); }
    if (srv?.modulo_nutricion && cur.nutri != null && cur.nutri < 50) { sube('bad'); motivos.push(`Esta semana: alimentación al ${cur.nutri} %`); }
  }
  if (srv?.modulo_futbol) alertasFutbol(a.id).forEach(([n, m]) => { sube(n); motivos.push(m); });
  if (ult && ult.motivacion <= 4) { sube('bad'); motivos.push(`Motivación ${ult.motivacion}/10`); }
  else if (ult && ant && ant.motivacion - ult.motivacion >= 3) { sube('warn'); motivos.push(`Motivación de ${ant.motivacion} a ${ult.motivacion}`); }
  const semana = new Set(ses.filter(s => s.fecha >= lunes).map(s => s.fecha + s.dia_id)).size;
  const mes = new Set(ses.filter(s => s.fecha >= sumaDias(hoy, -27)).map(s => s.fecha + s.dia_id)).size;
  const control = revisionPendiente(srv, (c.revisiones || []).filter(r => r.alumno_id === a.id), c.revisionesErr) || (c.revisionesErr ? controlEnSemana(srv, lunes) : null);
  if (control?.atrasada) { sube('warn'); motivos.push(`Revisión mensual ${control.n} pendiente desde el ${fCorta(control.fecha)}`); }
  return { nivel, motivos, ult, ultSes: ses[0], dpw, semana, mes, control, ses7: semana };
}
function verAlertas(id) {
  const a = S.c.perfiles.find(x => x.id === id); if (!a) return;
  const e = estadoAlumno(a), lab = { ok: 'En camino', warn: 'Atención', bad: 'Revisar' };
  abrirSheet(`<div class="stack"><span class="eyebrow">Alertas</span><h2>${esc(a.nombre)}</h2><span class="pill ${e.nivel}" style="align-self:flex-start">${lab[e.nivel]}</span>
    ${e.motivos.length ? `<ul class="alertas-lista">${e.motivos.map(m => `<li>${esc(m)}</li>`).join('')}</ul>` : '<p class="small muted">Ahora mismo no tiene ninguna alerta.</p>'}
    <button class="btn full" data-act="ficha" data-id="${a.id}">Abrir su ficha</button></div>`);
}
function vAntiguos() {
  const ant = S.c.perfiles.filter(p => p.activo === false && p.rol !== 'coach');
  if (!ant.length) return '';
  return `<section class="section"><details class="card antiguos"><summary><b>Antiguos alumnos · ${ant.length}</b> <span class="small muted">Sin avisos ni seguimiento. Sus datos siguen aquí.</span></summary>
    <div class="card" style="margin-top:10px">${ant.map(a => `<div class="line"><div class="grow"><b>${esc(a.nombre)}</b><div class="small muted">${esc(a.email || '')}</div></div><button class="btn sm ghost" data-act="ficha" data-id="${a.id}">Ver</button><button class="btn sm ghost" data-act="reactivarAlumno" data-id="${a.id}">Reactivar</button></div>`).join('')}</div></details></section>`;
}
async function cambiarArchivo(id, activo) {
  if (!activo && !confirm('¿Pasar a antiguos alumnos? Dejará de aparecer en tus avisos y listados. Sus datos se conservan y podrá seguir usando la app.')) return;
  const { error } = await sb.from('perfiles').update({ activo }).eq('id', id); if (error) return fallo(error);
  toast(activo ? 'Alumno reactivado' : 'Pasado a antiguos alumnos');
  await cargarCoach(); render();
}
function vAlumnos() {
  const c = S.c, als = c.perfiles.filter(p => p.activo !== false);
  const est = als.map(a => ({ a, e: estadoAlumno(a) })), orden = { bad: 0, warn: 1, ok: 2 };
  est.sort((x, y) => orden[x.e.nivel] - orden[y.e.nivel]);
  const lab = { ok: 'En camino', warn: 'Atención', bad: 'Revisar' };
  const venc = c.pagos.filter(p => !p.pagado_at && p.vence < hoyISO());
  return `<section class="stack"><span class="eyebrow">Panel del coach · ${esc(fLarga(hoyISO()))}</span><h1>Tus alumnos</h1></section>
  <section class="section"><div class="kpis"><div class="kpi"><div class="v num">${als.length}</div><div class="l">perfiles activos</div></div><div class="kpi"><div class="v num" style="color:var(--bad)">${est.filter(x => x.e.nivel !== 'ok').length}</div><div class="l">necesitan atención</div></div><div class="kpi"><div class="v num" style="color:${venc.length ? 'var(--bad)' : 'var(--ok)'}">${venc.length}</div><div class="l">pagos vencidos</div></div></div></section>
  <section class="section"><button class="card reporte-b" data-act="abrirReporte"><div class="ico gold">${svg('checkin')}</div><div class="grow" style="text-align:left"><b>Reporting semanal</b><div class="small muted">Semana del ${esc(fCorta(sumaDias(lunesDe(hoyISO()), -7)))} al ${esc(fCorta(sumaDias(lunesDe(hoyISO()), -1)))} · todos tus alumnos de un vistazo</div></div><span class="small" style="color:var(--blue-text)">Abrir ›</span></button></section>
  ${vFutbolCoach()}
  ${vResumenCoach(est)}
  ${vAntiguos()}
  <section class="section"><h2>Alumnos</h2><div class="card">${est.map(({ a, e }) => `<div class="line" data-act="ficha" data-id="${a.id}" style="cursor:pointer"><span style="width:4px;align-self:stretch;border-radius:2px;background:var(--${e.nivel})"></span><div class="grow stack" style="gap:3px"><div class="row"><h3 class="grow">${esc(a.nombre)}</h3>${e.control ? '<span class="pill gold">Revisión mensual</span>' : ''}<span class="pill ${e.nivel}">${lab[e.nivel]}</span></div><div class="small muted">${esc((c.servicios.find(s => s.alumno_id === a.id) || {}).producto || 'Sin servicio')}${e.ult ? ` · motivación ${e.ult.motivacion}/10` : ''}</div>${e.dpw ? barra('Semana', e.semana, e.dpw) + barra('Últimas 4 semanas', e.mes, e.dpw * 4) : ''}${e.motivos.length ? `<div class="small">${esc(e.motivos.join(' · '))}</div>` : ''}</div></div>`).join('') || '<div class="empty">Aún no hay alumnos.</div>'}</div>
  <p class="note">Para dar de alta a un alumno nuevo, créalo en Supabase → Authentication → Users. Su perfil aparecerá aquí solo.</p></section>`;
}

async function abrirFicha(id) {
  S.ficha = { id, cargando: true }; S.verSes = null; S.verPlan = null; S.fichaSub = null; render(); window.scrollTo(0, 0);
  const [med, ses, notas, prog, srv, todas] = await Promise.all([
    sb.from('mediciones').select('*').eq('alumno_id', id).order('fecha', { ascending: false }),
    sb.from('sesiones_hechas').select('*,dias(nombre,foco),registros_series(id)').eq('alumno_id', id).order('fecha', { ascending: false }).limit(60),
    sb.from('notas_coach').select('*').eq('alumno_id', id).order('fecha', { ascending: false }).limit(20),
    sb.from('programas').select('nombre,dias_semana').eq('alumno_id', id).eq('activo', true).limit(1),
    sb.from('servicios').select('*').eq('alumno_id', id).eq('activo', true).limit(1),
    conRespaldo(() => sb.from('sesiones_hechas').select('id,fecha,dia_id,duracion_min').eq('alumno_id', id).gte('fecha', sumaDias(hoyISO(), -365)),
      () => sb.from('sesiones_hechas').select('id,fecha,dia_id').eq('alumno_id', id).gte('fecha', sumaDias(hoyISO(), -365)))
  ]);
  S.ficha = { id, med: med.data || [], ses: ses.data || [], notas: notas.data || [], prog: prog.data?.[0], srv: srv.data?.[0], todas: todas.data || [] };
  S.valEd = null;
  const [pr, ru] = await Promise.all([sb.from('presenciales').select('*').eq('alumno_id', id).order('fecha'), sb.from('hoja_ruta').select('*').eq('alumno_id', id).order('orden')]);
  S.ficha.pres = pr.data || []; S.ficha.ruta = ru.data || []; if (S.ficha.srv) S.ficha.srv._bloques = bloquesDe(S.ficha.ruta);
  const f = S.ficha; await Promise.all([cargarValoraciones(), cargarProgramasFicha(f)]);
  if (S.ficha === f && !S.verSes && !S.fichaSub) render();
}
/* Todos los programas del alumno (con días y ejercicios); el activo es su bloque actual */
async function cargarProgramasFicha(f) {
  const q = sel => () => sb.from('programas').select(sel).eq('alumno_id', f.id).order('id');
  const r = await conRespaldo(q('activo,ciclo,' + SEL_PROGRAMA), () => conRespaldo(q('activo,' + SEL_PROGRAMA), q('activo,' + SIN_NUEVAS(SEL_PROGRAMA))));
  const l = r.data || [];
  l.forEach(p => { (p.dias ||= []).sort((a, b) => a.numero - b.numero); p.dias.forEach(ordenarDia); });
  f.programas = l; f.progFull = l.filter(p => p.activo !== false).pop() || null;
}
/* Programa de cada bloque del proceso: el marcado con ese nº de ciclo o, en el bloque en curso, el activo */
const progDeCiclo = (f, P) => c => {
  const l = f.programas || [], con = l.filter(p => p.ciclo === c.n);
  return con.find(p => p.activo !== false) || con[con.length - 1] || (P && c.n === P.ciclo && f.progFull && f.progFull.ciclo == null ? f.progFull : null);
};
function vBloqueActual(f, a) {
  const pr = f.progFull, P = proceso(f.srv), nom = (a.nombre || '').split(' ')[0];
  const cab = P && !P.antes && !P.fuera ? `${esc(nomCiclo(P.cc))} · semana ${P.semCiclo} de ${P.cc.sem}` : 'Programa activo';
  return `<section class="section"><div class="section-head"><h2>Bloque de entrenamiento actual</h2><button class="btn sm ghost" data-act="editarPrograma" data-id="${a.id}">${pr ? '✎ Editar' : 'Crear programa'}</button></div>
    <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn sm" data-act="asignarPlantilla" data-al="${a.id}">＋ Asignar plantilla</button>${pr ? `<button class="btn sm ghost" data-act="guardarPlantilla" data-id="${pr.id}">Guardar como plantilla</button>` : ''}</div>
    ${pr ? `<div class="card stack"><div><span class="eyebrow">${cab}</span><h3>${esc(pr.nombre)}</h3><div class="small muted">${pr.dias.length} ${pr.dias.length === 1 ? 'entrenamiento' : 'entrenamientos'}${pr.dias_semana ? ` · ${pr.dias_semana} días por semana` : ''}</div></div>
      <div>${pr.dias.map(d => `<div class="line" data-act="verPlan" data-p="${pr.id}" data-d="${d.id}" style="cursor:pointer"><span class="pill gold num">${d.numero}</span><div class="grow"><b class="small">${esc(d.nombre)}</b>${d.foco ? ` <span class="small muted">· ${esc(d.foco)}</span>` : ''}<div class="small muted">${d.bloques_sesion.filter(b => b.tipo === 'fuerza').reduce((t, b) => t + b.ejercicios_sesion.length, 0)} ejercicios${d.bloques_sesion.some(b => b.tipo !== 'fuerza') ? ' · ' + [...new Set(d.bloques_sesion.filter(b => b.tipo !== 'fuerza').map(b => b.tipo))].join(' y ') : ''}</div></div><span class="small" style="color:var(--blue-text)">Ver ›</span></div>`).join('')}</div>
      <p class="note">Toca un día para ver su entrenamiento tal como lo ve ${esc(nom)}, sin empezar la sesión.</p></div>` : '<div class="card empty">Aún no tiene programa activo.</div>'}</section>`;
}
/* ---------- Revisión mensual: aviso desde 3 días antes del aniversario mensual hasta que se registra ---------- */
function revisionPendiente(srv, revs, sinTabla) {
  if (sinTabla || !srv?.inicio) return null;
  const hoy = hoyISO(), cs = controlesMensuales(srv, sumaDias(hoy, 3)).filter(c => c.fecha >= sumaDias(hoy, -35));
  const c = cs[cs.length - 1]; if (!c) return null;
  if ((revs || []).some(r => r.control_n === c.n || (r.fecha >= sumaDias(c.fecha, -10) && r.fecha <= sumaDias(c.fecha, 25)))) return null;
  return { ...c, atrasada: hoy > sumaDias(c.fecha, 7) };
}
function formRevision(n, id) {
  const f = S.ficha, a = S.c.perfiles.find(p => p.id === f.id) || {}, r = id ? (S.c.revisiones || []).find(x => x.id === id) || {} : {};
  abrirSheet(`<form class="stack" id="f-rev"><h2>Revisión mensual${n || r.control_n ? ' ' + (n || r.control_n) : ''}</h2><p class="small muted">${esc(a.nombre || '')}: 10-15 minutos para ver cómo se siente, sus objetivos y su composición corporal.</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label class="f">Fecha<input type="date" id="rv-f" value="${r.fecha || hoyISO()}"></label><label class="f">Formato<select id="rv-t">${['Videollamada', 'Llamada', 'Presencial'].map(v => `<option ${v === r.formato ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div>
    <label class="f">¿Cómo se siente?${escala10('rv-s', r.sensacion, ['1 · Muy mal', '10 · Genial'])}</label>
    <label class="f">Consecución de objetivos<textarea id="rv-o" rows="2" placeholder="Qué ha conseguido este mes y qué le falta">${esc(r.objetivos || '')}</textarea></label>
    <label class="f">Resumen y objetivos para el próximo mes (lo ve el alumno)<textarea id="rv-r" rows="3">${esc(r.resumen || '')}</textarea></label>
    ${id ? '' : '<label class="f">Nota privada (solo tú, se guarda en tus notas)<textarea id="rv-n" rows="2"></textarea></label>'}
    <button class="btn full" type="submit">Guardar revisión</button></form>`);
  $('#f-rev').addEventListener('submit', async e => {
    e.preventDefault();
    const row = { alumno_id: f.id, control_n: n || r.control_n || null, fecha: $('#rv-f').value, formato: $('#rv-t').value, sensacion: valEscala('rv-s'), objetivos: $('#rv-o').value.trim() || null, resumen: $('#rv-r').value.trim() || null };
    const nota = $('#rv-n')?.value.trim();
    const q = id ? await sb.from('revisiones').update(row).eq('id', id) : await sb.from('revisiones').insert(row);
    if (q.error) return fallo(q.error, /revisiones/.test(q.error.message || '') ? 'Falta ejecutar el Bloque 22 en Supabase.' : undefined);
    if (nota) await sb.from('notas_coach').insert({ alumno_id: f.id, texto: `Revisión mensual${row.control_n ? ' ' + row.control_n : ''}: ${nota}` });
    cerrarSheet(); toast('Revisión guardada'); const r2 = await sb.from('revisiones').select('*').order('fecha', { ascending: false }); S.c.revisiones = r2.data || []; S.c.revisionesErr = !!r2.error; abrirFicha(f.id);
  });
}
function vRevisionesFicha(a) {
  const l = (S.c.revisiones || []).filter(r => r.alumno_id === a.id);
  if (!l.length) return '';
  return `<section class="section"><div class="section-head"><h2>Revisiones mensuales</h2><button class="btn sm ghost" data-act="revision">＋ Revisión</button></div><div class="card">${l.map(r => `<div class="line" data-act="revision" data-id="${r.id}" style="align-items:flex-start;cursor:pointer"><span class="small muted num" style="width:64px;flex:none">${esc(fCorta(r.fecha))}</span><div class="grow small"><b>${r.control_n ? 'Revisión ' + r.control_n : 'Revisión'}</b> · ${esc(r.formato || '')}${r.sensacion ? ` · se siente <b>${r.sensacion}/10</b>` : ''}${r.resumen ? `<div class="muted">${esc(r.resumen)}</div>` : ''}</div></div>`).join('')}</div></section>`;
}
/* ======================= ELITE PLAYER · futbolistas: partidos, wellness y carga ======================= */
const ZONAS = ['Isquiotibiales', 'Aductor', 'Cuádriceps', 'Gemelo', 'Tobillo', 'Rodilla', 'Cadera / pubis', 'Espalda', 'Otra'];
async function cargarFutbol(uid, dst) {
  const [pt, wl] = await Promise.all([
    sb.from('partidos').select('*').eq('alumno_id', uid).gte('fecha', sumaDias(hoyISO(), -60)).order('fecha'),
    sb.from('wellness').select('*').eq('alumno_id', uid).gte('fecha', sumaDias(hoyISO(), -42)).order('fecha')
  ]);
  dst.partidos = pt.data || []; dst.wellness = wl.data || []; dst.futbolErr = pt.error || wl.error ? 'Falta ejecutar el Bloque 21 en Supabase.' : null;
}
async function cargarFutbolCoach() {
  const [pt, wl] = await Promise.all([
    sb.from('partidos').select('*').gte('fecha', sumaDias(hoyISO(), -60)).order('fecha'),
    sb.from('wellness').select('*').gte('fecha', sumaDias(hoyISO(), -42)).order('fecha')
  ]);
  S.c.partidos = pt.data || []; S.c.wellness = wl.data || [];
}
/* Día respecto al partido: MD-3 … MD (partido) … MD+2 */
function mdDe(partidos, f = hoyISO()) {
  const dias = (a, b) => Math.round((fecha(b) - fecha(a)) / 864e5);
  const prox = partidos.filter(p => p.fecha >= f).sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
  const ant = partidos.filter(p => p.fecha < f).sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
  if (prox && prox.fecha === f) return { md: 'MD', txt: 'Día de partido', prox, ant, tipo: 'partido' };
  if (ant && dias(ant.fecha, f) <= 2 && (!prox || dias(f, prox.fecha) > 2)) { const n = dias(ant.fecha, f); return { md: 'MD+' + n, txt: n === 1 ? 'Día después del partido' : '2 días después del partido', prox, ant, tipo: 'post' }; }
  if (prox) { const n = dias(f, prox.fecha); return { md: 'MD-' + n, txt: n === 1 ? 'Mañana hay partido' : `Faltan ${n} días para el partido`, prox, ant, tipo: n === 1 ? 'previo' : 'semana' }; }
  return { md: '', txt: 'Sin partido a la vista', prox, ant, tipo: 'semana' };
}
const wDe = (w, f, t) => w.find(x => x.fecha === f && x.tipo === t);
/* Carga del día en unidades arbitrarias (minutos × esfuerzo 1-10) */
function cargaDia(w, f) {
  const d = wDe(w, f, 'diario')?.datos || {}, p = wDe(w, f, 'partido')?.datos || {};
  const eq = (+d.eq_min || 0) * (+d.eq_rpe || 0), lof = (+d.lof_min || 0) * (+d.lof_rpe || 0), pa = (+p.minutos || 0) * (+p.rpe || 0);
  return { eq, lof, pa, total: eq + lof + pa };
}
function cargasSemana(w, f = hoyISO()) {
  const suma = n => [...Array(n)].reduce((t, _, i) => t + cargaDia(w, sumaDias(f, -i)).total, 0);
  const aguda = suma(7), cronica = suma(28) / 4;
  return { aguda, cronica, acwr: cronica ? aguda / cronica : null };
}
const nivelAcwr = r => r == null ? ['', 'sin datos'] : r > 1.5 ? ['bad', 'riesgo alto'] : r > 1.3 ? ['warn', 'atención'] : r < 0.8 ? ['warn', 'carga baja'] : ['ok', 'óptima'];
const nivelFat = v => v == null ? '' : v >= 7 ? 'bad' : v >= 5 ? 'warn' : 'ok';
function ultimaFatiga(w) {
  const l = w.filter(x => x.datos && (x.datos.fatiga != null || x.datos.despues != null)).sort((a, b) => (b.fecha + b.tipo).localeCompare(a.fecha + a.tipo))[0];
  return l ? { v: l.datos.fatiga ?? (11 - l.datos.despues), f: l.fecha } : null;
}
function molestiasRecientes(w, dias = 4) {
  const desde = sumaDias(hoyISO(), -dias);
  return w.filter(x => x.fecha >= desde && x.datos?.molestias?.length).map(x => ({ f: x.fecha, z: x.datos.molestias, t: x.datos.molestia_txt }));
}
/* Cuestionarios pendientes del jugador */
function pendientesFutbol() {
  const s = S.d?.servicio; if (!s?.modulo_futbol || S.d.futbolErr) return [];
  const w = S.d.wellness || [], hoy = hoyISO(), dow = (fecha(hoy).getDay() + 6) % 7, out = [];
  const jugados = (S.d.partidos || []).filter(p => p.fecha <= hoy && p.fecha >= sumaDias(hoy, -3) && !wDe(w, p.fecha, 'partido'));
  jugados.forEach(p => out.push({ t: 'partido', f: p.fecha, txt: `Cuestionario del partido${p.rival ? ' contra ' + p.rival : ''}`, sub: p.fecha === hoy ? 'Rellénalo al terminar: antes, durante y después.' : 'Te falta contarle a Jesús cómo fue.' }));
  if (dow === 0 && !wDe(w, hoy, 'lunes')) out.push({ t: 'lunes', f: hoy, txt: 'Cuestionario del lunes', sub: 'Tu fatiga tras el fin de semana para ajustar la semana. 1 minuto.' });
  const dom = dow === 6 ? hoy : dow === 0 ? sumaDias(hoy, -1) : null;
  if (dom && !wDe(w, dom, 'semana')) out.push({ t: 'semana', f: dom, txt: 'Comparte la planificación de tu equipo', sub: 'La semana que viene del club (entrenos, horarios, partido). Escríbela o sube una foto o PDF. Así Jesús te deja tu semana lista el lunes.' });
  if (!wDe(w, hoy, 'diario') && !jugados.some(p => p.fecha === hoy)) out.push({ t: 'diario', f: hoy, txt: 'Check diario', sub: 'Carga con el equipo, tu sesión y tu fatiga. 30 segundos.' });
  return out;
}
const escala10 = (id, val, ext) => `<div class="escala10" role="group" id="${id}">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `<button type="button" data-act="escala10" data-v="${n}" aria-pressed="${val === n}">${n}</button>`).join('')}</div>${ext ? `<div class="row small muted"><span class="grow">${ext[0]}</span><span>${ext[1]}</span></div>` : ''}`;
const valEscala = id => { const b = document.querySelector(`#${id} [aria-pressed="true"]`); return b ? +b.dataset.v : null; };
const chipsZonas = sel => `<div class="chips" id="w-zonas">${ZONAS.map(z => `<button type="button" data-zona="${esc(z)}" aria-pressed="${(sel || []).includes(z)}">${esc(z)}</button>`).join('')}</div>`;
function vFutbolHoy() {
  const D = S.d; if (D.futbolErr) return `<section class="section"><div class="card small muted">${esc(D.futbolErr)}</div></section>`;
  const M = mdDe(D.partidos || []), pend = pendientesFutbol(), fut = (D.partidos || []).filter(p => p.fecha >= hoyISO()).slice(0, 3);
  return `<section class="section"><div class="card md-card stack">
      <div class="row"><span class="md-chip">${esc(M.md || '—')}</span><div class="grow"><b>${esc(M.txt)}</b>${M.prox ? `<div class="small muted">Próximo: ${esc(M.prox.rival || 'partido')} · ${esc(fCorta(M.prox.fecha))}${M.prox.hora ? ' · ' + esc(M.prox.hora) : ''}${M.prox.local === false ? ' · fuera' : M.prox.local ? ' · en casa' : ''}</div>` : '<div class="small muted">Añade tu próximo partido para que Jesús ajuste tu semana.</div>'}</div></div>
      ${pend.map(p => `<button class="pend-b" data-act="wellness" data-t="${p.t}" data-f="${p.f}"><span class="badge-dot" style="position:static"></span><div class="grow" style="text-align:left"><b>${esc(p.txt)}</b><div class="small muted">${esc(p.sub)}</div></div><span style="color:var(--blue-text);font-weight:700">Rellenar ›</span></button>`).join('')}
      ${!pend.length ? '<div class="small" style="color:var(--ok)"><b>✓ Todo al día.</b> Gracias: Jesús ya tiene tu información de hoy.</div>' : ''}
      ${fut.length ? `<div class="stack" style="gap:4px"><span class="eyebrow">Próximos partidos</span>${fut.map(p => `<div class="line" data-act="partido" data-id="${p.id}" style="cursor:pointer;padding:6px 0"><span class="small num" style="width:56px">${esc(fCorta(p.fecha))}</span><span class="small grow"><b>${esc(p.rival || 'Partido')}</b>${p.competicion ? ' · ' + esc(p.competicion) : ''}${p.hora ? ' · ' + esc(p.hora) : ''}</span><span class="small" style="color:var(--blue-text)">Editar</span></div>`).join('')}</div>` : ''}
      <button class="btn sm ghost" data-act="partido" style="align-self:flex-start">＋ Añadir partido</button>
    </div></section>`;
}
function formPartido(id, alumnoId) {
  const lista = alumnoId ? (S.c.partidos || []) : (S.d.partidos || []), p = id ? lista.find(x => x.id === id) || {} : {};
  abrirSheet(`<form class="stack" id="f-pt"><h2>${id ? 'Partido' : 'Nuevo partido'}</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label class="f">Fecha<input type="date" id="pt-f" value="${p.fecha || ''}" required></label><label class="f">Hora<input type="time" id="pt-h" value="${esc(p.hora || '')}"></label></div>
    <label class="f">Rival<input type="text" id="pt-r" value="${esc(p.rival || '')}" placeholder="Ej. Rayo B"></label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label class="f">¿Dónde?<select id="pt-l"><option value="1" ${p.local !== false ? 'selected' : ''}>En casa</option><option value="0" ${p.local === false ? 'selected' : ''}>Fuera</option></select></label><label class="f">Competición<input type="text" id="pt-c" value="${esc(p.competicion || '')}" placeholder="Liga, Copa, amistoso…"></label></div>
    <label class="f">Nivel del rival<select id="pt-n">${['', 'Fácil', 'Igualado', 'Exigente'].map(v => `<option ${v === (p.nivel || '') ? 'selected' : ''} value="${v}">${v || '—'}</option>`).join('')}</select></label>
    <button class="btn full" type="submit">Guardar</button>${id ? '<button class="btn ghost full" type="button" id="pt-del" style="color:var(--bad)">Eliminar partido</button>' : ''}</form>`);
  const recargar = async () => { if (alumnoId) { await cargarFutbolCoach(); } else await cargarFutbol(S.user.id, S.d); cerrarSheet(); render(); };
  $('#pt-del')?.addEventListener('click', async () => { if (!confirm('¿Eliminar este partido?')) return; const { error } = await sb.from('partidos').delete().eq('id', id); if (error) return fallo(error); toast('Partido eliminado'); recargar(); });
  $('#f-pt').addEventListener('submit', async e => {
    e.preventDefault();
    const row = { alumno_id: alumnoId || uidSes(), fecha: $('#pt-f').value, hora: $('#pt-h').value || null, rival: $('#pt-r').value.trim() || null, local: $('#pt-l').value === '1', competicion: $('#pt-c').value.trim() || null, nivel: $('#pt-n').value || null };
    const { error } = id ? await sb.from('partidos').update(row).eq('id', id) : await sb.from('partidos').insert(row);
    if (error) return fallo(error, /partidos/.test(error.message || '') ? 'Falta ejecutar el Bloque 21 en Supabase.' : undefined);
    toast('Partido guardado'); recargar();
  });
}
/* Cuestionarios: diario (carga equipo + sesión LOF + fatiga), partido (antes/durante/después) y lunes (estado tras el fin de semana) */
function formWellness(tipo, f, alumnoId) {
  f = f || hoyISO();
  const D = alumnoId ? { wellness: S.c.wellness.filter(x => x.alumno_id === alumnoId), partidos: S.c.partidos.filter(x => x.alumno_id === alumnoId), sesiones: [], servicio: S.c.servicios.find(x => x.alumno_id === alumnoId) } : S.d;
  const prev = wDe(D.wellness || [], f, tipo), d = prev?.datos || {};
  const sesLof = (D.sesiones || []).find(x => x.fecha === f), pt = (D.partidos || []).find(x => x.fecha === f);
  const q = (t, h) => `<div class="stack" style="gap:6px"><b class="small">${t}</b>${h}</div>`;
  let cuerpo = '';
  if (tipo === 'diario') cuerpo = `
    ${q('¿Has entrenado hoy con el equipo?', `<div class="choice" role="group" id="w-eq">${[['si', 'Sí'], ['no', 'No']].map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${(d.eq_min ? 'si' : prev ? 'no' : '') === v}">${l}</button>`).join('')}</div>
      <div id="w-eq-x" class="stack" style="gap:6px" ${d.eq_min ? '' : 'hidden'}><label class="f">Minutos<input type="number" id="w-eq-min" inputmode="numeric" value="${d.eq_min || 90}"></label><span class="small">¿Cómo de duro ha sido?</span>${escala10('w-eq-rpe', d.eq_rpe, ['1 · Muy suave', '10 · Máximo'])}</div>`)}
    ${q(sesLof ? `Tu sesión de hoy con Jesús${sesLof.duracion_min ? ` (${sesLof.duracion_min} min)` : ''}: ¿cómo de dura?` : '¿Has hecho hoy tu sesión de Jesús? ¿Cómo de dura?', `${escala10('w-lof-rpe', d.lof_rpe, ['1 · Muy suave', '10 · Máximo'])}<label class="f">Minutos de la sesión<input type="number" id="w-lof-min" inputmode="numeric" value="${d.lof_min ?? sesLof?.duracion_min ?? ''}" placeholder="Déjalo vacío si hoy no tocaba"></label>`)}
    ${q('Fatiga general ahora mismo', escala10('w-fat', d.fatiga, ['1 · Fresco', '10 · Destrozado']))}
    ${q('¿Cómo has dormido esta noche?', `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label class="f">Me acosté a las<input type="time" id="w-dormir" value="${esc(d.dormir || '')}"></label><label class="f">Me levanté a las<input type="time" id="w-levantar" value="${esc(d.levantar || '')}"></label></div><span class="small muted">Tu horario objetivo: acostarte a las ${esc(objSueno(D.servicio || S.d?.servicio).dormir)} y levantarte a las ${esc(objSueno(D.servicio || S.d?.servicio).levantar)}.</span>`)}
    ${q('¿Cómo ha ido hoy la alimentación?', `<div class="choice" role="group" id="w-ali">${[['si', 'Cumplida'], ['parcial', 'A medias'], ['no', 'No cumplida']].map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${d.alimentacion === v}">${l}</button>`).join('')}</div>`)}`;
  if (tipo === 'partido') cuerpo = `
    ${pt ? `<p class="small muted">${esc(pt.rival ? 'Contra ' + pt.rival : 'Partido')} · ${esc(fCorta(pt.fecha))}</p>` : ''}
    <label class="f">Minutos jugados<input type="number" id="w-min" inputmode="numeric" value="${d.minutos ?? ''}" placeholder="0 si no jugaste" required></label>
    ${q('¿Cómo te sentías ANTES del partido?', escala10('w-antes', d.antes, ['1 · Muy mal', '10 · Perfecto']))}
    ${q('¿Cómo te sentiste DURANTE el partido?', escala10('w-durante', d.durante, ['1 · Muy mal', '10 · Perfecto']))}
    ${q('¿Cómo te sientes DESPUÉS?', escala10('w-despues', d.despues, ['1 · Muy mal', '10 · Perfecto']))}
    ${q('¿Cómo de duro ha sido el partido?', escala10('w-rpe', d.rpe, ['1 · Muy suave', '10 · Máximo']))}
    ${q('Datos del GPS (opcional)', `<span class="small muted">Sube la captura o el PDF que te dé el club.${(d.gps || []).length ? ` Ya has subido ${d.gps.length} ${d.gps.length === 1 ? 'archivo' : 'archivos'}.` : ''}</span><input type="file" id="w-gps" accept="image/*,application/pdf" multiple>`)}`;
  if (tipo === 'lunes') cuerpo = `
    ${q('Fatiga general hoy', escala10('w-fat', d.fatiga, ['1 · Fresco', '10 · Destrozado']))}
    ${q('Dolor muscular / agujetas', escala10('w-dolor', d.dolor, ['1 · Nada', '10 · Mucho']))}
    ${q('¿Cómo has dormido este fin de semana?', escala10('w-sueno', d.sueno, ['1 · Fatal', '10 · Genial']))}
    <label class="f">¿Cómo es tu semana con el equipo? (días y horarios de entreno, partido…)<textarea id="w-semana" rows="2" placeholder="Ej. entreno L-M-X-J 10:00, viernes libre, partido sábado 18:00">${esc(d.semana || '')}</textarea></label>`;
  if (tipo === 'semana') cuerpo = `
    <p class="small muted">Lo que te haya pasado el club para la semana que viene: días y horarios de entreno, tipo de sesión, día libre y partido. Con escribirla o subir la foto/PDF es suficiente.</p>
    <label class="f">Planificación del equipo<textarea id="w-plan" rows="5" placeholder="Ej. Lunes libre · Martes 10:00 fuerza + táctica · Miércoles 10:00 alta intensidad · Jueves 10:00 · Viernes activación · Sábado partido 18:00">${esc(d.texto || '')}</textarea></label>
    ${q('Foto o PDF de la planificación (opcional)', `${(d.archivos || []).length ? `<span class="small muted">Ya has subido ${d.archivos.length} ${d.archivos.length === 1 ? 'archivo' : 'archivos'}.</span>` : ''}<input type="file" id="w-arch" accept="image/*,application/pdf" multiple>`)}`;
  abrirSheet(`<form class="stack" id="f-w"><h2>${{ diario: 'Check diario', partido: 'Cuestionario del partido', lunes: 'Cuestionario del lunes', semana: 'Planificación de tu equipo' }[tipo]}</h2><span class="small muted">${tipo === 'semana' ? 'Semana del ' + esc(fCorta(sumaDias(f, 1))) + ' al ' + esc(fCorta(sumaDias(f, 7))) : esc(fLarga(f))}</span>
    ${cuerpo}
    ${tipo === 'semana' ? '' : q('¿Alguna molestia? (opcional)', chipsZonas(d.molestias))}
    <label class="f">${tipo === 'lunes' ? '¿Algo que Jesús deba saber para planificar tu semana?' : tipo === 'semana' ? '¿Algo más que deba saber Jesús? (opcional)' : 'Comentario (opcional)'}<textarea id="w-nota" rows="2">${esc(d.nota || d.molestia_txt || '')}</textarea></label>
    <p class="err" id="w-err"></p><button class="btn full" type="submit" id="w-b">Enviar a Jesús</button></form>`);
  const F = $('#f-w');
  F.addEventListener('click', ev => {
    const z = ev.target.closest('[data-zona]'); if (z) z.setAttribute('aria-pressed', z.getAttribute('aria-pressed') !== 'true');
    const al = ev.target.closest('#w-ali [data-v]'); if (al) F.querySelectorAll('#w-ali [data-v]').forEach(x => x.setAttribute('aria-pressed', x === al));
    const c = ev.target.closest('#w-eq [data-v]'); if (c) { F.querySelectorAll('#w-eq [data-v]').forEach(x => x.setAttribute('aria-pressed', x === c)); $('#w-eq-x').hidden = c.dataset.v !== 'si'; }
  });
  F.addEventListener('submit', async e => {
    e.preventDefault();
    const datos = { molestias: [...F.querySelectorAll('[data-zona][aria-pressed="true"]')].map(x => x.dataset.zona), nota: $('#w-nota').value.trim() || null };
    if (tipo === 'diario') {
      const eq = F.querySelector('#w-eq [aria-pressed="true"]')?.dataset.v;
      if (!eq) return $('#w-err').textContent = 'Dime si has entrenado hoy con el equipo.';
      if (eq === 'si') { datos.eq_min = numero($('#w-eq-min').value) || 0; datos.eq_rpe = valEscala('w-eq-rpe'); if (!datos.eq_rpe) return $('#w-err').textContent = 'Indica cómo de duro ha sido el entreno con el equipo.'; }
      datos.lof_rpe = valEscala('w-lof-rpe'); datos.lof_min = datos.lof_rpe ? (numero($('#w-lof-min').value) || 45) : 0;
      datos.fatiga = valEscala('w-fat'); if (!datos.fatiga) return $('#w-err').textContent = 'Indica tu fatiga general.';
      datos.dormir = $('#w-dormir').value || null; datos.levantar = $('#w-levantar').value || null;
      datos.alimentacion = F.querySelector('#w-ali [aria-pressed="true"]')?.dataset.v || null;
    }
    if (tipo === 'partido') {
      Object.assign(datos, { minutos: numero($('#w-min').value) ?? 0, antes: valEscala('w-antes'), durante: valEscala('w-durante'), despues: valEscala('w-despues'), rpe: valEscala('w-rpe'), partido_id: pt?.id || null, gps: d.gps || [] });
      if (!datos.antes || !datos.despues) return $('#w-err').textContent = 'Responde al menos cómo te sentías antes y después.';
      if (!await subirArchivosW($('#w-gps'), datos.gps, `${alumnoId || uidSes()}/${f}`, 'Subiendo GPS…', 'No se ha podido subir el GPS.')) return;
    }
    if (tipo === 'semana') {
      Object.assign(datos, { texto: $('#w-plan').value.trim() || null, archivos: d.archivos || [] });
      if (!datos.texto && !($('#w-arch')?.files || []).length && !datos.archivos.length) return $('#w-err').textContent = 'Escribe la planificación o sube una foto o PDF.';
      if (!await subirArchivosW($('#w-arch'), datos.archivos, `${alumnoId || uidSes()}/semana-${f}`, 'Subiendo…', 'No se ha podido subir el archivo.')) return;
    }
    if (tipo === 'lunes') { Object.assign(datos, { fatiga: valEscala('w-fat'), dolor: valEscala('w-dolor'), sueno: valEscala('w-sueno'), semana: $('#w-semana').value.trim() || null }); if (!datos.fatiga) return $('#w-err').textContent = 'Indica tu fatiga general.'; }
    const btn = $('#w-b'); btn.disabled = true; btn.textContent = 'Enviando…';
    const row = { alumno_id: alumnoId || uidSes(), fecha: f, tipo, datos };
    const r = prev?.id ? await sb.from('wellness').update({ datos }).eq('id', prev.id) : await sb.from('wellness').insert(row);
    if (r.error) { btn.disabled = false; btn.textContent = 'Enviar a Jesús'; return fallo(r.error, /wellness/.test(r.error.message || '') ? 'Falta ejecutar el Bloque 21 en Supabase.' : 'No se ha podido enviar.'); }
    if (pt && tipo === 'partido') await sb.from('partidos').update({ minutos: datos.minutos }).eq('id', pt.id);
    cerrarSheet(); toast('¡Recibido! Gracias'); if (alumnoId) await cargarFutbolCoach(); else await cargarFutbol(S.user.id, S.d); render();
  });
}
/* Sube imágenes (reducidas) o PDF al espacio privado "gps" (carpeta del jugador) y añade las rutas a la lista */
async function subirArchivosW(input, lista, prefijo, txt, msg) {
  const files = [...(input?.files || [])]; if (!files.length) return true;
  const btn = $('#w-b'); btn.disabled = true; btn.textContent = txt;
  try {
    for (const fl of files) {
      const pdf = /pdf/i.test(fl.type), blob = pdf ? fl : await reducirImagen(fl, 1800), ruta = `${prefijo}-${Math.random().toString(36).slice(2, 8)}.${pdf ? 'pdf' : 'jpg'}`;
      const up = await sb.storage.from('gps').upload(ruta, blob, { contentType: pdf ? 'application/pdf' : 'image/jpeg' }); if (up.error) throw up.error;
      lista.push(ruta);
    }
    return true;
  } catch (err) { btn.disabled = false; btn.textContent = 'Enviar a Jesús'; fallo(err, /bucket|not found/i.test(err.message || '') ? 'Falta ejecutar el Bloque 22 en Supabase.' : msg); return false; }
}
/* ---- Sueño: horas y horario respecto al objetivo (±30 min) ---- */
const objSueno = srv => ({ dormir: srv?.sueno_dormir || '23:00', levantar: srv?.sueno_levantar || '08:00' });
const minDe = h => { const [a, b] = String(h || '').split(':').map(Number); return isNaN(a) ? null : a * 60 + (b || 0); };
const horasSueno = (d, l) => { const a = minDe(d), b = minDe(l); if (a == null || b == null) return null; let x = b - a; if (x <= 0) x += 1440; return x / 60; };
const difMin = (a, b) => { const x = Math.abs(minDe(a) - minDe(b)) % 1440; return Math.min(x, 1440 - x); };
function resumenSueno(w, srv, ini, fin) {
  const o = objSueno(srv), meta = horasSueno(o.dormir, o.levantar);
  const dias = w.filter(x => x.tipo === 'diario' && x.fecha >= ini && x.fecha <= fin && x.datos?.dormir && x.datos?.levantar);
  const por = {}; dias.forEach(x => { const h = horasSueno(x.datos.dormir, x.datos.levantar), enH = difMin(x.datos.dormir, o.dormir) <= 30 && difMin(x.datos.levantar, o.levantar) <= 30;
    por[x.fecha] = { h, enH, cls: enH && h >= meta - .5 ? 'ok' : h >= meta - 1 ? 'part' : 'no' }; });
  const hs = Object.values(por).map(x => x.h);
  return { o, meta, por, media: hs.length ? hs.reduce((a, b) => a + b, 0) / hs.length : null, enHorario: Object.values(por).filter(x => x.enH).length, n: hs.length };
}
function resumenAliW(w, ini, fin) {
  const l = w.filter(x => x.tipo === 'diario' && x.fecha >= ini && x.fecha <= fin && x.datos?.alimentacion);
  const por = Object.fromEntries(l.map(x => [x.fecha, x.datos.alimentacion]));
  return { por, pct: l.length ? Math.round(l.reduce((t, x) => t + (x.datos.alimentacion === 'si' ? 1 : x.datos.alimentacion === 'parcial' ? .5 : 0), 0) / l.length * 100) : null };
}
function vSemanaFutbol(ini, w, p) {
  const fin = sumaDias(ini, 6), W = S.d.wellness || [], su = resumenSueno(W, S.d.servicio, ini, fin), al = resumenAliW(W, ini, fin);
  const big = (v, col) => `<b class="num" style="font-family:var(--display);font-size:20px${col ? ';color:var(--' + col + ')' : ''}">${v}</b>`;
  return `<section class="section"><div class="section-head"><h2>Últimos 7 días</h2><span class="small muted">${esc(fCorta(ini))} – ${esc(fCorta(fin))}</span></div><div class="card stack" style="gap:18px">
    <div class="stack" style="gap:8px"><div class="row"><span class="grow small">Entrenamientos completados</span>${big(`${w.entrenos}${p?.dias_semana ? ' / ' + p.dias_semana : ''}`)}</div>${tira(ini, x => w.diasEntreno.has(x) ? 'ok' : '')}</div>
    <div class="stack" style="gap:8px"><div class="row"><span class="grow small">Alimentación cumplida</span>${big(al.pct == null ? '—' : al.pct + ' %', al.pct == null ? '' : al.pct >= 85 ? 'ok' : al.pct >= 60 ? 'warn' : 'bad')}</div>${tira(ini, x => ({ si: 'ok', parcial: 'part', no: 'no' }[al.por[x]] || ''))}</div>
    <div class="stack" style="gap:8px"><div class="row"><span class="grow small">Sueño (media · objetivo ${fmtNum(su.meta)} h)</span>${big(su.media == null ? '—' : fmtNum(su.media) + ' h', su.media == null ? '' : su.media >= su.meta - .5 ? 'ok' : 'warn')}</div>${tira(ini, x => su.por[x]?.cls || '')}
      <div class="small muted">Acostarte ${esc(su.o.dormir)} · levantarte ${esc(su.o.levantar)} → ${su.n ? `en horario ${su.enHorario} de ${su.n} noches` : 'apúntalo en tu check diario'}</div></div>
    ${vDiasSinCheck(W)}
  </div></section>`;
}
/* ---- Lado del coach ---- */
const futDe = aid => ({ w: (S.c.wellness || []).filter(x => x.alumno_id === aid), p: (S.c.partidos || []).filter(x => x.alumno_id === aid) });
function alertasFutbol(aid) {
  const { w } = futDe(aid), out = [], hoy = hoyISO(), dow = (fecha(hoy).getDay() + 6) % 7;
  const uf = ultimaFatiga(w); if (uf && uf.f >= sumaDias(hoy, -1) && uf.v >= 7) out.push(['bad', `Fatiga ${uf.v}/10 (${fCorta(uf.f)})`]);
  molestiasRecientes(w, 3).slice(-1).forEach(m => out.push(['warn', `Molestia: ${m.z.join(', ')}`]));
  const C = cargasSemana(w); if (C.acwr != null && C.acwr > 1.5) out.push(['bad', `Pico de carga (ACWR ${fmtNum(C.acwr)})`]);
  if (dow <= 1 && !wDe(w, sumaDias(hoy, -dow), 'lunes')) out.push(['warn', 'Sin cuestionario del lunes']);
  if (dow <= 1 && !wDe(w, sumaDias(hoy, -dow - 1), 'semana')) out.push(['warn', 'Sin planificación del equipo']);
  return out;
}
function vFutbolCoach() {
  const fut = S.c.perfiles.filter(p => p.activo !== false && S.c.servicios.some(x => x.alumno_id === p.id && x.modulo_futbol));
  if (!fut.length) return '';
  const hoy = hoyISO();
  return `<section class="section"><div class="section-head"><h2>Futbolistas · hoy</h2></div><div class="card tbl" style="overflow-x:auto"><table class="fut-t"><thead><tr><th>Jugador</th><th>Partido</th><th>Fatiga</th><th>Carga 7 d</th><th>ACWR</th><th>Hoy</th></tr></thead><tbody>
    ${fut.map(a => { const { w, p } = futDe(a.id), M = mdDe(p), uf = ultimaFatiga(w), C = cargasSemana(w), [na, ta] = nivelAcwr(C.acwr), hecho = wDe(w, hoy, 'diario') || wDe(w, hoy, 'partido'), mol = molestiasRecientes(w, 3).length;
      return `<tr data-act="ficha" data-id="${a.id}" style="cursor:pointer"><td><b>${esc(a.nombre)}</b>${mol ? ' <span class="pill warn">molestia</span>' : ''}</td><td class="small">${M.md ? `<span class="md-chip sm">${esc(M.md)}</span> ` : ''}${esc(M.prox?.rival || '')}</td><td>${uf ? `<span class="pill ${nivelFat(uf.v)}">${uf.v}/10</span>` : '—'}</td><td class="num">${fmtNum(C.aguda, 0)}</td><td>${C.acwr != null ? `<span class="pill ${na}" title="${ta}">${fmtNum(C.acwr)}</span>` : '—'}</td><td>${hecho ? '<span style="color:var(--ok)">✓</span>' : '<span class="muted">pendiente</span>'}</td></tr>`; }).join('')}
  </tbody></table><p class="note">Carga = minutos × esfuerzo (1-10) del equipo, de tu sesión y del partido. ACWR = carga de los últimos 7 días frente a la media de las últimas 4 semanas: entre 0,8 y 1,3 es la zona óptima; por encima de 1,5, riesgo de lesión.</p></div></section>`;
}
function graficaCarga(w) {
  const dias = [...Array(14)].map((_, i) => sumaDias(hoyISO(), i - 13)), cs = dias.map(f => cargaDia(w, f)), max = Math.max(400, ...cs.map(c => c.total));
  const fat = dias.map(f => { const x = wDe(w, f, 'diario')?.datos?.fatiga ?? wDe(w, f, 'lunes')?.datos?.fatiga; return x ?? null; });
  const W = 320, H = 130, bw = (W - 16) / 14, y = v => 100 - v / max * 90;
  const barras = cs.map((c, i) => { let y0 = 100; return [['eq', 'var(--blue)'], ['lof', 'var(--gold)'], ['pa', 'var(--bad)']].map(([k, col]) => { const h = c[k] / max * 90; y0 -= h; return h ? `<rect x="${8 + i * bw + 3}" y="${y0}" width="${bw - 6}" height="${h}" fill="${col}" rx="2"/>` : ''; }).join(''); }).join('');
  const pts = fat.map((v, i) => v == null ? null : `${8 + i * bw + bw / 2},${100 - v * 9}`).filter(Boolean);
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Carga y fatiga de los últimos 14 días">${barras}${pts.length > 1 ? `<polyline points="${pts.join(' ')}" fill="none" stroke="var(--fg)" stroke-width="1.6" stroke-dasharray="3 3"/>` : ''}${fat.map((v, i) => v == null ? '' : `<circle cx="${8 + i * bw + bw / 2}" cy="${100 - v * 9}" r="3.2" fill="var(--${nivelFat(v) || 'fg'})"/>`).join('')}${dias.map((f, i) => i % 2 ? '' : `<text x="${8 + i * bw + bw / 2}" y="${H - 10}" font-size="9" fill="var(--muted)" text-anchor="middle">${fecha(f).getDate()}/${fecha(f).getMonth() + 1}</text>`).join('')}</svg>
  <div class="row small muted" style="gap:12px;flex-wrap:wrap"><span><i class="ley" style="background:var(--blue)"></i>Equipo</span><span><i class="ley" style="background:var(--gold)"></i>Sesión LOF</span><span><i class="ley" style="background:var(--bad)"></i>Partido</span><span>● Fatiga (1-10)</span></div>`;
}
function botonesArchivos(x) {
  const l = x.datos?.gps?.length ? x.datos.gps : x.datos?.archivos || [], et = x.tipo === 'semana' ? 'Planificación' : 'GPS';
  return l.length ? `<div class="row" style="gap:6px;flex-wrap:wrap;margin-top:4px">${l.map((g, i) => `<button class="pill blue" data-act="verGps" data-r="${esc(g)}">📎 ${et}${l.length > 1 ? ' ' + (i + 1) : ''}${/\.pdf$/.test(g) ? ' (PDF)' : ''}</button>`).join('')}</div>` : '';
}
function resumenW(x) {
  const d = x.datos || {}, m = (d.molestias || []).length ? ` · molestia: ${d.molestias.join(', ')}` : '';
  if (x.tipo === 'diario') return `Fatiga ${d.fatiga ?? '—'}/10${d.dormir && d.levantar ? ` · sueño ${d.dormir}–${d.levantar} (${fmtNum(horasSueno(d.dormir, d.levantar))} h)` : ''}${d.alimentacion ? ` · alimentación ${{ si: 'cumplida', parcial: 'a medias', no: 'no cumplida' }[d.alimentacion]}` : ''} · equipo ${d.eq_min ? `${d.eq_min}′ esfuerzo ${d.eq_rpe}` : 'no'} · sesión ${d.lof_rpe ? `esfuerzo ${d.lof_rpe}` : 'no'}${m}`;
  if (x.tipo === 'partido') return `${d.minutos ?? 0}′ jugados · antes ${d.antes ?? '—'} · durante ${d.durante ?? '—'} · después ${d.despues ?? '—'} · esfuerzo ${d.rpe ?? '—'}${m}`;
  if (x.tipo === 'semana') return `Planificación del equipo${d.texto ? ': ' + d.texto : ''}`;
  return `Fatiga ${d.fatiga ?? '—'}/10 · dolor ${d.dolor ?? '—'} · sueño ${d.sueno ?? '—'}${d.semana ? ' · semana: ' + d.semana : ''}${m}`;
}
function vFutbolFicha(a) {
  const { w, p } = futDe(a.id), M = mdDe(p), C = cargasSemana(w), [na, ta] = nivelAcwr(C.acwr), uf = ultimaFatiga(w);
  const ult = w.slice().sort((x, y) => (y.fecha + y.tipo).localeCompare(x.fecha + x.tipo)).slice(0, 10);
  return `<section class="section"><div class="section-head"><h2>Competición y fatiga</h2><button class="btn sm ghost" data-act="partido" data-al="${a.id}">＋ Partido</button></div>
    <div class="card stack">
      <div class="row"><span class="md-chip">${esc(M.md || '—')}</span><div class="grow"><b>${esc(M.txt)}</b>${M.prox ? `<div class="small muted">${esc(M.prox.rival || 'Partido')} · ${esc(fCorta(M.prox.fecha))}${M.prox.hora ? ' · ' + esc(M.prox.hora) : ''}${M.prox.nivel ? ' · rival ' + esc(M.prox.nivel.toLowerCase()) : ''}</div>` : ''}</div></div>
      <div class="kpis"><div class="kpi"><div class="l">Fatiga</div><b class="num" style="color:var(--${nivelFat(uf?.v) || 'fg'})">${uf ? uf.v + '/10' : '—'}</b></div><div class="kpi"><div class="l">Carga 7 días</div><b class="num">${fmtNum(C.aguda, 0)}</b></div><div class="kpi"><div class="l">ACWR</div><b class="num" style="color:var(--${na || 'fg'})">${C.acwr != null ? fmtNum(C.acwr) : '—'}</b><div class="small muted">${ta}</div></div></div>
      ${(() => { const sw = w.filter(x => x.tipo === 'semana' && x.fecha >= sumaDias(hoyISO(), -8)).sort((a, b) => b.fecha.localeCompare(a.fecha))[0]; return sw ? `<div class="aprox small"><b>Semana del equipo · del ${esc(fCorta(sumaDias(sw.fecha, 1)))} al ${esc(fCorta(sumaDias(sw.fecha, 7)))}</b>${sw.datos?.texto ? `<div class="pre" style="margin-top:4px">${esc(sw.datos.texto)}</div>` : ''}${sw.datos?.nota ? `<div class="muted">"${esc(sw.datos.nota)}"</div>` : ''}${botonesArchivos(sw)}</div>` : ((fecha(hoyISO()).getDay() + 6) % 7 <= 1 ? '<div class="small muted">Aún no ha compartido la planificación de su equipo para esta semana.</div>' : ''); })()}
      ${(() => { const srv = S.c.servicios.find(x => x.alumno_id === a.id), i7 = sumaDias(hoyISO(), -6), su = resumenSueno(w, srv, i7, hoyISO()), al = resumenAliW(w, i7, hoyISO());
        return `<div class="row small" style="gap:14px;flex-wrap:wrap"><span>Sueño 7 d: <b>${su.media == null ? '—' : fmtNum(su.media) + ' h'}</b> (objetivo ${fmtNum(su.meta)} h)</span><span>En horario: <b>${su.n ? su.enHorario + '/' + su.n : '—'}</b></span><span>Alimentación: <b>${al.pct == null ? '—' : al.pct + ' %'}</b></span></div>`; })()}
      <div class="chart">${graficaCarga(w)}</div>
      <div><span class="eyebrow">Últimas respuestas</span>${ult.map(x => `<div class="line" style="align-items:flex-start"><span class="small muted num" style="width:64px;flex:none">${esc(fCorta(x.fecha))}</span><div class="grow small"><b>${{ diario: 'Diario', partido: 'Partido', lunes: 'Lunes', semana: 'Domingo' }[x.tipo]}</b> · ${esc(resumenW(x))}${x.datos?.nota ? `<div class="muted">"${esc(x.datos.nota)}"</div>` : ''}${botonesArchivos(x)}</div></div>`).join('') || '<div class="empty">Aún no ha respondido ningún cuestionario.</div>'}</div>
      ${p.length ? `<details><summary class="small"><b>Partidos (${p.length})</b></summary>${p.slice().reverse().map(x => `<div class="line" data-act="partido" data-al="${a.id}" data-id="${x.id}" style="cursor:pointer"><span class="small num" style="width:64px">${esc(fCorta(x.fecha))}</span><span class="small grow">${esc(x.rival || 'Partido')}${x.competicion ? ' · ' + esc(x.competicion) : ''}${x.minutos != null ? ` · ${x.minutos}′` : ''}</span></div>`).join('')}</details>` : ''}
    </div></section>`;
}
/* ---------- Alumno de prueba: ver una plantilla tal como la vería un alumno, sin cuenta y sin guardar nada ----------
   Mientras dura, las lecturas y escrituras van a una base de datos en memoria (sb.from / sb.storage se sustituyen). */
const UID_PRUEBA = '00000000-0000-4000-8000-0000000000aa';
function baseEnMemoria(seed) {
  const db = JSON.parse(JSON.stringify(seed)), blobs = {}; let nextId = 900000;
  const builder = table => {
    const st = { filtros: [], orden: [], op: 'select', payload: null, single: false, maybe: false, limit: null, conflict: null };
    const api = {
      select() { return api; },
      eq(c, v) { st.filtros.push(r => String(r[c]) === String(v)); return api; },
      neq(c, v) { st.filtros.push(r => String(r[c]) !== String(v)); return api; },
      gte(c, v) { st.filtros.push(r => r[c] != null && r[c] >= v); return api; },
      lte(c, v) { st.filtros.push(r => r[c] != null && r[c] <= v); return api; },
      gt(c, v) { st.filtros.push(r => r[c] != null && r[c] > v); return api; },
      lt(c, v) { st.filtros.push(r => r[c] != null && r[c] < v); return api; },
      in(c, vs) { const set = new Set(vs.map(String)); st.filtros.push(r => set.has(String(r[c]))); return api; },
      is(c, v) { st.filtros.push(r => (r[c] ?? null) === v); return api; },
      order(c, o = {}) { st.orden.push([c, o.ascending !== false]); return api; },
      limit(n) { st.limit = n; return api; },
      maybeSingle() { st.single = true; st.maybe = true; return api; },
      single() { st.single = true; return api; },
      insert(p) { st.op = 'insert'; st.payload = p; return api; },
      upsert(p, o = {}) { st.op = 'upsert'; st.payload = p; st.conflict = o.onConflict ? o.onConflict.split(',') : null; return api; },
      update(p) { st.op = 'update'; st.payload = p; return api; },
      delete() { st.op = 'delete'; return api; },
      then(ok, ko) { return Promise.resolve(run()).then(ok, ko); }
    };
    const fin = out => st.single ? (out.length || st.maybe ? { data: out[0] || null, error: null } : { data: null, error: { message: 'Sin filas' } }) : { data: out, error: null };
    function run() {
      const rows = db[table] || (db[table] = []);
      if (st.op === 'insert' || st.op === 'upsert') {
        const out = (Array.isArray(st.payload) ? st.payload : [st.payload]).map(r => {
          const ya = st.op === 'upsert' && st.conflict && rows.find(x => st.conflict.every(k => String(x[k]) === String(r[k])));
          if (ya) return Object.assign(ya, JSON.parse(JSON.stringify(r)));
          const n = { id: nextId++, creado_at: new Date().toISOString(), ...JSON.parse(JSON.stringify(r)) }; rows.push(n); return n;
        });
        return fin(out);
      }
      let out = rows.filter(r => st.filtros.every(f => f(r)));
      if (st.op === 'update') { out.forEach(r => Object.assign(r, JSON.parse(JSON.stringify(st.payload)))); return fin(out); }
      if (st.op === 'delete') { db[table] = rows.filter(r => !out.includes(r)); return { data: null, error: null }; }
      st.orden.slice().reverse().forEach(([c, asc]) => out = out.slice().sort((a, b) => (a[c] ?? '') < (b[c] ?? '') ? (asc ? -1 : 1) : (a[c] ?? '') > (b[c] ?? '') ? (asc ? 1 : -1) : 0));
      if (st.limit) out = out.slice(0, st.limit);
      return fin(JSON.parse(JSON.stringify(out)));
    }
    return api;
  };
  const storage = { from: () => ({
    upload: async (ruta, blob) => { blobs[ruta] = URL.createObjectURL(blob); return { data: { path: ruta }, error: null }; },
    remove: async () => ({ data: [], error: null }),
    getPublicUrl: ruta => ({ data: { publicUrl: blobs[ruta] || '' } }),
    createSignedUrls: async rutas => ({ data: rutas.map(r => ({ path: r, signedUrl: blobs[r] || null })), error: null })
  }) };
  return { from: builder, storage, rpc: async () => ({ data: null, error: { message: 'No disponible en modo prueba' } }) };
}
async function probarPlantilla(id) {
  const pl = (S.c.plantillas || []).find(p => p.id === id) || {};
  const [pr, met] = await Promise.all([
    conRespaldo(() => sb.from('programas').select(SEL_PROGRAMA).eq('id', id).limit(1), () => sb.from('programas').select(SIN_NUEVAS(SEL_PROGRAMA)).eq('id', id).limit(1)),
    sb.from('metodos').select('nombre,explicacion')
  ]);
  const prog = pr.data?.[0]; if (!prog) return toast('No se ha podido cargar la plantilla');
  if (!(prog.dias || []).length) return toast('La plantilla está vacía: añádele días antes de probarla');
  const hoy = hoyISO(), futbol = /futbol/.test(norm(pl.categoria)), u = UID_PRUEBA, val = valDePlantilla(pl);
  const seed = {
    perfiles: [{ id: u, nombre: 'Alumno de prueba', rol: 'alumno', consentimiento_at: hoy }],
    servicios: [{ id: 1, alumno_id: u, producto: pl.nombre || prog.nombre, inicio: sumaDias(lunesDe(hoy), -7), duracion_semanas: 8, modulo_entreno: true, modulo_nutricion: true, modulo_futbol: futbol, objetivo_pasos: 10000, activo: true }],
    programas: [{ ...prog, alumno_id: u, activo: true }],
    metodos: met.data || [],
    valoraciones: val ? [{ id: 1, alumno_id: u, nombre: val.nombre || 'Test inicial', fecha: hoy, resumen: val.resumen || null, pruebas: val.pruebas.map((p, k) => ({ id: 100 + k, valoracion_id: 1, alumno_id: u, orden: k, tipo: p.tipo, titulo: p.titulo, protocolo: p.protocolo || null, datos: p.datos || [], valoracion: p.valoracion || null, foco: p.foco || null, video_url: p.video_url || null })) }] : [],
    partidos: futbol ? [{ id: 1, alumno_id: u, fecha: sumaDias(hoy, -2), hora: '18:00', rival: 'Rival de prueba', local: true, competicion: 'Liga' }, { id: 2, alumno_id: u, fecha: sumaDias(hoy, 3), hora: '17:00', rival: 'Próximo rival', local: false, competicion: 'Liga', nivel: 'Exigente' }] : []
  };
  stopTimer();
  const fake = baseEnMemoria(seed);
  S.prueba = { id, nombre: pl.nombre || prog.nombre, futbol, guard: { user: S.user, perfil: S.perfil, d: S.d, modo: S.modo, tab: S.tab, ctab: S.ctab, dia: S.dia, sesion: S.sesion, ficha: S.ficha, editor: S.editor, verPlan: S.verPlan } };
  S.prueba.propios = Object.fromEntries(['from', 'rpc', 'storage'].map(k => [k, Object.getOwnPropertyDescriptor(sb, k)]));
  ['from', 'rpc', 'storage'].forEach(k => Object.defineProperty(sb, k, { value: fake[k], configurable: true, writable: true }));
  Object.assign(S, { user: { id: u, email: 'prueba@lof' }, perfil: seed.perfiles[0], modo: 'alumno', tab: 'hoy', dia: null, sesion: null, ficha: null, editor: null, verPlan: null });
  S.perfil.metodologia = 'Modo prueba';
  await cargarAlumno(u); render(); window.scrollTo(0, 0);
}
async function salirPrueba() {
  if (!S.prueba) return;
  stopTimer();
  Object.entries(S.prueba.propios).forEach(([k, d]) => { delete sb[k]; if (d) Object.defineProperty(sb, k, d); });
  const g = S.prueba.guard, id = S.prueba.id; S.prueba = null;
  Object.assign(S, g, { dia: null, sesion: null });
  await cargarCoach();
  if (g.editor?.plantilla) await abrirEditor(null, id); else { S.ctab = 'plantillas'; S.editor = null; S.ficha = null; render(); }
  window.scrollTo(0, 0);
}
function vBannerPrueba() {
  const P = S.prueba;
  return `<div class="prueba-b"><div class="row" style="gap:10px;align-items:flex-start"><div class="grow"><b>Modo prueba · ${esc(P.nombre)}</b><div class="small">Así lo verá tu alumno. Puedes tocarlo todo: nada de lo que hagas se guarda.</div></div><button class="btn sm" data-act="salirPrueba">Salir</button></div>
    ${P.futbol ? `<div class="row small" style="gap:6px;flex-wrap:wrap;margin-top:8px"><span>Probar cuestionarios:</span>${[['diario', 'Diario', hoyISO()], ['partido', 'Partido', sumaDias(hoyISO(), -2)], ['lunes', 'Lunes', hoyISO()], ['semana', 'Domingo', sumaDias(lunesDe(hoyISO()), 6)]].map(([t, l, f]) => `<button class="pill" data-act="wellness" data-t="${t}" data-f="${f}">${l}</button>`).join('')}</div>` : ''}</div>`;
}
/* ---------- Plantillas de programa por tipo de alumno (programas sin alumno asignado; los alumnos no las ven) ---------- */
const CATEGORIAS = ['Futbolistas alto rendimiento', 'Recomposición hombres', 'Recomposición mujeres', 'Salud +55 · lesiones y enfermedades', 'Otras'];
async function cargarPlantillas() {
  const sel = c => () => sb.from('programas').select(c + 'id,nombre,dias_semana,dias(id,numero,nombre,foco,bloques_sesion(id,tipo,ejercicios_sesion(id)))').is('alumno_id', null).order('nombre');
  const r = await conRespaldo(sel('categoria,descripcion,valoracion,'), () => conRespaldo(sel('categoria,descripcion,'), sel('')));
  S.c.plantillas = r.data || []; S.c.plantillasErr = r.error ? r.error.message : null;
  S.c.plantillas.forEach(p => (p.dias || []).sort((a, b) => a.numero - b.numero));
}
const nEjs = p => (p.dias || []).reduce((t, d) => t + d.bloques_sesion.reduce((u, b) => u + (b.tipo === 'fuerza' ? b.ejercicios_sesion.length : 0), 0), 0);
function vPlantillas() {
  const l = S.c.plantillas || [], porCat = c => l.filter(p => (p.categoria || 'Otras') === c || (c === 'Otras' && !CATEGORIAS.includes(p.categoria)));
  return `<section class="stack"><span class="eyebrow">Tu método, listo para asignar</span><h1>Plantillas</h1><p class="small muted">Un programa base por tipo de alumno. Al asignarlo se crea una copia en su perfil que personalizas (pesos, ajustes de máquina, cambios de ejercicio) sin tocar la plantilla. Los alumnos no ven esta sección.</p>
    <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn" data-act="nuevaPlantilla">＋ Nueva plantilla</button></div></section>
  ${CATEGORIAS.map(c => { const ps = porCat(c); if (!ps.length && c === 'Otras') return ''; return `<section class="section"><h2>${esc(c)}</h2>${ps.map(p => `<div class="card stack">
      <div class="row"><div class="grow"><h3>${esc(p.nombre)}</h3><div class="small muted">${(p.dias || []).length} ${(p.dias || []).length === 1 ? 'día' : 'días'} · ${nEjs(p)} ejercicios${p.dias_semana ? ` · ${p.dias_semana} por semana` : ''} · ${resumenValPlantilla(p)}</div></div></div>
      ${(p.dias || []).length ? `<div class="chips">${p.dias.map(d => `<span class="pill">${esc(d.nombre || 'Día ' + d.numero)}${d.foco ? ' · ' + esc(d.foco) : ''}</span>`).join('')}</div>` : '<p class="small muted">Vacía: entra en "Editar" para añadir sus días, o pásame tu Excel y la monto.</p>'}
      <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn sm gold" data-act="probarPlantilla" data-id="${p.id}">👁 Ver como alumno de prueba</button><button class="btn sm" data-act="asignarPlantilla" data-id="${p.id}">Asignar a un alumno</button><button class="btn sm ghost" data-act="valPlantilla" data-id="${p.id}">🩺 Valoración inicial</button><button class="btn sm ghost" data-act="editarPlantilla" data-id="${p.id}">✎ Editar</button><button class="btn sm ghost" data-act="duplicarPlantilla" data-id="${p.id}">Duplicar</button><button class="btn sm ghost" data-act="borrarPlantilla" data-id="${p.id}" style="color:var(--bad)">Eliminar</button></div>
    </div>`).join('') || '<div class="card empty">Aún no hay plantillas de este tipo.</div>'}</section>`; }).join('')}
  ${S.c.plantillasErr ? `<p class="note">Falta ejecutar el Bloque 20 en Supabase para guardar el tipo de alumno de cada plantilla.</p>` : ''}`;
}
const optsPlantillas = sel => CATEGORIAS.map(c => { const ps = (S.c.plantillas || []).filter(p => (p.categoria || 'Otras') === c || (c === 'Otras' && !CATEGORIAS.includes(p.categoria))); return ps.length ? `<optgroup label="${esc(c)}">${ps.map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.nombre)} · ${(p.dias || []).length} días</option>`).join('')}</optgroup>` : ''; }).join('');
async function copiarPrograma(arg) {
  const { data, error } = await sb.rpc('copiar_programa', arg);
  if (error) throw /copiar_programa|function/i.test(error.message || '') ? new Error('Falta ejecutar el Bloque 20 en Supabase.') : error;
  return data;
}
function formNuevaPlantilla() {
  abrirSheet(`<form class="stack" id="f-np"><h2>Nueva plantilla</h2>
    <label class="f">Nombre<input type="text" id="np-n" placeholder="Ej. Futbolistas · pretemporada 4 días" required></label>
    <label class="f">Tipo de alumno<select id="np-c">${CATEGORIAS.map(c => `<option>${esc(c)}</option>`).join('')}</select></label>
    <label class="f">Entrenamientos por semana<input type="number" id="np-d" min="1" max="7" value="3"></label>
    <p class="small muted">Se crea vacía y se abre el editor para añadir días, bloques y ejercicios. También puedes partir del programa de un alumno con "Guardar como plantilla" desde su ficha.</p>
    <button class="btn full" type="submit">Crear y editar</button></form>`);
  $('#f-np').addEventListener('submit', async e => {
    e.preventDefault();
    const row = { alumno_id: null, nombre: $('#np-n').value.trim() || 'Plantilla', dias_semana: numero($('#np-d').value) || 3, activo: true, categoria: $('#np-c').value };
    let r = await sb.from('programas').insert(row).select().single();
    if (r.error && /categoria/.test(r.error.message || '')) { delete row.categoria; r = await sb.from('programas').insert(row).select().single(); }
    if (r.error) return fallo(r.error);
    cerrarSheet(); toast('Plantilla creada'); await cargarPlantillas(); await abrirEditor(null, r.data.id);
  });
}
function formAsignarPlantilla(alumnoId, plantillaId) {
  const als = S.c.perfiles.filter(p => p.activo !== false && p.rol !== 'coach');
  if (!(S.c.plantillas || []).length) return toast('Aún no tienes plantillas');
  const P = alumnoId ? proceso(S.c.servicios.find(x => x.alumno_id === alumnoId)) : null;
  abrirSheet(`<form class="stack" id="f-ap2"><h2>Asignar plantilla</h2>
    ${alumnoId ? `<p class="small">Para <b>${esc((S.c.perfiles.find(p => p.id === alumnoId) || {}).nombre || '')}</b></p>` : `<label class="f">Alumno<select id="as-al" required><option value="">Elige alumno…</option>${als.map(a => `<option value="${a.id}">${esc(a.nombre)}</option>`).join('')}</select></label>`}
    <label class="f">Plantilla<select id="as-p" required>${optsPlantillas(plantillaId)}</select></label>
    <label class="f">Nombre del programa para el alumno<input type="text" id="as-n" placeholder="Ej. Ciclo 1"></label>
    ${P?.ciclos?.length ? `<label class="f">Bloque del proceso<select id="as-c">${P.ciclos.map(c => `<option value="${c.n}" ${c.n === P.ciclo ? 'selected' : ''}>${esc(nomCiclo(c))} · ${esc(fCorta(c.ini))} – ${esc(fCorta(c.fin))}</option>`).join('')}</select></label>` : ''}
    <label class="row small" style="gap:8px"><input type="checkbox" id="as-val" checked style="width:auto"> Crear también su test inicial, si la plantilla lo tiene (los resultados los rellenas tú)</label>
    <label class="row small" style="gap:8px"><input type="checkbox" id="as-act" checked style="width:auto"> Pasa a ser su programa activo (el anterior queda guardado con su historial)</label>
    <p class="err" id="as-err"></p><button class="btn full" type="submit" id="as-b">Asignar y personalizar</button></form>`);
  $('#f-ap2').addEventListener('submit', async e => {
    e.preventDefault();
    const aid = alumnoId || $('#as-al').value; if (!aid) return toast('Elige el alumno');
    const pid = +$('#as-p').value, pl = S.c.plantillas.find(p => p.id === pid), btn = $('#as-b');
    if (!(pl?.dias || []).length && !confirm('Esta plantilla está vacía (sin días). ¿Asignarla igualmente?')) return;
    btn.disabled = true; btn.textContent = 'Copiando…';
    try {
      await copiarPrograma({ origen: pid, destino: aid, nombre_nuevo: $('#as-n').value.trim() || pl?.nombre || 'Programa', categoria_nueva: null, limpiar: false, activar: $('#as-act').checked, ciclo_nuevo: $('#as-c') ? +$('#as-c').value : null });
      const val = valDePlantilla(pl);
      if (val && $('#as-val')?.checked) {
        try { await crearValoracionDesdePlantilla(aid, val); }
        catch (err2) { console.error(err2); toast('Programa asignado, pero no su test inicial: ' + (/valoraciones|pruebas/.test(err2.message || '') ? 'ejecuta el Bloque 7 y el 25 en Supabase' : 'revisa la conexión')); }
      }
      cerrarSheet(); toast('Plantilla asignada: personaliza pesos y ajustes'); await cargarCoach();
      if (S.ficha?.id === aid) { await cargarProgramasFicha(S.ficha); await cargarValoraciones(); }
      await abrirEditor(aid);
    } catch (err) { btn.disabled = false; btn.textContent = 'Asignar y personalizar'; $('#as-err').textContent = err.message || 'No se ha podido asignar.'; console.error(err); }
  });
}
/* ---------- Valoración inicial dentro de la plantilla (se copia como test del alumno al asignarla) ---------- */
const valDePlantilla = p => { const v = p?.valoracion; return v && Array.isArray(v.pruebas) ? v : null; };
const resumenValPlantilla = p => { const v = valDePlantilla(p); return v ? `test inicial con ${v.pruebas.length} ${v.pruebas.length === 1 ? 'prueba' : 'pruebas'}` : 'sin test inicial'; };
const pruebaPlantilla = tipo => { const t = PLANTILLAS[tipo] || PLANTILLAS.otra; return { tipo, titulo: t.titulo, protocolo: t.protocolo || '', datos: t.datos.map(n => t.cols === 'di' ? { nombre: n, d: '', i: '' } : { nombre: n, valor: '' }), valoracion: '', foco: '', video_url: '' }; };
async function crearValoracionDesdePlantilla(aid, val) {
  const { data, error } = await sb.from('valoraciones').insert({ alumno_id: aid, nombre: val.nombre || 'Test inicial', fecha: hoyISO(), resumen: val.resumen || null }).select().single();
  if (error) throw error;
  if (val.pruebas.length) {
    const { error: e2 } = await sb.from('pruebas').insert(val.pruebas.map((p, k) => ({ valoracion_id: data.id, alumno_id: aid, orden: k, tipo: p.tipo, titulo: p.titulo, protocolo: p.protocolo || null, datos: (p.datos || []).map(x => ({ ...x })), valoracion: p.valoracion || null, foco: p.foco || null, video_url: p.video_url || null })));
    if (e2) throw e2;
  }
}
const capturarValPlantilla = () => { const D = S.valPl; D.val.nombre = $('#vp-n')?.value.trim() || D.val.nombre || 'Test inicial'; D.val.resumen = $('#vp-r')?.value.trim() || null; };
function formValPlantilla(progId) {
  const pl = (S.c.plantillas || []).find(p => p.id === progId) || {};
  const base = valDePlantilla(pl) || { nombre: 'Test inicial', resumen: '', pruebas: [] };
  S.valPl = { id: progId, nombre: pl.nombre || '', val: JSON.parse(JSON.stringify(base)) };
  pintarValPlantilla();
}
function pintarValPlantilla() {
  const D = S.valPl, v = D.val;
  abrirSheet(`<form class="stack" id="f-vp"><h2>Valoración inicial</h2>
    <p class="small muted">De <b>${esc(D.nombre)}</b>. Al asignar la plantilla a un alumno, se crea su test inicial con estas pruebas y sus protocolos, con los resultados en blanco para que los rellenes tú.</p>
    <label class="f">Nombre del test<input type="text" id="vp-n" value="${esc(v.nombre || '')}"></label>
    <label class="f">Informe general (plantilla)<textarea id="vp-r" rows="5" placeholder="Qué se observa en la valoración y cómo se interpreta; luego lo editas para cada alumno">${esc(v.resumen || '')}</textarea></label>
    <div class="stack" style="gap:8px"><span class="small"><b>Pruebas</b></span>
      ${v.pruebas.map((p, k) => `<div class="row" style="gap:8px;align-items:center"><div class="grow"><div class="small"><b>${esc(p.titulo)}</b></div><div class="small muted">${(p.datos || []).length} ${(p.datos || []).length === 1 ? 'resultado' : 'resultados'}${p.protocolo ? ' · con protocolo' : ''}</div></div><button type="button" class="btn sm ghost" data-vp-edit="${k}">✎ Editar</button><button type="button" class="btn sm ghost" data-vp-quitar="${k}" style="color:var(--bad)" aria-label="Quitar">✕</button></div>`).join('') || '<p class="small muted">Aún no hay pruebas.</p>'}
    </div>
    <div class="stack" style="gap:6px"><span class="small muted">Añadir prueba</span><div class="chips" style="gap:6px">${Object.entries(PLANTILLAS).map(([k, t]) => `<button type="button" class="pill" data-vp-add="${k}">＋ ${esc(t.titulo)}</button>`).join('')}</div></div>
    <p class="err" id="vp-err"></p>
    <button class="btn full" type="submit" id="vp-b">Guardar valoración de la plantilla</button>
    <button class="btn ghost full" type="button" data-act="cerrarSheet">Cancelar</button></form>`);
  $('#f-vp').addEventListener('click', ev => {
    const t = ev.target.closest('[data-vp-edit],[data-vp-quitar],[data-vp-add]'); if (!t) return;
    if (t.dataset.vpQuitar != null && !confirm('¿Quitar esta prueba de la valoración de la plantilla?')) return;
    capturarValPlantilla();
    if (t.dataset.vpAdd) { D.val.pruebas.push(pruebaPlantilla(t.dataset.vpAdd)); formPruebaPlantilla(D.val.pruebas.length - 1); }
    else if (t.dataset.vpEdit != null) formPruebaPlantilla(+t.dataset.vpEdit);
    else { D.val.pruebas.splice(+t.dataset.vpQuitar, 1); pintarValPlantilla(); }
  });
  $('#f-vp').addEventListener('submit', async ev => {
    ev.preventDefault(); capturarValPlantilla();
    const btn = $('#vp-b'); btn.disabled = true;
    const { error } = await sb.from('programas').update({ valoracion: D.val }).eq('id', D.id).is('alumno_id', null);
    btn.disabled = false;
    if (error) { console.error(error); $('#vp-err').textContent = /valoracion/.test(error.message || '') ? 'Falta ejecutar el Bloque 25 en Supabase para guardar la valoración en las plantillas.' : 'No se ha podido guardar. Revisa la conexión.'; return; }
    cerrarSheet(); S.valPl = null; toast('Valoración de la plantilla guardada'); await cargarPlantillas(); render();
  });
}
function formPruebaPlantilla(k) {
  const D = S.valPl, p = D.val.pruebas[k]; if (!p) return;
  const di = p.tipo === 'descompensacion';
  abrirSheet(`<form class="stack" id="f-prp"><h2>Prueba de la plantilla</h2>
    <label class="f">Título<input type="text" id="pp-t" value="${esc(p.titulo)}"></label>
    <span class="small muted">Los resultados se dejan en blanco para rellenarlos en cada alumno. Si pones valores, aparecen como referencia.</span>
    <div class="stack" id="pp-datos" style="gap:8px">${(p.datos || []).map(x => filaDato(x, di)).join('')}</div>
    <button type="button" class="btn sm ghost" id="pp-add" style="align-self:flex-start">＋ Añadir resultado</button>
    <label class="f">Valoración (texto de referencia)<textarea id="pp-v" rows="3">${esc(p.valoracion || '')}</textarea></label>
    <label class="f">Foco de trabajo (texto de referencia)<textarea id="pp-f" rows="3">${esc(p.foco || '')}</textarea></label>
    <label class="f">Cómo se hace la prueba<textarea id="pp-pr" rows="6">${esc(p.protocolo || '')}</textarea></label>
    <label class="f">Vídeo (opcional)<input type="text" id="pp-vi" value="${esc(p.video_url || '')}" placeholder="https://…"></label>
    <button class="btn full" type="submit">Guardar prueba</button>
    <button class="btn ghost full" type="button" id="pp-volver">← Volver a la valoración</button></form>`);
  const cont = $('#pp-datos');
  cont.addEventListener('click', ev => { const q = ev.target.closest('[data-quitar]'); if (q) q.closest('[data-dato]').remove(); });
  $('#pp-add').addEventListener('click', () => cont.insertAdjacentHTML('beforeend', filaDato({}, di)));
  $('#pp-volver').addEventListener('click', () => pintarValPlantilla());
  $('#f-prp').addEventListener('submit', ev => {
    ev.preventDefault();
    const v = id => $(id).value.trim();
    p.titulo = v('#pp-t') || p.titulo;
    p.datos = [...cont.querySelectorAll('[data-dato]')].map(r => Object.fromEntries([...r.querySelectorAll('[data-k]')].map(i => [i.dataset.k, i.value.trim()]))).filter(x => x.nombre);
    p.valoracion = v('#pp-v'); p.foco = v('#pp-f'); p.protocolo = v('#pp-pr'); p.video_url = v('#pp-vi');
    pintarValPlantilla();
  });
}
function formGuardarPlantilla(progId, duplicar = false) {
  const pl = duplicar ? (S.c.plantillas || []).find(p => p.id === progId) : null, pr = !duplicar ? (S.ficha?.programas || []).find(p => p.id === progId) : null;
  abrirSheet(`<form class="stack" id="f-gp"><h2>${duplicar ? 'Duplicar plantilla' : 'Guardar como plantilla'}</h2>
    <label class="f">Nombre de la plantilla<input type="text" id="gp-n" value="${esc(duplicar ? (pl?.nombre || '') + ' (copia)' : '')}" placeholder="Ej. Recomposición mujeres · 3 días" required></label>
    <label class="f">Tipo de alumno<select id="gp-c">${CATEGORIAS.map(c => `<option ${c === pl?.categoria ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
    ${duplicar ? '' : `<label class="row small" style="gap:8px"><input type="checkbox" id="gp-l" checked style="width:auto"> Quitar los pesos y los ajustes de máquina (son de este alumno)</label><p class="small muted">Se copia <b>${esc(pr?.nombre || 'su programa')}</b> con sus días, bloques, métodos y series. El programa del alumno no cambia.</p>`}
    <p class="err" id="gp-err"></p><button class="btn full" type="submit" id="gp-b">Guardar plantilla</button></form>`);
  $('#f-gp').addEventListener('submit', async e => {
    e.preventDefault(); const btn = $('#gp-b'); btn.disabled = true; btn.textContent = 'Copiando…';
    try {
      await copiarPrograma({ origen: progId, destino: null, nombre_nuevo: $('#gp-n').value.trim() || 'Plantilla', categoria_nueva: $('#gp-c').value, limpiar: !!$('#gp-l')?.checked, activar: true, ciclo_nuevo: null });
      cerrarSheet(); toast('Plantilla guardada'); await cargarPlantillas(); render();
    } catch (err) { btn.disabled = false; btn.textContent = 'Guardar plantilla'; $('#gp-err').textContent = err.message || 'No se ha podido guardar.'; console.error(err); }
  });
}
async function borrarPlantilla(id) {
  const p = (S.c.plantillas || []).find(x => x.id === id);
  if (!confirm(`¿Eliminar la plantilla "${p?.nombre || ''}"? Los alumnos que ya la tienen asignada conservan su copia.`)) return;
  const { error } = await sb.from('programas').delete().eq('id', id).is('alumno_id', null); if (error) return fallo(error);
  toast('Plantilla eliminada'); await cargarPlantillas(); render();
}
/* ---------- Planificación completa del alumno (solo la ve el coach) ---------- */
const APARTADOS = {
  entreno: [['enfoque', 'Enfoque y notas del entrenamiento']],
  alimentacion: [['contexto', 'Informe de su contexto'], ['equivalencias', 'Equivalencias visuales'], ['contextos', 'Contextos metabólicos'], ['menus', 'Menús contextualizados'], ['suplementacion', 'Suplementación'], ['analitica', 'Conclusiones de su analítica']],
  habitos: [['principales', 'Hábitos principales'], ['pasos', 'Pasos'], ['actividad', 'Calorías mínimas diarias de actividad'], ['sueno', 'Sueño']]
};
async function cargarPlanificacion(f) {
  const { data, error } = await sb.from('planificacion').select('*').eq('alumno_id', f.id).order('orden');
  f.planErr = error ? (/planificacion/.test(error.message || '') ? 'Falta ejecutar el Bloque 17 en Supabase para guardar la planificación.' : error.message) : null;
  f.plan = data || [];
  const rutas = [...new Set(f.plan.flatMap(x => x.imagenes || []))];
  f.planImg = f.planImg || {};
  const faltan = rutas.filter(r => !f.planImg[r]);
  if (faltan.length) {
    const r = await sb.storage.from('planificacion').createSignedUrls(faltan, 6 * 3600);
    (r.data || []).forEach(x => { if (x.signedUrl) f.planImg[x.path] = x.signedUrl; });
  }
}
function apartadosDe(f, sec) {
  const l = (f.plan || []).filter(x => x.seccion === sec);
  const base = APARTADOS[sec].map(([k, t], i) => l.find(x => x.clave === k) || { seccion: sec, clave: k, titulo: t, orden: i, vacio: true });
  return [...base, ...l.filter(x => !APARTADOS[sec].some(([k]) => k === x.clave))];
}
function vApartado(f, x, abierto, extra = '') {
  const imgs = (x.imagenes || []).map(r => f.planImg?.[r]).filter(Boolean);
  const vacio = !x.contenido && !imgs.length && !extra;
  return `<details class="plan-ap" ${abierto ? 'open' : ''}><summary><b class="grow">${esc(x.titulo)}</b>${vacio ? '<span class="pill">Sin rellenar</span>' : imgs.length ? `<span class="small muted">${imgs.length} ${imgs.length === 1 ? 'imagen' : 'imágenes'}</span>` : ''}</summary>
    <div class="stack" style="gap:10px;padding-top:8px">${extra}${x.contenido ? `<div class="small pre">${esc(x.contenido)}</div>` : ''}
    ${imgs.length ? `<div class="plan-imgs">${imgs.map(u => `<button class="img" data-act="verImagen" data-src="${esc(u)}" aria-label="Ver imagen"><img src="${esc(u)}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}
    ${vacio ? '<p class="small muted">Aún no has escrito nada aquí.</p>' : ''}
    <button class="btn sm ghost" data-act="editarApartado" data-sec="${x.seccion}" data-k="${esc(x.clave)}" style="align-self:flex-start">✎ ${vacio ? 'Rellenar' : 'Editar'}</button></div></details>`;
}
function vPlanificacion(f, a) {
  const srv = f.srv, P = proceso(srv), og = objetivoDe(f.ruta), obj = objPasos(srv);
  const fF = iso => fecha(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  const extras = { pasos: `<div class="kpis" style="grid-template-columns:1fr"><div class="kpi"><div class="l">Objetivo de pasos en la app</div><b class="num">${fmtNum(obj, 0)} al día</b></div></div>` };
  const sec = (k, t, ico, cuerpo) => `<section class="section"><div class="card stack"><div class="row"><div class="ico gold">${svg(ico)}</div><h2 class="grow" style="margin:0">${t}</h2></div>${cuerpo}</div></section>`;
  return `${f.planErr ? `<div class="aprox small">${esc(f.planErr)}</div>` : ''}
  <section class="section span"><div class="card stack"><span class="eyebrow">Plan de acompañamiento</span><h3>${esc(srv?.producto || 'Sin plan asignado')}</h3>
    <div class="small muted">${[srv?.inicio && 'Inicio ' + fF(srv.inicio), P && !P.sinFin && 'final ' + fF(P.ciclos[P.ciclos.length - 1].fin), srv?.modulo_nutricion && 'con nutrición', srv?.sesiones_incluidas && srv.sesiones_incluidas + ' presenciales'].filter(Boolean).join(' · ')}</div>
    <p class="note">Solo tú ves esta planificación. ${esc((a.nombre || '').split(' ')[0])} no tiene acceso a nada de esta pantalla.</p></div></section>
  <section class="section plan-grupo">${sec('entreno', 'Entrenamiento', 'entreno', `<div class="aprox small"><b>Objetivo del proceso:</b> ${og ? esc(og) : 'sin definir (ponlo en "Editar bloques")'}</div>${apartadosDe(f, 'entreno').map(x => vApartado(f, x, false)).join('')}<button class="linkbtn small" data-act="nuevoApartado" data-sec="entreno">＋ Añadir apartado</button>`)}
  ${vLineaTiempo(srv, 'Bloques de entrenamiento', true, progDeCiclo(f, P))}</section>
  ${sec('alimentacion', 'Alimentación', 'nutri', `${srv?.modulo_nutricion ? '' : '<p class="small muted">Su plan no incluye nutrición, pero puedes guardar aquí lo que quieras.</p>'}${apartadosDe(f, 'alimentacion').map((x, i) => vApartado(f, x, i === 0 && !!x.contenido)).join('')}<button class="linkbtn small" data-act="nuevoApartado" data-sec="alimentacion">＋ Añadir apartado</button>`)}
  ${sec('habitos', 'Hábitos', 'pasos', `${apartadosDe(f, 'habitos').map((x, i) => vApartado(f, x, i === 0 && !!x.contenido, extras[x.clave] || '')).join('')}<button class="linkbtn small" data-act="nuevoApartado" data-sec="habitos">＋ Añadir apartado</button>`)}`;
}
function formApartado(sec, clave) {
  const f = S.ficha, nuevo = !clave, x = nuevo ? { seccion: sec, clave: 'extra-' + Date.now(), titulo: '', imagenes: [], orden: 50 } : apartadosDe(f, sec).find(z => z.clave === clave);
  if (!x) return;
  const fijo = APARTADOS[sec].some(([k]) => k === x.clave);
  abrirSheet(`<form class="stack" id="f-ap"><h2>${nuevo ? 'Nuevo apartado' : esc(x.titulo)}</h2>
    ${fijo ? '' : `<label class="f">Título<input type="text" id="ap-t" value="${esc(x.titulo)}" placeholder="Ej. Pautas para comer fuera" required></label>`}
    <label class="f">Contenido<textarea id="ap-c" rows="10" placeholder="Escribe o pega aquí el texto">${esc(x.contenido || '')}</textarea></label>
    ${(x.imagenes || []).length ? `<div class="stack" style="gap:6px"><span class="small"><b>Imágenes</b> · marca las que quieras quitar</span><div class="plan-imgs">${x.imagenes.map((r, i) => `<label class="plan-q"><img src="${esc(f.planImg?.[r] || '')}" alt=""><span><input type="checkbox" data-quitar="${i}"> Quitar</span></label>`).join('')}</div></div>` : ''}
    <label class="f">Añadir imágenes (menús, equivalencias, tablas…)<input type="file" id="ap-f" accept="image/*" multiple></label>
    <p class="small muted">Las imágenes se guardan en un espacio privado: solo tú puedes verlas.</p>
    <p class="err" id="ap-err"></p><button class="btn full" type="submit" id="ap-b">Guardar</button>
    ${!nuevo && !fijo ? '<button class="btn ghost full" type="button" id="ap-del" style="color:var(--bad)">Eliminar apartado</button>' : ''}</form>`);
  $('#ap-del')?.addEventListener('click', async () => {
    if (!confirm('¿Eliminar este apartado y sus imágenes?')) return;
    if ((x.imagenes || []).length) await sb.storage.from('planificacion').remove(x.imagenes);
    const { error } = await sb.from('planificacion').delete().eq('id', x.id); if (error) return fallo(error);
    cerrarSheet(); toast('Apartado eliminado'); await cargarPlanificacion(f); render();
  });
  $('#f-ap').addEventListener('submit', async e => {
    e.preventDefault(); const btn = $('#ap-b'); btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      const quitar = [...document.querySelectorAll('#f-ap [data-quitar]:checked')].map(c => x.imagenes[+c.dataset.quitar]);
      let imagenes = (x.imagenes || []).filter(r => !quitar.includes(r));
      for (const file of $('#ap-f').files) {
        const blob = await reducirImagen(file, 1600), ruta = `${f.id}/${sec}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
        const up = await sb.storage.from('planificacion').upload(ruta, blob, { contentType: 'image/jpeg' });
        if (up.error) throw up.error;
        imagenes.push(ruta);
      }
      if (quitar.length) await sb.storage.from('planificacion').remove(quitar);
      const fila = { alumno_id: f.id, seccion: sec, clave: x.clave, titulo: fijo ? x.titulo : ($('#ap-t').value.trim() || 'Apartado'), contenido: $('#ap-c').value.trim() || null, imagenes, orden: x.orden ?? 50, actualizado_at: new Date().toISOString() };
      const r = x.id ? await sb.from('planificacion').update(fila).eq('id', x.id) : await sb.from('planificacion').insert(fila);
      if (r.error) throw r.error;
      cerrarSheet(); toast('Guardado'); await cargarPlanificacion(f); render();
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Guardar';
      $('#ap-err').textContent = /planificacion|bucket|not found/i.test(err.message || '') ? 'Falta ejecutar el Bloque 17 en Supabase.' : 'No se ha podido guardar. Revisa la conexión e inténtalo de nuevo.'; console.error(err);
    }
  });
}
/* Vista de solo lectura de un día del programa (lo planificado, sin registrar nada) */
function verPlan(pid, did) {
  const pr = (S.ficha.programas || []).find(p => p.id === pid), dia = pr?.dias.find(d => d.id === did);
  if (!dia) return toast('No se encuentra ese entrenamiento');
  S.verPlan = { pr, dia }; render(); window.scrollTo(0, 0);
}
function vPlanDia() {
  const { pr, dia: d } = S.verPlan, a = S.c.perfiles.find(p => p.id === S.ficha.id) || {}, cont = { n: 0 }, nom = (a.nombre || '').split(' ')[0];
  const c = pr.ciclo ? (proceso(S.ficha.srv)?.ciclos || []).find(x => x.n === pr.ciclo) : null;
  return `<div class="cerrada"><span class="pill blue">Planificado</span><span class="small grow">${esc(pr.nombre)}${c ? ' · ' + esc(nomCiclo(c)) : ''}${pr.activo === false ? ' · bloque anterior' : ''}</span><button class="btn sm" data-act="editarPrograma" data-id="${a.id}">✎ Editar</button></div>
  <section class="stack" style="margin-top:12px"><button class="btn sm ghost" data-act="cerrarPlan" style="align-self:flex-start">← ${S.fichaSub ? 'Entrenamiento' : 'Ficha'} de ${esc(nom)}</button>
    <div class="chips">${pr.dias.map(x => `<button data-act="verPlan" data-p="${pr.id}" data-d="${x.id}" aria-pressed="${x.id === d.id}">${esc(x.nombre)}</button>`).join('')}</div>
    <span class="eyebrow">${esc(a.nombre || '')} · ${esc(d.nombre)}</span><h1>${esc(d.foco || d.nombre)}</h1>
    <div class="card stack"><span class="eyebrow">Objetivo del día</span><div class="small">${esc(d.objetivo || '')}</div>
    <div class="kpis"><div class="kpi"><div class="l">Volumen</div><b>${esc(d.volumen || '—')}</b></div><div class="kpi"><div class="l">Intensidad</div><b>${esc(d.intensidad || '—')}</b></div><div class="kpi"><div class="l">Foco</div><b>${esc(d.foco || '—')}</b></div></div></div></section>
  <section class="section">${vBloquesDia(d, cont, { plan: true })}
  <button class="btn full ghost" data-act="cerrarPlan">Volver</button></section>`;
}
function vRevision(f) {
  const l = f.ses.filter(s => s.fecha >= sumaDias(hoyISO(), -35) && (s.nota_revision || s.nota || s.cansancio || s.poderio));
  if (!l.length) return '';
  const media = k => { const v = l.filter(s => s[k]).map(s => s[k]); return v.length ? fmtNum(v.reduce((a, b) => a + b, 0) / v.length) : '—'; };
  return `<section class="section"><h2>Para la revisión</h2><div class="card stack">
    <div class="kpis" style="grid-template-columns:1fr 1fr"><div class="kpi"><div class="l">Cansancio medio (5 sem.)</div><b class="num">${media('cansancio')} / 5</b></div><div class="kpi"><div class="l">Poderío medio (5 sem.)</div><b class="num">${media('poderio')} / 5</b></div></div>
    ${l.filter(s => s.nota_revision || s.nota).map(s => `<div class="line" style="align-items:flex-start;cursor:pointer" data-act="verSesion" data-id="${s.id}"><span class="small muted num" style="width:64px;flex:none">${esc(fCorta(s.fecha))}</span><div class="grow stack" style="gap:3px">${s.nota_revision ? `<div class="small rev">${esc(s.nota_revision)}</div>` : ''}${s.nota ? `<div class="small muted">Sesión: "${esc(s.nota)}"</div>` : ''}</div></div>`).join('')}
  </div></section>`;
}
function vFotosComida(dl) {
  const lim = sumaDias(hoyISO(), -13), con = dl.filter(r => r.fecha >= lim && (r.fotos || []).length).sort((a, b) => b.fecha.localeCompare(a.fecha));
  if (!con.length) return '';
  pedirFotos(con.flatMap(r => r.fotos));
  return `<section class="section"><h2>Fotos de comidas · 14 días</h2><div class="card stack" style="gap:12px">${con.map(r => `<div class="stack" style="gap:6px"><span class="small muted">${esc(fLarga(r.fecha))}</span><div class="plan-imgs">${miniFotos(r.fotos)}</div></div>`).join('')}</div></section>`;
}
function vFicha() {
  const f = S.ficha, a = S.c.perfiles.find(p => p.id === f.id) || {};
  if (f.cargando) return '<div class="empty">Cargando ficha…</div>';
  if (S.fichaSub) return vFichaSub(f, a);
  const e = estadoAlumno(a), chks = S.c.checkins.filter(k => k.alumno_id === a.id).slice(0, 4);
  const pagos = S.c.pagos.filter(p => p.alumno_id === a.id);
  const srv = f.srv, P = proceso(srv), dpw = f.prog?.dias_semana || 0, hoy = hoyISO(), lunes = lunesDe(hoy), nom = (a.nombre || '').split(' ')[0];
  const src = { sesiones: f.todas.map(x => ({ ...x, alumno_id: a.id })), diario: S.c.diario, checkins: S.c.checkins };
  const cur = semanaDatos(a.id, lunes, src), pre = semanaDatos(a.id, sumaDias(lunes, -7), src);
  const ult7 = sumaDias(hoy, -6), d7 = S.c.diario.filter(r => r.alumno_id === a.id && r.fecha >= ult7 && r.pasos != null), pasos7 = d7.length ? Math.round(d7.reduce((t, r) => t + r.pasos, 0) / d7.length) : null;
  const ing7 = ingestasSemana(S.c.diario.filter(r => r.alumno_id === a.id), ult7, srv), evN = evalNutri(ing7.pct), obj = objPasos(srv);
  const nivelE = dpw ? (cur.entrenos >= dpw ? 'ok' : pre.entrenos >= dpw ? '' : pre.entrenos >= dpw / 2 ? 'warn' : 'bad') : '';
  const tile = (sub, t, v, l1, l2, niv) => `<button class="kpi rep tile ${niv}" data-act="fichaSub" data-s="${sub}"><div class="l">${t} ›</div><b class="num">${v}</b><div class="small muted">${l1}</div>${l2 ? `<div class="small muted">${l2}</div>` : ''}</button>`;
  const fF = iso => fecha(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  return `<section class="stack"><button class="btn sm ghost" data-act="cerrarFicha" style="align-self:flex-start">← Alumnos</button><span class="eyebrow">Ficha del alumno</span><h1>${esc(a.nombre)}</h1>
    <div class="small muted">${esc(a.email)} · alta ${esc(fCorta(a.fecha_alta))}${a.nombre_fiscal ? ' · ' + esc(a.nombre_fiscal) : ''}</div>
    <div class="row" style="flex-wrap:wrap;gap:8px"><button class="btn sm gold" data-act="entrenarAhora" data-id="${a.id}">▶ Entrenar con ${esc(nom)}</button><button class="btn sm" data-act="abrirReporte" data-id="${a.id}">📋 Reporting semanal</button><button class="btn sm ghost" data-act="datosAlumno" data-id="${a.id}">✎ Datos del alumno</button>${a.activo === false ? `<button class="btn sm gold" data-act="reactivarAlumno" data-id="${a.id}">Reactivar</button>` : `<button class="btn sm ghost" data-act="archivarAlumno" data-id="${a.id}">Pasar a antiguos alumnos</button>`}</div>${a.activo === false ? '<div class="aprox small" style="margin-top:10px">Antiguo alumno: no le llegan avisos de seguimiento al coach. Sus datos siguen guardados y puede seguir usando la app. Reactívalo si vuelve a empezar un proceso.</div>' : ''}</section>
  ${e.motivos.length ? `<section class="section"><div class="card stack"><span class="eyebrow">Para revisar</span><div class="small">${esc(e.motivos.join(' · '))}</div></div></section>` : ''}
  <section class="section"><div class="section-head"><h2>Plan</h2><button class="btn sm ghost" data-act="editarServicio">✎ Editar</button></div><div class="card stack">
    <button class="plan-b" data-act="fichaSub" data-s="plan"><div class="grow"><h3>${esc(srv?.producto || 'Sin plan asignado')} <span style="color:var(--blue-text)">›</span></h3><div class="small" style="color:var(--blue-text)">Ver toda su planificación: entrenamiento, alimentación y hábitos</div></div></button>
    <div class="row"><div class="grow"><div class="small muted">${[f.prog && `${esc(f.prog.nombre)}${dpw ? ` · ${dpw} días por semana` : ''}`, srv?.modulo_nutricion && 'con nutrición', (srv?.modulo_presencial || srv?.sesiones_incluidas) && `${srv.sesiones_incluidas || ''} presenciales`.trim()].filter(Boolean).join(' · ') || 'Sin programa'}</div></div>${P && !P.sinFin ? `<b class="num" style="font-family:var(--display);font-size:24px">${P.pctTotal} %</b>` : ''}</div>
    ${P ? `<div class="track gordo"><i style="width:${P.pctTotal}%"></i></div><div class="row small muted"><span class="grow">${P.antes ? 'Empieza' : 'Inicio'} ${esc(fF(srv.inicio))}${!P.antes && !P.fuera ? ` · semana ${P.semana}${P.sinFin ? '' : ' de ' + P.total}` : ''}</span>${P.sinFin ? '' : `<span>Final ${esc(fF(P.ciclos[P.ciclos.length - 1].fin))}</span>`}</div>` : '<p class="small muted">Pon la fecha de inicio y la duración en "Editar".</p>'}
    ${e.control ? `<div class="aprox small row" style="flex-wrap:wrap;gap:8px"><div class="grow"><b>Toca su revisión mensual ${e.control.n}</b> (${esc(fCorta(e.control.fecha))}): llamada o videollamada de 10-15 minutos para ver cómo se siente, sus objetivos y su composición corporal.</div><button class="btn sm gold" data-act="revision" data-n="${e.control.n}">Registrar revisión</button></div>` : ''}
  </div></section>
  ${srv?.modulo_futbol ? vFutbolFicha(a) : ''}
  <section class="section"><h2>Cumplimiento</h2><div class="kpis">
    ${tile('entreno', 'Entrenamiento', dpw ? `${cur.entrenos}/${dpw}` : cur.entrenos, 'esta semana', dpw ? `semana pasada ${pre.entrenos}/${dpw}` : '', nivelE)}
    ${srv?.modulo_nutricion ? tile('alimentacion', 'Alimentación', ing7.pct != null ? ing7.pct + ' %' : '—', ing7.dias ? `${ing7.hechas}/${ing7.total} ingestas` : 'sin registros', evN ? evN[1] + ' · 7 días' : '', evN?.[0] || '') : tile('alimentacion', 'Alimentación', '—', 'sin nutrición', 'contratada', '')}
    ${tile('habitos', 'Hábitos', pasos7 != null ? fmtNum(pasos7, 0) : '—', `pasos de media · 7 días`, `objetivo ${fmtNum(obj, 0)}`, pasos7 == null ? '' : pasos7 >= obj ? 'ok' : pasos7 >= obj * .7 ? 'warn' : 'bad')}
  </div></section>
  <section class="section"><div class="section-head"><h2>Composición corporal</h2><button class="btn sm ghost" data-act="nuevaMedicion">＋ Medición</button></div>
    ${vGraficaComp(f.med.slice().sort((x, y) => x.fecha.localeCompare(y.fecha)), a) || '<div class="card empty">Sin mediciones todavía.</div>'}
    <button class="btn ghost full" data-act="fichaSub" data-s="composicion">Ver todas las medidas y tests ›</button></section>
  ${vBloqueActual(f, a)}
  ${vRevisionesFicha(a)}
  ${vPresenciales(srv, f.pres, true)}
  <section class="section"><h2>Check-ins</h2><div class="card">${chks.map(k => `<div class="line" style="align-items:flex-start"><span class="small muted num" style="width:64px;flex:none">${esc(fCorta(k.semana_inicio))}</span><div class="grow stack" style="gap:4px"><div class="small">Motivación <b>${k.motivacion}/10</b> · implicación <b>${k.implicacion}/10</b></div>${k.dificultades ? `<div class="small"><span class="muted">Dificultades:</span> ${esc(k.dificultades)}</div>` : ''}${(k.proxima_semana_etiquetas || []).length || k.proxima_semana ? `<div class="small"><span class="muted">Semana que viene:</span> ${esc([...(k.proxima_semana_etiquetas || []), k.proxima_semana].filter(Boolean).join(' · '))}</div>` : ''}</div></div>`).join('') || '<div class="empty">Sin check-ins todavía.</div>'}</div></section>
  <section class="section"><div class="section-head"><h2>Plan de pagos</h2><button class="btn sm ghost" data-act="nuevoPago">＋ Cuota</button></div><div class="card">${pagos.map(lineaPago).join('') || '<div class="empty">Sin cuotas registradas.</div>'}</div></section>
  <section class="section"><div class="section-head"><h2>Notas privadas</h2><button class="btn sm ghost" data-act="nuevaNota">＋ Nota</button></div><div class="card">${f.notas.map(n => `<div class="line" style="align-items:flex-start"><span class="small muted num" style="width:64px;flex:none">${esc(fCorta(n.fecha))}</span><div class="small grow">${esc(n.texto)}</div></div>`).join('') || '<div class="empty">Solo tú ves estas notas.</div>'}</div></section>`;
}
/* Sub-pantallas de la ficha: entrenamiento, alimentación, hábitos y composición */
async function abrirSub(sub) {
  const f = S.ficha; S.fichaSub = sub; render(); window.scrollTo(0, 0);
  const tareas = [];
  if (sub === 'entreno' && !f.programas) tareas.push(cargarProgramasFicha(f));
  if ((sub === 'habitos' || sub === 'alimentacion') && !f.diarioLargo) tareas.push(sb.from('registro_diario').select('*').eq('alumno_id', f.id).gte('fecha', sumaDias(hoyISO(), -55)).then(r => { f.diarioLargo = (r.data || []).sort((a, b) => b.fecha.localeCompare(a.fecha)); }));
  if (sub === 'plan' || sub === 'alimentacion') { tareas.push(cargarPlanificacion(f)); if (!f.programas) tareas.push(cargarProgramasFicha(f)); }
  if (sub === 'alimentacion' && f.planNutri === undefined) tareas.push(sb.from('planes_nutricion').select('*').eq('alumno_id', f.id).limit(1).then(r => { f.planNutri = r.data?.[0] || null; }));
  if (tareas.length) { await Promise.all(tareas); if (S.fichaSub === sub) render(); }
}
function vFichaSub(f, a) {
  const sub = S.fichaSub, srv = f.srv, nom = (a.nombre || '').split(' ')[0], hoy = hoyISO(), lunes = lunesDe(hoy);
  const cab = t => `<section class="stack"><button class="btn sm ghost" data-act="cerrarSub" style="align-self:flex-start">← Ficha de ${esc(nom)}</button><span class="eyebrow">${esc(a.nombre)}</span><h1>${t}</h1></section>`;
  if (sub === 'entreno') {
    const dpw = f.prog?.dias_semana || 0, P = proceso(srv), linea = s2 => `<div class="line" data-act="verSesion" data-id="${s2.id}" style="cursor:pointer"><span class="small muted num" style="width:64px;flex:none">${esc(fCorta(s2.fecha))}</span><div class="grow"><div class="small"><b>${esc(s2.dias?.nombre || '')}</b> · ${esc(s2.dias?.foco || '')} · ${(s2.registros_series || []).length} series${s2.duracion_min ? ` · ${s2.duracion_min} min` : ''}${s2.cansancio ? ` · cansancio ${s2.cansancio}/5` : ''}${(s2.omitidos || []).length ? ` · ${s2.omitidos.length} no realizado${s2.omitidos.length > 1 ? 's' : ''}` : ''}</div>${s2.nota ? `<div class="small muted">"${esc(s2.nota)}"</div>` : ''}</div><span class="small" style="color:var(--blue-text)">›</span></div>`;
    const semana = f.ses.filter(x => x.fecha >= lunes), bloque = P && !P.antes ? f.ses.filter(x => x.fecha >= P.cc.ini && x.fecha <= P.cc.fin && x.fecha < lunes) : [];
    const unicas = l => new Set(l.map(x => x.fecha + x.dia_id)).size, mes = unicas(f.todas.filter(x => x.fecha >= sumaDias(hoy, -27)));
    return cab('Entrenamiento') + `
    <section class="section"><div class="section-head"><h2>Programa</h2><button class="btn sm" data-act="editarPrograma" data-id="${a.id}">${f.prog ? '✎ Editar programa' : 'Crear programa'}</button></div><div class="card small">${f.prog ? `<b>${esc(f.prog.nombre)}</b> · ${dpw || '—'} días por semana` : 'Aún no tiene programa.'}</div></section>
    <section class="section"><h2>Esta semana</h2><div class="card">${dpw ? barra('Entrenos de la semana', unicas(semana), dpw, '') + barra('Últimas 4 semanas', mes, dpw * 4, '') : ''}${semana.map(linea).join('') || '<div class="empty">Aún no ha entrenado esta semana.</div>'}</div></section>
    ${P && !P.antes ? `<section class="section"><h2>Resto del bloque · ${esc(nomCiclo(P.cc))}</h2><div class="card">${bloque.map(linea).join('') || '<div class="empty">Sin entrenamientos anteriores en este bloque.</div>'}</div></section>` : ''}
    ${vLineaTiempo(srv, 'Ciclos de entrenamiento', true, progDeCiclo(f, P))}
    <section class="section"><div class="card stack chart"><h3>Entrenamientos por semana</h3>${barrasSemanas(f.todas, dpw)}</div></section>
    ${vRevision(f)}
    <section class="section"><h2>Todos los entrenamientos</h2><div class="card">${f.ses.map(linea).join('') || '<div class="empty">Sin entrenamientos registrados.</div>'}</div></section>`;
  }
  if (sub === 'plan') return cab('Planificación') + vPlanificacion(f, a);
  if (sub === 'alimentacion') {
    const dl = f.diarioLargo || [], n = comidasDia(srv), sems = [0, 1, 2, 3].map(k => sumaDias(lunes, -7 * k)), pn = f.planNutri;
    const chk = S.c.checkins.filter(k => k.alumno_id === a.id && k.nota_alimentacion);
    return cab('Alimentación') + `
    <section class="section"><button class="card reporte-b" data-act="fichaSub" data-s="plan"><div class="ico gold">${svg('checkin')}</div><div class="grow" style="text-align:left"><b>Su plan de alimentación</b><div class="small muted">Informe de su contexto, equivalencias, contextos metabólicos, menús y suplementación</div></div><span class="small" style="color:var(--blue-text)">Abrir ›</span></button></section>
    <section class="section"><div class="section-head"><h2>Cumplimiento por ingestas</h2><button class="btn sm ghost" data-act="editarComidas">${n} ingestas/día · cambiar</button></div><div class="card">
      ${sems.map(l => { const I = ingestasSemana(dl, l, srv), ev = evalNutri(I.pct); return `<div class="line"><span class="small muted" style="width:96px;flex:none">${esc(fCorta(l))} – ${esc(fCorta(sumaDias(l, 6)))}</span><div class="grow small">${I.hechas} de ${I.total} ingestas${I.dias < 7 ? ` · ${I.dias} días registrados` : ''}</div>${ev ? `<span class="pill ${ev[0]}">${I.pct} % · ${ev[1]}</span>` : '<span class="small muted">sin datos</span>'}</div>`; }).join('')}
      <p class="note">Bien: 85 % o más de las ingestas de la semana. Regular: entre 60 y 85 %. Mal: por debajo del 60 %.</p></div></section>
    ${vFotosComida(dl)}<section class="section"><h2>Día a día</h2><div class="card tbl"><table><thead><tr><th>Día</th><th>Ingestas</th><th>Observación</th></tr></thead><tbody>${dl.slice(0, 21).map(r => `<tr><td>${esc(fCorta(r.fecha))}</td><td class="num">${r.ingestas == null ? '—' : `${r.ingestas}/${n}`}</td><td class="small">${esc(r.observacion || '')}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">Sin registros.</td></tr>'}</tbody></table></div></section>
    ${chk.length ? `<section class="section"><h2>Lo que cuenta en sus check-ins</h2><div class="card">${chk.slice(0, 6).map(k => `<div class="line" style="align-items:flex-start"><span class="small muted num" style="width:64px;flex:none">${esc(fCorta(k.semana_inicio))}</span><div class="small grow">${esc(k.nota_alimentacion)}</div></div>`).join('')}</div></section>` : ''}`;
  }
  if (sub === 'habitos') {
    const dl = f.diarioLargo || [], obj = objPasos(srv), sems = [0, 1, 2, 3, 4, 5].map(k => sumaDias(lunes, -7 * k));
    return cab('Hábitos') + `
    <section class="section"><div class="section-head"><h2>Pasos diarios</h2><button class="btn sm ghost" data-act="editarServicio">Objetivo: ${fmtNum(obj, 0)} · cambiar</button></div><div class="card">
      ${sems.map(l => { const v = dl.filter(r => r.fecha >= l && r.fecha <= sumaDias(l, 6) && r.pasos != null), m = v.length ? Math.round(v.reduce((t, r) => t + r.pasos, 0) / v.length) : null, ok = v.filter(r => r.pasos >= obj).length; return `<div class="line"><span class="small muted" style="width:96px;flex:none">${esc(fCorta(l))} – ${esc(fCorta(sumaDias(l, 6)))}</span><div class="grow small">${m == null ? 'Sin registros' : `Media ${fmtNum(m, 0)} · ${ok} de ${v.length} días en objetivo`}</div>${m == null ? '' : `<span class="pill ${m >= obj ? 'ok' : m >= obj * .7 ? 'warn' : 'bad'}">${Math.round(m / obj * 100)} %</span>`}</div>`; }).join('')}</div></section>
    <section class="section"><h2>Día a día</h2><div class="card tbl"><table><thead><tr><th>Día</th><th>Pasos</th><th>Observación</th></tr></thead><tbody>${dl.slice(0, 28).map(r => `<tr><td>${esc(fCorta(r.fecha))}</td><td class="num" style="color:${r.pasos == null ? 'inherit' : r.pasos >= obj ? 'var(--ok)' : 'var(--warn)'}">${r.pasos == null ? '—' : fmtNum(r.pasos, 0)}</td><td class="small">${esc(r.observacion || '')}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">Sin registros.</td></tr>'}</tbody></table></div></section>`;
  }
  if (sub === 'composicion') {
    const med = f.med.slice().sort((x, y) => x.fecha.localeCompare(y.fecha));
    const campos = [['peso', 'Peso (kg)'], ['grasa_pct', '% grasa'], ['grasa_kg', 'Grasa (kg)'], ['cuello', 'Cuello'], ['pectoral', 'Pectoral'], ['hombros', 'Hombros'], ['cintura', 'Cintura'], ['abd_bajo', 'Abdomen bajo'], ['cadera', 'Cadera'], ['brazo_d', 'Brazo dcho.'], ['brazo_i', 'Brazo izdo.'], ['muslo_d', 'Muslo dcho.'], ['muslo_i', 'Muslo izdo.'], ['gemelo_d', 'Gemelo dcho.'], ['gemelo_i', 'Gemelo izdo.']].filter(([k]) => med.some(m => m[k] != null));
    return cab('Composición corporal') + `
    <section class="section">${vGraficaComp(med, a) || '<div class="card empty">Sin mediciones todavía.</div>'}<div class="row" style="gap:8px"><button class="btn grow" data-act="nuevaMedicion">＋ Añadir medición</button><button class="btn ghost" data-act="calcGrasa">Calculadora</button></div></section>
    ${med.length ? `<section class="section"><h2>Todas las medidas</h2><div class="card tbl" style="overflow-x:auto"><table><thead><tr><th>Medida</th>${med.map(m => `<th class="num">${esc(fCorta(m.fecha))} ${String(fecha(m.fecha).getFullYear()).slice(2)}</th>`).join('')}<th>Cambio</th></tr></thead><tbody>${campos.map(([k, l]) => { const v = med.filter(m => m[k] != null), dl = v.length > 1 ? v[v.length - 1][k] - v[0][k] : null; return `<tr><td>${l}</td>${med.map(m => `<td class="num">${m[k] == null ? '—' : fmtNum(m[k])}</td>`).join('')}<td class="num"><b>${dl == null ? '—' : (dl > 0 ? '+' : '') + fmtNum(dl)}</b></td></tr>`; }).join('')}</tbody></table></div><p class="small muted">Perímetros en cm.</p></section>` : ''}
    ${vTestsFicha(f)}`;
  }
  S.fichaSub = null; return vFicha();
}
function formComidas() {
  const srv = S.ficha.srv; if (!srv?.id) return toast('Primero asigna un plan en "Editar"');
  abrirSheet(`<form class="stack" id="f-com"><h2>Ingestas al día</h2><p class="small">Cuántas comidas tiene su plan cada día. La semana se valora sobre el total (por ejemplo, 3 al día = 21 ingestas).</p><label class="f">Ingestas al día<input type="number" id="com-n" min="1" max="8" value="${comidasDia(srv)}"></label><button class="btn full" type="submit">Guardar</button></form>`);
  $('#f-com').addEventListener('submit', async e => { e.preventDefault(); const n = Math.max(1, Math.min(8, +$('#com-n').value || 3)); const { error } = await sb.from('servicios').update({ comidas_dia: n }).eq('id', srv.id); if (error) return fallo(error, 'Falta ejecutar el Bloque 11 en Supabase.'); srv.comidas_dia = n; const s2 = S.c.servicios.find(x => x.id === srv.id); if (s2) s2.comidas_dia = n; cerrarSheet(); toast('Guardado'); render(); });
}
async function verSesion(id) {
  const ses = S.ficha.ses.find(x => x.id === id);
  if (!ses?.dia_id) return verSesionLista(id);
  toast('Abriendo entrenamiento…');
  if (!S.ficha.programas) {
    const { data } = await conRespaldo(() => sb.from('programas').select(SEL_PROGRAMA).eq('alumno_id', S.ficha.id),
      () => sb.from('programas').select(SIN_NUEVAS(SEL_PROGRAMA)).eq('alumno_id', S.ficha.id));
    S.ficha.programas = data || [];
  }
  const dia = S.ficha.programas.flatMap(p => p.dias || []).find(d => d.id === ses.dia_id);
  if (!dia) return verSesionLista(id);
  ordenarDia(dia);
  const ant = S.ficha.ses.filter(x => x.dia_id === ses.dia_id && x.fecha < ses.fecha && x.registros_series.length).sort((x, y) => y.fecha.localeCompare(x.fecha))[0];
  const ids = [id, ant?.id].filter(Boolean);
  const { data, error } = await conRespaldo(() => sb.from('registros_series').select('sesion_id,ejercicio_sesion_id,serie,tramo,kg,repeticiones,rir').in('sesion_id', ids),
    () => sb.from('registros_series').select('sesion_id,ejercicio_sesion_id,serie,kg,repeticiones,rir').in('sesion_id', ids));
  if (error) return fallo(error, 'No se ha podido cargar la sesión.');
  const esIds = new Set(dia.bloques_sesion.flatMap(b => b.ejercicios_sesion.map(e => e.id)));
  const valores = {}, antM = {}, huerfanas = [];
  (data || []).forEach(r => {
    const k = `${r.ejercicio_sesion_id}-${r.serie}-${(r.tramo || 1) - 1}`;
    if (r.sesion_id === id) { if (esIds.has(r.ejercicio_sesion_id)) valores[k] = r; else huerfanas.push(r); }
    else antM[k] = r;
  });
  S.verSes = { ses, dia, valores, ant: antM, antFecha: ant?.fecha, huerfanas };
  render(); window.scrollTo(0, 0);
}
async function verSesionLista(id) {
  const { data, error } = await sb.from('registros_series').select('serie,kg,repeticiones,rir,ejercicios_sesion(orden,ejercicios(nombre),bloques_sesion(letra))').eq('sesion_id', id).order('serie');
  if (error) return fallo(error, 'No se ha podido cargar la sesión.');
  const g = {};
  (data || []).forEach(r => { const es = r.ejercicios_sesion, k = `${es?.bloques_sesion?.letra || ''}${String(es?.orden || 0).padStart(2, '0')}`; (g[k] ||= { n: es?.ejercicios?.nombre || 'Ejercicio', s: [] }).s.push(r); });
  abrirSheet(`<div class="stack"><h2>Series registradas</h2>${Object.keys(g).sort().map(k => `<div class="stack" style="gap:4px"><h3>${esc(g[k].n)}</h3>${g[k].s.map(r => `<div class="small num">Serie ${r.serie}: ${r.kg == null ? '—' : fmtNum(r.kg, 2) + ' kg'} × ${r.repeticiones ?? '—'} rep · RIR ${r.rir ?? '—'}</div>`).join('')}</div>`).join('') || '<p class="muted">No hay series registradas.</p>'}<button class="btn ghost full" data-act="cerrarSheet">Cerrar</button></div>`);
}
/* El alumno online se mide él mismo una vez al mes */
const MEDIDAS_ALUMNO = [['cuello', 'Cuello', 'incluida la nuez'], ['cintura', 'Cintura', 'bajo la última costilla'], ['abd_bajo', 'Abdomen bajo', 'a la altura del ombligo'], ['cadera', 'Cadera', 'parte más ancha del glúteo'], ['muslo_d', 'Muslo derecho', 'parte más ancha'], ['muslo_i', 'Muslo izquierdo', 'parte más ancha'], ['gemelo_d', 'Gemelo derecho', 'parte más ancha'], ['gemelo_i', 'Gemelo izquierdo', 'parte más ancha'], ['hombros', 'Anchura de hombros', 'medición más ancha'], ['brazo_d', 'Brazo contraído', 'parte más ancha']];
/* Una medición por alumno y día: si ya existe ese día, se actualiza en vez de duplicarla */
async function guardarMedicion(row) {
  const { data: ya, error: e0 } = await sb.from('mediciones').select('id').eq('alumno_id', row.alumno_id).eq('fecha', row.fecha)
    .or('es_objetivo.is.null,es_objetivo.eq.false').order('id').limit(1);
  if (e0) return { error: e0 };
  if (ya?.length) { const { alumno_id, fecha, ...resto } = row; return sb.from('mediciones').update(resto).eq('id', ya[0].id); }
  return sb.from('mediciones').insert(row);
}
function formMisMedidas() {
  abrirSheet(`<form class="stack" id="f-mm"><h2>Mis medidas</h2><p class="small">Mídete con una cinta métrica, en cm, a primera hora y antes de comer. Deja vacío lo que no puedas medir.</p>
    <label class="f">Fecha<input type="date" id="mm-f" value="${hoyISO()}" max="${hoyISO()}"></label>
    ${camposPerfil(S.perfil)}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${MEDIDAS_ALUMNO.map(([k, l, h]) => `<label class="f">${l} <span class="muted" style="font-weight:400">· ${h}</span><input type="text" inputmode="decimal" data-campo="${k}" placeholder="cm"></label>`).join('')}</div>
    <label class="f">Peso (si tienes báscula)<input type="text" inputmode="decimal" data-campo="peso" placeholder="kg"></label>
    <div class="calc-grasa card" style="padding:12px"></div>
    <button class="btn full" type="submit">Guardar mis medidas</button></form>`);
  enganchaCalcGrasa($('#f-mm'), S.perfil);
  $('#f-mm').addEventListener('submit', async e => {
    e.preventDefault();
    const bt = $('#f-mm [type=submit]'); if (bt.disabled) return; bt.disabled = true;
    const row = { alumno_id: S.user.id, fecha: $('#mm-f').value || hoyISO() };
    document.querySelectorAll('#f-mm [data-campo]').forEach(i => { const v = numero(i.value); if (v != null) row[i.dataset.campo] = v; });
    if (Object.keys(row).length < 3) { bt.disabled = false; return toast('Escribe al menos una medida'); }
    await guardarDatosPerfil($('#f-mm'), S.user.id, S.perfil);
    const fm = $('#f-mm'); if (fm.dataset.grasaPct) { row.grasa_pct = +fm.dataset.grasaPct; if (fm.dataset.grasaKg) row.grasa_kg = +fm.dataset.grasaKg; }
    const { error } = await guardarMedicion(row);
    if (error) { bt.disabled = false; return fallo(error, /row-level|policy/.test(error.message || '') ? 'Falta ejecutar el Bloque 12 en Supabase.' : undefined); }
    cerrarSheet(); toast('Medidas guardadas. ¡Gracias!'); await cargarAlumno(S.user.id); render();
  });
}
function formMedicion() {
  const per = S.c.perfiles.find(p => p.id === S.ficha.id) || {};
  const c = [['peso', 'Peso (kg)'], ['cuello', 'Cuello'], ['cintura', 'Cintura'], ['cadera', 'Cadera'], ['abd_bajo', 'Abdomen bajo'], ['pectoral', 'Pectoral'], ['hombros', 'Hombros'], ['brazo_d', 'Brazo contraído dcho.'], ['brazo_i', 'Brazo contraído izdo.'], ['muslo_d', 'Muslo dcho.'], ['muslo_i', 'Muslo izdo.'], ['gemelo_d', 'Gemelo dcho.'], ['gemelo_i', 'Gemelo izdo.']];
  abrirSheet(`<form class="stack" id="f-med"><h2>Nueva medición</h2><label class="f">Fecha<input type="date" id="m-fecha" value="${hoyISO()}"></label>
    ${camposPerfil(per)}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${c.map(([k, l]) => `<label class="f">${l}<input type="text" inputmode="decimal" id="m-${k}" data-campo="${k}"></label>`).join('')}</div>
    <div class="calc-grasa card" style="padding:12px"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label class="f">% de grasa<input type="text" inputmode="decimal" id="m-grasa_pct" data-campo="grasa_pct" placeholder="se calcula solo"></label><label class="f">Grasa (kg)<input type="text" inputmode="decimal" id="m-grasa_kg" data-campo="grasa_kg" placeholder="se calcula solo"></label></div>
    <p class="small muted">Perímetros en cm. Deja vacío lo que no midas. Si usas báscula de bioimpedancia, puedes escribir su % de grasa encima del calculado.</p><button class="btn full" type="submit">Guardar medición</button></form>`);
  const fm = $('#f-med'); let manual = false;
  fm.querySelector('#m-grasa_pct').addEventListener('input', () => { manual = true; });
  enganchaCalcGrasa(fm, per, (pct, peso) => { if (manual) return; fm.querySelector('#m-grasa_pct').value = pct != null ? String(pct).replace('.', ',') : ''; fm.querySelector('#m-grasa_kg').value = pct != null && peso ? String(Math.round(peso * pct) / 100).replace('.', ',') : ''; });
  fm.addEventListener('submit', async e => {
    e.preventDefault();
    const bt = fm.querySelector('[type=submit]'); if (bt.disabled) return; bt.disabled = true;
    await guardarDatosPerfil(fm, S.ficha.id, per);
    const row = { alumno_id: S.ficha.id, fecha: $('#m-fecha').value };
    fm.querySelectorAll('[data-campo]').forEach(i => { const v = numero(i.value); if (v != null) row[i.dataset.campo] = v; });
    if (row.grasa_pct != null && row.grasa_kg == null && row.peso) row.grasa_kg = Math.round(row.peso * row.grasa_pct) / 100;
    const { error } = await guardarMedicion(row);
    if (error) { bt.disabled = false; return fallo(error); }
    cerrarSheet(); toast('Medición guardada'); await abrirFicha(S.ficha.id); abrirSub('composicion');
  });
}
/* Datos del alumno: nombre visible, nombre completo para facturas, NIF y datos físicos */
function formDatosAlumno(id) {
  const a = S.c.perfiles.find(p => p.id === id); if (!a) return;
  abrirSheet(`<form class="stack" id="f-da"><h2>Datos del alumno</h2>
    <label class="f">Nombre en la app<input type="text" data-k="nombre" value="${esc(a.nombre || '')}" placeholder="Ej. Carmen Sánchez" required></label>
    <p class="small muted">Es el nombre que verás en tus listas. Pon nombre y primer apellido para no confundir a dos alumnos con el mismo nombre.</p>
    <label class="f">Nombre completo (para facturas)<input type="text" data-k="nombre_fiscal" value="${esc(a.nombre_fiscal || '')}" placeholder="Como aparece en su DNI"></label>
    <label class="f">NIF / NIE<input type="text" data-k="nif" value="${esc(a.nif || '')}"></label>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px"><label class="f">Sexo<select data-k="sexo"><option value="">—</option><option value="mujer" ${a.sexo === 'mujer' ? 'selected' : ''}>Mujer</option><option value="hombre" ${a.sexo === 'hombre' ? 'selected' : ''}>Hombre</option></select></label>
    <label class="f">Estatura (cm)<input type="text" inputmode="decimal" data-k="estatura_cm" value="${a.estatura_cm || ''}"></label><label class="f">Nacimiento<input type="date" data-k="fecha_nacimiento" value="${a.fecha_nacimiento || ''}"></label></div>
    <p class="small muted">Email de acceso: ${esc(a.email || '')}</p>
    <button class="btn full" type="submit">Guardar</button></form>`);
  $('#f-da').addEventListener('submit', async e => {
    e.preventDefault();
    const upd = {}; document.querySelectorAll('#f-da [data-k]').forEach(i => { const k = i.dataset.k; upd[k] = k === 'estatura_cm' ? numero(i.value) : (i.value.trim() || null); });
    if (!upd.nombre) return toast('El nombre no puede quedar vacío');
    let { error } = await sb.from('perfiles').update(upd).eq('id', id);
    if (error && /column/.test(error.message || '')) { ({ error } = await sb.from('perfiles').update({ nombre: upd.nombre }).eq('id', id)); if (!error) toast('Nombre guardado. Para el resto de datos ejecuta los Bloques 11 y 13'); }
    if (error) return fallo(error);
    Object.assign(a, upd); if (id === S.user.id) Object.assign(S.perfil, upd);
    cerrarSheet(); toast('Datos guardados'); render();
  });
}
/* Calculadora suelta (sin guardar), como la de Fit Generation */
function formCalculadoraGrasa() {
  abrirSheet(`<form class="stack" id="f-cg"><h2>Calculadora de % de grasa</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label class="f">Sexo<select data-perfil="sexo"><option value="mujer">Mujer</option><option value="hombre">Hombre</option></select></label><label class="f">Fecha de nacimiento<input type="date" data-perfil="fecha_nacimiento"></label>
    <label class="f">Estatura (cm)<input type="text" inputmode="decimal" data-perfil="estatura_cm"></label><label class="f">Peso (kg)<input type="text" inputmode="decimal" data-campo="peso"></label>
    <label class="f">Cuello (cm)<input type="text" inputmode="decimal" data-campo="cuello"></label><label class="f">Cintura (cm)<input type="text" inputmode="decimal" data-campo="cintura"></label>
    <label class="f">Cadera (cm, mujeres)<input type="text" inputmode="decimal" data-campo="cadera"></label></div>
    <div class="calc-grasa card" style="padding:12px"></div><button class="btn ghost full" type="button" data-act="cerrarSheet">Cerrar</button></form>`);
  enganchaCalcGrasa($('#f-cg'), {});
}
function formPago(alumnoId) {
  const als = S.c.perfiles;
  abrirSheet(`<form class="stack" id="f-pago"><h2>Nueva cuota</h2>
    ${alumnoId ? '' : `<label class="f">Alumno<select id="p-al">${als.map(a => `<option value="${a.id}">${esc(a.nombre)}</option>`).join('')}</select></label>`}
    <label class="f">Concepto<input type="text" id="p-con" placeholder="Ej. Cuota 2 de 6 · Plan Integral" required></label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label class="f">Vence<input type="date" id="p-vence" value="${hoyISO()}"></label><label class="f">Importe (€)<input type="text" inputmode="decimal" id="p-imp" required></label></div>
    <label class="f">Repetir cada mes (nº de cuotas)<input type="number" id="p-rep" min="1" max="12" value="1"></label>
    <button class="btn full" type="submit">Guardar</button></form>`);
  $('#f-pago').addEventListener('submit', async e => {
    e.preventDefault();
    const imp = numero($('#p-imp').value), con = $('#p-con').value.trim(), n = Math.max(1, Math.min(12, +$('#p-rep').value || 1));
    if (imp == null || !con) return toast('Indica concepto e importe');
    const al = alumnoId || $('#p-al').value, base = fecha($('#p-vence').value);
    const rows = [...Array(n)].map((_, i) => { const d = new Date(base); d.setMonth(d.getMonth() + i); return { alumno_id: al, concepto: n > 1 ? `${con} (${i + 1}/${n})` : con, vence: isoDe(d), importe: imp }; });
    const { data, error } = await sb.from('pagos').insert(rows).select();
    if (error) return fallo(error);
    S.c.pagos = S.c.pagos.concat(data).sort((x, y) => x.vence.localeCompare(y.vence));
    cerrarSheet(); toast(n > 1 ? `${n} cuotas creadas` : 'Cuota creada'); render();
  });
}
function formNota() {
  abrirSheet(`<form class="stack" id="f-nota"><h2>Nota privada</h2><p class="small muted">Solo la ves tú. El alumno nunca tiene acceso.</p><textarea id="n-txt" required></textarea><button class="btn full" type="submit">Guardar</button></form>`);
  $('#f-nota').addEventListener('submit', async e => {
    e.preventDefault();
    const texto = $('#n-txt').value.trim(); if (!texto) return;
    const { error } = await sb.from('notas_coach').insert({ alumno_id: S.ficha.id, texto });
    if (error) return fallo(error);
    cerrarSheet(); toast('Nota guardada'); abrirFicha(S.ficha.id);
  });
}

/* ---------- Estadísticas del alumno (coach) ---------- */
/* ---------- Objetivo de pasos y control mensual ---------- */
const PASOS_DEF = 10000;
const objPasos = srv => srv?.objetivo_pasos || PASOS_DEF;
const sumaMeses = (iso, n) => { const d = fecha(iso), dia = d.getDate(); d.setMonth(d.getMonth() + n); if (d.getDate() < dia) d.setDate(0); return isoDe(d); };
/* Semana (lunes) en la que cae cada control mensual desde el inicio del proceso */
function controlesMensuales(srv, hasta = sumaDias(hoyISO(), 70)) {
  if (!srv?.inicio) return [];
  const out = []; for (let k = 1; k < 40; k++) { const f = sumaMeses(srv.inicio, k); if (f > hasta) break; out.push({ n: k, fecha: f, lunes: lunesDe(f) }); }
  return out;
}
const controlEnSemana = (srv, lunes) => controlesMensuales(srv, sumaDias(lunes, 6)).find(c => c.lunes === lunes);
function vEventos(srv, pres) {
  const hoy = hoyISO(), lunes = lunesDe(hoy), ev = [];
  const rev = revisionPendiente(srv, S.d?.revisiones || [], S.d?.revisionesErr);
  const cEsta = rev || (S.d?.revisionesErr ? controlEnSemana(srv, lunes) : null), cProx = !cEsta && controlEnSemana(srv, sumaDias(lunes, 7));
  if (rev) ev.push(`<div class="line evento"><div class="ico gold">${svg('progreso')}</div><div class="grow"><b class="small">Toca tu revisión mensual con Jesús</b><div class="small muted">Una llamada o videollamada de 10-15 minutos para ver cómo te sientes, cómo vas con tus objetivos y tu composición corporal. Escríbele para agendarla.</div><div class="row" style="gap:8px;flex-wrap:wrap;margin-top:8px">${waJesus(`Hola Jesús, me toca la revisión mensual ${rev.n}. ¿Cuándo te viene bien la llamada?`) ? `<a class="btn sm" href="${esc(waJesus(`Hola Jesús, me toca la revisión mensual ${rev.n}. ¿Cuándo te viene bien la llamada?`))}" target="_blank" rel="noopener">Agendar por WhatsApp</a>` : ''}${srv?.modulo_presencial ? '' : '<button class="btn sm ghost" data-act="misMedidas">Añadir mis medidas</button>'}</div></div></div>`);
  else if (cEsta) ev.push(`<div class="line evento"><div class="ico gold">${svg('progreso')}</div><div class="grow"><b class="small">Esta semana toca tu control mensual ${cEsta.n}</b><div class="small muted">Composición corporal, ajustes y mejoras: tienes pendiente la reunión de seguimiento mensual con Jesús.${srv?.modulo_presencial ? '' : ' Antes de la reunión, tómate tus medidas.'}</div>${srv?.modulo_presencial ? '' : '<button class="btn sm" data-act="misMedidas" style="margin-top:8px">Añadir mis medidas</button>'}</div></div>`);
  else if (cProx) ev.push(`<div class="line evento"><div class="ico">${svg('progreso')}</div><div class="grow"><b class="small">La semana que viene: control mensual ${cProx.n}</b><div class="small muted">Semana del ${esc(fCorta(cProx.lunes))}. Reunión de seguimiento, composición corporal y ajustes.</div></div></div>`);
  (pres || []).filter(p => p.estado === 'programada' && p.fecha >= hoy && p.fecha <= sumaDias(hoy, 13)).sort(ordPres).slice(0, 3)
    .forEach(p => ev.push(`<div class="line" data-act="verPres" data-id="${p.id}" style="cursor:pointer"><div class="ico">${svg('cal')}</div><div class="grow"><b class="small">Entrenamiento con Jesús</b><div class="small muted">${esc(fLargaP(p))}${p.hora ? ' · ' + hhmm(p.hora) : ''}</div></div><span class="small muted">›</span></div>`));
  return ev.length ? `<section class="section"><h2>Próximos eventos</h2><div class="card">${ev.join('')}</div></section>` : '';
}

/* ---------- Proceso dividido en ciclos de 8 semanas ---------- */
const SEM_CICLO = 8;
const esObjetivo = r => r.es_bloque === false || (r.es_bloque == null && /^objetivo/i.test(r.nombre || '') && r.semana_inicio === r.semana_fin);
const bloquesDe = ruta => (ruta || []).filter(r => !esObjetivo(r)).sort((a, b) => a.semana_inicio - b.semana_inicio);
const objetivoDe = ruta => (ruta || []).filter(esObjetivo).flatMap(r => r.objetivos || []).join(' · ');
function proceso(srv, f = hoyISO()) {
  if (!srv?.inicio) return null;
  const dias = Math.floor((fecha(f) - fecha(srv.inicio)) / 864e5), semana = Math.floor(dias / 7) + 1;
  const bl = srv._bloques || [], ciclos = [];
  let total;
  if (bl.length) {
    bl.forEach((b, i) => { const sem = Math.max(1, b.semana_fin - b.semana_inicio + 1), ini = sumaDias(srv.inicio, (b.semana_inicio - 1) * 7); ciclos.push({ n: i + 1, sem, ini, fin: sumaDias(ini, sem * 7 - 1), s0: b.semana_inicio, nombre: b.nombre, objetivo: (b.objetivos || []).join(' · ') }); });
    total = bl[bl.length - 1].semana_fin;
  } else {
    total = srv.duracion_semanas || Math.max(1, Math.ceil(Math.max(semana, 1) / SEM_CICLO)) * SEM_CICLO;
    const n = Math.ceil(total / SEM_CICLO);
    for (let c = 1; c <= n; c++) {
      const sem = Math.min(SEM_CICLO, total - (c - 1) * SEM_CICLO), ini = sumaDias(srv.inicio, (c - 1) * SEM_CICLO * 7);
      ciclos.push({ n: c, sem, ini, fin: sumaDias(ini, sem * 7 - 1), s0: (c - 1) * SEM_CICLO + 1 });
    }
  }
  const antes = dias < 0, fuera = semana > total;
  const cc0 = antes ? ciclos[0] : ciclos.find(c => semana >= c.s0 && semana < c.s0 + c.sem) || ciclos[ciclos.length - 1];
  const ciclo = cc0.n, cc = cc0;
  const semCiclo = antes ? 0 : Math.max(1, Math.min(cc.sem, semana - cc.s0 + 1));
  const pctCiclo = antes ? 0 : Math.min(100, Math.round((Math.floor((fecha(f) - fecha(cc.ini)) / 864e5) + 1) / (cc.sem * 7) * 100));
  const pctTotal = antes ? 0 : Math.min(100, Math.round((dias + 1) / (total * 7) * 100));
  return { semana, total, ciclos, ciclo, semCiclo, cc, pctCiclo, pctTotal, antes, fuera, sinFin: !srv.duracion_semanas && !bl.length };
}
/* Nº de entreno dentro del ciclo (contando la sesión de esa fecha) */
function numEntreno(sesiones, srv, f, sesId, dpw) {
  const P = proceso(srv, f); if (!P || P.antes) return null;
  const enCiclo = sesiones.filter(x => x.fecha >= P.cc.ini && x.fecha <= P.cc.fin);
  let n = enCiclo.filter(x => x.fecha < f).length;
  const mismoDia = enCiclo.filter(x => x.fecha === f).sort((a, b) => (a.id || 0) - (b.id || 0));
  const i = sesId ? mismoDia.findIndex(x => x.id === sesId) : -1;
  n += i >= 0 ? i + 1 : mismoDia.length + 1;
  return { ...P, n, previstos: dpw ? dpw * P.cc.sem : null };
}
const nomCiclo = c => c.nombre || `Ciclo ${c.n}`;
const txtCiclo = x => x ? `${nomCiclo(x.cc)} · Semana ${x.semCiclo} de ${x.cc.sem}${x.n ? ` · Entreno ${x.n}${x.previstos ? ' de ' + x.previstos : ''}` : ''}` : '';
function vLineaTiempo(srv, titulo = 'Tu proceso', coach = false, prog = null) {
  const P = proceso(srv);
  if (!P) return coach ? `<section class="section"><div class="card stack"><span class="eyebrow">${esc(titulo)}</span><p class="small muted">Pon la fecha de inicio en "Servicio → Editar" para ver la línea temporal.</p><button class="btn sm" data-act="editarBloques" style="align-self:flex-start">✎ Editar bloques</button></div></section>` : '';
  const fF = iso => fecha(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  const segs = P.ciclos.map(c => { const est = c.n < P.ciclo || P.fuera ? 100 : c.n === P.ciclo ? P.pctCiclo : 0;
    return `<div class="tl-seg ${c.n === P.ciclo && !P.fuera ? 'now' : ''}" style="flex:${c.sem}"><i style="width:${est}%"></i><span>${c.n}</span></div>`; }).join('');
  const filas = P.ciclos.map(c => { const hecho = c.n < P.ciclo || P.fuera, act = c.n === P.ciclo && !P.fuera && !P.antes, pc = hecho ? 100 : act ? P.pctCiclo : 0;
    const pc2 = typeof prog === 'function' ? prog(c) : act ? prog : null;
    const sesiones = pc2?.dias?.length ? `<div class="stack" style="gap:6px;margin-top:8px"><span class="eyebrow">${coach ? esc(pc2.nombre) + ' · toca un día para verlo' : 'Tus entrenamientos de este bloque'}</span>${pc2.dias.map(d => `<div class="tl-ses" ${coach ? `data-act="verPlan" data-p="${pc2.id}" data-d="${d.id}" style="cursor:pointer"` : ''}><b class="small">${esc(d.nombre)} · ${esc(d.foco || '')}${coach ? ' <span style="color:var(--blue-text)">›</span>' : ''}</b>${d.objetivo ? `<div class="small muted">${esc(d.objetivo)}</div>` : ''}<div class="small muted">${esc([d.volumen && 'Volumen ' + d.volumen.toLowerCase(), d.intensidad && 'intensidad ' + d.intensidad.toLowerCase()].filter(Boolean).join(' · '))}</div></div>`).join('')}</div>` : '';
    const cab = `<div class="row"><span class="tl-dot ${hecho ? 'ok' : act ? 'now' : ''}"></span><div class="grow"><b>${esc(nomCiclo(c))}</b> <span class="small muted">· ${c.sem} semanas</span><div class="small muted">${fF(c.ini)} → ${fF(c.fin)}</div>${c.objetivo ? `<div class="small">🎯 ${esc(c.objetivo)}</div>` : ''}</div><span class="small ${act ? '' : 'muted'}">${hecho ? 'Completado' : act ? `<b>${P.pctCiclo} %</b>` : 'Empieza ' + fF(c.ini)}</span></div>
      <div class="track" style="margin:6px 0 0 22px"><i style="width:${pc}%;background:${hecho ? 'var(--gold)' : 'var(--blue)'}"></i></div>`;
    return sesiones ? `<details class="tl-row ${act ? 'now' : ''}"><summary>${cab}<div class="small" style="margin:6px 0 0 22px;color:var(--blue-text)">Toca para ver ${coach ? 'los' : 'tus'} entrenamientos de este bloque ›</div></summary>${sesiones}</details>` : `<div class="tl-row ${act ? 'now' : ''}">${cab}</div>`; }).join('');
  const cab = P.antes ? `Empieza el ${fF(srv.inicio)}` : P.fuera ? 'Proceso completado' : `${esc(nomCiclo(P.cc))} (${P.ciclo} de ${P.ciclos.length}) · Semana ${P.semCiclo} de ${P.cc.sem}`;
  return `<section class="section"><div class="card stack">
    <div class="row"><div class="grow"><span class="eyebrow">${esc(titulo)}</span><h3>${cab}</h3></div>${P.sinFin ? '' : `<div style="text-align:right"><b class="num" style="font-family:var(--display);font-size:22px">${P.pctTotal} %</b><div class="small muted">del proceso</div></div>`}</div>
    <div class="tl">${segs}</div>
    ${!P.antes && !P.fuera ? `<div class="small">${esc(nomCiclo(P.cc))} va al <b>${P.pctCiclo} %</b> y termina el <b>${fF(P.cc.fin)}</b>${P.ciclos[P.ciclo] ? `; ${esc(nomCiclo(P.ciclos[P.ciclo]))} empieza el ${fF(P.ciclos[P.ciclo].ini)}` : ''}.</div>${P.cc.objetivo ? `<div class="aprox small"><b>Objetivo de este bloque:</b> ${esc(P.cc.objetivo)}</div>` : ''}` : ''}
    <div class="stack" style="gap:0">${filas}</div>
    ${P.sinFin ? '<p class="note">Duración total sin definir: se muestran los ciclos hasta hoy.</p>' : ''}
    ${coach ? '<button class="btn sm" data-act="editarBloques" style="align-self:flex-start">✎ Editar bloques (objetivo y semanas)</button>' : ''}
  </div></section>`;
}
function barra(lbl, v, max, nota) {
  const pct = max ? Math.min(100, Math.round(v / max * 100)) : 0, col = pct >= 90 ? 'var(--ok)' : pct >= 60 ? 'var(--warn)' : 'var(--bad)';
  return `<div class="stack" style="gap:5px;margin-top:6px"><div class="row small"><span class="grow">${esc(lbl)}</span><b class="num">${v} / ${max}${nota ? ' ' + esc(nota) : ''} · ${pct} %</b></div><div class="track"><i style="width:${pct}%;background:${col}"></i></div></div>`;
}
function barrasSemanas(sesiones, dpw) {
  const semanas = [...Array(8)].map((_, i) => lunesDe(sumaDias(hoyISO(), -7 * (7 - i))));
  const cuenta = semanas.map(l => new Set(sesiones.filter(s => s.fecha >= l && s.fecha <= sumaDias(l, 6)).map(s => s.fecha + s.dia_id)).size);
  const max = Math.max(dpw || 1, ...cuenta), bw = 304 / 8;
  return `<svg viewBox="0 0 320 110" role="img" aria-label="Entrenamientos por semana">${cuenta.map((v, i) => { const h = v / max * 76; return `<rect x="${8 + i * bw + 6}" y="${86 - h}" width="${bw - 12}" height="${Math.max(h, 1)}" rx="4" fill="${dpw && v >= dpw ? 'var(--ok)' : v ? 'var(--blue)' : 'var(--line)'}"/><text x="${8 + i * bw + bw / 2}" y="${82 - h}" fill="var(--fg)" font-size="11" text-anchor="middle">${v || ''}</text><text x="${8 + i * bw + bw / 2}" y="104" fill="var(--muted)" font-size="10" text-anchor="middle">${esc(fecha(semanas[i]).toLocaleDateString('es-ES', { day: 'numeric', month: 'numeric' }))}</text>`; }).join('')}</svg>`;
}
function vEstadisticas(f) {
  const hoy = hoyISO(), dpw = f.prog?.dias_semana || 0, srv = f.srv;
  const unicas = l => new Set(l.map(s => s.fecha + s.dia_id)).size;
  const semana = unicas(f.todas.filter(s => s.fecha >= lunesDe(hoy)));
  const mes = unicas(f.todas.filter(s => s.fecha >= sumaDias(hoy, -27)));
  let proceso = '';
  if (srv?.inicio) {
    const semanas = Math.max(1, Math.ceil((fecha(hoy) - fecha(srv.inicio) + 864e5) / 6048e5));
    const hechas = unicas(f.todas.filter(s => s.fecha >= srv.inicio));
    proceso = (dpw ? barra('Proceso completo', hechas, dpw * semanas, 'entrenos') : '')
      + (srv.duracion_semanas ? barra('Avance del proceso', Math.min(semanas, srv.duracion_semanas), srv.duracion_semanas, 'semanas') : '');
  }
  const dur = f.todas.filter(s => s.duracion_min), durMedia = dur.length ? Math.round(dur.reduce((t, s) => t + s.duracion_min, 0) / dur.length) : null;
  const diario = S.c.diario.filter(r => r.alumno_id === f.id), pasos = diario.filter(r => r.pasos != null);
  const med = f.med.slice().sort((x, y) => x.fecha.localeCompare(y.fecha));
  const graf = [['peso', 'Peso', ' kg', 'var(--blue)'], ['grasa_pct', '% de grasa', ' %', 'var(--gold)'], ['cintura', 'Cintura', ' cm', 'var(--ink)'], ['cadera', 'Cadera', ' cm', 'var(--blue)'], ['abd_bajo', 'Abdomen bajo', ' cm', 'var(--ink)']]
    .map(([c, t, u, col]) => { const p = serie(med, c); return p.length > 1 ? `<div class="card stack chart"><div class="row"><h3 class="grow">${t}</h3><span class="pill blue num">${fmtNum(p[p.length - 1].v)}${u}</span><span class="pill num ${delta(p) <= 0 ? 'ok' : 'warn'}">${delta(p) > 0 ? '+' : ''}${fmtNum(delta(p))}</span></div>${spark(p, { unit: u, color: col })}</div>` : ''; }).join('');
  return `<section class="section"><div class="section-head"><h2>Servicio</h2><button class="btn sm ghost" data-act="editarServicio">Editar</button></div>
    <div class="card small">${srv ? `<b>${esc(srv.producto)}</b> · inicio ${srv.inicio ? esc(fCorta(srv.inicio)) + ' ' + fecha(srv.inicio).getFullYear() : '—'} · ${srv.duracion_semanas ? srv.duracion_semanas + ' semanas' : 'sin duración'} · ${[srv.modulo_entreno && 'entreno', srv.modulo_nutricion && 'nutrición', srv.modulo_presencial && 'presencial'].filter(Boolean).join(', ') || 'sin módulos'}` : 'Sin servicio asignado.'}</div></section>
  <section class="section"><h2>Cumplimiento</h2><div class="card">
    ${dpw ? barra('Esta semana', semana, dpw, 'entrenos') + barra('Últimas 4 semanas', mes, dpw * 4, 'entrenos') : '<p class="small muted">Sin programa activo.</p>'}${proceso}
    <div class="row small" style="margin-top:12px;flex-wrap:wrap;gap:8px"><span class="pill">Pasos medios (14 días): ${pasos.length ? fmtNum(Math.round(pasos.reduce((t, r) => t + r.pasos, 0) / pasos.length), 0) : '—'}</span><span class="pill">Duración media: ${durMedia ? durMedia + ' min' : '—'}</span></div>
    ${!srv?.duracion_semanas ? '<p class="note" style="margin-top:10px">Añade la fecha de inicio y la duración en "Servicio" para ver el avance del proceso completo.</p>' : ''}
  </div>
  <div class="card stack chart"><h3>Entrenamientos por semana</h3>${barrasSemanas(f.todas, dpw)}</div></section>
  ${graf ? `<section class="section"><h2>Composición corporal</h2>${vGraficaComp(med)}</section>` : ''}`;
}
function formServicio() {
  const s = S.ficha.srv || {};
  abrirSheet(`<form class="stack" id="f-srv"><h2>Servicio</h2>
    <label class="f">Programa / producto contratado<input type="text" id="sv-prod" list="sv-prods" value="${esc(s.producto || '')}" placeholder="Ej. Plan Integral 6 meses" required></label>
    <datalist id="sv-prods">${[...new Set(['Plan Integral 3 meses', 'Plan Integral 6 meses', 'Plan Integral 10 meses', 'Plan Entrenamiento 3 meses', 'Plan Entrenamiento 6 meses', 'Bono 10 sesiones presenciales', 'Bono 15 sesiones presenciales', 'Zero to Fit · Integral', 'Élite Player', ...S.c.servicios.map(x => x.producto).filter(Boolean)])].map(v => `<option value="${esc(v)}">`).join('')}</datalist>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label class="f">Inicio<input type="date" id="sv-ini" value="${s.inicio || hoyISO()}"></label><label class="f">Duración (semanas)<input type="number" id="sv-dur" min="1" max="104" value="${s.duracion_semanas || ''}" placeholder="Ej. 26"></label></div>
    <label class="f">Objetivo de pasos diarios<input type="number" id="sv-pasos" min="0" step="500" value="${s.objetivo_pasos || ''}" placeholder="${PASOS_DEF}"></label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label class="f">Hora de acostarse objetivo<input type="time" id="sv-dormir" value="${esc(s.sueno_dormir || '')}" placeholder="23:00"></label><label class="f">Hora de levantarse objetivo<input type="time" id="sv-levantar" value="${esc(s.sueno_levantar || '')}" placeholder="08:00"></label></div>
    <label class="f">Sesiones presenciales incluidas (bono)<input type="number" id="sv-pres" min="0" max="200" value="${s.sesiones_incluidas || ''}" placeholder="Ej. 15"></label>
    <div class="stack" style="gap:8px">${[['entreno', 'Entrenamiento', s.modulo_entreno ?? true], ['nutricion', 'Nutrición', s.modulo_nutricion], ['presencial', 'Sesiones presenciales', s.modulo_presencial], ['futbol', 'Elite Player · seguimiento de futbolista (wellness, partidos y carga)', s.modulo_futbol]].map(([k, l, v]) => `<label class="row small"><input type="checkbox" id="sv-${k}" ${v ? 'checked' : ''} style="width:20px;height:20px"> ${l}</label>`).join('')}</div>
    <button class="btn full" type="submit">Guardar</button></form>`);
  $('#f-srv').addEventListener('submit', async e => {
    e.preventDefault();
    const row = { alumno_id: S.ficha.id, producto: $('#sv-prod').value.trim() || 'Servicio', inicio: $('#sv-ini').value, duracion_semanas: numero($('#sv-dur').value), sesiones_incluidas: numero($('#sv-pres').value),
      modulo_entreno: $('#sv-entreno').checked, modulo_nutricion: $('#sv-nutricion').checked, modulo_presencial: $('#sv-presencial').checked, activo: true };
    if ($('#sv-futbol').checked || s.modulo_futbol) row.modulo_futbol = $('#sv-futbol').checked;
    if ($('#sv-dormir').value || s.sueno_dormir) row.sueno_dormir = $('#sv-dormir').value || null;
    if ($('#sv-levantar').value || s.sueno_levantar) row.sueno_levantar = $('#sv-levantar').value || null;
    const op = numero($('#sv-pasos').value); if (op) row.objetivo_pasos = op;
    const guardar = r => s.id ? sb.from('servicios').update(r).eq('id', s.id) : sb.from('servicios').insert(r);
    let { error } = await guardar(row);
    if (!error && !s.id) await sb.from('perfiles').update({ activo: true }).eq('id', S.ficha.id);
    if (error && /modulo_futbol/.test(error.message || '')) return fallo(error, 'Falta ejecutar el Bloque 21 en Supabase.');
    if (error && /sueno_/.test(error.message || '')) return fallo(error, 'Falta ejecutar el Bloque 24 en Supabase.');
    if (error && /objetivo_pasos/.test(error.message || '')) { delete row.objetivo_pasos; ({ error } = await guardar(row)); toast('Para guardar el objetivo de pasos falta ejecutar el Bloque 10'); }
    if (error) return fallo(error);
    cerrarSheet(); toast('Servicio guardado'); await cargarCoach(); if (S.ficha.id === S.user.id) await cargarAlumno(S.user.id); abrirFicha(S.ficha.id);
  });
}

/* ---------- Biblioteca de ejercicios (coach) ---------- */
function vEjercicios() {
  const l = S.c.ejercicios, filtro = norm(S.filtroEj || '');
  const vis = l.filter(x => !filtro || norm(x.nombre + ' ' + (x.musculo || '')).includes(filtro));
  const sinV = l.filter(x => !x.video_url).length, sinF = l.filter(x => !x.imagen_url).length;
  return `<section class="stack"><span class="eyebrow">Tu biblioteca</span><h1>Ejercicios</h1><p class="small muted">Lo que cambies aquí se ve al instante en los entrenos de todos tus alumnos.</p></section>
  <section class="section"><div class="kpis"><div class="kpi"><div class="v num">${l.length}</div><div class="l">ejercicios</div></div><div class="kpi"><div class="v num" style="color:${sinV ? 'var(--warn)' : 'var(--ok)'}">${sinV}</div><div class="l">sin vídeo</div></div><div class="kpi"><div class="v num" style="color:${sinF ? 'var(--warn)' : 'var(--ok)'}">${sinF}</div><div class="l">sin foto</div></div></div>
  <button class="btn full" data-act="importarImagenes">Actualizar imágenes desde tus hojas</button><p class="note">Pone la imagen del ejercicio, la del músculo y las de cardio y movilidad que tenías en tus hojas, y repara las que no cargan.</p>
  <input type="text" id="ej-buscar" placeholder="Buscar por nombre o músculo" value="${esc(S.filtroEj || '')}">
  <div class="card">${vis.map(x => `<div class="line" data-act="editarEjercicio" data-id="${x.id}" style="cursor:pointer">${x.imagen_url ? `<img src="${esc(x.imagen_url)}" alt="" style="width:48px;height:48px;border-radius:10px;object-fit:cover;flex:none" onerror="this.outerHTML='<span class=&quot;pill bad&quot;>Foto rota</span>'">` : `<div class="ico">${svg('ejercicios')}</div>`}<div class="grow"><h3>${esc(x.nombre)}</h3><div class="small muted">${esc(x.musculo || 'Sin músculo')}</div></div><div class="stack" style="gap:4px;align-items:flex-end"><span class="pill ${x.video_url ? 'ok' : 'warn'}">${x.video_url ? 'Vídeo' : 'Sin vídeo'}</span><span class="pill ${x.imagen_url ? 'ok' : 'warn'}">${x.imagen_url ? 'Foto' : 'Sin foto'}</span>${x.musculo_img_url ? '' : '<span class="pill warn">Sin músculo</span>'}</div></div>`).join('') || '<div class="empty">No hay ejercicios con ese nombre.</div>'}</div></section>`;
}
function formEjercicio(id) {
  const x = S.c.ejercicios.find(z => z.id === id); if (!x) return;
  abrirSheet(`<form class="stack" id="f-ej"><h2>${esc(x.nombre)}</h2>
    ${x.imagen_url ? `<img src="${esc(x.imagen_url)}" alt="" style="width:100%;max-height:200px;object-fit:cover;border-radius:12px">` : ''}
    <label class="f">Foto del ejercicio (desde la galería o la cámara)<input type="file" id="e-foto" accept="image/*"></label>
    ${x.musculo_img_url ? `<img src="${esc(x.musculo_img_url)}" alt="" style="width:100%;max-height:160px;object-fit:contain;border-radius:12px;background:#fff">` : ''}
    <label class="f">Imagen del músculo trabajado<input type="file" id="e-mfoto" accept="image/*"></label>
    <label class="f">Músculo que se trabaja<input type="text" id="e-mus" value="${esc(x.musculo || '')}"></label>
    <label class="f">Descripción o claves de ejecución<textarea id="e-desc">${esc(x.descripcion || '')}</textarea></label>
    <label class="f">Enlace del vídeo (YouTube oculto)<input type="text" id="e-vid" inputmode="url" value="${esc(x.video_url || '')}" placeholder="https://youtu.be/…"></label>
    <p class="err" id="e-err"></p><button class="btn full" type="submit" id="e-btn">Guardar</button></form>`);
  $('#f-ej').addEventListener('submit', async e => {
    e.preventDefault(); const btn = $('#e-btn'); btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      const cambios = { musculo: $('#e-mus').value.trim() || null, descripcion: $('#e-desc').value.trim() || null, video_url: $('#e-vid').value.trim() || null };
      const file = $('#e-foto').files[0];
      if (file) {
        const blob = await reducirImagen(file, 1000), ruta = `ej-${x.id}-${Date.now()}.jpg`;
        const up = await sb.storage.from('ejercicios').upload(ruta, blob, { contentType: 'image/jpeg', upsert: true });
        if (up.error) throw up.error;
        cambios.imagen_url = sb.storage.from('ejercicios').getPublicUrl(ruta).data.publicUrl;
      }
      const mfile = $('#e-mfoto').files[0];
      if (mfile) {
        const blob = await reducirImagen(mfile, 900), ruta = `mus-${x.id}-${Date.now()}.jpg`;
        const up = await sb.storage.from('ejercicios').upload(ruta, blob, { contentType: 'image/jpeg', upsert: true });
        if (up.error) throw up.error;
        cambios.musculo_img_url = sb.storage.from('ejercicios').getPublicUrl(ruta).data.publicUrl;
      }
      const { error } = await sb.from('ejercicios').update(cambios).eq('id', x.id); if (error) throw error;
      Object.assign(x, cambios); cerrarSheet(); toast('Ejercicio guardado'); await cargarAlumno(S.user.id); render();
    } catch (err) { btn.disabled = false; btn.textContent = 'Guardar'; $('#e-err').textContent = 'No se ha podido guardar. Si subías una foto, prueba con otra o revisa la conexión.'; console.error(err); }
  });
}
function reducirImagen(file, max) {
  return new Promise((ok, ko) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => { const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); c.toBlob(b => b ? ok(b) : ko(new Error('imagen')), 'image/jpeg', .82); };
    img.onerror = ko; img.src = url;
  });
}


/* ---------- Resumen gráfico del coach ---------- */
function vResumenCoach(est) {
  const hoy = hoyISO(), c = S.c;
  const semanas = [...Array(8)].map((_, i) => lunesDe(sumaDias(hoy, -7 * (7 - i))));
  const totalSem = semanas.map(l => new Set(c.sesiones.filter(s => s.fecha >= l && s.fecha <= sumaDias(l, 6)).map(s => s.alumno_id + s.fecha + s.dia_id)).size);
  const previsto = c.programas.reduce((t, p) => t + (p.dias_semana || 0), 0);
  const conPlan = est.filter(x => x.e.dpw);
  const pctSem = conPlan.length ? Math.round(conPlan.reduce((t, x) => t + Math.min(1, x.e.semana / x.e.dpw), 0) / conPlan.length * 100) : 0;
  const pctMes = conPlan.length ? Math.round(conPlan.reduce((t, x) => t + Math.min(1, x.e.mes / (x.e.dpw * 4)), 0) / conPlan.length * 100) : 0;
  const motiv = c.checkins.filter(k => k.semana_inicio >= lunesDe(sumaDias(hoy, -7)));
  const motMedia = motiv.length ? (motiv.reduce((t, k) => t + k.motivacion, 0) / motiv.length) : null;
  const W = 320, H = 130, bw = 304 / 8, max = Math.max(previsto, ...totalSem, 1), y = v => 96 - v / max * 80;
  const barras = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Entrenamientos de todos tus alumnos por semana">${previsto ? `<line x1="8" x2="312" y1="${y(previsto)}" y2="${y(previsto)}" stroke="var(--ink)" stroke-dasharray="4 4"/><text x="312" y="${y(previsto) - 4}" fill="var(--fg)" font-size="10" text-anchor="end">Previsto: ${previsto}</text>` : ''}${totalSem.map((v, i) => `<rect x="${8 + i * bw + 6}" y="${y(v)}" width="${bw - 12}" height="${Math.max(96 - y(v), 1)}" rx="4" fill="${previsto && v >= previsto ? 'var(--ok)' : 'var(--blue)'}"/><text x="${8 + i * bw + bw / 2}" y="${y(v) - 4}" fill="var(--fg)" font-size="11" text-anchor="middle">${v || ''}</text><text x="${8 + i * bw + bw / 2}" y="114" fill="var(--muted)" font-size="10" text-anchor="middle">${esc(fecha(semanas[i]).toLocaleDateString('es-ES', { day: 'numeric', month: 'numeric' }))}</text>`).join('')}</svg>`;
  const filas = conPlan.map(x => { const p = Math.min(100, Math.round(x.e.mes / (x.e.dpw * 4) * 100)); return { n: x.a.nombre, p }; }).sort((a, b) => a.p - b.p);
  const horiz = filas.length ? `<svg viewBox="0 0 320 ${filas.length * 30 + 6}" role="img" aria-label="Cumplimiento por alumno">${filas.map((f, i) => { const col = f.p >= 90 ? 'var(--ok)' : f.p >= 60 ? 'var(--warn)' : 'var(--bad)'; return `<text x="0" y="${i * 30 + 19}" fill="var(--fg)" font-size="12">${esc(f.n.length > 14 ? f.n.slice(0, 13) + '…' : f.n)}</text><rect x="110" y="${i * 30 + 6}" width="170" height="16" rx="5" fill="var(--surface-2)"/><rect x="110" y="${i * 30 + 6}" width="${Math.max(2, f.p * 1.7)}" height="16" rx="5" fill="${col}"/><text x="318" y="${i * 30 + 19}" fill="var(--fg)" font-size="12" text-anchor="end">${f.p} %</text>`; }).join('')}</svg>` : '<p class="small muted">Asigna programas para ver el cumplimiento.</p>';
  const anillo = (pct, lbl) => { const R = 30, C = 2 * Math.PI * R, col = pct >= 90 ? 'var(--ok)' : pct >= 60 ? 'var(--warn)' : 'var(--bad)'; return `<div class="kpi" style="display:flex;flex-direction:column;align-items:center;gap:4px"><svg viewBox="0 0 80 80" width="72" height="72" role="img" aria-label="${lbl} ${pct} %"><circle cx="40" cy="40" r="${R}" fill="none" stroke="var(--surface-2)" stroke-width="9"/><circle cx="40" cy="40" r="${R}" fill="none" stroke="${col}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${C * pct / 100} ${C}" transform="rotate(-90 40 40)"/><text x="40" y="45" text-anchor="middle" font-size="16" font-weight="800" fill="var(--fg)">${pct}%</text></svg><div class="l" style="text-align:center">${lbl}</div></div>`; };
  return `<section class="section"><h2>Resumen</h2><div class="kpis">${anillo(pctSem, 'Cumplimiento esta semana')}${anillo(pctMes, 'Cumplimiento 4 semanas')}<div class="kpi" style="display:flex;flex-direction:column;justify-content:center;align-items:center"><div class="v num">${motMedia == null ? '—' : fmtNum(motMedia)}</div><div class="l" style="text-align:center">Motivación media (/10)</div></div></div>
  <div class="card stack chart"><h3>Entrenamientos de tus alumnos por semana</h3>${barras}</div>
  <div class="card stack chart"><h3>Cumplimiento por alumno · 4 semanas</h3>${horiz}</div></section>`;
}

/* ---------- Gráfica de pagos ---------- */
function graficaPagos(P) {
  const hoy = hoyISO(), base = new Date(hoy.slice(0, 7) + '-01T00:00:00');
  const meses = [...Array(7)].map((_, i) => { const d = new Date(base); d.setMonth(d.getMonth() + i - 4); return isoDe(d).slice(0, 7); });
  const datos = meses.map(m => {
    const cob = P.filter(p => p.pagado_at && p.pagado_at.slice(0, 7) === m).reduce((t, p) => t + Number(p.importe), 0);
    const pen = P.filter(p => !p.pagado_at && p.vence.slice(0, 7) === m && p.vence >= hoy).reduce((t, p) => t + Number(p.importe), 0);
    const ven = P.filter(p => !p.pagado_at && p.vence.slice(0, 7) === m && p.vence < hoy).reduce((t, p) => t + Number(p.importe), 0);
    return { m, cob, pen, ven, tot: cob + pen + ven };
  });
  const max = Math.max(1, ...datos.map(d => d.tot)), bw = 304 / 7, y = v => v / max * 84;
  return `<svg viewBox="0 0 320 134" role="img" aria-label="Ingresos por mes">${datos.map((d, i) => { const x = 8 + i * bw + 5, w = bw - 10; let top = 100; const seg = (v, col) => { if (!v) return ''; const h = y(v); top -= h; return `<rect x="${x}" y="${top}" width="${w}" height="${h}" fill="${col}"/>`; };
    const barras = seg(d.cob, 'var(--ok)') + seg(d.ven, 'var(--bad)') + seg(d.pen, 'var(--blue)');
    return `${barras}${d.tot ? `<text x="${x + w / 2}" y="${top - 4}" fill="var(--fg)" font-size="10" text-anchor="middle">${fmtNum(d.tot, 0)}€</text>` : ''}<text x="${x + w / 2}" y="118" fill="${d.m === hoy.slice(0, 7) ? 'var(--blue-text)' : 'var(--muted)'}" font-size="10" font-weight="${d.m === hoy.slice(0, 7) ? 700 : 400}" text-anchor="middle">${esc(new Date(d.m + '-01T00:00:00').toLocaleDateString('es-ES', { month: 'short' }))}</text>`; }).join('')}<line x1="8" x2="312" y1="100" y2="100" stroke="var(--line)"/></svg>`;
}

/* ---------- Importar imágenes de las hojas ---------- */
/* Las imágenes de Google Sheets son enlaces temporales: se copian al almacén de la app para que no caduquen */
const esGoogle = u => /googleusercontent\.com/.test(u || '');
const cargaBien = url => new Promise(res => { if (!url) return res(false); const im = new Image(), t = setTimeout(() => res(false), 9000); im.onload = () => { clearTimeout(t); res(true); }; im.onerror = () => { clearTimeout(t); res(false); }; im.src = url; });
async function blobDe(url) {
  try { const r = await fetch(url, { mode: 'cors' }); if (r.ok) { const b = await r.blob(); if (b.size > 500) return b; } } catch (e) { }
  return new Promise(res => {
    const im = new Image(); im.crossOrigin = 'anonymous';
    im.onload = () => { try { const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext('2d').drawImage(im, 0, 0); c.toBlob(b => res(b), 'image/png'); } catch (e) { res(null); } };
    im.onerror = () => res(null); im.src = url;
  });
}
async function importarImagenes() {
  let mapa;
  try { mapa = await (await fetch('imagenes.json', { cache: 'no-store' })).json(); } catch (e) { return toast('No se ha podido leer el archivo de imágenes'); }
  abrirSheet(`<div class="stack"><h2>Actualizando imágenes</h2><p class="small" id="imp-txt">Comprobando qué imágenes faltan o no cargan…</p><div class="track"><i id="imp-bar" style="width:0"></i></div><p class="note">No cierres la app hasta que termine.</p></div>`);
  const abs = r => new URL(r, location.href).href;
  // Se sustituyen: vacías, enlaces de Google (caducan), copias antiguas de la hoja y las que no cargan. Las fotos que subiste tú se respetan.
  const sustituir = async (actual, nueva) => !actual || esGoogle(actual) || /\/hoja-/.test(actual) || (actual !== nueva && !(await cargaBien(actual)));
  const tareas = [];
  for (const x of S.c.ejercicios) {
    const m = mapa[x.nombre]; if (!m) continue;
    if (m.img && x.imagen_url !== abs(m.img) && await sustituir(x.imagen_url, abs(m.img))) tareas.push({ tabla: 'ejercicios', obj: x, campo: 'imagen_url', url: abs(m.img), nombre: x.nombre });
    if (m.musculo_img && x.musculo_img_url !== abs(m.musculo_img) && await sustituir(x.musculo_img_url, abs(m.musculo_img))) tareas.push({ tabla: 'ejercicios', obj: x, campo: 'musculo_img_url', url: abs(m.musculo_img), nombre: x.nombre + ' · músculo' });
  }
  const B = mapa._bloques || {};
  const { data: progs } = await sb.from('programas').select('nombre,dias(nombre,bloques_sesion(*))');
  for (const p of progs || []) for (const d of p.dias || []) for (const b of d.bloques_sesion || []) {
    if (!('imagen_url' in b)) continue;
    const r = b.tipo === 'cardio' && /caminata/i.test(b.maquina || b.nombre || '') ? B['cardio:caminata'] : b.tipo === 'movilidad' && /ciclo 1/i.test(p.nombre) ? B['movilidad:' + d.nombre] : null;
    if (r && b.imagen_url !== abs(r) && await sustituir(b.imagen_url, abs(r))) tareas.push({ tabla: 'bloques_sesion', obj: b, campo: 'imagen_url', url: abs(r), nombre: `${d.nombre} · ${b.nombre}` });
  }
  if (!tareas.length) { cerrarSheet(); return toast('Todas las imágenes están bien'); }
  let ok = 0, faltan = 0, n = 0;
  for (const t of tareas) {
    n++; $('#imp-txt').textContent = `${n} de ${tareas.length} · ${t.nombre}`; $('#imp-bar').style.width = (n / tareas.length * 100) + '%';
    if (!(await cargaBien(t.url))) { faltan++; continue; }
    const { error } = await sb.from(t.tabla).update({ [t.campo]: t.url }).eq('id', t.obj.id);
    if (!error) { t.obj[t.campo] = t.url; ok++; }
  }
  cerrarSheet(); await cargarAlumno(S.user.id); render();
  abrirSheet(`<div class="stack"><h2>Imágenes actualizadas</h2><p class="small"><b>${ok}</b> imágenes puestas${faltan ? ` · ${faltan} no disponibles todavía` : ''}.</p><p class="note">Ahora están guardadas dentro de la propia app: ya no dependen de Google y no caducan.</p><button class="btn ghost full" data-act="cerrarSheet">Entendido</button></div>`);
}

/* ---------- Facturas (modelo LOF: IVA 21 % incluido en el precio) ---------- */
const eur = n => Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fDMA = iso => iso ? iso.slice(0, 10).split('-').reverse().join('/') : '';
function siguienteNumero() {
  const anio = hoyISO().slice(0, 4), nums = (S.c.facturas || []).map(x => x.numero).concat(S.c.fiscal?.factura_ultima || []).filter(n => String(n).startsWith(anio + '-')).map(n => +String(n).split('-')[1] || 0);
  return `${anio}-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0')}`;
}
function vFacturas() {
  const l = S.c.facturas || [];
  return `<section class="section"><div class="section-head"><h2>Facturas</h2><button class="btn sm ghost" data-act="datosFiscales">Datos de facturación</button></div><div class="card">
    ${S.c.facturasError ? '<div class="empty">Ejecuta el Bloque 11 en Supabase para activar las facturas.</div>' : l.slice(0, 30).map(fa => `<div class="line" data-act="verFactura" data-id="${fa.id}" style="cursor:pointer"><div class="grow"><b class="small">${esc(fa.numero)} · ${esc(fa.cliente_nombre)}</b><div class="small muted">${esc(fDMA(fa.fecha))} · ${esc(fa.concepto)}</div></div><b class="num">${eur(fa.total)} €</b></div>`).join('') || '<div class="empty">Aún no has generado facturas. Pulsa "Factura" en una cuota pagada.</div>'}
    <button class="btn ghost full" data-act="nuevaFactura">＋ Factura sin cuota</button></div></section>`;
}
function formFactura(pagoId, facId) {
  const fe = facId ? (S.c.facturas || []).find(x => x.id === facId) : null;
  if (fe) pagoId = fe.pago_id;
  const p = pagoId ? S.c.pagos.find(x => x.id === pagoId) : null, a = p ? S.c.perfiles.find(x => x.id === p.alumno_id) || {} : {};
  const als = S.c.perfiles;
  abrirSheet(`<form class="stack" id="f-fac"><h2>${fe ? 'Modificar factura' : 'Nueva factura'}</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><label class="f">Número<input type="text" id="fa-n" value="${esc(fe?.numero || siguienteNumero())}" required></label><label class="f">Fecha de emisión<input type="date" id="fa-f" value="${fe?.fecha || hoyISO()}"></label></div>
    ${p || fe ? '' : `<label class="f">Alumno<select id="fa-al"><option value="">— Otro cliente —</option>${als.map(x => `<option value="${x.id}">${esc(x.nombre)}</option>`).join('')}</select></label>`}
    <label class="f">Nombre completo (con los dos apellidos) / razón social<input type="text" id="fa-cn" value="${esc(a.nombre_fiscal || a.nombre || '')}" required></label>
    ${p && !fe && !a.nombre_fiscal ? '<p class="small" style="color:var(--warn)">Escribe su nombre completo tal y como aparece en su DNI. Se guarda en su ficha (solo para facturas) y la próxima vez saldrá solo.</p>' : ''}
    <label class="f">NIF / NIE<input type="text" id="fa-ci" value="${esc(a.nif || '')}" placeholder="Se guarda en su ficha para la próxima vez"></label>
    <label class="f">Concepto<input type="text" id="fa-co" value="${esc(fe?.concepto || 'Acompañamiento personalizado')}" required></label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><label class="f">Total con IVA (€)<input type="text" inputmode="decimal" id="fa-t" value="${fe ? String(fe.total).replace('.', ',') : p ? String(p.importe).replace('.', ',') : ''}" required></label><label class="f">Fecha de pago<input type="date" id="fa-fp" value="${fe ? fe.fecha_pago || '' : (p?.pagado_at || '').slice(0, 10)}"></label></div>
    <label class="f">Forma de pago<select id="fa-fo">${['Transferencia bancaria', 'Bizum', 'Efectivo', 'Tarjeta'].map(x => `<option ${fe?.forma_pago === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
    <p class="small muted" id="fa-calc"></p>
    <button class="btn full" type="submit">${fe ? 'Guardar cambios' : 'Generar factura'}</button>${fe ? '<button class="btn ghost full" type="button" id="fa-del" style="color:var(--bad)">Eliminar factura</button>' : ''}</form>`);
  if (fe) { $('#fa-cn').value = fe.cliente_nombre || ''; $('#fa-ci').value = fe.cliente_nif || ''; }
  $('#fa-del')?.addEventListener('click', async ev => { const x = ev.currentTarget; if (!x.dataset.ok) { x.dataset.ok = 1; x.textContent = `Pulsa otra vez para eliminar la factura ${fe.numero}`; return; } const { error } = await sb.from('facturas').delete().eq('id', fe.id); if (error) return fallo(error); S.c.facturas = S.c.facturas.filter(y => y.id !== fe.id); S.factura = null; cerrarSheet(); toast('Factura eliminada'); render(); });
  const calc = () => { const t = numero($('#fa-t').value) || 0, b = Math.round(t / 1.21 * 100) / 100; $('#fa-calc').textContent = `Base imponible ${eur(b)} € · IVA (21 %) ${eur(t - b)} € · Total ${eur(t)} €`; };
  calc(); $('#fa-t').addEventListener('input', calc);
  $('#fa-al')?.addEventListener('change', ev => { const x = als.find(y => y.id === ev.target.value) || {}; $('#fa-cn').value = x.nombre_fiscal || x.nombre || ''; $('#fa-ci').value = x.nif || ''; });
  $('#f-fac').addEventListener('submit', async e => {
    e.preventDefault();
    const total = numero($('#fa-t').value); if (!total) return toast('Indica el importe');
    if (!fe) { const bt = $('#f-fac [type=submit]'); if (!bt.dataset.ok) { bt.dataset.ok = 1; bt.textContent = `¿Seguro? Pulsa otra vez para generar la factura ${$('#fa-n').value.trim()}`; return; } }
    const base = Math.round(total / 1.21 * 100) / 100, alumno = fe ? fe.alumno_id : p?.alumno_id || $('#fa-al')?.value || null;
    const row = { numero: $('#fa-n').value.trim(), fecha: $('#fa-f').value || hoyISO(), alumno_id: alumno, pago_id: fe ? fe.pago_id : p?.id || null, cliente_nombre: $('#fa-cn').value.trim(), cliente_nif: $('#fa-ci').value.trim() || null, concepto: $('#fa-co').value.trim(), base, iva_pct: 21, iva: Math.round((total - base) * 100) / 100, total, forma_pago: $('#fa-fo').value, fecha_pago: $('#fa-fp').value || null };
    const { data, error } = fe ? await sb.from('facturas').update(row).eq('id', fe.id).select().single() : await sb.from('facturas').insert(row).select().single();
    if (error) return fallo(error, /duplicate|unique/.test(error.message || '') ? 'Ese número de factura ya existe.' : /facturas/.test(error.message || '') ? 'Falta ejecutar el Bloque 11 en Supabase.' : undefined);
    if (alumno) { const upd = { nombre_fiscal: row.cliente_nombre, ...(row.cliente_nif ? { nif: row.cliente_nif } : {}) }; await sb.from('perfiles').update(upd).eq('id', alumno); const x = S.c.perfiles.find(y => y.id === alumno); if (x) Object.assign(x, upd); }
    S.c.facturas = [data, ...(S.c.facturas || []).filter(y => y.id !== data.id)]; cerrarSheet(); if (fe) toast('Factura modificada'); verFactura(data.id);
  });
}
function formDatosFiscales() {
  const F = S.c.fiscal || {};
  const c = [['emisor_nombre', 'Nombre'], ['emisor_nif', 'NIF'], ['emisor_direccion', 'Dirección'], ['emisor_telefono', 'Teléfono'], ['emisor_email', 'Email'], ['emisor_iban', 'IBAN o teléfono Bizum'], ['factura_ultima', 'Último número de factura emitido fuera de la app (ej. 2026-039)']];
  abrirSheet(`<form class="stack" id="f-df"><h2>Datos de facturación</h2>${c.map(([k, l]) => `<label class="f">${l}<input type="text" data-k="${k}" value="${esc(F[k] || '')}"></label>`).join('')}<p class="note">Solo los ves tú. Se usan en el encabezado de cada factura.</p><button class="btn full" type="submit">Guardar</button></form>`);
  $('#f-df').addEventListener('submit', async e => {
    e.preventDefault();
    const rows = [...document.querySelectorAll('#f-df [data-k]')].map(i => ({ clave: i.dataset.k, valor: i.value.trim() }));
    const { error } = await sb.from('ajustes_privados').upsert(rows, { onConflict: 'clave' });
    if (error) return fallo(error, 'Falta ejecutar el Bloque 11 en Supabase.');
    S.c.fiscal = Object.fromEntries(rows.map(r => [r.clave, r.valor])); cerrarSheet(); toast('Datos guardados');
  });
}
function verFactura(id) { S.factura = (S.c.facturas || []).find(x => x.id === id); if (S.factura) { render(); window.scrollTo(0, 0); } }
function vFacturaDoc() {
  const fa = S.factura, F = S.c.fiscal || {};
  const campo = (l, v, extra = '') => `<div class="fd-f ${extra}"><span>${l}</span><div>${esc(v || '')}</div></div>`;
  return `<section class="stack no-print"><button class="btn sm ghost" data-act="cerrarFactura" style="align-self:flex-start">← Pagos</button>
    <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn" data-act="imprimirFactura">Descargar / imprimir PDF</button><button class="btn ghost" data-act="editarFactura" data-id="${fa.id}">✎ Modificar</button></div>
    <p class="small muted">En el móvil: pulsa "Descargar / imprimir PDF" y elige "Guardar como PDF" o compártela por WhatsApp.</p></section>
  <div class="factura-doc">
    <div class="fd-top"></div>
    <div class="fd-head"><img src="icons/logo-96.jpg" alt="LOF"><div><h1>FACTURA</h1><div class="fd-sub">ENTRENAMIENTO Y ACOMPAÑAMIENTO</div></div></div>
    <div class="fd-g2">${campo('NÚMERO / SERIE', fa.numero)}${campo('FECHA DE EMISIÓN (DD/MM/AAAA)', fDMA(fa.fecha))}</div>
    <div class="fd-bar">01&nbsp; EMISOR</div>
    <div class="fd-g21">${campo('', F.emisor_nombre)}${campo('', 'NIF: ' + (F.emisor_nif || ''))}</div>
    ${campo('', F.emisor_direccion)}
    <div class="fd-mini">Tel. ${esc(F.emisor_telefono || '')} &nbsp;|&nbsp; ${esc(F.emisor_email || '')}</div>
    <div class="fd-bar">02&nbsp; CLIENTE</div>
    <div class="fd-g21">${campo('NOMBRE Y APELLIDOS / RAZÓN SOCIAL', fa.cliente_nombre)}${campo('NIF / NIE', fa.cliente_nif)}</div>
    <div class="fd-bar" style="margin-top:28px">03&nbsp; SERVICIOS · IMPORTES EN EUROS</div>
    <div class="fd-g21 fd-lab"><span>CONCEPTO</span><span>IMPORTE SIN IVA</span></div>
    <div class="fd-g21">${campo('', fa.concepto)}<div class="fd-f eur"><div>${eur(fa.base)}</div><b>€</b></div></div>
    ${fa.fecha_pago ? `<div class="fd-txt">Fecha de pago: ${esc(fDMA(fa.fecha_pago))}</div>` : ''}
    <div class="fd-tot">
      <div>${campo('FORMA DE PAGO', fa.forma_pago)}<div class="fd-mini">Transferencia / Bizum / efectivo / tarjeta</div>${campo('IBAN O TELÉFONO BIZUM', F.emisor_iban)}</div>
      <div class="fd-sum"><div class="fd-r"><span>Base imponible</span><div class="fd-f eur"><div>${eur(fa.base)}</div><b>€</b></div></div><div class="fd-r"><span>IVA (${fmtNum(fa.iva_pct)} %)</span><div class="fd-f eur"><div>${eur(fa.iva)}</div><b>€</b></div></div><div class="fd-r total"><span>TOTAL A PAGAR</span><div class="fd-f eur"><div>${eur(fa.total)}</div><b>€</b></div></div></div>
    </div>
    <div class="fd-pie">LOF · La Obra Fitness</div>
  </div>`;
}

/* ---------- Reporting semanal (coach) ---------- */
async function abrirReporte(alumno = null, lunes = null) {
  lunes = lunes || sumaDias(lunesDe(hoyISO()), -7);
  if (lunes > lunesDe(hoyISO())) lunes = lunesDe(hoyISO());
  S.reporte = { alumno, lunes, cargando: true }; render(); window.scrollTo(0, 0);
  const fin = sumaDias(lunes, 6);
  const filtro = q => alumno ? q.eq('alumno_id', alumno) : q;
  const [ses, reg, chk, pres] = await Promise.all([
    filtro(sb.from('sesiones_hechas').select('*,dias(nombre,foco)').gte('fecha', lunes).lte('fecha', fin)),
    filtro(sb.from('registro_diario').select('*').gte('fecha', lunes).lte('fecha', fin)),
    filtro(sb.from('checkins').select('*').eq('semana_inicio', lunes)),
    filtro(sb.from('presenciales').select('*').gte('fecha', lunes).lte('fecha', fin))
  ]);
  S.reporte = { alumno, lunes, src: { sesiones: ses.data || [], diario: reg.data || [], checkins: chk.data || [] }, pres: pres.data || [] };
  render();
}
function datosReporte(a, R) {
  const srv = S.c.servicios.find(x => x.alumno_id === a.id), dpw = (S.c.programas.find(p => p.alumno_id === a.id) || {}).dias_semana || 0, obj = objPasos(srv);
  const w = semanaDatos(a.id, R.lunes, R.src), P = proceso(srv, R.fin || sumaDias(R.lunes, 6));
  const pctE = dpw ? Math.round(w.entrenos / dpw * 100) : null, pctP = w.pasosMedia != null ? Math.round(w.pasosMedia / obj * 100) : null;
  const nivel = x => x == null ? '' : x >= 90 ? 'ok' : x >= 60 ? 'warn' : 'bad';
  const coment = [];
  w.ses.forEach(x => {
    const dia = x.dias ? `${x.dias.nombre}${x.dias.foco ? ' · ' + x.dias.foco : ''}` : 'Entreno';
    if (x.nota) coment.push(['Entreno', x.fecha, `${dia}: "${x.nota}"`]);
    if (x.nota_revision) coment.push(['Para la revisión', x.fecha, x.nota_revision]);
    (x.omitidos || []).forEach(o => coment.push(['No realizado', x.fecha, `${o.nombre}: ${o.motivo}`]));
    (x.comentarios || []).forEach(o => coment.push(['Ejercicio', x.fecha, `${o.nombre}: "${o.texto}"`]));
    if (x.cansancio >= 4) coment.push(['Cansancio', x.fecha, `${dia}: cansancio ${x.cansancio}/5`]);
  });
  w.reg.filter(r => r.observacion).forEach(r => coment.push(['Día', r.fecha, `${r.pasos != null ? fmtNum(r.pasos, 0) + ' pasos · ' : ''}"${r.observacion}"`]));
  if (w.chk?.nota_alimentacion) coment.push(['Alimentación', R.lunes, w.chk.nota_alimentacion]);
  if (w.chk?.dificultades) coment.push(['Dificultades de la semana', R.lunes, w.chk.dificultades]);
  if (w.chk && ((w.chk.proxima_semana_etiquetas || []).length || w.chk.proxima_semana)) coment.push(['Semana siguiente', R.lunes, [...(w.chk.proxima_semana_etiquetas || []), w.chk.proxima_semana].filter(Boolean).join(' · ')]);
  const pres = (R.pres || []).filter(p => p.alumno_id === a.id);
  const score = [pctE, srv?.modulo_nutricion ? w.nutri : null, pctP].filter(v => v != null);
  return { srv, dpw, obj, w, P, pctE, pctP, nivel, coment, pres, control: controlEnSemana(srv, R.lunes), score: score.length ? Math.min(...score) : 100 };
}
function vReporteAlumno(a, R, detalle) {
  const d = datosReporte(a, R), w = d.w;
  const caja = (t, v, sub, niv) => `<div class="kpi rep ${niv}"><div class="l">${t}</div><b class="num">${v}</b><div class="small muted">${sub}</div></div>`;
  const semTxt = d.P && !d.P.antes ? `Semana ${d.P.semana} del proceso · ${esc(nomCiclo(d.P.cc))}, semana ${d.P.semCiclo} de ${d.P.cc.sem}` : 'Sin fecha de inicio';
  const com = detalle ? d.coment : d.coment.slice(0, 4);
  return `<div class="card stack"><div class="row"><div class="grow"><h3>${esc(a.nombre)}</h3><div class="small muted">${semTxt}</div></div>${detalle ? '' : `<button class="btn sm ghost" data-act="abrirReporte" data-id="${a.id}">Ver</button>`}</div>
    <div class="kpis">${caja('Entrenos', d.dpw ? `${w.entrenos}/${d.dpw}` : w.entrenos, d.pctE != null ? d.pctE + ' %' : 'sin plan', d.nivel(d.pctE))}
      ${d.srv?.modulo_nutricion ? caja('Alimentación', w.nutri != null ? w.nutri + ' %' : '—', w.ing.dias ? `${w.ing.hechas}/${w.ing.total} ingestas · ${evalNutri(w.nutri)[1]}` : w.chk?.nutricion_pct != null ? 'según su check-in' : 'sin registros', evalNutri(w.nutri)?.[0] || '') : ''}
      ${caja('Pasos', w.pasosMedia != null ? fmtNum(w.pasosMedia, 0) : '—', `obj. ${fmtNum(d.obj, 0)} · ${w.diasPasos}/7 días`, d.nivel(d.pctP))}</div>
    ${w.cansancio || w.poderio || w.chk ? `<div class="row small muted" style="flex-wrap:wrap;gap:8px">${w.cansancio ? `<span class="pill">Cansancio medio ${fmtNum(w.cansancio)}/5</span>` : ''}${w.poderio ? `<span class="pill">Poderío medio ${fmtNum(w.poderio)}/5</span>` : ''}${w.chk ? `<span class="pill">Motivación ${w.chk.motivacion}/10 · implicación ${w.chk.implicacion}/10</span>` : '<span class="pill warn">Sin check-in</span>'}</div>` : ''}
    ${d.control ? `<div class="aprox small"><b>Esa semana tocaba el control mensual ${d.control.n}</b> (composición corporal, ajustes y reunión de seguimiento).</div>` : ''}
    ${d.pres.length ? `<div class="small">Presenciales: ${d.pres.map(p => `${fCorta(p.fecha)} (${({ dada: 'hecha', tarde: 'aviso < 24 h', programada: 'reservada', cancelada: 'cancelada' })[p.estado] || p.estado})`).join(' · ')}</div>` : ''}
    ${com.length ? `<div class="stack" style="gap:6px"><span class="eyebrow">Lo que ha contado</span>${com.map(([t, f, x]) => `<div class="rep-c"><span class="small muted">${esc(t)} · ${esc(fCorta(f))}</span><div class="small">${esc(x)}</div></div>`).join('')}${!detalle && d.coment.length > 4 ? `<span class="small muted">y ${d.coment.length - 4} más…</span>` : ''}</div>` : '<p class="small muted">No ha dejado comentarios esta semana.</p>'}
    ${detalle && d.dpw ? `<div class="stack" style="gap:4px"><span class="eyebrow">Entrenamientos</span>${w.ses.map(x => `<div class="line" data-act="repVerSesion" data-id="${x.id}" data-al="${a.id}" style="cursor:pointer"><span class="small muted num" style="width:56px;flex:none">${esc(fCorta(x.fecha))}</span><div class="grow small"><b>${esc(x.dias?.nombre || '')}</b> · ${esc(x.dias?.foco || '')}${x.cansancio ? ` · cansancio ${x.cansancio}/5` : ''}${x.poderio ? ` · poderío ${x.poderio}/5` : ''}</div><span class="small muted">›</span></div>`).join('') || '<p class="small muted">Ningún entrenamiento registrado.</p>'}</div>` : ''}
    ${detalle ? `<button class="btn full" data-act="reporteFicha" data-id="${a.id}">Abrir su ficha para revisarlo a fondo</button>` : ''}
  </div>`;
}
function vReporte() {
  const R = S.reporte, fin = sumaDias(R.lunes, 6);
  const cab = `<section class="stack"><button class="btn sm ghost" data-act="cerrarReporte" style="align-self:flex-start">← Volver</button><span class="eyebrow">Reporting semanal · semana ${esc(String(numSemanaISO(R.lunes)))} del año</span><h1>Semana del ${esc(fCorta(R.lunes))} al ${esc(fCorta(fin))}</h1>
    <div class="row" style="gap:8px"><button class="btn sm ghost" data-act="reporteSemana" data-d="-7">‹ Anterior</button>${R.lunes < sumaDias(lunesDe(hoyISO()), -7) ? '<button class="btn sm ghost" data-act="reporteSemana" data-d="7">Siguiente ›</button>' : R.lunes < lunesDe(hoyISO()) ? '<button class="btn sm ghost" data-act="reporteSemana" data-d="7">Semana en curso ›</button>' : ''}</div></section>`;
  if (R.cargando) return cab + '<div class="empty">Preparando el reporting…</div>';
  R.fin = fin;
  if (R.alumno) { const a = S.c.perfiles.find(p => p.id === R.alumno) || { id: R.alumno, nombre: 'Alumno' }; return cab + `<section class="section">${vReporteAlumno(a, R, true)}</section>`; }
  const als = S.c.perfiles.filter(p => p.activo !== false && (S.c.servicios.some(x => x.alumno_id === p.id) || S.c.programas.some(x => x.alumno_id === p.id)));
  const lista = als.map(a => ({ a, d: datosReporte(a, R) })).sort((x, y) => x.d.score - y.d.score);
  return cab + `<section class="section rep-lista"><p class="small muted">Ordenados de menor a mayor cumplimiento. Toca "Ver" para el detalle de cada alumno.</p>${lista.map(({ a }) => vReporteAlumno(a, R, false)).join('') || '<div class="empty">Sin alumnos activos.</div>'}</section>`;
}
const numSemanaISO = iso => { const d = fecha(iso); d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7); const y = new Date(d.getFullYear(), 0, 4); return 1 + Math.round(((d - y) / 864e5 - 3 + (y.getDay() + 6) % 7) / 7); };

/* ---------- Bloques del proceso (coach): nombre, objetivo y semanas ---------- */
function filaBloqueProc(b) {
  return `<div class="card stack" data-bp style="padding:12px;gap:8px"><div style="display:grid;grid-template-columns:1fr 84px 32px;gap:6px;align-items:end">
    <label class="f">Nombre del bloque<input type="text" data-k="nombre" value="${esc(b.nombre || '')}" placeholder="Ej. Bloque 1 · Base de fuerza"></label>
    <label class="f">Semanas<input type="number" data-k="sem" min="1" max="52" value="${b.sem || 8}"></label>
    <button type="button" class="btn sm ghost" data-quitar aria-label="Quitar bloque" style="padding:8px 0">✕</button></div>
    <label class="f">Objetivo<textarea data-k="obj" rows="2" placeholder="Qué buscamos en este bloque">${esc(b.obj || '')}</textarea></label></div>`;
}
function formBloquesProceso() {
  const f = S.ficha, bl = bloquesDe(f.ruta), srv = f.srv || {};
  const iniciales = bl.length ? bl.map(b => ({ nombre: b.nombre, sem: b.semana_fin - b.semana_inicio + 1, obj: (b.objetivos || []).join(' · ') }))
    : [...Array(Math.max(1, Math.ceil((srv.duracion_semanas || 8) / SEM_CICLO)))].map((_, i) => ({ nombre: `Bloque ${i + 1}`, sem: Math.min(SEM_CICLO, (srv.duracion_semanas || 8) - i * SEM_CICLO) }));
  abrirSheet(`<form class="stack" id="f-bp"><h2>Bloques del proceso</h2>
    <label class="f">Objetivo general del proceso<textarea id="bp-og" rows="3" placeholder="Ej. Bajar al 20 % de grasa ganando 1 kg de músculo">${esc(objetivoDe(f.ruta))}</textarea></label>
    <p class="small muted">Inicio del proceso: <b>${srv.inicio ? esc(fLarga(srv.inicio)) : 'sin fecha (ponla en Servicio)'}</b>. Cada bloque empieza cuando termina el anterior.</p>
    <div class="stack" id="bp-l" style="gap:8px">${iniciales.map(filaBloqueProc).join('')}</div>
    <button type="button" class="btn sm ghost" id="bp-add" style="align-self:flex-start">＋ Añadir bloque</button>
    <p class="small" id="bp-tot"></p>
    <button class="btn full" type="submit">Guardar bloques</button></form>`);
  const L = $('#bp-l'), tot = () => { const t = [...L.querySelectorAll('[data-k="sem"]')].reduce((a, i) => a + (+i.value || 0), 0); $('#bp-tot').innerHTML = `Total: <b>${t} semanas</b>${srv.duracion_semanas && t !== srv.duracion_semanas ? ` (el servicio dice ${srv.duracion_semanas}; al guardar se actualiza)` : ''}`; };
  tot(); L.addEventListener('input', tot);
  L.addEventListener('click', ev => { const q = ev.target.closest('[data-quitar]'); if (q) { q.closest('[data-bp]').remove(); tot(); } });
  $('#bp-add').addEventListener('click', () => { L.insertAdjacentHTML('beforeend', filaBloqueProc({ nombre: `Bloque ${L.children.length + 1}`, sem: SEM_CICLO })); tot(); });
  $('#f-bp').addEventListener('submit', async e => {
    e.preventDefault();
    const filas = [...L.querySelectorAll('[data-bp]')].map(r => ({ nombre: r.querySelector('[data-k="nombre"]').value.trim(), sem: Math.max(1, +r.querySelector('[data-k="sem"]').value || SEM_CICLO), obj: r.querySelector('[data-k="obj"]').value.trim() }));
    let w = 1; const rows = filas.map((b, i) => { const r = { alumno_id: f.id, orden: i + 2, nombre: b.nombre || `Bloque ${i + 1}`, semana_inicio: w, semana_fin: w + b.sem - 1, objetivos: b.obj ? [b.obj] : [], es_bloque: true }; w += b.sem; return r; });
    const og = $('#bp-og').value.trim();
    const del = await sb.from('hoja_ruta').delete().eq('alumno_id', f.id); if (del.error) return fallo(del.error);
    const todo = [...(og ? [{ alumno_id: f.id, orden: 1, nombre: 'Objetivo general', semana_inicio: 1, semana_fin: 1, objetivos: [og], es_bloque: false }] : []), ...rows];
    let r = todo.length ? await sb.from('hoja_ruta').insert(todo) : { error: null };
    if (r.error && /es_bloque/.test(r.error.message || '')) return fallo(r.error, 'Falta ejecutar el Bloque 8 en Supabase.');
    if (r.error) return fallo(r.error);
    const total = w - 1;
    if (srv.id && total && total !== srv.duracion_semanas) await sb.from('servicios').update({ duracion_semanas: total }).eq('id', srv.id);
    cerrarSheet(); toast('Bloques guardados'); await cargarCoach(); if (f.id === S.user.id) await cargarAlumno(S.user.id); await abrirFicha(f.id); await abrirSub('entreno');
  });
}

/* ---------- Entrenamientos presenciales (bono de sesiones con Jesús) ---------- */
const PRES_EST = { programada: 'Programada', dada: 'Hecha', tarde: 'Aviso con menos de 24 h · cuenta como hecha', cancelada: 'Cancelada a tiempo · no cuenta' };
const cuentaPres = p => p.estado === 'dada' || p.estado === 'tarde';
const ordPres = (a, b) => ((a.fecha || '9999-12-31') + (a.hora || '')).localeCompare((b.fecha || '9999-12-31') + (b.hora || ''));
/* Reservas de Calendly confirmadas sin fecha: la fecha está en el calendario de Jesús */
const fLargaP = p => p.fecha ? fLarga(p.fecha) : 'Fecha en tu calendario de Calendly';
const fNumP = p => p.fecha ? fNum(p.fecha) : 'Cal.';
const hhmm = h => h ? String(h).slice(0, 5) : '';
const fNum = iso => { const d = fecha(iso); return `${d.getDate()}/${d.getMonth() + 1}`; };
const REGLA_24H = 'Si se avisa con menos de 24 horas de antelación y no está justificado, la sesión cuenta como hecha.';
function datosPres(srv, lista) {
  const hechas = lista.filter(cuentaPres).sort(ordPres), total = srv?.sesiones_incluidas || 0;
  const prox = lista.filter(p => p.estado === 'programada' && (!p.fecha || p.fecha >= hoyISO())).sort(ordPres);
  return { total, hechas, prox, quedan: Math.max(0, total - hechas.length - prox.length) }; // quedan = sin usar ni reservar
}
function vPresenciales(srv, lista, coach) {
  lista = lista || [];
  if (!srv?.modulo_presencial && !srv?.sesiones_incluidas && !lista.length) return '';
  const D = datosPres(srv, lista), ocup = [...D.hechas, ...D.prox], n = Math.max(D.total, ocup.length);
  const cajas = [...Array(n)].map((_, k) => { const p = ocup[k];
    if (p) return `<button class="caja ${p.estado}" data-act="verPres" data-id="${p.id}" aria-label="Sesión ${k + 1}, ${esc(fLargaP(p))}"><b>${k + 1}</b><span>${fNumP(p)}</span></button>`;
    return `<button class="caja libre" data-act="${coach ? 'nuevaPres' : 'reservarPres'}" aria-label="Sesión ${k + 1}: ${coach ? 'programar' : 'reservar'}"><b>${k + 1}</b><span>${coach ? '＋' : 'Reservar'}</span></button>`; }).join('');
  const reservar = !coach && D.total && D.quedan > 0 ? `<button class="btn full" data-act="reservarPres">Reservar entrenamiento con Jesús</button>` : '';
  return `<section class="section"><div class="section-head"><h2>${coach ? 'Entrenamientos presenciales' : 'Tus entrenamientos conmigo'}</h2>${coach ? '<button class="btn sm" data-act="nuevaPres">＋ Añadir</button>' : ''}</div><div class="card stack">
    ${D.total ? `<div class="row"><div class="grow"><b class="num" style="font-family:var(--display);font-size:26px">${D.hechas.length} de ${D.total}</b><div class="small muted">sesiones hechas</div></div><div style="text-align:right"><b class="num" style="font-family:var(--display);font-size:26px;color:var(--blue)">${D.quedan}</b><div class="small muted">${D.quedan === 1 ? 'queda' : 'quedan'}</div></div></div>` : `<p class="small muted">${coach ? 'Indica en "Servicio → Editar" cuántas sesiones presenciales incluye su bono.' : 'Jesús indicará aquí tu bono de sesiones.'}</p>`}
    ${n ? `<div class="cajas">${cajas}</div><div class="row small muted" style="gap:12px;flex-wrap:wrap"><span><i class="lp hecha"></i> Hecha</span><span><i class="lp tarde"></i> Aviso &lt; 24 h (cuenta)</span><span><i class="lp prog"></i> Reservada</span><span><i class="lp libre"></i> Por usar</span></div>` : ''}
    <div class="stack" style="gap:6px"><span class="eyebrow">Próximos entrenamientos</span>${D.prox.map(p => `<div class="line" data-act="${coach ? 'editarPres' : 'verPres'}" data-id="${p.id}" style="cursor:pointer"><div class="ico">${svg('cal')}</div><div class="grow"><b class="small">${esc(fLargaP(p))}${p.hora ? ' · ' + hhmm(p.hora) : ''}</b>${p.tipo ? `<div class="small"><b>${esc(p.tipo)}</b></div>` : ''}${p.nota ? `<div class="small muted">${esc(p.nota)}</div>` : ''}</div><span class="small" style="color:var(--blue-text)">${coach ? 'Editar' : 'Ver / cancelar'} ›</span></div>`).join('') || '<div class="small muted">No hay ninguno programado.</div>'}</div>
    ${D.hechas.length ? `<div class="stack" style="gap:6px"><span class="eyebrow">Ya canjeados</span>${D.hechas.slice().reverse().map(p => `<div class="line" data-act="verPres" data-id="${p.id}" style="cursor:pointer"><span class="caja mini ${p.estado}"><b>${ocup.indexOf(p) + 1}</b></span><div class="grow"><b class="small">${esc(fLargaP(p))}</b><div class="small muted">${esc(qEntreno(p, coach) || (p.estado === 'tarde' ? 'Aviso con menos de 24 h' : p.nota || 'Sesión presencial'))}</div></div><span class="small muted">›</span></div>`).join('')}</div>` : ''}
    ${reservar}
    ${!coach && D.prox.length ? `<button class="btn ghost full" data-act="cancelarPresLista">Cancelar una sesión reservada</button>` : ''}
    ${coach ? `<p class="small muted">Calendly y WhatsApp: ${S.calendly ? `<a href="${esc(S.calendly)}" target="_blank" rel="noopener">${esc(S.calendly.replace(/^https?:\/\//, ''))}</a>` : 'sin configurar'} · <button class="linkbtn" data-act="configCalendly">${S.calendly ? 'Cambiar' : 'Configurar'}</button></p>` : ''}
    <p class="note">${REGLA_24H}</p>
  </div></section>`;
}
function qEntreno(p, coach) {
  const ses = (coach ? S.ficha?.ses : S.d?.sesiones || [])?.find(s => s.id === p.sesion_id); if (!ses) return '';
  const dia = ses.dias || (S.d?.programa?.dias || []).find(d => d.id === ses.dia_id);
  return dia ? [dia.nombre, dia.foco].filter(Boolean).join(' · ') : 'Entrenamiento registrado';
}
function verPres(id) {
  const coach = S.modo === 'coach' && S.ficha && !S.obj, lista = coach ? S.ficha.pres : S.d.presenciales, p = (lista || []).find(x => x.id === id); if (!p) return;
  const ses = coach ? S.ficha.ses.find(s => s.id === p.sesion_id) : S.d.sesiones.find(s => s.id === p.sesion_id);
  const dia = ses && (ses.dias || (S.d?.programa?.dias || []).find(d => d.id === ses.dia_id));
  const D = datosPres(coach ? S.ficha.srv : S.d.servicio, lista), num = D.hechas.indexOf(p) + 1;
  abrirSheet(`<div class="stack"><span class="eyebrow">Sesión presencial ${num || ''}</span><h2>${esc(fLargaP(p))}${p.hora ? ' · ' + hhmm(p.hora) : ''}</h2>
    <span class="pill ${p.estado === 'tarde' ? 'bad' : p.estado === 'dada' ? 'ok' : ''}" style="align-self:flex-start">${esc(PRES_EST[p.estado] || p.estado)}</span>
    ${dia ? `<div class="card stack"><span class="eyebrow">Qué entrenamos</span><b>${esc(dia.nombre || '')} · ${esc(dia.foco || '')}</b>${ses.registros_series ? `<div class="small muted">${ses.registros_series.length} series registradas</div>` : ''}${ses.duracion_min ? `<div class="small muted">${ses.duracion_min} minutos</div>` : ''}</div>` : `<p class="small muted">${p.estado === 'tarde' ? 'No se entrenó: se avisó con menos de 24 horas.' : 'Sin entrenamiento registrado en la app.'}</p>`}
    ${p.nota ? `<div class="small"><span class="muted">Nota:</span> ${esc(p.nota)}</div>` : ''}
    ${coach ? `<div class="row" style="gap:8px">${p.sesion_id ? `<button class="btn sm" data-act="presVerSesion" data-id="${p.sesion_id}">Ver entrenamiento</button>` : ''}<button class="btn sm ghost" data-act="editarPres" data-id="${p.id}">✎ Editar</button></div>` : ''}
    ${!coach && p.estado === 'programada' && p.fecha >= hoyISO() ? `<button class="btn ghost full" data-act="cancelarPres" data-id="${p.id}" style="color:var(--bad)">Cancelar esta sesión</button>` : ''}
    <button class="btn ghost full" data-act="cerrarSheet">Cerrar</button></div>`);
}
/* Cancelación por el alumno: solo con más de 24 h de antelación */
const momentoPres = p => new Date(`${p.fecha}T${hhmm(p.hora) || '00:00'}:00`);
const faltanHoras = p => (momentoPres(p) - Date.now()) / 36e5;
/* Acepta el número o el enlace de WhatsApp (wa.me, api.whatsapp.com o wa.link) */
function vChatCoach() {
  return `<section class="section"><a class="btn gold full chat-coach" href="${esc(waJesus('Hola Jesús, '))}" target="_blank" rel="noopener">💬 Escribir a Jesús por chat</a></section>`;
}
const waJesus = txt => {
  const v = String(S.whatsapp || '').trim();
  const m = v.match(/wa\.me\/\+?(\d{6,})/) || v.match(/phone=\+?(\d{6,})/) || (/^[\d\s+()-]+$/.test(v) ? [0, v.replace(/\D/g, '')] : null);
  if (m) return `https://wa.me/${m[1]}?text=${encodeURIComponent(txt)}`;
  return /^https?:\/\//.test(v) ? v : `https://wa.me/?text=${encodeURIComponent(txt)}`;
};
function cancelarPresLista() {
  const l = datosPres(S.d.servicio, S.d.presenciales || []).prox;
  if (l.length === 1) return cancelarPres(l[0].id);
  abrirSheet(`<div class="stack"><h2>¿Qué sesión quieres cancelar?</h2>${l.map(p => `<button class="btn ghost full" data-act="cancelarPres" data-id="${p.id}" style="text-align:left">${esc(fLargaP(p))}${p.hora ? ' · ' + hhmm(p.hora) : ''}</button>`).join('')}<button class="btn ghost full" data-act="cerrarSheet">Volver</button></div>`);
}
function cancelarPres(id) {
  const p = (S.d.presenciales || []).find(x => x.id === id); if (!p) return;
  const cuando = `${fLargaP(p)}${p.hora ? ' a las ' + hhmm(p.hora) : ''}`;
  if (faltanHoras(p) < 24) {
    return abrirSheet(`<div class="stack"><h2>No se puede cancelar</h2>
      <p class="small">Tu sesión del <b>${esc(cuando)}</b> es dentro de menos de 24 horas, así que ya no se puede cancelar desde la app.</p>
      <div class="aprox small">${REGLA_24H}</div>
      <p class="small">Escríbele a Jesús por WhatsApp y cuéntale qué ha sucedido: si está justificado, él la recolocará.</p>
      <a class="btn full" href="${esc(waJesus(`Hola Jesús, no voy a poder venir a la sesión del ${cuando}. Te cuento lo que ha pasado: `))}" target="_blank" rel="noopener">Escribir a Jesús por WhatsApp</a>
      <button class="btn ghost full" data-act="cerrarSheet">Cerrar</button></div>`);
  }
  abrirSheet(`<div class="stack"><h2>Cancelar sesión</h2><p class="small">¿Seguro que quieres cancelar tu sesión del <b>${esc(cuando)}</b>? Como avisas con más de 24 horas, no cuenta como hecha y la puedes volver a reservar.</p>
    ${p.origen === 'calendly' ? '<p class="note">La reservaste en Calendly: cancélala también desde el email de confirmación de Calendly para liberar el hueco en el calendario de Jesús.</p>' : ''}
    <button class="btn full" data-act="confirmarCancelPres" data-id="${p.id}" style="background:var(--bad)">Sí, cancelar la sesión</button><button class="btn ghost full" data-act="cerrarSheet">No, mantenerla</button></div>`);
}
async function confirmarCancelPres(id) {
  const p = (S.d.presenciales || []).find(x => x.id === id); if (!p) return;
  if (faltanHoras(p) < 24) return cancelarPres(id);
  const { data, error } = await sb.from('presenciales').update({ estado: 'cancelada', nota: [p.nota, 'Cancelada por el alumno el ' + fCorta(hoyISO())].filter(Boolean).join(' · ') }).eq('id', id).select();
  if (error || !data?.length) return fallo(error || {}, 'No se ha podido cancelar. Escríbele a Jesús por WhatsApp.');
  cerrarSheet(); toast('Sesión cancelada'); await cargarAlumno(S.user.id); render();
}
/* Calendario de próximas sesiones presenciales (pestaña Entreno) */
function vCalendarioPres() {
  const l = (S.d.presenciales || []).filter(p => p.estado === 'programada' && p.fecha >= hoyISO()).sort(ordPres);
  const srv = S.d.servicio; if (!l.length && !srv?.modulo_presencial && !srv?.sesiones_incluidas) return '';
  const ini = lunesDe(hoyISO()), dias = [...Array(28)].map((_, i) => sumaDias(ini, i)), porDia = {};
  l.forEach(p => (porDia[p.fecha] ||= []).push(p));
  const celda = d => { const ps = porDia[d], pas = d < hoyISO(); return `<${ps ? `button data-act="verPres" data-id="${ps[0].id}"` : 'div'} class="cal-d ${ps ? 'con' : ''} ${d === hoyISO() ? 'hoy' : ''} ${pas ? 'pas' : ''}"><b>${fecha(d).getDate()}</b>${ps ? `<span>${hhmm(ps[0].hora) || '●'}</span>` : ''}</${ps ? 'button' : 'div'}>`; };
  const mes = fecha(ini).toLocaleDateString('es-ES', { month: 'long' }), mes2 = fecha(dias[27]).toLocaleDateString('es-ES', { month: 'long' });
  return `<section class="section"><div class="section-head"><h2>Tus sesiones con Jesús</h2><span class="small muted">${esc(mes === mes2 ? mes : mes + ' – ' + mes2)}</span></div><div class="card stack">
    <div class="cal">${['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(x => `<span class="cal-h">${x}</span>`).join('')}${dias.map(celda).join('')}</div>
    ${l.length ? l.map(p => `<div class="line" data-act="verPres" data-id="${p.id}" style="cursor:pointer"><div class="ico">${svg('cal')}</div><div class="grow"><b class="small">${esc(fLargaP(p))}${p.hora ? ' · ' + hhmm(p.hora) : ''}</b><div class="small muted">${esc(p.tipo || 'Entrenamiento presencial con Jesús')}</div></div><span class="small" style="color:var(--blue-text)">›</span></div>`).join('') : '<p class="small muted">No tienes sesiones reservadas.</p>'}
    ${S.obj ? '' : '<button class="btn sm" data-act="reservarPres" style="align-self:flex-start">Reservar sesión</button>'}
    ${coach ? '' : '<button class="btn sm ghost" data-act="sincCal" style="align-self:flex-start">↻ Actualizar mis reservas</button>'}
  </div></section>`;
}
const etiquetaDia = d => `${d.nombre}${d.foco ? ' · ' + d.foco : ''}`;
function formPres(id) {
  const p = id ? S.ficha.pres.find(x => x.id === id) : null;
  const sesDia = f => S.ficha.ses.filter(s => s.fecha === f);
  const dias = S.ficha.prog?.dias || [];
  abrirSheet(`<form class="stack" id="f-pres"><h2>${p ? 'Editar sesión presencial' : 'Sesión presencial'}</h2>
    <div style="display:grid;grid-template-columns:1fr 110px;gap:8px"><label class="f">Fecha<input type="date" id="pr-f" value="${p?.fecha || hoyISO()}"></label><label class="f">Hora<input type="time" id="pr-h" value="${hhmm(p?.hora)}"></label></div>
    <label class="f">Estado<select id="pr-e">${Object.entries(PRES_EST).map(([k, l]) => `<option value="${k}" ${(p?.estado || 'programada') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="f">Título del entrenamiento<input type="text" id="pr-tt" list="pr-dl" value="${esc(p?.tipo || '')}" placeholder="Escríbelo tú, p. ej. Complementario: core y movilidad"><datalist id="pr-dl">${dias.map(d => `<option value="${esc(etiquetaDia(d))}"></option>`).join('')}</datalist></label>
    <label class="f">Sesión hecha ese día (opcional, para vincularla)<select id="pr-s"><option value="">— Ninguna —</option></select></label>
    <label class="f">Nota (la ve el alumno)<input type="text" id="pr-n" value="${esc(p?.nota || '')}" placeholder="Ej. Trabajo de técnica en sentadilla"></label>
    <p class="note">${REGLA_24H}</p>
    <button class="btn full" type="submit">Guardar</button>${p ? '<button class="btn ghost full" type="button" id="pr-del" style="color:var(--bad)">Eliminar</button>' : ''}</form>`);
  const llenar = () => { const f = $('#pr-f').value; $('#pr-s').innerHTML = '<option value="">— Ninguno —</option>' + sesDia(f).map(s => `<option value="${s.id}" ${p?.sesion_id === s.id ? 'selected' : ''}>${esc((s.dias?.nombre || '') + ' · ' + (s.dias?.foco || ''))}</option>`).join(''); };
  llenar(); $('#pr-f').addEventListener('change', llenar);
  $('#f-pres').addEventListener('submit', async e => {
    e.preventDefault();
    const row = { fecha: $('#pr-f').value || hoyISO(), hora: $('#pr-h').value || null, estado: $('#pr-e').value, sesion_id: +$('#pr-s').value || null, nota: $('#pr-n').value.trim() || null, tipo: $('#pr-tt').value.trim() || null };
    const guardar = r => p ? sb.from('presenciales').update(r).eq('id', p.id) : sb.from('presenciales').insert({ ...r, alumno_id: S.ficha.id });
    let { error } = await guardar(row), aviso = null;
    if (error && /tipo/.test(error.message || '') && row.tipo) { delete row.tipo; ({ error } = await guardar(row)); aviso = 'Guardado, pero el tipo no: ejecuta el Bloque 28 en Supabase'; }
    if (error) return fallo(error, /presenciales/.test(error.message || '') ? 'Falta ejecutar el Bloque 8 en Supabase.' : undefined);
    cerrarSheet(); toast(aviso || 'Guardado'); await cargarPres();
  });
  $('#pr-del')?.addEventListener('click', async ev => { const x = ev.currentTarget; if (!x.dataset.ok) { x.dataset.ok = 1; x.textContent = 'Pulsa otra vez para eliminarla'; return; } const { error } = await sb.from('presenciales').delete().eq('id', p.id); if (error) return fallo(error); cerrarSheet(); toast('Eliminada'); await cargarPres(); });
}
async function cargarPres() {
  const { data } = await sb.from('presenciales').select('*').eq('alumno_id', S.ficha.id).order('fecha');
  S.ficha.pres = data || []; render();
}
/* Reserva con Calendly: el alumno elige hueco (llega a Google Calendar de Jesús) y la app lo apunta */
async function cargarAjustes() { try { const { data } = await sb.from('ajustes').select('*'); S.calendly = (data || []).find(x => x.clave === 'calendly')?.valor || window.LOF_CONFIG?.calendly || ''; S.whatsapp = (data || []).find(x => x.clave === 'whatsapp')?.valor || ''; } catch (e) { } }
function formCalendly() {
  abrirSheet(`<form class="stack" id="f-cal"><h2>Calendly</h2>
    <p class="small">Pega el enlace de tu evento de Calendly para los entrenamientos presenciales (el que conectas a tu Google Calendar).</p>
    <label class="f">Enlace<input type="url" id="cal-u" value="${esc(S.calendly || '')}" placeholder="https://calendly.com/tu-usuario/entrenamiento-presencial"></label>
    <label class="f">Tu WhatsApp: pega el enlace a tu chat (o tu número con prefijo)<input type="text" id="cal-w" value="${esc(S.whatsapp || '')}" placeholder="https://wa.me/34600111222"></label>
    <p class="note">Cuando un alumno toque un recuadro libre se abrirá tu Calendly con su nombre y email ya puestos. Calendly te avisa y lo añade a tu Google Calendar; la app guarda la reserva en su bono.</p>
    <button class="btn full" type="submit">Guardar</button></form>`);
  $('#f-cal').addEventListener('submit', async e => {
    e.preventDefault(); const v = $('#cal-u').value.trim();
    const w = $('#cal-w').value.trim();
    const { error } = await sb.from('ajustes').upsert([{ clave: 'calendly', valor: v }, { clave: 'whatsapp', valor: w }], { onConflict: 'clave' });
    S.whatsapp = w;
    if (error) return fallo(error, 'Falta ejecutar el Bloque 8 en Supabase.');
    S.calendly = v; cerrarSheet(); toast('Calendly guardado'); render();
  });
}
let calCargado = null;
function cargarCalendly() {
  if (calCargado) return calCargado;
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://assets.calendly.com/assets/external/widget.css'; document.head.appendChild(css);
  calCargado = new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'https://assets.calendly.com/assets/external/widget.js'; sc.onload = res; sc.onerror = rej; document.head.appendChild(sc); });
  return calCargado;
}
async function reservarPres() {
  const D = datosPres(S.d.servicio, S.d.presenciales || []);
  if (D.total && D.quedan <= 0) return toast('Ya tienes reservadas todas las sesiones de tu bono');
  if (!S.calendly) return abrirSheet(`<div class="stack"><h2>Reservar entrenamiento</h2><p class="small">Escríbele a Jesús por WhatsApp para elegir día y hora. En cuanto la apunte, aparecerá aquí.</p><button class="btn ghost full" data-act="cerrarSheet">Entendido</button></div>`);
  try { await cargarCalendly(); } catch (e) { window.open(S.calendly, '_blank'); return; }
  S.esperaCal = true;
  window.Calendly.initPopupWidget({ url: S.calendly, prefill: { name: S.perfil?.nombre || '', email: S.perfil?.email || '' } });
}
window.addEventListener('message', e => {
  if (!S.esperaCal || !/calendly\.com$/.test(new URL(e.origin || 'http://x').hostname) || e.data?.event !== 'calendly.event_scheduled') return;
  S.esperaCal = false;
  setTimeout(async () => { try { window.Calendly?.closePopupWidget?.(); } catch (er) { } const r = await sincronizarCalendly(false); if (!r?.nuevas) setTimeout(() => sincronizarCalendly(true), 4000); }, 1200);
});
/* Reservas de Calendly: la función calendly-sync consulta la agenda de Jesús con el email del alumno y las guarda en su bono */
async function sincronizarCalendly(manual) {
  try {
    const { data, error } = await sb.functions.invoke('rapid-action');
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    if (data?.nuevas || data?.canceladas) {
      await cargarAlumno(S.user.id); render();
      toast(data.nuevas ? 'Reserva descontada de tu bono' : 'Reserva cancelada');
    } else if (manual) toast('No hay reservas nuevas');
    return data;
  } catch (err) { console.error(err); if (manual) toast('No se han podido actualizar las reservas'); return null; }
}
/* "Entrenar con…": pide la fecha y si canjea una sesión presencial */
function formEntrenarCon(alumnoId) {
  const a = S.c.perfiles.find(p => p.id === alumnoId) || {}, srv = S.ficha?.id === alumnoId ? S.ficha.srv : S.c.servicios.find(s => s.alumno_id === alumnoId);
  const pres = S.ficha?.id === alumnoId ? (S.ficha.pres || []) : [], D = datosPres(srv, pres), conBono = srv?.modulo_presencial || D.total;
  abrirSheet(`<form class="stack" id="f-ec"><h2>Entrenar con ${esc((a.nombre || '').split(' ')[0])}</h2>
    <label class="f">Fecha del entrenamiento<input type="date" id="ec-f" value="${hoyISO()}"></label>
    ${conBono ? `<label class="row small"><input type="checkbox" id="ec-p" checked style="width:20px;height:20px"> Canjea 1 sesión presencial${D.total ? ` (le quedan ${D.total - D.hechas.length} de ${D.total})` : ''}</label><p class="small muted" id="ec-info"></p>` : ''}
    <button class="btn full" type="submit">Empezar</button></form>`);
  const info = () => { const f = $('#ec-f').value, pg = pres.find(p => p.estado === 'programada' && p.fecha === f); if ($('#ec-info')) $('#ec-info').textContent = pg ? `Tiene una sesión programada ese día${pg.hora ? ' a las ' + hhmm(pg.hora) : ''}: se marcará como hecha.` : ''; };
  info(); $('#ec-f').addEventListener('change', info);
  $('#f-ec').addEventListener('submit', async e => {
    e.preventDefault();
    const f = $('#ec-f').value || hoyISO(), canjea = !!$('#ec-p')?.checked, pg = pres.find(p => p.estado === 'programada' && p.fecha === f);
    cerrarSheet(); await entrenarAhora(alumnoId, { fecha: f, presencial: canjea, presProg: pg?.id || null });
  });
}
async function registrarPresencial(sesId) {
  const o = S.obj; if (!o?.presencial) return;
  const fila = { estado: 'dada', sesion_id: sesId };
  const r = o.presProg ? await sb.from('presenciales').update(fila).eq('id', o.presProg) : await sb.from('presenciales').insert({ ...fila, alumno_id: o.id, fecha: o.fecha || hoyISO() });
  if (r.error) toast('Sesión guardada, pero no se ha podido canjear la presencial (¿falta el Bloque 8?)');
}
/* Nuevo ciclo: copia el programa activo para editarlo sin perder el historial del anterior */
function formNuevoCiclo() {
  const p = S.editor.prog; if (!p) return;
  const m = String(p.nombre).match(/ciclo\s*(\d+)/i), sug = m ? `Ciclo ${+m[1] + 1}` : 'Ciclo 2';
  const aid = p.alumno_id || S.editor.alumnoId, P = proceso(S.c.servicios.find(x => x.alumno_id === aid));
  const prev = p.ciclo || P?.ciclo || 1, cic = P?.ciclos || [], def = cic.some(c => c.n === prev + 1) ? prev + 1 : prev;
  abrirSheet(`<form class="stack" id="f-nc"><h2>Nuevo ciclo</h2><p class="small">Se crea una copia de <b>${esc(p.nombre)}</b> con todos sus días, bloques y ejercicios para que la modifiques. El ciclo anterior queda guardado con su historial.</p>
    <label class="f">Nombre del nuevo ciclo<input type="text" id="nc-n" value="${esc(sug)}"></label>
    ${cic.length ? `<label class="f">Bloque del proceso al que pertenece<select id="nc-c">${cic.map(c => `<option value="${c.n}" ${c.n === def ? 'selected' : ''}>${esc(nomCiclo(c))} · ${esc(fCorta(c.ini))} – ${esc(fCorta(c.fin))}</option>`).join('')}</select></label>` : ''}
    <button class="btn full" type="submit">Crear ciclo</button></form>`);
  $('#f-nc').addEventListener('submit', async e => {
    e.preventDefault(); const btn = e.submitter; btn.disabled = true; btn.textContent = 'Copiando…';
    try {
      const { data: np, error } = await sb.from('programas').insert({ alumno_id: p.alumno_id || S.editor.alumnoId, nombre: $('#nc-n').value.trim() || sug, dias_semana: p.dias_semana, activo: true }).select().single();
      if (error) throw error;
      for (const d of p.dias) {
        const { id, bloques_sesion, programa_id, ...dd } = d;
        const { data: nd, error: e1 } = await sb.from('dias').insert({ ...dd, programa_id: np.id }).select().single(); if (e1) throw e1;
        for (const b of d.bloques_sesion) {
          const { id: bid, ejercicios_sesion, dia_id, ...bb } = b;
          const { data: nb, error: e2 } = await sb.from('bloques_sesion').insert({ ...bb, dia_id: nd.id }).select().single(); if (e2) throw e2;
          if (b.ejercicios_sesion.length) { const { error: e3 } = await sb.from('ejercicios_sesion').insert(b.ejercicios_sesion.map(({ id, ejercicios, bloque_id, ...x }) => ({ ...x, bloque_id: nb.id }))); if (e3) throw e3; }
        }
      }
      await sb.from('programas').update({ activo: false }).eq('id', p.id);
      const nc = +($('#nc-c')?.value || 0);
      if (nc) { // si falta la columna (Bloque 15) no pasa nada: se sigue mostrando como bloque actual
        await sb.from('programas').update({ ciclo: nc }).eq('id', np.id);
        if (nc > 1) await sb.from('programas').update({ ciclo: nc - 1 }).eq('id', p.id).is('ciclo', null);
      }
      cerrarSheet(); toast('Nuevo ciclo creado'); await cargarCoach(); refrescarEditor();
    } catch (err) { btn.disabled = false; btn.textContent = 'Crear ciclo'; fallo(err, 'No se ha podido crear el ciclo.'); }
  });
}

/* ---------- Tests y valoraciones (como el apartado CONTROL de las hojas) ---------- */
const PLANTILLAS = {
  '1rm': { titulo: 'Test 1RM · fuerza máxima', cols: 'valor', datos: ['Cintura escapular', 'Bíceps', 'Jalón vertical', 'Pectoral', 'Tríceps', 'Empuje vertical', 'Adductores', 'Glúteos', 'Abdomen'],
    protocolo: 'Para valorar tu fuerza máxima a 1 sola repetición hace falta una buena aproximación en cada máquina.\n\nAproximación:\n1º Unas 8 repeticiones con un peso medio (exigente pero sin fatiga).\n2º Subes a un peso más exigente para hacer 5-6 repeticiones a RIR 2-3.\n3º 2-3 repeticiones con un peso aún mayor; en la última, bajada muy lenta.\n\nEl 1RM:\nDescansas 30 segundos, eliges un peso con el que creas que solo puedes hacer 1 repetición y lo intentas. Vas subiendo el peso, administrando el descanso, hasta que ya no puedas levantarlo. Se anota el último peso que pudiste.' },
  descompensacion: { titulo: 'Test de descompensaciones (unilateral)', cols: 'di', datos: ['Empuje unilateral (brazo)', 'Tracción unilateral (brazo)', 'Empuje de pierna', 'Isquiotibiales', 'Cuádriceps'],
    protocolo: 'Sirve para saber con qué brazo eres más débil en empujes y tracciones, y con qué pierna.\n\nAproximación:\n1º Un peso exigente que no te fatigue: 8-10 repeticiones con ambas extremidades a RIR 2-3.\n2º Subes el peso para hacer 5-6 repeticiones a RIR 2-3.\n\nEl test:\nHaces 1 repetición con una extremidad y acto seguido con la otra (siempre solo 1). Si lo consigues, sigues subiendo el peso hasta que una de las dos no pueda; continúas con la otra hasta que tampoco pueda y anotamos la diferencia. Si no hay descompensación y las dos acaban con el mismo peso, también se anota.' },
  fc: { titulo: 'Zonas de frecuencia cardiaca', cols: 'valor', datos: ['FC máxima', 'Zona 1 · predominio aeróbico (65–80 %)', 'Zona 2 · umbral (80–90 %)', 'Zona 3 · predominio anaeróbico (90–100 %)'],
    protocolo: 'Estimamos tu frecuencia cardiaca máxima con la fórmula de Tanaka: FC máx = 208,75 − (0,7 × edad).\n\nZona 1: base y cimientos de tu capacidad cardiovascular; predominio de las grasas y fatiga muy baja.\nZona 2: empieza a predominar el metabolismo de los hidratos; la fatiga aparece antes.\nZona 3: zona de potencia (VO2max); solo se mantiene segundos o pocos minutos.' },
  movilidad: { titulo: 'Movilidad articular', cols: 'valor', datos: ['Cadena lateral', 'Cadena posterior e isquiotibiales', 'Hombros', 'Rotación de cadera', 'Tobillos', 'Cadena anterior'], protocolo: '' },
  ritmos: { titulo: 'Test de carrera de 5 minutos · ritmos', cols: 'valor', datos: ['Distancia en 5 minutos', 'Ritmo medio (min/km)'],
    protocolo: 'Calentamiento: en pista o zona con distancia conocida, 10 minutos a ritmo bajo y 5 minutos subiendo el ritmo de forma progresiva. Después, unos 200 m de cambios de ritmo casi máximos (20-30 m) con 20-30 m de recuperación.\n\nParte principal: 5 minutos recorriendo la mayor distancia posible.' },
  carrera: { titulo: 'Análisis de carrera', cols: 'valor', datos: ['Caminata a 6 km/h', 'Carrera a 12 km/h'], protocolo: 'Grabamos de lado, de espaldas y de frente caminando y corriendo en cinta.' },
  otra: { titulo: 'Otra prueba', cols: 'valor', datos: [], protocolo: '' }
};
const ordenarValoraciones = l => { l.forEach(v => (v.pruebas || []).sort((a, b) => (a.orden || 0) - (b.orden || 0))); return l.sort((a, b) => b.fecha.localeCompare(a.fecha)); };
const numDe = v => { const m = String(v ?? '').replace(',', '.').match(/-?\d+(\.\d+)?/); return m ? +m[0] : null; };
const difPct = (d, i) => { const a = numDe(d), b = numDe(i); if (a == null || b == null || !Math.max(a, b)) return null; return Math.round(Math.abs(a - b) / Math.max(a, b) * 100); };
const resumenPrueba = p => {
  const ds = p.datos || [];
  if (p.tipo === 'descompensacion') { const m = Math.max(-1, ...ds.map(x => difPct(x.d, x.i) ?? -1)); return m >= 0 ? `Mayor diferencia: ${m} %` : ''; }
  if (p.tipo === 'fc') return ds[0]?.valor ? `FC máx ${ds[0].valor}` : '';
  const con = ds.filter(x => x.valor); return con.length ? `${con.length} ${con.length === 1 ? 'resultado' : 'resultados'}` : '';
};
function anteriorDe(lista, val, p) {
  return lista.filter(v => v.fecha < val.fecha).map(v => (v.pruebas || []).find(x => x.tipo === p.tipo && x.titulo === p.titulo)).find(Boolean);
}
function vResultados(p, ant) {
  const ds = (p.datos || []).filter(x => x.nombre);
  if (!ds.length) return '';
  if (p.tipo === 'descompensacion') {
    return `<div class="stack" style="gap:12px">${ds.map(x => {
      const a = numDe(x.d), b = numDe(x.i), mx = Math.max(a || 0, b || 0) || 1, pc = difPct(x.d, x.i);
      const debil = pc ? (a < b ? 'derecho' : 'izquierdo') : null, col = pc == null ? 'var(--muted)' : pc >= 15 ? 'var(--bad)' : pc >= 8 ? 'var(--warn)' : 'var(--ok)';
      return `<div class="stack" style="gap:5px"><div class="row small"><b class="grow">${esc(x.nombre)}</b>${pc != null ? `<span class="pill" style="color:${col}">${pc} %${debil ? ' · más débil el lado ' + debil : ''}</span>` : ''}</div>
        <div class="lado"><span class="small muted">Dcha.</span><div class="track"><i style="width:${(a || 0) / mx * 100}%;background:var(--blue)"></i></div><b class="small num">${esc(x.d || '—')}</b></div>
        <div class="lado"><span class="small muted">Izda.</span><div class="track"><i style="width:${(b || 0) / mx * 100}%;background:var(--gold)"></i></div><b class="small num">${esc(x.i || '—')}</b></div></div>`;
    }).join('')}<p class="note">Diferencia por encima del 15 %: desequilibrio a trabajar. Entre 8 y 15 %: a vigilar.</p></div>`;
  }
  const nums = ds.map(x => numDe(x.valor)), mx = Math.max(1, ...nums.filter(n => n != null)), barras = p.tipo === '1rm';
  return `<div class="stack" style="gap:8px">${ds.map((x, k) => {
    const prev = ant && (ant.datos || []).find(y => y.nombre === x.nombre), dv = prev && nums[k] != null && numDe(prev.valor) != null ? nums[k] - numDe(prev.valor) : null;
    return `<div class="stack" style="gap:4px"><div class="row small"><span class="grow">${esc(x.nombre)}</span><b class="num">${esc(x.valor || '—')}</b>${dv ? `<span class="pill ${dv > 0 ? 'ok' : 'bad'} num">${dv > 0 ? '+' : ''}${fmtNum(dv)}</span>` : ''}</div>${barras && nums[k] != null ? `<div class="track"><i style="width:${nums[k] / mx * 100}%;background:var(--blue)"></i></div>` : ''}</div>`;
  }).join('')}</div>`;
}
function vPrueba(p, lista, val, coach) {
  const ant = anteriorDe(lista, val, p);
  return `<details class="card prueba" ${coach ? 'open' : ''}><summary><div class="row"><div class="grow"><h3>${esc(p.titulo)}</h3><div class="small muted">${esc(resumenPrueba(p))}</div></div><span class="mas">＋</span></div></summary>
    <div class="stack" style="margin-top:12px">
    ${vResultados(p, ant)}
    ${ant ? `<p class="small muted">Comparado con ${esc(fCorta(lista.find(v => (v.pruebas || []).includes(ant)).fecha))}.</p>` : ''}
    ${p.valoracion ? `<div class="stack" style="gap:4px"><span class="eyebrow">Valoración del coach</span><div class="small pre">${esc(p.valoracion)}</div></div>` : ''}
    ${p.foco ? `<div class="aprox stack" style="gap:4px"><span class="eyebrow">Foco de trabajo</span><div class="small pre">${esc(p.foco)}</div></div>` : ''}
    ${p.protocolo ? `<details class="como"><summary class="small"><b>Cómo se hace la prueba</b></summary><div class="small pre muted" style="margin-top:8px">${esc(p.protocolo)}</div></details>` : ''}
    ${p.video_url ? `<a class="btn sm" style="align-self:flex-start" href="${esc(p.video_url)}" target="_blank" rel="noopener">▶ Vídeo</a>` : ''}
    ${coach ? `<div class="row" style="gap:8px"><button class="btn sm" data-act="editarPrueba" data-id="${p.id}">✎ Editar prueba</button></div>` : ''}
    </div></details>`;
}
function vInforme(val, lista, coach) {
  return `<div class="card hero stack"><span class="eyebrow">${esc(fLarga(val.fecha))} ${fecha(val.fecha).getFullYear()}</span><h2 style="color:#fff">${esc(val.nombre)}</h2>
      ${val.resumen ? `<div class="stack" style="gap:6px;border-top:1px solid rgba(255,255,255,.14);padding-top:12px"><span class="eyebrow">Informe · valoración de todo el contexto</span><div class="small pre">${esc(val.resumen)}</div></div>` : `<div class="small muted">${coach ? 'Escribe aquí el informe general con "Editar informe".' : 'Jesús añadirá aquí el informe de la valoración.'}</div>`}
      ${coach ? `<div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn sm gold" data-act="editarValoracion" data-id="${val.id}">✎ Editar informe</button><button class="btn sm ghost" data-act="nuevaPrueba" data-id="${val.id}" style="background:#fff">＋ Añadir prueba</button></div>` : ''}</div>
    <h2 style="margin-top:6px">Pruebas</h2>
    ${(val.pruebas || []).map(p => vPrueba(p, lista, val, coach)).join('') || '<div class="card empty">Aún no hay pruebas en esta valoración.</div>'}`;
}
function vTests() {
  const l = S.d.valoraciones || [];
  if (!l.length) return `<section class="stack"><span class="eyebrow">Control y evolución</span><h1>Tests</h1></section><div class="section card empty">Al empezar tu proceso Jesús te hará el test inicial. Aquí verás tu informe y el resultado de cada prueba.</div>`;
  const sel = l.find(v => v.id === S.valSel) || l[0];
  return `<section class="stack"><span class="eyebrow">Control y evolución</span><h1>Tests</h1>
    ${l.length > 1 ? `<div class="chips" style="gap:6px">${l.map(v => `<button class="pill ${v.id === sel.id ? 'blue' : ''}" data-act="verValoracion" data-id="${v.id}">${esc(v.nombre)} · ${esc(fCorta(v.fecha))}</button>`).join('')}</div>` : ''}</section>
  <section class="section">${vInforme(sel, l, false)}</section>`;
}

/* Coach: tests en la ficha */
function vTestsFicha(f) {
  const l = f.val || [];
  return `<section class="section"><div class="section-head"><h2>Tests y valoraciones</h2><button class="btn sm" data-act="nuevaValoracion">＋ Nuevo test</button></div>
    <div class="card">${l.map(v => `<div class="line" data-act="abrirValoracion" data-id="${v.id}" style="cursor:pointer"><span class="small muted num" style="width:64px;flex:none">${esc(fCorta(v.fecha))}</span><div class="grow"><div class="small"><b>${esc(v.nombre)}</b> · ${(v.pruebas || []).length} pruebas</div>${v.resumen ? `<div class="small muted">${esc(v.resumen.slice(0, 90))}${v.resumen.length > 90 ? '…' : ''}</div>` : ''}</div><span class="small" style="color:var(--blue-text)">Abrir ›</span></div>`).join('') || `<div class="empty">${f.valError ? 'Ejecuta el Bloque 7 en Supabase para activar los tests.' : 'Sin tests todavía. Crea el test inicial con "Nuevo test".'}</div>`}</div></section>`;
}
function vValoracionCoach() {
  const f = S.ficha, val = (f.val || []).find(v => v.id === S.valEd), a = S.c.perfiles.find(p => p.id === f.id) || {};
  if (!val) { S.valEd = null; return vFicha(); }
  return `<section class="stack"><button class="btn sm ghost" data-act="cerrarValoracion" style="align-self:flex-start">← Ficha de ${esc((a.nombre || '').split(' ')[0])}</button><span class="eyebrow">${esc(a.nombre || '')} · así lo ve en su pestaña Tests</span></section>
  <section class="section">${vInforme(val, f.val, true)}</section>`;
}
function formValoracion(id) {
  const v = id ? S.ficha.val.find(x => x.id === id) : null;
  abrirSheet(`<form class="stack" id="f-val"><h2>${v ? 'Editar informe' : 'Nuevo test'}</h2>
    <div style="display:grid;grid-template-columns:1fr 140px;gap:8px"><label class="f">Nombre<input type="text" id="v-n" value="${esc(v?.nombre || ((S.ficha.val || []).length ? 'Revaloración' : 'Test inicial'))}"></label><label class="f">Fecha<input type="date" id="v-f" value="${v?.fecha || hoyISO()}"></label></div>
    <label class="f">Informe · valoración final de todo el contexto<textarea id="v-r" rows="8" placeholder="Lo que hemos observado en todo el proceso de valoración…">${esc(v?.resumen || '')}</textarea></label>
    ${v ? '' : `<div class="stack" style="gap:8px"><span class="small"><b>Pruebas que incluye</b> (luego puedes añadir o quitar)</span>${Object.entries(PLANTILLAS).filter(([k]) => k !== 'otra').map(([k, t]) => `<label class="row small"><input type="checkbox" data-pl="${k}" ${['1rm', 'descompensacion', 'fc', 'movilidad'].includes(k) ? 'checked' : ''} style="width:20px;height:20px"> ${esc(t.titulo)}</label>`).join('')}</div>`}
    <button class="btn full" type="submit">Guardar</button>${v ? '<button class="btn ghost full" type="button" id="v-del" style="color:var(--bad)">Eliminar este test</button>' : ''}</form>`);
  $('#f-val').addEventListener('submit', async e => {
    e.preventDefault();
    const row = { nombre: $('#v-n').value.trim() || 'Test', fecha: $('#v-f').value || hoyISO(), resumen: $('#v-r').value.trim() || null };
    if (v) { const { error } = await sb.from('valoraciones').update(row).eq('id', v.id); if (error) return fallo(error); }
    else {
      const { data, error } = await sb.from('valoraciones').insert({ ...row, alumno_id: S.ficha.id }).select().single();
      if (error) return fallo(error, /valoraciones/.test(error.message || '') ? 'Falta ejecutar el Bloque 7 en Supabase.' : undefined);
      const tipos = [...document.querySelectorAll('#f-val [data-pl]:checked')].map(x => x.dataset.pl);
      if (tipos.length) { const { error: e2 } = await sb.from('pruebas').insert(tipos.map((t, k) => nuevaPruebaRow(t, data.id, k))); if (e2) return fallo(e2); }
      S.valEd = data.id;
    }
    cerrarSheet(); toast('Guardado'); await cargarValoraciones();
  });
  $('#v-del')?.addEventListener('click', async ev => { const x = ev.currentTarget; if (!x.dataset.ok) { x.dataset.ok = 1; x.textContent = 'Pulsa otra vez para borrar el test y sus pruebas'; return; } const { error } = await sb.from('valoraciones').delete().eq('id', v.id); if (error) return fallo(error); cerrarSheet(); S.valEd = null; toast('Test eliminado'); await cargarValoraciones(); });
}
const nuevaPruebaRow = (tipo, valId, orden) => { const t = PLANTILLAS[tipo] || PLANTILLAS.otra; return { valoracion_id: valId, alumno_id: S.ficha.id, orden, tipo, titulo: t.titulo, protocolo: t.protocolo || null, datos: t.datos.map(n => t.cols === 'di' ? { nombre: n, d: '', i: '' } : { nombre: n, valor: '' }) }; };
async function cargarValoraciones() {
  const { data, error } = await sb.from('valoraciones').select('*,pruebas(*)').eq('alumno_id', S.ficha.id).order('fecha', { ascending: false });
  S.ficha.val = ordenarValoraciones(data || []); S.ficha.valError = !!error;
  if (S.obj == null && S.ficha.id === S.user.id && S.d) S.d.valoraciones = S.ficha.val;
  render();
}
function formNuevaPrueba(valId) {
  abrirSheet(`<div class="stack"><h2>Añadir prueba</h2>${Object.entries(PLANTILLAS).map(([k, t]) => `<button class="btn ghost full" data-act="crearPrueba" data-t="${k}" data-v="${valId}" style="text-align:left">${esc(t.titulo)}</button>`).join('')}<button class="btn ghost full" data-act="cerrarSheet">Cancelar</button></div>`);
}
async function crearPrueba(tipo, valId) {
  const val = S.ficha.val.find(v => v.id === valId);
  const { data, error } = await sb.from('pruebas').insert(nuevaPruebaRow(tipo, valId, (val?.pruebas || []).length)).select().single();
  if (error) return fallo(error);
  cerrarSheet(); await cargarValoraciones(); formPrueba(data.id);
}
function filaDato(x, di) {
  return `<div class="dato" data-dato style="display:grid;grid-template-columns:${di ? '1.4fr 1fr 1fr' : '1.4fr 1fr'} 32px;gap:6px;align-items:end">
    <label class="f">Prueba<input type="text" data-k="nombre" value="${esc(x.nombre || '')}"></label>
    ${di ? `<label class="f">Dcha.<input type="text" data-k="d" value="${esc(x.d || '')}" placeholder="kg"></label><label class="f">Izda.<input type="text" data-k="i" value="${esc(x.i || '')}" placeholder="kg"></label>` : `<label class="f">Resultado<input type="text" data-k="valor" value="${esc(x.valor || '')}"></label>`}
    <button type="button" class="btn sm ghost" data-quitar aria-label="Quitar" style="padding:8px 0">✕</button></div>`;
}
function formPrueba(id) {
  const p = S.ficha.val.flatMap(v => v.pruebas || []).find(x => x.id === id); if (!p) return;
  const di = p.tipo === 'descompensacion';
  abrirSheet(`<form class="stack" id="f-pr"><h2>Editar prueba</h2>
    <label class="f">Título<input type="text" id="p-t" value="${esc(p.titulo)}"></label>
    ${p.tipo === 'fc' ? `<div class="row" style="gap:8px;align-items:end"><label class="f grow">Edad<input type="number" id="p-edad" min="10" max="90" placeholder="Ej. 38"></label><button type="button" class="btn sm" id="p-calc">Calcular zonas</button></div>` : ''}
    <div class="stack" id="p-datos" style="gap:8px">${(p.datos || []).map(x => filaDato(x, di)).join('')}</div>
    <button type="button" class="btn sm ghost" id="p-add" style="align-self:flex-start">＋ Añadir resultado</button>
    <label class="f">Valoración del coach<textarea id="p-v" rows="5">${esc(p.valoracion || '')}</textarea></label>
    <label class="f">Foco de trabajo<textarea id="p-f" rows="4">${esc(p.foco || '')}</textarea></label>
    <label class="f">Cómo se hace la prueba<textarea id="p-pr" rows="5">${esc(p.protocolo || '')}</textarea></label>
    <label class="f">Vídeo (opcional)<input type="text" id="p-vi" value="${esc(p.video_url || '')}" placeholder="https://…"></label>
    <button class="btn full" type="submit">Guardar</button><button class="btn ghost full" type="button" id="p-del" style="color:var(--bad)">Eliminar prueba</button></form>`);
  const cont = $('#p-datos');
  cont.addEventListener('click', ev => { const q = ev.target.closest('[data-quitar]'); if (q) q.closest('[data-dato]').remove(); });
  $('#p-add').addEventListener('click', () => cont.insertAdjacentHTML('beforeend', filaDato({}, di)));
  $('#p-calc')?.addEventListener('click', () => {
    const e = numero($('#p-edad').value); if (!e) return toast('Indica la edad');
    const mx = Math.round(208.75 - 0.7 * e), z = (a, b) => `${Math.round(mx * a)}–${Math.round(mx * b)} ppm`;
    cont.innerHTML = [{ nombre: 'FC máxima', valor: mx + ' ppm' }, { nombre: 'Zona 1 · predominio aeróbico (65–80 %)', valor: z(.65, .8) }, { nombre: 'Zona 2 · umbral (80–90 %)', valor: z(.8, .9) }, { nombre: 'Zona 3 · predominio anaeróbico (90–100 %)', valor: z(.9, 1) }].map(x => filaDato(x, false)).join('');
  });
  $('#f-pr').addEventListener('submit', async ev => {
    ev.preventDefault();
    const datos = [...cont.querySelectorAll('[data-dato]')].map(r => Object.fromEntries([...r.querySelectorAll('[data-k]')].map(i => [i.dataset.k, i.value.trim()]))).filter(x => x.nombre);
    const v = k => $(k).value.trim() || null;
    const { error } = await sb.from('pruebas').update({ titulo: v('#p-t') || p.titulo, datos, valoracion: v('#p-v'), foco: v('#p-f'), protocolo: v('#p-pr'), video_url: v('#p-vi') }).eq('id', p.id);
    if (error) return fallo(error);
    cerrarSheet(); toast('Prueba guardada'); await cargarValoraciones();
  });
  $('#p-del').addEventListener('click', async ev => { const x = ev.currentTarget; if (!x.dataset.ok) { x.dataset.ok = 1; x.textContent = 'Pulsa otra vez para borrarla'; return; } const { error } = await sb.from('pruebas').delete().eq('id', p.id); if (error) return fallo(error); cerrarSheet(); toast('Prueba eliminada'); await cargarValoraciones(); });
}

/* ---------- Editor de programas (coach) ---------- */
const SEL_EDITOR = 'id,nombre,dias_semana,alumno_id,dias(id,numero,nombre,objetivo,volumen,intensidad,foco,bloques_sesion(*,ejercicios_sesion(id,orden,ejercicio_id,series,repeticiones,rir,peso_ref,descanso_seg,metodo_id,ajustes,aproximacion_631,grupo,pauta,ejercicios(nombre))))';
async function abrirEditor(alumnoId, progId = null) {
  S.editor = { alumnoId, progId, cargando: true }; render(); window.scrollTo(0, 0);
  const [prog, met] = await Promise.all([
    progId ? conRespaldo(() => sb.from('programas').select('categoria,' + SEL_EDITOR).eq('id', progId).limit(1), () => sb.from('programas').select(SEL_EDITOR).eq('id', progId).limit(1))
      : sb.from('programas').select(SEL_EDITOR).eq('alumno_id', alumnoId).eq('activo', true).order('id', { ascending: false }).limit(1),
    sb.from('metodos').select('id,nombre').order('nombre')
  ]);
  const p = prog.data?.[0] || null;
  if (p) { (p.dias ||= []).sort((a, b) => a.numero - b.numero); p.dias.forEach(d => { d.bloques_sesion.sort((a, b) => a.letra.localeCompare(b.letra)); d.bloques_sesion.forEach(b => b.ejercicios_sesion.sort((a, b) => a.orden - b.orden)); }); }
  S.editor = { alumnoId, progId, plantilla: !!progId && !alumnoId, prog: p, metodos: met.data || [] }; render();
}
async function refrescarEditor() { const id = S.editor.alumnoId, pid = S.editor.progId; await abrirEditor(id, pid); if (id && id === S.user.id) await cargarAlumno(S.user.id); if (!id) await cargarPlantillas(); }
function vEditor() {
  const E = S.editor, a = S.c.perfiles.find(x => x.id === E.alumnoId) || {};
  if (E.cargando) return '<div class="empty">Cargando programa…</div>';
  const p = E.prog;
  const resumen = e => { const g = gruposDe(e.pauta); return `${e.series} × ${esc(e.repeticiones)}${e.rir != null ? ' · RIR ' + e.rir : ''}${e.peso_ref ? ' · ' + esc(e.peso_ref) : ''} · desc. ${e.descanso_seg ? seg(e.descanso_seg) : 'no'}${g.some(x => x.tramos.length > 1) ? ' · tramos' : ''}`; };
  return `<section class="stack"><button class="btn sm ghost" data-act="cerrarEditor" style="align-self:flex-start">← Volver</button><span class="eyebrow">${E.plantilla ? 'Plantilla · ' + esc(p?.categoria || 'sin categoría') : 'Programa de ' + esc(a.nombre || '')}</span><h1>${p ? esc(p.nombre) : 'Sin programa'}</h1>
    <div class="row" style="gap:8px;flex-wrap:wrap">${p ? `<button class="btn sm ghost" data-act="nuevoPrograma">Cambiar nombre</button><button class="btn sm" data-act="edDia">Añadir día</button>${E.plantilla ? `<button class="btn sm gold" data-act="probarPlantilla" data-id="${p.id}">👁 Ver como alumno de prueba</button>` : '<button class="btn sm gold" data-act="nuevoCiclo">Nuevo ciclo (copiar)</button>'}` : `<button class="btn sm" data-act="nuevoPrograma">Crear programa</button>`}</div>
    <p class="note">${E.plantilla ? 'Toca cualquier elemento para editarlo. Los cambios solo afectan a la plantilla: los alumnos que ya la tienen asignada conservan su copia.' : 'Toca cualquier elemento para editarlo. Los cambios los ve el alumno en cuanto vuelve a abrir la app.'}</p></section>
  ${p ? p.dias.map(d => `<section class="section"><div class="card stack">
    <div class="row"><div class="grow"><span class="eyebrow">Día ${d.numero}</span><h2>${esc(d.nombre || '')}</h2><div class="small muted">${esc([d.foco, d.volumen && 'vol. ' + d.volumen, d.intensidad && 'int. ' + d.intensidad].filter(Boolean).join(' · '))}</div></div><button class="btn sm ghost" data-act="edDia" data-id="${d.id}">Editar día</button></div>
    ${d.bloques_sesion.map(b => `<div class="stack" style="gap:6px;border-top:1px solid var(--line);padding-top:10px">
      <div class="row"><span class="pill gold">${esc(b.letra)}</span><h3 class="grow">${esc(b.nombre)}</h3><button class="btn sm ghost" data-act="edBloque" data-id="${b.id}">✎ Editar bloque</button></div>
      ${b.tipo === 'fuerza' ? `${b.ejercicios_sesion.map((e, i) => `<div class="ed-ej"><div class="grow" data-act="edEj" data-id="${e.id}" style="cursor:pointer;min-width:0"><b class="small">${i + 1}. ${esc(e.ejercicios?.nombre || '')}</b><div class="small muted">${resumen(e)}</div></div><button class="mini" data-act="moverEj" data-id="${e.id}" data-dir="-1" aria-label="Subir" ${i === 0 ? 'disabled' : ''}>↑</button><button class="mini" data-act="moverEj" data-id="${e.id}" data-dir="1" aria-label="Bajar" ${i === b.ejercicios_sesion.length - 1 ? 'disabled' : ''}>↓</button></div>`).join('')}
        <button class="btn sm ghost" data-act="edEj" data-bloque="${b.id}" style="align-self:flex-start">+ Añadir ejercicio</button>` : `<div class="small muted">${esc(b.tipo === 'cardio' ? [b.duracion, b.fc_objetivo, b.maquina].filter(Boolean).join(' · ') : 'Movilidad')}</div>`}
    </div>`).join('')}
    <button class="btn sm ghost" data-act="edBloque" data-dia="${d.id}" style="align-self:flex-start">+ Añadir bloque</button>
  </div></section>`).join('') : '<div class="section card empty">Crea el programa para empezar a añadir días.</div>'}`;
}
function formPrograma() {
  const p = S.editor.prog;
  abrirSheet(`<form class="stack" id="f-prog"><h2>${p ? 'Programa' : 'Nuevo programa'}</h2>
    <label class="f">Nombre<input type="text" id="pg-n" value="${esc(p?.nombre || '')}" placeholder="Ej. Ciclo 2 · Noviembre-Diciembre" required></label>
    <label class="f">Entrenamientos por semana<input type="number" id="pg-d" min="1" max="7" value="${p?.dias_semana || 3}"></label>
    ${S.editor.plantilla ? `<label class="f">Tipo de alumno<select id="pg-c">${CATEGORIAS.map(c => `<option ${c === p?.categoria ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>` : ''}
    <button class="btn full" type="submit">Guardar</button></form>`);
  $('#f-prog').addEventListener('submit', async e => {
    e.preventDefault();
    const row = { nombre: $('#pg-n').value.trim() || 'Programa', dias_semana: numero($('#pg-d').value) };
    if ($('#pg-c')) row.categoria = $('#pg-c').value;
    const { error } = p ? await sb.from('programas').update(row).eq('id', p.id) : await sb.from('programas').insert({ ...row, alumno_id: S.editor.alumnoId, activo: true });
    if (error) return fallo(error);
    cerrarSheet(); toast('Programa guardado'); await cargarCoach(); refrescarEditor();
  });
}
function formDia(id) {
  const p = S.editor.prog, d = id ? p.dias.find(x => x.id === id) : null;
  const DS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  abrirSheet(`<form class="stack" id="f-dia"><h2>${d ? 'Editar día' : 'Nuevo día'}</h2>
    <label class="f">Día de la semana<select id="d-n">${DS.map(x => `<option ${norm(x) === norm(d?.nombre) ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
    <label class="f">Objetivo del día<textarea id="d-obj">${esc(d?.objetivo || '')}</textarea></label>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px"><label class="f">Volumen<input type="text" id="d-vol" value="${esc(d?.volumen || '')}" placeholder="Alto"></label><label class="f">Intensidad<input type="text" id="d-int" value="${esc(d?.intensidad || '')}" placeholder="Alta"></label><label class="f">Foco<input type="text" id="d-foco" value="${esc(d?.foco || '')}" placeholder="Fuerza"></label></div>
    <button class="btn full" type="submit">Guardar</button>${d ? '<button class="btn ghost full" type="button" id="d-del" style="color:var(--bad)">Eliminar día</button>' : ''}</form>`);
  $('#f-dia').addEventListener('submit', async e => {
    e.preventDefault();
    const row = { nombre: $('#d-n').value, objetivo: $('#d-obj').value.trim() || null, volumen: $('#d-vol').value.trim() || null, intensidad: $('#d-int').value.trim() || null, foco: $('#d-foco').value.trim() || null };
    const { error } = d ? await sb.from('dias').update(row).eq('id', d.id) : await sb.from('dias').insert({ ...row, programa_id: p.id, numero: (Math.max(0, ...p.dias.map(x => x.numero)) + 1) });
    if (error) return fallo(error);
    cerrarSheet(); toast('Día guardado'); refrescarEditor();
  });
  $('#d-del')?.addEventListener('click', async ev => { const b = ev.currentTarget; if (!b.dataset.ok) { b.dataset.ok = 1; b.textContent = 'Pulsa otra vez: se borrará el día con todos sus ejercicios'; return; } const { error } = await sb.from('dias').delete().eq('id', d.id); if (error) return fallo(error, 'No se puede borrar: ese día ya tiene entrenos registrados.'); cerrarSheet(); toast('Día eliminado'); refrescarEditor(); });
}
function formBloque(id, diaId) {
  const p = S.editor.prog, dia = p.dias.find(d => d.id === diaId) || p.dias.find(d => d.bloques_sesion.some(b => b.id === id)), b = id ? dia.bloques_sesion.find(x => x.id === id) : null;
  const sig = String.fromCharCode(65 + (dia?.bloques_sesion.length || 0));
  abrirSheet(`<form class="stack" id="f-blq"><h2>${b ? 'Editar bloque' : 'Nuevo bloque'}</h2>
    <div style="display:grid;grid-template-columns:70px 1fr;gap:8px"><label class="f">Letra<input type="text" id="b-l" maxlength="2" value="${esc(b?.letra || sig)}"></label><label class="f">Nombre<input type="text" id="b-n" value="${esc(b?.nombre || '')}" placeholder="Ej. Tren inferior" required></label></div>
    <label class="f">Tipo<select id="b-t">${[['fuerza', 'Fuerza (ejercicios con series)'], ['cardio', 'Cardio'], ['movilidad', 'Movilidad']].map(([v, l]) => `<option value="${v}" ${b?.tipo === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="f">Momento (día de partido)<select id="b-mo">${[['', 'Normal'], ['pre', 'Antes del partido'], ['post', 'Después del partido']].map(([v, l]) => `<option value="${v}" ${(b?.momento || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="f">Indicación del bloque (superserie, circuito…)<input type="text" id="b-ag" value="${esc(b?.agrupacion || '')}" placeholder="Ej. 1 y 2 juntos (superserie). Descanso 1 minuto."></label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><label class="f">Duración (cardio)<input type="text" id="b-du" value="${esc(b?.duracion || '')}" placeholder="30 min"></label><label class="f">Frecuencia cardiaca<input type="text" id="b-fc" value="${esc(b?.fc_objetivo || '')}" placeholder="135–140 ppm"></label></div>
    <label class="f">Máquina<input type="text" id="b-ma" value="${esc(b?.maquina || '')}"></label>
    <label class="f">Detalle<textarea id="b-de">${esc(b?.detalle || '')}</textarea></label>
    <label class="f">Vídeo (movilidad)<input type="text" id="b-vi" value="${esc(b?.video_url || '')}" placeholder="https://youtu.be/…"></label>
    ${b?.imagen_url ? `<img src="${esc(b.imagen_url)}" alt="" style="width:100%;max-height:180px;object-fit:contain;border-radius:12px;background:var(--surface-2)">` : ''}
    <label class="f">Imagen ilustrativa (cardio y movilidad)<input type="file" id="b-img" accept="image/*"></label>
    <button class="btn full" type="submit">Guardar</button>${b ? '<button class="btn ghost full" type="button" id="b-del" style="color:var(--bad)">Eliminar bloque</button>' : ''}</form>`);
  $('#f-blq').addEventListener('submit', async e => {
    e.preventDefault();
    const v = k => $(k).value.trim() || null;
    const row = { letra: v('#b-l') || sig, nombre: v('#b-n') || 'Bloque', tipo: $('#b-t').value, agrupacion: v('#b-ag'), duracion: v('#b-du'), fc_objetivo: v('#b-fc'), maquina: v('#b-ma'), detalle: v('#b-de'), video_url: v('#b-vi') };
    if ($('#b-mo').value || b?.momento) row.momento = $('#b-mo').value || null;
    const file = $('#b-img').files[0];
    if (file) {
      toast('Subiendo imagen…');
      const blob = await reducirImagen(file, 1000), ruta = `bloque-${Date.now()}.jpg`;
      const up = await sb.storage.from('ejercicios').upload(ruta, blob, { contentType: 'image/jpeg', upsert: true });
      if (up.error) return fallo(up.error, 'No se ha podido subir la imagen.');
      row.imagen_url = sb.storage.from('ejercicios').getPublicUrl(ruta).data.publicUrl;
    }
    const { error } = b ? await sb.from('bloques_sesion').update(row).eq('id', b.id) : await sb.from('bloques_sesion').insert({ ...row, dia_id: dia.id });
    if (error) return fallo(error, /imagen_url/.test(error.message || '') ? 'Falta ejecutar el Bloque 7 en Supabase para guardar imágenes de bloque.' : /momento/.test(error.message || '') ? 'Falta ejecutar el Bloque 24 en Supabase.' : undefined);
    cerrarSheet(); toast('Bloque guardado'); refrescarEditor();
  });
  $('#b-del')?.addEventListener('click', async ev => { const x = ev.currentTarget; if (!x.dataset.ok) { x.dataset.ok = 1; x.textContent = 'Pulsa otra vez: se borrará el bloque y sus ejercicios'; return; } const { error } = await sb.from('bloques_sesion').delete().eq('id', b.id); if (error) return fallo(error, 'No se puede borrar: ese bloque ya tiene series registradas.'); cerrarSheet(); toast('Bloque eliminado'); refrescarEditor(); });
}
function filaTramo(t, primero) {
  return `<div class="tr-row" data-tramo>
    <label>Tipo<select data-k="tipo"><option value="serie" ${t.s || primero ? 'selected' : ''}>Nuevas series</option><option value="tramo" ${!t.s && !primero ? 'selected' : ''}>↳ Tramo sin parar</option></select></label>
    <label>Nº series<input type="number" data-k="s" min="1" max="10" value="${t.s || ''}" placeholder="—"></label>
    <label>Reps<input type="text" data-k="r" value="${esc(t.r || '')}" placeholder="8–10"></label>
    <label>Peso<input type="text" data-k="kg" value="${esc(t.kg || '')}" placeholder="20 kg"></label>
    <label>Desc. (s)<input type="number" data-k="d" min="0" step="5" value="${t.d ?? ''}" placeholder="60"></label>
    <button type="button" class="mini" data-quitar aria-label="Quitar">✕</button>
    <label style="grid-column:3/5">RIR<input type="text" data-k="rir" value="${esc(t.rir ?? '')}" placeholder="1"></label>
  </div>`;
}
function formEjSesion(id, bloqueId) {
  const p = S.editor.prog, todos = p.dias.flatMap(d => d.bloques_sesion), blq = todos.find(b => b.id === bloqueId) || todos.find(b => b.ejercicios_sesion.some(x => x.id === id));
  const e = id ? blq.ejercicios_sesion.find(x => x.id === id) : null;
  const pauta = e?.pauta?.length ? e.pauta : [{ s: 3, r: '10', rir: 2, kg: '', d: 90 }];
  const opts = S.c.ejercicios.map(x => `<option value="${x.id}" ${e?.ejercicio_id === x.id ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('');
  abrirSheet(`<form class="stack" id="f-ejs"><h2>${e ? 'Editar ejercicio' : 'Añadir ejercicio'}</h2>
    <label class="f">Ejercicio<select id="es-ej"><option value="">— Elige de tu biblioteca —</option>${opts}<option value="nuevo">+ Ejercicio nuevo…</option></select></label>
    <label class="f" id="es-nuevo-w" hidden>Nombre del ejercicio nuevo<input type="text" id="es-nuevo"></label>
    <div class="stack" style="gap:8px"><span class="small muted">Pauta serie a serie. Usa "Tramo sin parar" para dropsets, clusters o rest-pause.</span><div id="es-tramos" class="stack" style="gap:10px">${pauta.map((t, i) => filaTramo(t, i === 0)).join('')}</div><button type="button" class="btn sm ghost" id="es-add" style="align-self:flex-start">+ Añadir fila</button></div>
    <label class="f">Método<select id="es-met"><option value="">Sin método</option>${S.editor.metodos.map(m => `<option value="${m.id}" ${e?.metodo_id === m.id ? 'selected' : ''}>${esc(m.nombre)}</option>`).join('')}</select></label>
    <label class="f">Ajustes a su medida<input type="text" id="es-aj" value="${esc(e?.ajustes || '')}" placeholder="Ej. Silla: 5 · pies altos"></label>
    <label class="f">Indicación de superserie (opcional)<input type="text" id="es-gr" value="${esc(e?.grupo || '')}" placeholder="Ej. 3 y 4 juntos (superserie)"></label>
    <label class="row small"><input type="checkbox" id="es-631" ${e?.aproximacion_631 ? 'checked' : ''} style="width:20px;height:20px"> Aproximación 6·3·1 antes de empezar</label>
    <p class="note">Si pones descanso 0 en la última fila, la app enlaza este ejercicio con el siguiente como superserie.</p>
    <button class="btn full" type="submit">Guardar</button>${e ? '<button class="btn ghost full" type="button" id="es-del" style="color:var(--bad)">Quitar del programa</button>' : ''}</form>`);
  $('#es-ej').addEventListener('change', ev => { $('#es-nuevo-w').hidden = ev.target.value !== 'nuevo'; });
  $('#es-add').addEventListener('click', () => { $('#es-tramos').insertAdjacentHTML('beforeend', filaTramo({ d: 0 }, false)); });
  $('#es-tramos').addEventListener('click', ev => { const q = ev.target.closest('[data-quitar]'); if (q && document.querySelectorAll('#es-tramos [data-tramo]').length > 1) q.closest('[data-tramo]').remove(); });
  $('#f-ejs').addEventListener('submit', async ev => {
    ev.preventDefault();
    try {
      let ejId = $('#es-ej').value;
      if (ejId === 'nuevo') {
        const nombre = $('#es-nuevo').value.trim(); if (!nombre) return toast('Escribe el nombre del ejercicio nuevo');
        const { data, error } = await sb.from('ejercicios').insert({ nombre }).select().single(); if (error) throw error;
        S.c.ejercicios.push(data); ejId = data.id;
      }
      if (!ejId) return toast('Elige un ejercicio');
      const filas = [...document.querySelectorAll('#es-tramos [data-tramo]')].map((f, i) => {
        const g = k => f.querySelector(`[data-k="${k}"]`).value.trim();
        const t = { r: g('r') || '—' };
        if (g('tipo') === 'serie' || i === 0) t.s = Math.max(1, numero(g('s')) || 1);
        const rir = g('rir'); if (rir !== '') t.rir = /^\d+$/.test(rir) ? +rir : rir;
        if (g('kg')) t.kg = g('kg');
        t.d = numero(g('d')) ?? 0;
        return t;
      });
      const rirNum = filas.map(t => t.rir).find(v => typeof v === 'number');
      const row = { ejercicio_id: +ejId, pauta: filas, series: filas.reduce((t, x) => t + (x.s || 0), 0), repeticiones: filas[0].r, rir: rirNum ?? null,
        peso_ref: filas.find(t => t.kg)?.kg || null, descanso_seg: filas[filas.length - 1].d, metodo_id: numero($('#es-met').value), ajustes: $('#es-aj').value.trim() || null,
        grupo: $('#es-gr').value.trim() || null, aproximacion_631: $('#es-631').checked };
      const { error } = e ? await sb.from('ejercicios_sesion').update(row).eq('id', e.id) : await sb.from('ejercicios_sesion').insert({ ...row, bloque_id: blq.id, orden: (Math.max(0, ...blq.ejercicios_sesion.map(x => x.orden)) + 1) });
      if (error) throw error;
      cerrarSheet(); toast('Ejercicio guardado'); refrescarEditor();
    } catch (err) { fallo(err); }
  });
  $('#es-del')?.addEventListener('click', async ev => { const x = ev.currentTarget; if (!x.dataset.ok) { x.dataset.ok = 1; x.textContent = 'Pulsa otra vez para quitarlo'; return; } const { error } = await sb.from('ejercicios_sesion').delete().eq('id', e.id); if (error) return fallo(error, 'No se puede quitar: ya tiene series registradas. Puedes cambiarlo por otro ejercicio.'); cerrarSheet(); toast('Ejercicio quitado'); refrescarEditor(); });
}
async function moverEj(id, dir) {
  const blq = S.editor.prog.dias.flatMap(d => d.bloques_sesion).find(b => b.ejercicios_sesion.some(x => x.id === id));
  const l = blq.ejercicios_sesion, i = l.findIndex(x => x.id === id), j = i + dir; if (j < 0 || j >= l.length) return;
  const a = l[i], b = l[j];
  const r1 = await sb.from('ejercicios_sesion').update({ orden: b.orden }).eq('id', a.id), r2 = await sb.from('ejercicios_sesion').update({ orden: a.orden }).eq('id', b.id);
  if (r1.error || r2.error) return fallo(r1.error || r2.error);
  if (a.orden === b.orden) await sb.from('ejercicios_sesion').update({ orden: b.orden + dir }).eq('id', a.id);
  refrescarEditor();
}

/* ---------- Pagos ---------- */
function lineaPago(p) {
  const hoy = hoyISO(), st = p.pagado_at ? 'pagado' : p.vence < hoy ? 'vencido' : 'pendiente';
  const a = S.c.perfiles.find(x => x.id === p.alumno_id) || {};
  return `<div class="line"><div class="grow" data-act="editarPago" data-id="${p.id}" style="cursor:pointer"><h3>${esc(a.nombre || '')}</h3><div class="small muted">${esc(p.concepto)} · vence ${esc(fCorta(p.vence))}${p.pagado_at ? ` · pagado ${esc(fCorta(p.pagado_at))}` : ''}</div></div>
    <div class="stack" style="gap:6px;align-items:flex-end"><b class="num" style="font-family:var(--display);font-size:20px">${fmtNum(p.importe, 2)} €</b>
    ${st === 'pagado' ? `<div class="row" style="gap:6px;flex-wrap:wrap;justify-content:flex-end"><span class="pill ok">Pagado</span>${(() => { const fa = (S.c.facturas || []).find(x => x.pago_id === p.id); return fa ? `<button class="btn sm ghost" data-act="verFactura" data-id="${fa.id}">Factura ${esc(fa.numero)}</button>` : `<button class="btn sm" data-act="nuevaFactura" data-id="${p.id}">Factura</button><button class="btn sm ghost" data-act="deshacerPago" data-id="${p.id}">Deshacer pago</button>`; })()}</div>` : `<div class="row" style="gap:6px">${st === 'vencido' ? `<button class="btn sm ghost" data-act="recordar" data-id="${p.id}">Recordatorio</button>` : ''}<button class="btn sm${st === 'vencido' ? '' : ' ghost'}" data-act="pagar" data-id="${p.id}">Pagado</button></div>`}</div></div>`;
}
function vPagos() {
  const hoy = hoyISO(), P = S.c.pagos;
  const venc = P.filter(p => !p.pagado_at && p.vence < hoy), pend = P.filter(p => !p.pagado_at && p.vence >= hoy), cob = P.filter(p => p.pagado_at).slice(-15).reverse();
  const sum = l => fmtNum(l.reduce((t, p) => t + Number(p.importe), 0), 2) + ' €';
  const mes = hoy.slice(0, 7), cobMes = P.filter(p => p.pagado_at && p.pagado_at.slice(0, 7) === mes);
  return `<section class="stack"><span class="eyebrow">Cobros</span><h1>Pagos</h1><button class="btn sm" data-act="nuevoPagoGeneral" style="align-self:flex-start">Añadir cuota</button></section>
  <section class="section"><div class="kpis"><div class="kpi"><div class="v num" style="color:var(--ok);font-size:20px">${sum(cobMes)}</div><div class="l">cobrado este mes</div></div><div class="kpi"><div class="v num" style="font-size:20px">${sum(pend)}</div><div class="l">por cobrar</div></div><div class="kpi"><div class="v num" style="color:${venc.length ? 'var(--bad)' : 'var(--ok)'};font-size:20px">${sum(venc)}</div><div class="l">vencido</div></div></div></section>
  <section class="section"><div class="card stack chart"><div class="row"><h3 class="grow">Ingresos por mes</h3></div>${graficaPagos(P)}<div class="row small" style="gap:14px;flex-wrap:wrap"><span><i class="ley" style="background:var(--ok)"></i>Cobrado</span><span><i class="ley" style="background:var(--blue)"></i>Por cobrar</span><span><i class="ley" style="background:var(--bad)"></i>Vencido</span></div></div></section>
  ${venc.length ? `<section class="section"><h2>Vencidos</h2><div class="card">${venc.map(lineaPago).join('')}</div></section>` : ''}
  <section class="section"><h2>Próximos cobros</h2><div class="card">${pend.map(lineaPago).join('') || '<div class="empty">No hay cuotas pendientes.</div>'}</div></section>
  ${cob.length ? `<section class="section"><h2>Últimos cobrados</h2><div class="card">${cob.map(lineaPago).join('')}</div></section>` : ''}
  ${vFacturas()}`;
}
function formEditarPago(id) {
  const p = S.c.pagos.find(x => x.id === id); if (!p) return;
  abrirSheet(`<form class="stack" id="f-ep"><h2>Editar cuota</h2>
    <label class="f">Concepto<input type="text" id="ep-con" value="${esc(p.concepto)}" required></label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label class="f">Vence<input type="date" id="ep-vence" value="${p.vence}"></label><label class="f">Importe (€)<input type="text" inputmode="decimal" id="ep-imp" value="${fmtNum(p.importe, 2)}"></label></div>
    <label class="f">Fecha de pago (vacío = pendiente)<input type="date" id="ep-pag" value="${p.pagado_at || ''}"></label>
    <button class="btn full" type="submit">Guardar cambios</button>
    ${p.pagado_at ? '<button class="btn ghost full" type="button" id="ep-undo">Deshacer pago (volver a pendiente)</button>' : ''}
    <button class="btn ghost full" type="button" id="ep-del" style="color:var(--bad)">Eliminar cuota</button></form>`);
  $('#f-ep').addEventListener('submit', async e => {
    e.preventDefault();
    const imp = numero($('#ep-imp').value); if (imp == null) return toast('Indica el importe');
    const cambios = { concepto: $('#ep-con').value.trim(), vence: $('#ep-vence').value, importe: imp, pagado_at: $('#ep-pag').value || null };
    const { data, error } = await sb.from('pagos').update(cambios).eq('id', id).select().single(); if (error) return fallo(error);
    S.c.pagos = S.c.pagos.map(x => x.id === id ? data : x).sort((a, b) => a.vence.localeCompare(b.vence)); cerrarSheet(); toast('Cuota actualizada'); render();
  });
  $('#ep-undo')?.addEventListener('click', async ev => {
    const x = ev.currentTarget, fa = (S.c.facturas || []).find(y => y.pago_id === id);
    if (!x.dataset.ok) { x.dataset.ok = 1; x.textContent = fa ? `¿Borrar la factura ${fa.numero} y dejar pendiente?` : '¿Seguro? Pulsa otra vez'; return; }
    cerrarSheet(); await quitarPago(id);
  });
  $('#ep-del').addEventListener('click', async ev => {
    const b = ev.currentTarget;
    if (!b.dataset.ok) { b.dataset.ok = 1; b.textContent = 'Pulsa otra vez para eliminarla definitivamente'; return; }
    const { error } = await sb.from('pagos').delete().eq('id', id); if (error) return fallo(error);
    S.c.pagos = S.c.pagos.filter(x => x.id !== id); cerrarSheet(); toast('Cuota eliminada'); render();
  });
}
async function marcarPagado(id, btn) {
  if (btn && !btn.dataset.ok) { btn.dataset.ok = 1; btn.textContent = '¿Confirmar pago?'; return; }
  const { data, error } = await sb.from('pagos').update({ pagado_at: hoyISO() }).eq('id', id).select().single();
  if (error) return fallo(error);
  S.c.pagos = S.c.pagos.map(p => p.id === id ? data : p); toast('Pago registrado'); render();
}
/* Vuelve la cuota a pendiente. En beta, si tiene factura de prueba, la borra antes. */
async function quitarPago(id) {
  const fa = (S.c.facturas || []).find(x => x.pago_id === id);
  if (fa) { const { error: e1 } = await sb.from('facturas').delete().eq('id', fa.id); if (e1) return fallo(e1); S.c.facturas = S.c.facturas.filter(x => x.id !== fa.id); }
  const { data, error } = await sb.from('pagos').update({ pagado_at: null }).eq('id', id).select().single();
  if (error) return fallo(error);
  S.c.pagos = S.c.pagos.map(x => x.id === id ? data : x); toast(fa ? 'Factura de prueba borrada y cuota pendiente' : 'Cuota marcada como pendiente'); render();
}
async function deshacerPago(id, btn) {
  const fa = (S.c.facturas || []).find(x => x.pago_id === id);
  if (!btn.dataset.ok) { btn.dataset.ok = 1; btn.textContent = fa ? `¿Borrar la factura ${fa.numero} y dejar pendiente?` : '¿Seguro? Pulsa otra vez'; return; }
  await quitarPago(id);
}
async function copiarRecordatorio(id) {
  const p = S.c.pagos.find(x => x.id === id), a = S.c.perfiles.find(x => x.id === p.alumno_id) || {};
  const msg = `Hola ${(a.nombre || '').split(' ')[0]}, te recuerdo que la cuota "${p.concepto}" de ${fmtNum(p.importe, 2)} € venció el ${fCorta(p.vence)}. Cuando puedas, me avisas. ¡Gracias!`;
  try { await navigator.clipboard.writeText(msg); toast('Mensaje copiado: pégalo en WhatsApp'); }
  catch { abrirSheet(`<div class="stack"><h2>Recordatorio</h2><textarea readonly style="min-height:120px">${esc(msg)}</textarea><button class="btn ghost full" data-act="cerrarSheet">Cerrar</button></div>`); }
}

/* ---------- Cuenta ---------- */
function vCuenta() {
  abrirSheet(`<div class="stack"><h2>${esc(S.perfil.nombre)}</h2><p class="small muted">${esc(S.perfil.email)}</p>
    <button class="btn ghost full" data-act="cambiarClave">Cambiar contraseña</button>
    <button class="btn ghost full" data-act="salir">Cerrar sesión</button>
    <p class="note">Para instalarla como app: en iPhone, Safari → Compartir → "Añadir a pantalla de inicio". En Android, Chrome → menú ⋮ → "Instalar aplicación".</p></div>`);
}

/* ---------- Temporizador de descanso ---------- */
/* Al terminar: pantalla de marca con el logo, 3 toques tipo triángulo musical, vibración (Android) y, si la app está
   en segundo plano y tiene permiso, una notificación. Se para con el botón, con "Silenciar" o al bloquear la pantalla. */
const T = { end: 0, total: 0, iv: null, ctx: null, lock: null, fin: false, lbl: '', voces: [] };
const fmtT = ms => { const t = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
function audio() {
  try {
    if (navigator.audioSession) navigator.audioSession.type = 'transient'; // iPhone: suena aunque haya música, bajándola un momento
    T.ctx = T.ctx || new (window.AudioContext || window.webkitAudioContext)(); if (T.ctx.state === 'suspended') T.ctx.resume();
  } catch (e) { }
}
/* Un toque de triángulo: golpe seco y resonancia metálica larga (parciales inarmónicos que se apagan poco a poco) */
function triangulo(c, t0) {
  const f = 1850, parciales = [[1, .5, 1.6], [2.76, .22, 1.1], [5.40, .12, .8], [8.93, .06, .5]];
  const salida = c.createGain(); salida.gain.value = .9; salida.connect(c.destination);
  parciales.forEach(([m, vol, dur]) => {
    const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = f * m;
    g.gain.setValueAtTime(.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + .004); g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
    o.connect(g).connect(salida); o.start(t0); o.stop(t0 + dur + .05); T.voces.push(o);
  });
}
function tresToques() {
  try { const c = T.ctx; if (!c) return; if (c.state === 'suspended') c.resume(); T.voces = []; [0, .55, 1.1].forEach(d => triangulo(c, c.currentTime + .05 + d)); } catch (e) { }
}
function callar() { T.voces.forEach(o => { try { o.stop(); } catch (e) { } }); T.voces = []; try { navigator.vibrate && navigator.vibrate(0); } catch (e) { } }
function beep() { tresToques(); }
async function pedirAvisos() {
  try {
    if (!('Notification' in window) || Notification.permission !== 'default' || localStorage.getItem('lof-avisos-pedido')) return;
    localStorage.setItem('lof-avisos-pedido', '1'); await Notification.requestPermission();
  } catch (e) { }
}
async function notificarFin() {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker?.ready, op = { body: T.lbl.replace(/^Descanso · /, '') || 'Fin del descanso', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'descanso', renotify: true, vibrate: [300, 150, 300, 150, 300] };
    reg ? reg.showNotification('Fin del descanso', op) : new Notification('Fin del descanso', op);
  } catch (e) { }
}
async function startTimer(sec, lbl) {
  audio(); pararAlarma(); clearInterval(T.iv); T.total = sec * 1000; T.end = Date.now() + T.total; T.fin = false; T.lbl = lbl;
  const el = $('#timer'); el.hidden = false; el.classList.remove('done'); $('#t-lbl').textContent = lbl;
  try { if (navigator.wakeLock && !T.lock) T.lock = await navigator.wakeLock.request('screen'); } catch (e) { }
  if (sec >= 45) pedirAvisos();
  tick(); T.iv = setInterval(tick, 250);
}
function tick() {
  if (T.fin) return;
  const left = T.end - Date.now();
  $('#t-clock').textContent = fmtT(left);
  $('#t-bar').style.width = Math.min(100, (1 - left / T.total) * 100) + '%';
  if (left <= 0) { clearInterval(T.iv); T.iv = null; finTimer(left); }
}
function finTimer(left) {
  if (T.fin) return; T.fin = true; // una sola alarma por descanso, aunque se vuelva a la app varias veces
  $('#timer').classList.add('done'); $('#t-lbl').textContent = 'Fin del descanso';
  if (document.hidden) notificarFin();
  if (left < -60000) return; // volvió a la app mucho después: sin alarma, solo el aviso en la barra
  const ov = $('#alarma'); ov.hidden = false; $('#al-lbl').textContent = T.lbl.replace(/^Descanso · /, '');
  const m = ov.querySelector('[data-silenciar]'); m.setAttribute('aria-pressed', 'false'); m.textContent = '🔇 Silenciar';
  tresToques(); try { navigator.vibrate && navigator.vibrate([300, 250, 300, 250, 300]); } catch (e) { }
}
function pararAlarma() { callar(); const ov = $('#alarma'); if (ov) ov.hidden = true; }
function stopTimer() { clearInterval(T.iv); T.iv = null; T.fin = true; pararAlarma(); $('#timer').hidden = true; try { T.lock?.release(); } catch (e) { } T.lock = null; }
/* Bloquear la pantalla o salir de la app para la alarma al momento */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { callar(); return; }
  if (!$('#timer').hidden && T.iv) tick();
});

/* ---------- Eventos ---------- */
document.addEventListener('click', async e => {
  if (e.target.closest('[data-silenciar]')) { const b = e.target.closest('[data-silenciar]'); callar(); b.setAttribute('aria-pressed', 'true'); b.textContent = 'Silenciada'; return; }
  if (e.target.closest('[data-alarma]')) { stopTimer(); return; }
  const tm = e.target.closest('[data-tm]');
  if (tm) {
    if (tm.dataset.tm === 'plus') { T.end += 15000; T.total += 15000; if ($('#timer').classList.contains('done')) { $('#timer').classList.remove('done'); clearInterval(T.iv); T.iv = setInterval(tick, 250); } }
    else stopTimer();
    return;
  }
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act;
  switch (a) {
    case 'tab': S.tab = b.dataset.t; S.dia = null; S.chipsCargados = false; render(); window.scrollTo(0, 0); break;
    case 'ctab': if (S.obj) await salirComo(); S.reporte = null; S.factura = null; S.ctab = b.dataset.t; S.ficha = null; S.editor = null; render(); window.scrollTo(0, 0); break;
    case 'modo': if (S.obj) await salirComo(); S.modo = b.dataset.v; S.ficha = null; if (S.modo === 'coach') await cargarCoach(); render(); window.scrollTo(0, 0); break;
    case 'abrirDia': await abrirDia(+b.dataset.id); break;
    case 'cerrarDia': S.dia = null; S.sesion = null; render(); break;
    case 'salirComo': await salirComo(); break;
    case 'verValoracion': S.valSel = +b.dataset.id; render(); break;
    case 'nuevaValoracion': formValoracion(); break;
    case 'abrirValoracion': S.valEd = +b.dataset.id; render(); window.scrollTo(0, 0); break;
    case 'cerrarValoracion': S.valEd = null; render(); window.scrollTo(0, 0); break;
    case 'editarValoracion': formValoracion(+b.dataset.id); break;
    case 'nuevaPrueba': formNuevaPrueba(+b.dataset.id); break;
    case 'crearPrueba': await crearPrueba(b.dataset.t, +b.dataset.v); break;
    case 'editarPrueba': formPrueba(+b.dataset.id); break;
    case 'omitir': formOmitir(+b.dataset.es, b.dataset.n); break;
    case 'deshacerOmitir': await deshacerOmitir(+b.dataset.es); break;
    case 'abrirReporte': await abrirReporte(b.dataset.id || null); break;
    case 'reporteSemana': await abrirReporte(S.reporte.alumno, sumaDias(S.reporte.lunes, +b.dataset.d)); break;
    case 'cerrarReporte': { const al = S.reporte?.alumno; S.reporte = null; if (al && S.ficha?.id === al) render(); else render(); window.scrollTo(0, 0); break; }
    case 'reporteFicha': S.reporte = null; await abrirFicha(b.dataset.id); break;
    case 'repVerSesion': { const al = b.dataset.al; S.reporte = null; await abrirFicha(al); await verSesion(+b.dataset.id); break; }
    case 'fichaSub': await abrirSub(b.dataset.s); break;
    case 'cerrarSub': S.fichaSub = null; render(); window.scrollTo(0, 0); break;
    case 'editarComidas': formComidas(); break;
    case 'nuevaFactura': formFactura(b.dataset.id ? +b.dataset.id : null); break;
    case 'verFactura': verFactura(+b.dataset.id); break;
    case 'cerrarFactura': S.factura = null; render(); break;
    case 'imprimirFactura': { const t = document.title; document.title = `Factura_${S.factura.numero}_${S.factura.cliente_nombre}`.replace(/\s+/g, '_'); window.print(); setTimeout(() => document.title = t, 1500); break; }
    case 'datosFiscales': formDatosFiscales(); break;
    case 'escala': document.querySelectorAll(`#${b.dataset.g} button`).forEach(x => x.setAttribute('aria-pressed', x === b)); break;
    case 'editarSesion': await editarSesionCerrada(); break;
    case 'entrenarAhora': formEntrenarCon(b.dataset.id); break;
    case 'verPres': verPres(+b.dataset.id); break;
    case 'reservarPres': await reservarPres(); break;
    case 'sincCal': await sincronizarCalendly(true); break;
    case 'cancelarPresLista': cancelarPresLista(); break;
    case 'cancelarPres': cancelarPres(+b.dataset.id); break;
    case 'confirmarCancelPres': await confirmarCancelPres(+b.dataset.id); break;
    case 'configCalendly': formCalendly(); break;
    case 'editarBloques': formBloquesProceso(); break;
    case 'nuevaPres': formPres(); break;
    case 'editarPres': formPres(+b.dataset.id); break;
    case 'presVerSesion': cerrarSheet(); await verSesion(+b.dataset.id); break;
    case 'nuevoCiclo': formNuevoCiclo(); break;
    case 'editarProgramaObj': { const id = S.obj.id; await salirComo(); await abrirEditor(id); break; }
    case 'serie': await toggleSerie(b); break;
    case 'tramo': { const d = +b.dataset.d; if (d > 0) startTimer(d, 'Pausa · ' + b.dataset.lbl); else toast('Sin pausa: sigue con el siguiente tramo'); break; }
    case 'aprox': b.classList.add('on'); if (b.dataset.j === '2') startTimer(60, 'Descanso tras la aproximación 6·3·1'); else toast(b.dataset.j === '0' ? 'Ahora 3 repeticiones con tu peso objetivo' : 'Ahora 1 repetición por encima del objetivo'); break;
    case 'metodo': { const n = b.dataset.n; abrirSheet(`<div class="stack"><span class="eyebrow">Método</span><h2>${esc(n)}</h2><p class="pre">${esc((S.d?.metodos || {})[n] || 'Pregúntale a Jesús por este método.')}</p><button class="btn ghost full" data-act="cerrarSheet">Entendido</button></div>`); break; }
    case 'terminar': terminar(); break;
    case 'guardarSesion': await guardarSesion(); break;
    case 'guardarDiario': await guardarDiario(); break;
    case 'ingestas': await guardarDiario({ ingestas: +b.dataset.v }); break;
    case 'permisoAvisos': try { await Notification.requestPermission(); } catch (e) { } render(); avisoCheckin(); break;
    case 'ali': await guardarDiario({ alimentacion: b.dataset.v }); break;
    case 'chip': { const v = b.dataset.v; S.chips.has(v) ? S.chips.delete(v) : S.chips.add(v); b.setAttribute('aria-pressed', S.chips.has(v)); break; }
    case 'enviarCheckin': await enviarCheckin(); break;
    case 'ficha': cerrarSheet(); await abrirFicha(b.dataset.id); break;
    case 'verAlertas': verAlertas(b.dataset.id); break;
    case 'cerrarFicha': S.ficha = null; S.verSes = null; S.verPlan = null; S.valEd = null; render(); break;
    case 'cerrarVerSesion': S.verSes = null; render(); window.scrollTo(0, 0); break;
    case 'verPlan': verPlan(+b.dataset.p, +b.dataset.d); break;
    case 'editarPlantilla': await abrirEditor(null, +b.dataset.id); break;
    case 'nuevaPlantilla': formNuevaPlantilla(); break;
    case 'valPlantilla': formValPlantilla(+b.dataset.id); break;
    case 'regDia': S.regDia = b.dataset.f; render(); break;
    case 'zonaFC': zonaFC(+b.dataset.z); break;
    case 'archivarAlumno': await cambiarArchivo(b.dataset.id, false); break;
    case 'reactivarAlumno': await cambiarArchivo(b.dataset.id, true); break;
    case 'asignarPlantilla': formAsignarPlantilla(b.dataset.al || null, b.dataset.id ? +b.dataset.id : null); break;
    case 'guardarPlantilla': formGuardarPlantilla(+b.dataset.id); break;
    case 'duplicarPlantilla': formGuardarPlantilla(+b.dataset.id, true); break;
    case 'borrarPlantilla': await borrarPlantilla(+b.dataset.id); break;
    case 'comentarEj': formComentarioEj(+b.dataset.es); break;
    case 'probarPlantilla': await probarPlantilla(+b.dataset.id); break;
    case 'salirPrueba': await salirPrueba(); break;
    case 'revision': formRevision(+b.dataset.n || null, b.dataset.id ? +b.dataset.id : null); break;
    case 'verGps': { const r = await sb.storage.from('gps').createSignedUrls([b.dataset.r], 3600); const u = r.data?.[0]?.signedUrl; if (!u) { toast('No se ha podido abrir el archivo'); break; } if (/\.pdf$/i.test(b.dataset.r)) window.open(u, '_blank', 'noopener'); else abrirSheet(`<div class="stack"><img src="${esc(u)}" alt="GPS" style="width:100%;border-radius:12px"><a class="btn ghost full" href="${esc(u)}" target="_blank" rel="noopener">Abrir en grande</a><button class="btn ghost full" data-act="cerrarSheet">Cerrar</button></div>`); break; }
    case 'wellness': formWellness(b.dataset.t, b.dataset.f || null, b.dataset.al || null); break;
    case 'partido': formPartido(b.dataset.id ? +b.dataset.id : null, b.dataset.al || null); break;
    case 'escala10': { const g = b.closest('.escala10'); g.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); break; }
    case 'editarApartado': formApartado(b.dataset.sec, b.dataset.k); break;
    case 'nuevoApartado': formApartado(b.dataset.sec, null); break;
    case 'cerrarPlan': S.verPlan = null; render(); window.scrollTo(0, 0); break;
    case 'verSesion': await verSesion(+b.dataset.id); break;
    case 'nuevaMedicion': formMedicion(); break;
    case 'misMedidas': formMisMedidas(); break;
    case 'calcGrasa': formCalculadoraGrasa(); break;
    case 'datosAlumno': formDatosAlumno(b.dataset.id); break;
    case 'editarFactura': formFactura(null, +b.dataset.id); break;
    case 'nuevoPago': formPago(S.ficha.id); break;
    case 'nuevoPagoGeneral': formPago(null); break;
    case 'nuevaNota': formNota(); break;
    case 'editarPago': formEditarPago(+b.dataset.id); break;
    case 'editarServicio': formServicio(); break;
    case 'editarEjercicio': formEjercicio(+b.dataset.id); break;
    case 'empezarCrono': empezarCrono(); break;
    case 'verImagen': abrirSheet(`<div class="stack"><img src="${esc(b.dataset.src)}" alt="" style="width:100%;border-radius:12px;background:var(--surface-2)"><button class="btn ghost full" data-act="cerrarSheet">Cerrar</button></div>`); break;
    case 'importarImagenes': await importarImagenes(); break;
    case 'editarPrograma': await abrirEditor(b.dataset.id); break;
    case 'cerrarEditor': if (S.editor?.plantilla) { S.editor = null; S.ctab = 'plantillas'; await cargarPlantillas(); render(); window.scrollTo(0, 0); break; }
      S.editor = null; S.verPlan = null; if (S.ficha && !S.ficha.cargando) await cargarProgramasFicha(S.ficha); render(); window.scrollTo(0, 0); break;
    case 'edDia': formDia(b.dataset.id ? +b.dataset.id : null); break;
    case 'edBloque': formBloque(b.dataset.id ? +b.dataset.id : null, b.dataset.dia ? +b.dataset.dia : null); break;
    case 'edEj': formEjSesion(b.dataset.id ? +b.dataset.id : null, b.dataset.bloque ? +b.dataset.bloque : null); break;
    case 'moverEj': await moverEj(+b.dataset.id, +b.dataset.dir); break;
    case 'nuevoPrograma': formPrograma(); break;
    case 'sinVideo': toast('Jesús todavía no ha subido el vídeo de este ejercicio'); break;
    case 'pagar': await marcarPagado(+b.dataset.id, b); break;
    case 'deshacerPago': await deshacerPago(+b.dataset.id, b); break;
    case 'recordar': await copiarRecordatorio(+b.dataset.id); break;
    case 'cuenta': if (S.prueba) { await salirPrueba(); break; } vCuenta(); break;
    case 'cambiarClave': cerrarSheet(); vistaNuevaClave(); break;
    case 'cerrarSheet': cerrarSheet(); break;
    case 'salir': cerrarSheet(); stopTimer(); await sb.auth.signOut(); break;
  }
});
document.addEventListener('change', async e => {
  if (e.target.dataset?.graf === 'comp') { S.grafComp = e.target.value; render(); return; }
  const m = (e.target.id || '').match(/^(kg|rp|ri)-(\d+)-(\d+)(?:-(\d+))?$/); if (!m || !S.sesion) return;
  const fila = `${m[2]}-${m[3]}`, z = S.sesion; if (!z.regs[fila]) return;
  const T = +(document.getElementById('ck-' + fila)?.dataset.t || 1), k = m[1] === 'ri' ? T - 1 : +m[4];
  const reg = z.valores[`${fila}-${k}`]; if (!reg?.id) return;
  const campo = { kg: 'kg', rp: 'repeticiones', ri: 'rir' }[m[1]], val = numero(e.target.value);
  if (val == null || val === reg[campo]) return;
  const { error } = await sb.from('registros_series').update({ [campo]: val }).eq('id', reg.id);
  if (error) return fallo(error, 'No se ha guardado el cambio.');
  reg[campo] = val; toast('Cambio guardado');
});
document.addEventListener('input', e => {
  if (e.target.id === 'ej-buscar') { S.filtroEj = e.target.value; const pos = e.target.selectionStart; render(); const i = $('#ej-buscar'); i.focus(); try { i.setSelectionRange(pos, pos); } catch (er) { } }
  if (e.target.id === 'k-mot') $('#k-mot-v').textContent = e.target.value + '/10';
  if (e.target.id === 'k-nut') $('#k-nut-v').textContent = e.target.value + ' %';
  if (e.target.id === 'k-imp') $('#k-imp-v').textContent = e.target.value + '/10';
});

document.addEventListener('change', e => { if (e.target.id === 'r-fotos') subirFotosComida(e.target); });

arrancar().catch(err => { console.error(err); vistaMensaje('No se ha podido cargar', 'Revisa tu conexión y vuelve a abrir la app.', false); });
