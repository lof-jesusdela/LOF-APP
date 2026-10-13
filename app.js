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
  cal: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>'
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
  await cargarAlumno(S.user.id);
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
const SEL_PROGRAMA = 'id,nombre,dias_semana,dias(id,numero,nombre,objetivo,volumen,intensidad,foco,bloques_sesion(id,letra,nombre,tipo,agrupacion,duracion,fc_objetivo,maquina,objetivo,detalle,video_url,ejercicios_sesion(id,orden,series,repeticiones,rir,peso_ref,descanso_seg,ajustes,aproximacion_631,grupo,pauta,ejercicios(nombre,video_url,imagen_url,musculo_img_url,musculo,descripcion),metodos(nombre,explicacion))))';

async function cargarAlumno(uid) {
  const desde = sumaDias(hoyISO(), -60);
  const [srv, prog, med, reg, ses, chk, ruta, met] = await Promise.all([
    sb.from('servicios').select('*').eq('alumno_id', uid).eq('activo', true).order('id', { ascending: false }).limit(1),
    conRespaldo(() => sb.from('programas').select(SEL_PROGRAMA).eq('alumno_id', uid).eq('activo', true).order('id', { ascending: false }).limit(1),
      () => sb.from('programas').select(SIN_NUEVAS(SEL_PROGRAMA)).eq('alumno_id', uid).eq('activo', true).order('id', { ascending: false }).limit(1)),
    sb.from('mediciones').select('*').eq('alumno_id', uid).eq('es_objetivo', false).order('fecha'),
    sb.from('registro_diario').select('*').eq('alumno_id', uid).gte('fecha', desde),
    conRespaldo(() => sb.from('sesiones_hechas').select('id,dia_id,fecha,nota,inicio_at,duracion_min').eq('alumno_id', uid).gte('fecha', desde).order('fecha'),
      () => sb.from('sesiones_hechas').select('id,dia_id,fecha,nota').eq('alumno_id', uid).gte('fecha', desde).order('fecha')),
    sb.from('checkins').select('*').eq('alumno_id', uid).order('semana_inicio', { ascending: false }).limit(12),
    sb.from('hoja_ruta').select('*').eq('alumno_id', uid).order('orden'),
    sb.from('metodos').select('nombre,explicacion')
  ]);
  const p = prog.data?.[0] || null;
  if (p) {
    p.dias.sort((a, b) => a.numero - b.numero);
    p.dias.forEach(d => { d.bloques_sesion.sort((a, b) => a.letra.localeCompare(b.letra)); d.bloques_sesion.forEach(b => b.ejercicios_sesion.sort((a, b) => a.orden - b.orden)); });
  }
  S.d = {
    servicio: srv.data?.[0] || null, programa: p, mediciones: med.data || [], diario: reg.data || [],
    sesiones: ses.data || [], checkins: chk.data || [], ruta: ruta.data || [],
    metodos: Object.fromEntries((met.data || []).map(m => [m.nombre, m.explicacion]))
  };
}

/* ---------- Render principal ---------- */
function tabsAlumno() {
  const s = S.d.servicio || {};
  return [['hoy', 'Hoy'], (s.modulo_entreno ?? true) && ['entreno', 'Entreno'], s.modulo_nutricion && ['nutri', 'Nutrición'], ['progreso', 'Progreso'], ['checkin', 'Check-in']].filter(Boolean);
}

function render() {
  const coach = S.modo === 'coach';
  const tabs = coach ? [['alumnos', 'Alumnos'], ['ejercicios', 'Ejercicios'], ['pagos', 'Pagos']] : tabsAlumno();
  const actual = coach ? S.ctab : S.tab;
  const esCoach = S.perfil.rol === 'coach';
  const vistas = { hoy: vHoy, entreno: vEntreno, nutri: vNutri, progreso: vProgreso, checkin: vCheckin, alumnos: vAlumnos, pagos: vPagos, ejercicios: vEjercicios };
  $('#app').innerHTML = `<header class="top">
      <div class="badge"><img src="icons/logo-96.jpg" alt=""><div class="t">La Obra Fitness<strong>${coach ? 'Panel coach' : esc(S.perfil.metodologia || 'Tu proceso')}</strong></div></div>
      <div class="row" style="gap:8px">${esCoach ? `<div class="seg" role="group" aria-label="Vista"><button data-act="modo" data-v="alumno" aria-pressed="${!coach}">Yo</button><button data-act="modo" data-v="coach" aria-pressed="${coach}">Coach</button></div>` : ''}
      <button class="avatar" data-act="cuenta" aria-label="Mi cuenta">${esCoach ? '<img src="icons/coach.jpg" alt="">' : esc((S.perfil.nombre || '?').slice(0, 2).toUpperCase())}</button></div>
    </header><main id="main">${(S.editor && coach) ? vEditor() : (S.ficha && coach) ? vFicha() : vistas[actual]()}</main>`;
  $('#tabs').hidden = false;
  $('#tabs-in').innerHTML = tabs.map(([k, l]) => `<button data-act="${coach ? 'ctab' : 'tab'}" data-t="${k}" ${actual === k && !((S.ficha || S.editor) && coach) ? 'aria-current="page"' : ''}>${svg(k)}<span>${l}</span></button>`).join('');
  if (S.dia && !coach && S.tab === 'entreno') rellenarSesion();
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

function vHoy() {
  const s = S.d.servicio || {}, p = S.d.programa, hoy = hoyISO();
  const d = diaDeHoy(), prox = proximoDia();
  const r = S.d.diario.find(x => x.fecha === hoy) || {};
  const ini = sumaDias(hoy, -6), w = semana(ini);
  let toca = '';
  if (!p) toca = '<div class="empty">Jesús está preparando tu programa. Aparecerá aquí en cuanto esté listo.</div>';
  else if (d) toca = `<div class="line"><div class="ico">${svg('entreno')}</div><div class="grow"><h3>${esc(d.nombre)} · ${esc(d.foco || '')}</h3><div class="small muted">${d.bloques_sesion.length} bloques · ${d.bloques_sesion.reduce((t, b) => t + b.ejercicios_sesion.length, 0)} ejercicios</div></div>${hechoHoy(d.id) ? '<span class="pill ok">Hecho</span>' : `<button class="btn sm" data-act="abrirDia" data-id="${d.id}">Empezar</button>`}</div>`;
  else toca = `<div class="line"><div class="ico">${svg('cal')}</div><div class="grow"><h3>Hoy toca descanso</h3><div class="small muted">${prox ? `Próximo entreno: ${esc(prox.nombre)}` : 'Aprovecha para moverte y cumplir tus pasos.'}</div></div></div>`;
  const ali = s.modulo_nutricion ? `<div class="stack" style="gap:8px"><span class="small muted">¿Cómo ha ido hoy la alimentación?</span><div class="choice" role="group">${[['si', 'Cumplido'], ['parcial', 'A medias'], ['no', 'No cumplido']].map(([v, l]) => `<button data-act="ali" data-v="${v}" aria-pressed="${r.alimentacion === v}">${l}</button>`).join('')}</div></div>` : '';
  const dur = s.duracion_semanas, semN = s.inicio ? Math.floor((fecha(hoy) - fecha(s.inicio)) / 6048e5) + 1 : null;
  return `<section class="card hero stack">
    <span class="eyebrow">${esc(fLarga(hoy))}</span>
    <h1>Hola, ${esc((S.perfil.nombre || '').split(' ')[0])}</h1>
    <div class="small muted">${esc(s.producto || 'Tu proceso')}${p ? ' · ' + esc(p.nombre) : ''}${semN && dur ? ` · Semana ${semN} de ${dur}` : ''}</div>
    ${S.d.ruta[0]?.objetivos?.length ? `<div style="border-top:1px solid rgba(255,255,255,.14);padding-top:12px" class="stack"><span class="eyebrow">Tu objetivo</span><div class="small">${esc(S.d.ruta[0].objetivos.join(' · '))}</div></div>` : ''}
  </section>
  <section class="section"><h2>Lo que toca hoy</h2><div class="card">${toca}</div></section>
  <section class="section"><h2>Registro de hoy</h2><div class="card stack">
    <div class="row"><div class="ico">${svg('pasos')}</div><label class="f grow">Pasos de hoy<input id="r-pasos" type="number" inputmode="numeric" min="0" value="${r.pasos ?? ''}" placeholder="Ej. 8500"></label><label class="f" style="width:96px">Horas de pie<input id="r-pie" type="number" inputmode="decimal" min="0" max="24" step="0.5" value="${r.horas_pie ?? ''}" placeholder="Ej. 5"></label></div>
    ${ali}
    <button class="btn" data-act="guardarDiario">Guardar registro de hoy</button>
    <p class="note">Apúntalo al final del día. Tarda 10 segundos y es lo que permite a Jesús ver tu semana real.</p>
  </div></section>
  <section class="section"><div class="section-head"><h2>Últimos 7 días</h2><span class="small muted">${esc(fCorta(ini))} – ${esc(fCorta(hoy))}</span></div><div class="card stack" style="gap:18px">
    ${(s.modulo_entreno ?? true) ? `<div class="stack" style="gap:8px"><div class="row"><span class="grow small">Entrenamientos</span><b class="num" style="font-family:var(--display);font-size:20px">${w.entrenos}${p?.dias_semana ? ' / ' + p.dias_semana : ''}</b></div>${tira(ini, x => w.diasEntreno.has(x) ? 'ok' : '')}</div>` : ''}
    ${s.modulo_nutricion ? `<div class="stack" style="gap:8px"><div class="row"><span class="grow small">Alimentación</span><b class="num" style="font-family:var(--display);font-size:20px">${w.aliPct == null ? '—' : w.aliPct + ' %'}</b></div>${tira(ini, x => ({ si: 'ok', parcial: 'part', no: 'no' }[w.aliDias[x]] || ''))}</div>` : ''}
    <div class="stack" style="gap:8px"><div class="row"><span class="grow small">Pasos (media)</span><b class="num" style="font-family:var(--display);font-size:20px">${w.pasosMedia == null ? '—' : fmtNum(w.pasosMedia, 0)}</b></div>${tira(ini, x => w.diasPasos.has(x) ? 'ok' : '')}</div>
  </div></section>
  ${S.perfil.rol !== 'coach' ? `<section class="section"><div class="card coach"><img src="icons/coach.jpg" alt="Jesús de la Obra"><div class="grow"><span class="eyebrow">Tu coach</span><h3>Jesús de la Obra</h3><div class="small muted">Dudas y ajustes por WhatsApp</div></div></div></section>` : ''}`;
}

async function guardarDiario(extra = {}) {
  const row = { alumno_id: S.user.id, fecha: hoyISO(), pasos: numero($('#r-pasos')?.value), horas_pie: numero($('#r-pie')?.value), ...extra };
  const prev = S.d.diario.find(x => x.fecha === row.fecha);
  if (prev && !('alimentacion' in extra)) row.alimentacion = prev.alimentacion;
  const { data, error } = await sb.from('registro_diario').upsert(row, { onConflict: 'alumno_id,fecha' }).select().single();
  if (error) return fallo(error);
  S.d.diario = S.d.diario.filter(x => x.fecha !== row.fecha).concat(data);
  toast('Registro de hoy guardado'); render();
}

/* ---------- Entreno ---------- */
function vEntreno() {
  const p = S.d.programa;
  if (!p) return '<div class="empty">Jesús está preparando tu programa.</div>';
  if (S.dia) return vSesion();
  const lunes = lunesDe(hoyISO()), hoyN = norm(DIAS[new Date().getDay()]);
  const hechoSemana = id => S.d.sesiones.some(s => s.dia_id === id && s.fecha >= lunes);
  return `<section class="stack"><span class="eyebrow">${esc(p.nombre)}</span><h1>Entreno</h1></section>
  <section class="section"><div class="card">${p.dias.map(d => `<div class="wk ${norm(d.nombre) === hoyN ? 'today' : ''}"><span class="d">${esc(d.nombre.slice(0, 3))}</span><div class="grow"><h3>${esc(d.foco || d.nombre)}</h3><div class="small muted">${esc(d.volumen || '')} volumen · ${esc(d.intensidad || '')} intensidad</div></div>${hechoSemana(d.id) ? '<span class="pill ok">Hecho</span>' : ''}<button class="btn sm ${norm(d.nombre) === hoyN ? '' : 'ghost'}" data-act="abrirDia" data-id="${d.id}">Abrir</button></div>`).join('')}</div></section>`;
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
const kgDe = t => { const m = String(t?.kg || '').match(/(\d+[.,]?\d*)\s*kg/i); return m ? m[1] : ''; };

function vEjercicio(e, i) {
  const grupos = gruposDe(e.pauta), sp = esSinPeso(e), ej = e.ejercicios || {};
  let n = 0;
  const filas = grupos.map((g, gi) => {
    const descanso = g.tramos[g.tramos.length - 1].d ?? e.descanso_seg ?? 60, T = g.tramos.length;
    const cab = `<div class="small" style="grid-column:1/-1;margin-top:${gi ? 6 : 0}px"><b>${grupos.length > 1 ? (gi === 0 && g.s === 1 ? 'Serie principal' : `Series ${n + 1}–${n + g.s}`) : `${g.s} ${g.s === 1 ? 'serie' : 'series'}`}</b> · ${esc(txtTramo(g.tramos[0]))} · descanso ${descanso ? seg(descanso) : 'no, sigue'}</div>
      ${T > 1 ? `<div class="tramos" style="grid-column:1/-1">${g.tramos.map((t, k) => `<button class="tramo" data-act="tramo" data-d="${t.d ?? 0}" data-lbl="${esc(ej.nombre)} · tramo ${k + 1}">Tramo ${k + 1}: ${esc(txtTramo(t) || 'igual')}${k < T - 1 ? ` → ${t.d ? seg(t.d) : 'sin pausa'}` : ''}</button>`).join('')}</div>` : ''}`;
    const series = [...Array(g.s)].map(() => {
      n++; const r = `${e.id}-${n}`;
      return g.tramos.map((t, k) => {
        const ult = k === T - 1, id = `${r}-${k}`;
        return `<span class="num muted" data-row="${r}" ${k === 0 ? `id="row-${r}"` : ''}>${k === 0 ? n : '↳'}</span>`
          + (sp ? `<span class="small muted" data-row="${r}" style="text-align:center">Sin peso</span>` : `<input id="kg-${id}" data-row="${r}" type="text" inputmode="decimal" placeholder="${esc(kgDe(t))}" aria-label="Kg serie ${n}${T > 1 ? ' tramo ' + (k + 1) : ''}">`)
          + `<input id="rp-${id}" data-row="${r}" type="number" inputmode="numeric" aria-label="Repeticiones serie ${n}${T > 1 ? ' tramo ' + (k + 1) : ''}">`
          + (ult ? `<input id="ri-${r}" data-row="${r}" type="number" inputmode="numeric" min="0" max="5" aria-label="RIR serie ${n}"><button class="chk" id="ck-${r}" data-act="serie" data-es="${e.id}" data-n="${n}" data-t="${T}" data-sp="${sp ? 1 : 0}" data-d="${descanso}" data-lbl="${esc(ej.nombre)} · serie ${n}" aria-label="Serie ${n} hecha">${CHK}</button>` : '<span></span><span></span>');
      }).join('');
    }).join('');
    return cab + series;
  }).join('');
  const vid = ej.video_url ? `<a class="btn sm" href="${esc(ej.video_url)}" target="_blank" rel="noopener">▶ Vídeo</a>` : `<button class="btn sm ghost" data-act="sinVideo">▶ Vídeo</button>`;
  return `<div class="card ex" id="ex-${e.id}">
    ${ej.imagen_url || ej.musculo_img_url ? `<div class="imgs">${ej.imagen_url ? `<button class="img" data-act="verImagen" data-src="${esc(ej.imagen_url)}" aria-label="Ver imagen del ejercicio"><img src="${esc(ej.imagen_url)}" alt="${esc(ej.nombre)}" loading="lazy" onerror="this.parentNode.hidden=true"><span>Ejercicio</span></button>` : ''}${ej.musculo_img_url ? `<button class="img" data-act="verImagen" data-src="${esc(ej.musculo_img_url)}" aria-label="Ver músculo trabajado"><img src="${esc(ej.musculo_img_url)}" alt="Músculo trabajado" loading="lazy" onerror="this.parentNode.hidden=true"><span>Músculo</span></button>` : ''}</div>` : ''}
    <div class="row" style="align-items:flex-start"><span class="exn num">${i}</span><div class="grow"><h3>${esc(ej.nombre)}</h3><div class="small muted">${e.series} ${e.series === 1 ? 'serie' : 'series'} · ${esc(e.repeticiones)}${e.rir != null ? ' · RIR ' + e.rir : ''}</div></div>${vid}</div>
    ${ej.musculo ? `<div class="chips" style="gap:6px"><span class="pill blue">Músculo: ${esc(ej.musculo)}</span></div>` : ''}
    ${ej.descripcion ? `<p class="small muted">${esc(ej.descripcion)}</p>` : ''}
    ${e.grupo ? `<p class="note">${esc(e.grupo)}</p>` : ''}
    <div class="chips" style="gap:6px">${e.metodos ? `<button class="pill gold" data-act="metodo" data-n="${esc(e.metodos.nombre)}">Método: ${esc(e.metodos.nombre)} ⓘ</button>` : ''}${e.aproximacion_631 ? '<button class="pill gold" data-act="metodo" data-n="Aproximación 6·3·1">Aproximación 6·3·1 ⓘ</button>' : ''}</div>
    ${e.ajustes ? `<div class="small" style="color:var(--blue-text)">A tu medida: ${esc(e.ajustes)}</div>` : ''}
    ${e.aproximacion_631 ? vAprox(e) : ''}
    <div class="sets"><span class="h">Nº</span><span class="h">Kg</span><span class="h">Reps</span><span class="h">RIR</span><span class="h">Hecha</span>${filas}</div>
  </div>`;
}

/* Orden de la sesión y cadenas de superseries (ejercicios unidos por descanso 0) */
function prepararNavegacion(d) {
  const orden = [], cadena = {}, series = {};
  d.bloques_sesion.filter(b => b.tipo === 'fuerza').forEach(b => {
    let actual = [];
    b.ejercicios_sesion.forEach((e, i) => {
      if (i > 0 && (b.ejercicios_sesion[i - 1].descanso_seg ?? 60) !== 0) actual = [];
      actual.push(e.id); cadena[e.id] = actual; orden.push(e.id); series[e.id] = e.series;
    });
  });
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
function vAprox(e) {
  const m = String(e.peso_ref || '').match(/(\d+[.,]?\d*)\s*kg/i), o = m ? m[1] + ' kg' : 'tu peso';
  return `<div class="aprox"><span class="eyebrow">Aproximación 6·3·1 · antes de empezar</span>
    <div class="small">Al terminar la repetición única, descansa 1 minuto y empieza tus series.</div>
    ${[[6, 'Peso ligero', 'Ligero'], [3, 'Tu peso objetivo', o], [1, 'Por encima del objetivo', '+ ' + o]].map(([n, t, ph], j) => `<div class="ap-row"><span class="ap-n num">${n}</span><span class="small">${n === 1 ? '1 repetición' : n + ' repeticiones'}<br><span class="muted">${t}</span></span><input type="text" inputmode="decimal" placeholder="${esc(ph)}" aria-label="Peso aproximación ${n}"><button class="chk" data-act="aprox" data-j="${j}" aria-label="Hecha">${CHK}</button></div>`).join('')}
  </div>`;
}
function vBloque(b, cont) {
  if (b.tipo !== 'fuerza') {
    return `<div class="card stack"><div class="row"><span class="pill gold">${esc(b.letra)}</span><h3 class="grow">${esc(b.nombre)}</h3></div>
      ${b.tipo === 'cardio' ? `<div class="kpis" style="grid-template-columns:1fr 1fr"><div class="kpi"><div class="l">Duración</div><b>${esc(b.duracion || '—')}</b></div><div class="kpi"><div class="l">Frecuencia cardiaca</div><b style="color:var(--bad)">${esc(b.fc_objetivo || '—')}</b></div></div><div class="small muted">${esc([b.maquina, b.objetivo].filter(Boolean).join(' · '))}</div>` : ''}
      ${b.detalle ? `<p class="note">${esc(b.detalle)}</p>` : ''}
      ${b.video_url ? `<a class="btn sm ghost" style="align-self:flex-start" href="${esc(b.video_url)}" target="_blank" rel="noopener">Ver vídeo</a>` : ''}</div>`;
  }
  return `<div class="stack"><div class="row"><span class="pill gold">${esc(b.letra)}</span><h3 class="grow">${esc(b.nombre)}</h3></div>${b.agrupacion ? `<p class="note">${esc(b.agrupacion)}</p>` : ''}${b.ejercicios_sesion.map(e => vEjercicio(e, ++cont.n)).join('')}</div>`;
}
function vSesion() {
  const d = S.dia, cont = { n: 0 };
  prepararNavegacion(d);
  const ini = S.sesion?.inicio;
  return `<div class="crono" id="crono">${ini ? `<span class="crono-t num" id="crono-t">${fmtCrono(Date.now() - ini)}</span><span class="small">Entrenamiento en curso</span>` : `<button class="btn sm" data-act="empezarCrono">⏱ Empezar entrenamiento</button><span class="small muted">El cronómetro mide tu sesión completa</span>`}</div>
  <section class="stack"><button class="btn sm ghost" data-act="cerrarDia" style="align-self:flex-start">← Semana</button>
    <span class="eyebrow">${esc(S.d.programa.nombre)} · ${esc(d.nombre)}</span><h1>${esc(d.foco || d.nombre)}</h1>
    <div class="card stack"><span class="eyebrow">Objetivo de hoy</span><div class="small">${esc(d.objetivo || '')}</div>
    <div class="kpis"><div class="kpi"><div class="l">Volumen</div><b>${esc(d.volumen || '—')}</b></div><div class="kpi"><div class="l">Intensidad</div><b>${esc(d.intensidad || '—')}</b></div><div class="kpi"><div class="l">Foco</div><b>${esc(d.foco || '—')}</b></div></div></div></section>
  <section class="section">${d.bloques_sesion.map(b => vBloque(b, cont)).join('')}
  <button class="btn full dark" data-act="terminar">Terminar sesión</button></section>`;
}

/* Cronómetro de la sesión completa (sobrevive a cerrar la app) */
const claveCrono = () => `lof-ini-${S.user.id}-${S.dia.id}-${hoyISO()}`;
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

async function abrirDia(id) {
  S.dia = S.d.programa.dias.find(d => d.id === id);
  S.sesion = { id: null, regs: {}, valores: {}, ultimos: {}, inicio: null };
  try { const v = +localStorage.getItem(claveCrono()); if (v) S.sesion.inicio = v; } catch (e) { }
  S.tab = 'entreno'; window.scrollTo(0, 0);
  const ids = S.dia.bloques_sesion.flatMap(b => b.ejercicios_sesion.map(e => e.id));
  const hoyS = S.d.sesiones.find(s => s.fecha === hoyISO() && s.dia_id === id);
  if (hoyS) { S.sesion.id = hoyS.id; if (!S.sesion.inicio && hoyS.inicio_at) S.sesion.inicio = new Date(hoyS.inicio_at).getTime(); }
  if (ids.length) {
    const { data } = await conRespaldo(() => sb.from('registros_series').select('id,sesion_id,ejercicio_sesion_id,serie,tramo,kg,repeticiones,rir,creado_at').eq('alumno_id', S.user.id).in('ejercicio_sesion_id', ids).order('creado_at', { ascending: false }).limit(1500),
      () => sb.from('registros_series').select('id,sesion_id,ejercicio_sesion_id,serie,kg,repeticiones,rir,creado_at').eq('alumno_id', S.user.id).in('ejercicio_sesion_id', ids).order('creado_at', { ascending: false }).limit(1500));
    (data || []).forEach(r => {
      const fila = `${r.ejercicio_sesion_id}-${r.serie}`, k = `${fila}-${(r.tramo || 1) - 1}`;
      if (hoyS && r.sesion_id === hoyS.id) { (S.sesion.regs[fila] ||= []).push(r.id); S.sesion.valores[k] = r; }
      else if (!S.sesion.ultimos[k]) S.sesion.ultimos[k] = r;
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
      if (u) { if (kg && u.kg != null) kg.placeholder = fmtNum(u.kg, 2); if (u.repeticiones != null) rp.placeholder = u.repeticiones; }
      if (v) { if (kg && v.kg != null) kg.value = fmtNum(v.kg, 2); if (v.repeticiones != null) rp.value = v.repeticiones; }
    }
    const ri = document.getElementById(`ri-${fila}`), uL = z.ultimos[`${fila}-${T - 1}`], vL = z.valores[`${fila}-${T - 1}`];
    if (uL?.rir != null) ri.placeholder = uL.rir;
    if (vL?.rir != null) ri.value = vL.rir;
    if (z.regs[fila]) marcar(b, fila, true);
  });
}
function marcar(b, fila, on) {
  b.classList.toggle('on', on);
  document.querySelectorAll(`input[data-row="${fila}"]`).forEach(x => x.classList.toggle('on', on));
}
async function asegurarSesion() {
  if (S.sesion.id) return S.sesion.id;
  const fila = { alumno_id: S.user.id, dia_id: S.dia.id, fecha: hoyISO() };
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
  if (!z.inicio) empezarCrono();
  const rows = [...Array(T)].map((_, k) => {
    const u = z.ultimos[`${fila}-${k}`] || {}, kg = document.getElementById(`kg-${fila}-${k}`), rp = document.getElementById(`rp-${fila}-${k}`);
    return { alumno_id: S.user.id, ejercicio_sesion_id: es, serie: n, tramo: k + 1,
      kg: kg ? (numero(kg.value) ?? u.kg ?? null) : null, repeticiones: numero(rp.value) ?? u.repeticiones ?? null,
      rir: k === T - 1 ? (numero(document.getElementById(`ri-${fila}`).value) ?? u.rir ?? null) : null };
  });
  marcar(b, fila, true);
  const d = +b.dataset.d;
  if (d > 0) startTimer(d, 'Descanso · ' + b.dataset.lbl); else toast('Sin descanso: sigue con el siguiente');
  const sig = siguienteFila(es, n); if (sig) enfocarFila(sig[0], sig[1]);
  try {
    const sid = await asegurarSesion(); rows.forEach(r => r.sesion_id = sid);
    const { data, error } = await conRespaldo(() => sb.from('registros_series').insert(rows).select('id'),
      () => sb.from('registros_series').insert(rows.map(({ tramo, ...x }) => x)).select('id'));
    if (error) throw error;
    z.regs[fila] = data.map(x => x.id);
    rows.forEach((r, k) => {
      z.valores[`${fila}-${k}`] = r;
      const kg = document.getElementById(`kg-${fila}-${k}`), rp = document.getElementById(`rp-${fila}-${k}`);
      if (kg && r.kg != null && !kg.value) kg.value = fmtNum(r.kg, 2);
      if (r.repeticiones != null && !rp.value) rp.value = r.repeticiones;
    });
  } catch (err) { marcar(b, fila, false); fallo(err, 'No se ha guardado la serie. Revisa tu conexión.'); }
}
function terminar() {
  const min = S.sesion?.inicio ? Math.max(1, Math.round((Date.now() - S.sesion.inicio) / 60000)) : null;
  abrirSheet(`<div class="stack"><h2>Sesión terminada</h2>${min ? `<p class="small">Has entrenado <b>${min} minutos</b>.</p>` : ''}<label class="f">¿Algo que quieras contarle a Jesús? (opcional)<textarea id="s-nota" placeholder="Molestias, sensaciones, máquinas ocupadas…"></textarea></label><button class="btn full" data-act="guardarSesion">Guardar y salir</button></div>`);
}
async function guardarSesion() {
  try {
    const id = await asegurarSesion(), nota = $('#s-nota').value.trim(), cambios = {};
    if (nota) cambios.nota = nota;
    if (S.sesion.inicio) { cambios.duracion_min = Math.max(1, Math.round((Date.now() - S.sesion.inicio) / 60000)); cambios.inicio_at = new Date(S.sesion.inicio).toISOString(); }
    if (Object.keys(cambios).length) { const { error } = await conRespaldo(() => sb.from('sesiones_hechas').update(cambios).eq('id', id), () => sb.from('sesiones_hechas').update({ nota: cambios.nota ?? null }).eq('id', id)); if (error) throw error; Object.assign(S.d.sesiones.find(s => s.id === id) || {}, cambios); }
    try { localStorage.removeItem(claveCrono()); } catch (e) { }
    cerrarSheet(); stopTimer(); S.dia = null; S.sesion = null; S.tab = 'hoy'; toast('Sesión guardada. ¡Buen trabajo!'); render(); window.scrollTo(0, 0);
  } catch (err) { fallo(err); }
}

/* ---------- Nutrición (pendiente de cargar planes) ---------- */
function vNutri() { return `<section class="stack"><span class="eyebrow">Tu plan de alimentación</span><h1>Nutrición</h1></section><div class="section card empty">Tu plan de alimentación aparecerá aquí muy pronto.</div>`; }

/* ---------- Progreso ---------- */
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
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolución">${grid}<polygon points="${x(0)},${H - pb} ${line} ${x(pts.length - 1)},${H - pb}" fill="${color}" opacity=".1"/><polyline points="${line}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>${pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.v)}" r="${i === pts.length - 1 ? 4.5 : 2.5}" fill="${color}" stroke="var(--surface)" stroke-width="1.5"/>`).join('')}${lbl}</svg>`;
}
function serie(med, campo) { return med.slice().sort((x, y) => x.fecha.localeCompare(y.fecha)).filter(m => m[campo] != null).map(m => ({ f: m.fecha, v: Number(m[campo]) })); }
function delta(pts) { if (pts.length < 2) return null; return pts[pts.length - 1].v - pts[0].v; }
function vProgreso() {
  const med = S.d.mediciones;
  const campos = [['peso', 'Peso', ' kg', 'var(--blue)'], ['grasa_pct', '% de grasa', ' %', 'var(--gold)'], ['cintura', 'Cintura', ' cm', 'var(--ink)'], ['cadera', 'Cadera', ' cm', 'var(--blue)'], ['abd_bajo', 'Abdomen bajo', ' cm', 'var(--ink)']];
  const k = c => { const p = serie(med, c), dl = delta(p); return dl == null ? '—' : (dl > 0 ? '+' : '') + fmtNum(dl); };
  const semanas = [...Array(8)].map((_, i) => lunesDe(sumaDias(hoyISO(), -7 * (7 - i))));
  const porSem = semanas.map(l => semana(l).entrenos), maxS = Math.max(S.d.programa?.dias_semana || 1, ...porSem);
  return `<section class="stack"><span class="eyebrow">Tu evolución</span><h1>Progreso</h1></section>
  ${S.d.ruta.length ? `<section class="section"><div class="card stack"><span class="eyebrow">Tu objetivo</span>${S.d.ruta.map(r => `<div class="small">${esc((r.objetivos || []).join(' · '))}</div>`).join('')}</div></section>` : ''}
  ${med.length ? `<section class="section"><div class="kpis"><div class="kpi"><div class="v num">${k('peso')}</div><div class="l">kg de peso</div></div><div class="kpi"><div class="v num">${k('grasa_pct')}</div><div class="l">% de grasa</div></div><div class="kpi"><div class="v num">${k('cintura')}</div><div class="l">cm de cintura</div></div></div><p class="small muted">Cambio desde tu primera medición (${esc(fCorta(med[0].fecha))} ${fecha(med[0].fecha).getFullYear()}).</p></section>` : ''}
  <section class="section">${campos.map(([c, t, u, col]) => { const p = serie(med, c); return p.length ? `<div class="card stack chart"><div class="row"><h3 class="grow">${t}</h3><span class="pill blue num">${fmtNum(p[p.length - 1].v)}${u}</span></div>${spark(p, { unit: u, color: col })}</div>` : ''; }).join('') || '<div class="card empty">Aún no hay mediciones. Jesús las añadirá en tu próxima revisión.</div>'}
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
    ${s.modulo_nutricion ? `<div class="row small"><span class="grow">Alimentación</span><span class="pill num">${w.aliPct == null ? 'Sin registros' : w.aliPct + ' %'}</span></div>` : ''}
    <div class="row small"><span class="grow">Pasos (media)</span><span class="pill num">${w.pasosMedia == null ? 'Sin registros' : fmtNum(w.pasosMedia, 0)}</span></div>
  </div>
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
  const { data, error } = await sb.from('checkins').upsert(row, { onConflict: 'alumno_id,semana_inicio' }).select().single();
  if (error) return fallo(error);
  S.d.checkins = [data, ...S.d.checkins.filter(x => x.semana_inicio !== row.semana_inicio)];
  toast('Check-in enviado a Jesús'); S.tab = 'hoy'; render(); window.scrollTo(0, 0);
}

/* =====================================================================
   PANEL DEL COACH
   ===================================================================== */
async function cargarCoach() {
  const desde = sumaDias(hoyISO(), -56);
  const [per, srv, ses, chk, reg, pag, prg, ejs] = await Promise.all([
    sb.from('perfiles').select('*').order('nombre'),
    sb.from('servicios').select('*').eq('activo', true),
    sb.from('sesiones_hechas').select('id,alumno_id,dia_id,fecha,nota').gte('fecha', desde).order('fecha', { ascending: false }),
    sb.from('checkins').select('*').gte('semana_inicio', sumaDias(desde, -7)).order('semana_inicio', { ascending: false }),
    sb.from('registro_diario').select('*').gte('fecha', sumaDias(hoyISO(), -13)),
    sb.from('pagos').select('*').order('vence'),
    sb.from('programas').select('alumno_id,nombre,dias_semana').eq('activo', true),
    sb.from('ejercicios').select('*').order('nombre')
  ]);
  S.c = { perfiles: per.data || [], servicios: srv.data || [], sesiones: ses.data || [], checkins: chk.data || [], diario: reg.data || [], pagos: pag.data || [], programas: prg.data || [], ejercicios: ejs.data || [] };
}
function estadoAlumno(a) {
  const c = S.c, hoy = hoyISO(), hace7 = sumaDias(hoy, -6);
  const ses = c.sesiones.filter(s => s.alumno_id === a.id);
  const ses7 = new Set(ses.filter(s => s.fecha >= hace7).map(s => s.fecha + s.dia_id)).size;
  const chks = c.checkins.filter(k => k.alumno_id === a.id);
  const ult = chks[0], ant = chks[1];
  const vencidos = c.pagos.filter(p => p.alumno_id === a.id && !p.pagado_at && p.vence < hoy);
  const motivos = [];
  let nivel = 'ok';
  if (vencidos.length) { nivel = 'bad'; motivos.push(`Pago vencido: ${vencidos.map(p => p.importe + ' €').join(', ')}`); }
  if (!ses.length || ses[0].fecha < hace7) { nivel = 'bad'; motivos.push(ses.length ? `Sin entrenar desde el ${fCorta(ses[0].fecha)}` : 'Sin entrenamientos registrados'); }
  if (ult && ult.motivacion <= 4) { nivel = 'bad'; motivos.push(`Motivación ${ult.motivacion}/10`); }
  else if (ult && ant && ant.motivacion - ult.motivacion >= 3) { if (nivel === 'ok') nivel = 'warn'; motivos.push(`Motivación de ${ant.motivacion} a ${ult.motivacion}`); }
  if (!chks.some(k => k.semana_inicio >= lunesDe(sumaDias(hoy, -7)))) { if (nivel === 'ok') nivel = 'warn'; motivos.push('Sin check-in reciente'); }
  const dpw = (c.programas.find(p => p.alumno_id === a.id) || {}).dias_semana || 0;
  const lunes = lunesDe(hoy), semana = new Set(ses.filter(s => s.fecha >= lunes).map(s => s.fecha + s.dia_id)).size;
  const mes = new Set(ses.filter(s => s.fecha >= sumaDias(hoy, -27)).map(s => s.fecha + s.dia_id)).size;
  return { nivel, motivos, ses7, ult, ultSes: ses[0], dpw, semana, mes };
}
function vAlumnos() {
  const c = S.c, als = c.perfiles.filter(p => p.activo !== false);
  const est = als.map(a => ({ a, e: estadoAlumno(a) })), orden = { bad: 0, warn: 1, ok: 2 };
  est.sort((x, y) => orden[x.e.nivel] - orden[y.e.nivel]);
  const lab = { ok: 'En camino', warn: 'Atención', bad: 'Revisar' };
  const venc = c.pagos.filter(p => !p.pagado_at && p.vence < hoyISO());
  return `<section class="stack"><span class="eyebrow">Panel del coach · ${esc(fLarga(hoyISO()))}</span><h1>Tus alumnos</h1></section>
  <section class="section"><div class="kpis"><div class="kpi"><div class="v num">${als.length}</div><div class="l">perfiles activos</div></div><div class="kpi"><div class="v num" style="color:var(--bad)">${est.filter(x => x.e.nivel !== 'ok').length}</div><div class="l">necesitan atención</div></div><div class="kpi"><div class="v num" style="color:${venc.length ? 'var(--bad)' : 'var(--ok)'}">${venc.length}</div><div class="l">pagos vencidos</div></div></div></section>
  ${vResumenCoach(est)}
  <section class="section"><h2>Alumnos</h2><div class="card">${est.map(({ a, e }) => `<div class="line" data-act="ficha" data-id="${a.id}" style="cursor:pointer"><span style="width:4px;align-self:stretch;border-radius:2px;background:var(--${e.nivel})"></span><div class="grow stack" style="gap:3px"><div class="row"><h3 class="grow">${esc(a.nombre)}</h3><span class="pill ${e.nivel}">${lab[e.nivel]}</span></div><div class="small muted">${esc((c.servicios.find(s => s.alumno_id === a.id) || {}).producto || 'Sin servicio')}${e.ult ? ` · motivación ${e.ult.motivacion}/10` : ''}</div>${e.dpw ? barra('Semana', e.semana, e.dpw) + barra('Últimas 4 semanas', e.mes, e.dpw * 4) : ''}${e.motivos.length ? `<div class="small">${esc(e.motivos.join(' · '))}</div>` : ''}</div></div>`).join('') || '<div class="empty">Aún no hay alumnos.</div>'}</div>
  <p class="note">Para dar de alta a un alumno nuevo, créalo en Supabase → Authentication → Users. Su perfil aparecerá aquí solo.</p></section>`;
}

async function abrirFicha(id) {
  S.ficha = { id, cargando: true }; render(); window.scrollTo(0, 0);
  const [med, ses, notas, prog, srv, todas] = await Promise.all([
    sb.from('mediciones').select('*').eq('alumno_id', id).order('fecha', { ascending: false }),
    sb.from('sesiones_hechas').select('id,fecha,nota,dias(nombre,foco),registros_series(id)').eq('alumno_id', id).order('fecha', { ascending: false }).limit(20),
    sb.from('notas_coach').select('*').eq('alumno_id', id).order('fecha', { ascending: false }).limit(20),
    sb.from('programas').select('nombre,dias_semana').eq('alumno_id', id).eq('activo', true).limit(1),
    sb.from('servicios').select('*').eq('alumno_id', id).eq('activo', true).limit(1),
    conRespaldo(() => sb.from('sesiones_hechas').select('fecha,dia_id,duracion_min').eq('alumno_id', id).gte('fecha', sumaDias(hoyISO(), -365)),
      () => sb.from('sesiones_hechas').select('fecha,dia_id').eq('alumno_id', id).gte('fecha', sumaDias(hoyISO(), -365)))
  ]);
  S.ficha = { id, med: med.data || [], ses: ses.data || [], notas: notas.data || [], prog: prog.data?.[0], srv: srv.data?.[0], todas: todas.data || [] };
  render();
}
function vFicha() {
  const f = S.ficha, a = S.c.perfiles.find(p => p.id === f.id) || {};
  if (f.cargando) return '<div class="empty">Cargando ficha…</div>';
  const e = estadoAlumno(a), chks = S.c.checkins.filter(k => k.alumno_id === a.id).slice(0, 4);
  const diario = S.c.diario.filter(r => r.alumno_id === a.id).sort((x, y) => y.fecha.localeCompare(x.fecha));
  const pagos = S.c.pagos.filter(p => p.alumno_id === a.id);
  return `<section class="stack"><button class="btn sm ghost" data-act="cerrarFicha" style="align-self:flex-start">← Alumnos</button><span class="eyebrow">Ficha del alumno</span><h1>${esc(a.nombre)}</h1>
    <div class="small muted">${esc(a.email)} · ${esc(f.srv?.producto || 'Sin servicio')}${f.prog ? ' · ' + esc(f.prog.nombre) : ''} · alta ${esc(fCorta(a.fecha_alta))}</div>
    <div class="row" style="flex-wrap:wrap;gap:8px"><button class="btn sm" data-act="nuevaMedicion">Añadir medición</button><button class="btn sm ghost" data-act="nuevoPago">Añadir cuota</button><button class="btn sm ghost" data-act="nuevaNota">Nota privada</button></div></section>
  ${e.motivos.length ? `<section class="section"><div class="card stack"><span class="eyebrow">Para revisar</span><div class="small">${esc(e.motivos.join(' · '))}</div></div></section>` : ''}
  ${vEstadisticas(f)}
  <section class="section"><div class="section-head"><h2>Programa</h2><button class="btn sm" data-act="editarPrograma" data-id="${a.id}">${f.prog ? 'Editar programa' : 'Crear programa'}</button></div><div class="card small">${f.prog ? `<b>${esc(f.prog.nombre)}</b> · ${f.prog.dias_semana || '—'} días por semana` : 'Este alumno aún no tiene programa.'}</div></section>
  <section class="section"><h2>Entrenamientos</h2><div class="card">${f.ses.map(s => `<div class="line" data-act="verSesion" data-id="${s.id}" style="cursor:pointer"><span class="small muted num" style="width:64px;flex:none">${esc(fCorta(s.fecha))}</span><div class="grow"><div class="small"><b>${esc(s.dias?.nombre || '')}</b> · ${esc(s.dias?.foco || '')} · ${s.registros_series.length} series</div>${s.nota ? `<div class="small muted">"${esc(s.nota)}"</div>` : ''}</div><span class="small muted">Ver</span></div>`).join('') || '<div class="empty">Sin entrenamientos registrados.</div>'}</div></section>
  <section class="section"><h2>Check-ins</h2><div class="card">${chks.map(k => `<div class="line" style="align-items:flex-start"><span class="small muted num" style="width:64px;flex:none">${esc(fCorta(k.semana_inicio))}</span><div class="grow stack" style="gap:4px"><div class="small">Motivación <b>${k.motivacion}/10</b> · implicación <b>${k.implicacion}/10</b></div>${k.dificultades ? `<div class="small"><span class="muted">Dificultades:</span> ${esc(k.dificultades)}</div>` : ''}${(k.proxima_semana_etiquetas || []).length || k.proxima_semana ? `<div class="small"><span class="muted">Semana que viene:</span> ${esc([...(k.proxima_semana_etiquetas || []), k.proxima_semana].filter(Boolean).join(' · '))}</div>` : ''}</div></div>`).join('') || '<div class="empty">Sin check-ins todavía.</div>'}</div></section>
  <section class="section"><h2>Registro diario</h2><div class="card tbl"><table><thead><tr><th>Día</th><th>Pasos</th><th>De pie</th><th>Alim.</th></tr></thead><tbody>${diario.map(r => `<tr><td>${esc(fCorta(r.fecha))}</td><td class="num">${r.pasos == null ? '—' : fmtNum(r.pasos, 0)}</td><td class="num">${r.horas_pie == null ? '—' : fmtNum(r.horas_pie) + ' h'}</td><td>${({ si: 'Cumplido', parcial: 'A medias', no: 'No' })[r.alimentacion] || '—'}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Sin registros en 14 días.</td></tr>'}</tbody></table></div></section>
  <section class="section"><h2>Mediciones</h2><div class="card tbl"><table><thead><tr><th>Fecha</th><th>Peso</th><th>% grasa</th><th>Cintura</th><th>Cadera</th></tr></thead><tbody>${f.med.map(m => `<tr><td>${esc(fCorta(m.fecha))} ${String(fecha(m.fecha).getFullYear()).slice(2)}</td><td class="num">${fmtNum(m.peso)}</td><td class="num">${fmtNum(m.grasa_pct)}</td><td class="num">${fmtNum(m.cintura)}</td><td class="num">${fmtNum(m.cadera)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Sin mediciones.</td></tr>'}</tbody></table></div></section>
  <section class="section"><h2>Pagos</h2><div class="card">${pagos.map(lineaPago).join('') || '<div class="empty">Sin cuotas registradas.</div>'}</div></section>
  <section class="section"><h2>Notas privadas</h2><div class="card">${f.notas.map(n => `<div class="line" style="align-items:flex-start"><span class="small muted num" style="width:64px;flex:none">${esc(fCorta(n.fecha))}</span><div class="small grow">${esc(n.texto)}</div></div>`).join('') || '<div class="empty">Solo tú ves estas notas.</div>'}</div></section>`;
}
async function verSesion(id) {
  const { data, error } = await sb.from('registros_series').select('serie,kg,repeticiones,rir,ejercicios_sesion(orden,ejercicios(nombre),bloques_sesion(letra))').eq('sesion_id', id).order('serie');
  if (error) return fallo(error, 'No se ha podido cargar la sesión.');
  const g = {};
  (data || []).forEach(r => { const es = r.ejercicios_sesion, k = `${es?.bloques_sesion?.letra || ''}${String(es?.orden || 0).padStart(2, '0')}`; (g[k] ||= { n: es?.ejercicios?.nombre || 'Ejercicio', s: [] }).s.push(r); });
  abrirSheet(`<div class="stack"><h2>Series registradas</h2>${Object.keys(g).sort().map(k => `<div class="stack" style="gap:4px"><h3>${esc(g[k].n)}</h3>${g[k].s.map(r => `<div class="small num">Serie ${r.serie}: ${r.kg == null ? '—' : fmtNum(r.kg, 2) + ' kg'} × ${r.repeticiones ?? '—'} rep · RIR ${r.rir ?? '—'}</div>`).join('')}</div>`).join('') || '<p class="muted">No hay series registradas.</p>'}<button class="btn ghost full" data-act="cerrarSheet">Cerrar</button></div>`);
}
function formMedicion() {
  const c = [['peso', 'Peso (kg)'], ['grasa_pct', '% de grasa'], ['grasa_kg', 'Grasa (kg)'], ['cuello', 'Cuello'], ['cintura', 'Cintura'], ['cadera', 'Cadera'], ['abd_bajo', 'Abdomen bajo'], ['pectoral', 'Pectoral'], ['hombros', 'Hombros'], ['brazo_d', 'Brazo dcho.'], ['brazo_i', 'Brazo izdo.'], ['muslo_d', 'Muslo dcho.'], ['muslo_i', 'Muslo izdo.'], ['gemelo_d', 'Gemelo dcho.'], ['gemelo_i', 'Gemelo izdo.']];
  abrirSheet(`<form class="stack" id="f-med"><h2>Nueva medición</h2><label class="f">Fecha<input type="date" id="m-fecha" value="${hoyISO()}"></label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${c.map(([k, l]) => `<label class="f">${l}<input type="text" inputmode="decimal" id="m-${k}" data-campo="${k}"></label>`).join('')}</div>
    <p class="small muted">Perímetros en cm. Deja vacío lo que no midas.</p><button class="btn full" type="submit">Guardar medición</button></form>`);
  $('#f-med').addEventListener('submit', async e => {
    e.preventDefault();
    const row = { alumno_id: S.ficha.id, fecha: $('#m-fecha').value };
    document.querySelectorAll('#f-med [data-campo]').forEach(i => { const v = numero(i.value); if (v != null) row[i.dataset.campo] = v; });
    const { error } = await sb.from('mediciones').insert(row);
    if (error) return fallo(error);
    cerrarSheet(); toast('Medición guardada'); abrirFicha(S.ficha.id);
  });
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
  ${graf ? `<section class="section"><h2>Composición corporal</h2>${graf}</section>` : ''}`;
}
function formServicio() {
  const s = S.ficha.srv || {};
  abrirSheet(`<form class="stack" id="f-srv"><h2>Servicio</h2>
    <label class="f">Producto<input type="text" id="sv-prod" value="${esc(s.producto || '')}" placeholder="Ej. Plan Integral 6 meses" required></label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label class="f">Inicio<input type="date" id="sv-ini" value="${s.inicio || hoyISO()}"></label><label class="f">Duración (semanas)<input type="number" id="sv-dur" min="1" max="104" value="${s.duracion_semanas || ''}" placeholder="Ej. 26"></label></div>
    <div class="stack" style="gap:8px">${[['entreno', 'Entrenamiento', s.modulo_entreno ?? true], ['nutricion', 'Nutrición', s.modulo_nutricion], ['presencial', 'Sesiones presenciales', s.modulo_presencial]].map(([k, l, v]) => `<label class="row small"><input type="checkbox" id="sv-${k}" ${v ? 'checked' : ''} style="width:20px;height:20px"> ${l}</label>`).join('')}</div>
    <button class="btn full" type="submit">Guardar</button></form>`);
  $('#f-srv').addEventListener('submit', async e => {
    e.preventDefault();
    const row = { alumno_id: S.ficha.id, producto: $('#sv-prod').value.trim() || 'Servicio', inicio: $('#sv-ini').value, duracion_semanas: numero($('#sv-dur').value),
      modulo_entreno: $('#sv-entreno').checked, modulo_nutricion: $('#sv-nutricion').checked, modulo_presencial: $('#sv-presencial').checked, activo: true };
    const q = s.id ? sb.from('servicios').update(row).eq('id', s.id) : sb.from('servicios').insert(row);
    const { error } = await q; if (error) return fallo(error);
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
  ${sinF ? `<button class="btn full" data-act="importarImagenes">Importar imágenes de tus hojas</button><p class="note">Copia la imagen del ejercicio y la del músculo que tenías en tus hojas de Google en los ${sinF} ejercicios que aún no tienen foto.</p>` : ''}
  <input type="text" id="ej-buscar" placeholder="Buscar por nombre o músculo" value="${esc(S.filtroEj || '')}">
  <div class="card">${vis.map(x => `<div class="line" data-act="editarEjercicio" data-id="${x.id}" style="cursor:pointer">${x.imagen_url ? `<img src="${esc(x.imagen_url)}" alt="" style="width:48px;height:48px;border-radius:10px;object-fit:cover;flex:none">` : `<div class="ico">${svg('ejercicios')}</div>`}<div class="grow"><h3>${esc(x.nombre)}</h3><div class="small muted">${esc(x.musculo || 'Sin músculo')}</div></div><div class="stack" style="gap:4px;align-items:flex-end"><span class="pill ${x.video_url ? 'ok' : 'warn'}">${x.video_url ? 'Vídeo' : 'Sin vídeo'}</span><span class="pill ${x.imagen_url ? 'ok' : 'warn'}">${x.imagen_url ? 'Foto' : 'Sin foto'}</span>${x.musculo_img_url ? '' : '<span class="pill warn">Sin músculo</span>'}</div></div>`).join('') || '<div class="empty">No hay ejercicios con ese nombre.</div>'}</div></section>`;
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
async function importarImagenes() {
  let mapa;
  try { mapa = await (await fetch('imagenes.json', { cache: 'no-store' })).json(); } catch (e) { return toast('No se ha podido leer el archivo de imágenes'); }
  const lista = S.c.ejercicios.filter(x => mapa[x.nombre] && (!x.imagen_url || !x.musculo_img_url));
  if (!lista.length) return toast('No hay imágenes nuevas que importar');
  abrirSheet(`<div class="stack"><h2>Importando imágenes</h2><p class="small" id="imp-txt">Preparando…</p><div class="track"><i id="imp-bar" style="width:0"></i></div><p class="note">No cierres la app hasta que termine.</p></div>`);
  let ok = 0, copias = 0, enlaces = 0, n = 0;
  const copiar = async (url, ruta) => {
    try {
      const resp = await fetch(url); if (!resp.ok) throw new Error(resp.status);
      const blob = await resp.blob();
      const up = await sb.storage.from('ejercicios').upload(ruta, blob, { contentType: blob.type || 'image/png', upsert: true });
      if (up.error) throw up.error;
      copias++; return sb.storage.from('ejercicios').getPublicUrl(ruta).data.publicUrl;
    } catch (e) { enlaces++; return url; }
  };
  for (const x of lista) {
    n++; $('#imp-txt').textContent = `${n} de ${lista.length} · ${x.nombre}`; $('#imp-bar').style.width = (n / lista.length * 100) + '%';
    const m = mapa[x.nombre], cambios = {};
    if (!x.imagen_url && m.img) cambios.imagen_url = await copiar(m.img, `hoja-ej-${x.id}.png`);
    if (!x.musculo_img_url && m.musculo_img) cambios.musculo_img_url = await copiar(m.musculo_img, `hoja-mus-${x.id}.png`);
    if (Object.keys(cambios).length) { const { error } = await sb.from('ejercicios').update(cambios).eq('id', x.id); if (!error) { Object.assign(x, cambios); ok++; } }
  }
  cerrarSheet(); await cargarAlumno(S.user.id); render();
  toast(`${ok} ejercicios con imagen${enlaces ? ' · algunas enlazadas a tu hoja' : ''}`);
  if (enlaces) setTimeout(() => abrirSheet(`<div class="stack"><h2>Imágenes importadas</h2><p class="small">${copias} imágenes copiadas a tu almacén y ${enlaces} enlazadas directamente a tu hoja de Google (el navegador no permitió copiarlas).</p><p class="note">Las enlazadas se ven igual, pero si algún día borras la hoja o cambias la imagen allí, dejarían de verse. Puedes sustituirlas desde cada ejercicio.</p><button class="btn ghost full" data-act="cerrarSheet">Entendido</button></div>`), 300);
}

/* ---------- Editor de programas (coach) ---------- */
const SEL_EDITOR = 'id,nombre,dias_semana,alumno_id,dias(id,numero,nombre,objetivo,volumen,intensidad,foco,bloques_sesion(id,letra,nombre,tipo,agrupacion,duracion,fc_objetivo,maquina,objetivo,detalle,video_url,ejercicios_sesion(id,orden,ejercicio_id,series,repeticiones,rir,peso_ref,descanso_seg,metodo_id,ajustes,aproximacion_631,grupo,pauta,ejercicios(nombre))))';
async function abrirEditor(alumnoId) {
  S.editor = { alumnoId, cargando: true }; render(); window.scrollTo(0, 0);
  const [prog, met] = await Promise.all([
    sb.from('programas').select(SEL_EDITOR).eq('alumno_id', alumnoId).eq('activo', true).order('id', { ascending: false }).limit(1),
    sb.from('metodos').select('id,nombre').order('nombre')
  ]);
  const p = prog.data?.[0] || null;
  if (p) { p.dias.sort((a, b) => a.numero - b.numero); p.dias.forEach(d => { d.bloques_sesion.sort((a, b) => a.letra.localeCompare(b.letra)); d.bloques_sesion.forEach(b => b.ejercicios_sesion.sort((a, b) => a.orden - b.orden)); }); }
  S.editor = { alumnoId, prog: p, metodos: met.data || [] }; render();
}
async function refrescarEditor() { const id = S.editor.alumnoId; await abrirEditor(id); if (id === S.user.id) await cargarAlumno(S.user.id); }
function vEditor() {
  const E = S.editor, a = S.c.perfiles.find(x => x.id === E.alumnoId) || {};
  if (E.cargando) return '<div class="empty">Cargando programa…</div>';
  const p = E.prog;
  const resumen = e => { const g = gruposDe(e.pauta); return `${e.series} × ${esc(e.repeticiones)}${e.rir != null ? ' · RIR ' + e.rir : ''}${e.peso_ref ? ' · ' + esc(e.peso_ref) : ''} · desc. ${e.descanso_seg ? seg(e.descanso_seg) : 'no'}${g.some(x => x.tramos.length > 1) ? ' · tramos' : ''}`; };
  return `<section class="stack"><button class="btn sm ghost" data-act="cerrarEditor" style="align-self:flex-start">← Volver</button><span class="eyebrow">Programa de ${esc(a.nombre || '')}</span><h1>${p ? esc(p.nombre) : 'Sin programa'}</h1>
    <div class="row" style="gap:8px;flex-wrap:wrap">${p ? `<button class="btn sm ghost" data-act="nuevoPrograma">Cambiar nombre</button><button class="btn sm" data-act="edDia">Añadir día</button>` : `<button class="btn sm" data-act="nuevoPrograma">Crear programa</button>`}</div>
    <p class="note">Toca cualquier elemento para editarlo. Los cambios los ve el alumno en cuanto vuelve a abrir la app.</p></section>
  ${p ? p.dias.map(d => `<section class="section"><div class="card stack">
    <div class="row"><div class="grow"><span class="eyebrow">Día ${d.numero}</span><h2>${esc(d.nombre || '')}</h2><div class="small muted">${esc([d.foco, d.volumen && 'vol. ' + d.volumen, d.intensidad && 'int. ' + d.intensidad].filter(Boolean).join(' · '))}</div></div><button class="btn sm ghost" data-act="edDia" data-id="${d.id}">Editar día</button></div>
    ${d.bloques_sesion.map(b => `<div class="stack" style="gap:6px;border-top:1px solid var(--line);padding-top:10px">
      <div class="row"><span class="pill gold">${esc(b.letra)}</span><h3 class="grow">${esc(b.nombre)}</h3><button class="mini" data-act="edBloque" data-id="${b.id}" aria-label="Editar bloque">✎</button></div>
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
    <button class="btn full" type="submit">Guardar</button></form>`);
  $('#f-prog').addEventListener('submit', async e => {
    e.preventDefault();
    const row = { nombre: $('#pg-n').value.trim() || 'Programa', dias_semana: numero($('#pg-d').value) };
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
    <label class="f">Indicación del bloque (superserie, circuito…)<input type="text" id="b-ag" value="${esc(b?.agrupacion || '')}" placeholder="Ej. 1 y 2 juntos (superserie). Descanso 1 minuto."></label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><label class="f">Duración (cardio)<input type="text" id="b-du" value="${esc(b?.duracion || '')}" placeholder="30 min"></label><label class="f">Frecuencia cardiaca<input type="text" id="b-fc" value="${esc(b?.fc_objetivo || '')}" placeholder="135–140 ppm"></label></div>
    <label class="f">Máquina<input type="text" id="b-ma" value="${esc(b?.maquina || '')}"></label>
    <label class="f">Detalle<textarea id="b-de">${esc(b?.detalle || '')}</textarea></label>
    <label class="f">Vídeo (movilidad)<input type="text" id="b-vi" value="${esc(b?.video_url || '')}" placeholder="https://youtu.be/…"></label>
    <button class="btn full" type="submit">Guardar</button>${b ? '<button class="btn ghost full" type="button" id="b-del" style="color:var(--bad)">Eliminar bloque</button>' : ''}</form>`);
  $('#f-blq').addEventListener('submit', async e => {
    e.preventDefault();
    const v = k => $(k).value.trim() || null;
    const row = { letra: v('#b-l') || sig, nombre: v('#b-n') || 'Bloque', tipo: $('#b-t').value, agrupacion: v('#b-ag'), duracion: v('#b-du'), fc_objetivo: v('#b-fc'), maquina: v('#b-ma'), detalle: v('#b-de'), video_url: v('#b-vi') };
    const { error } = b ? await sb.from('bloques_sesion').update(row).eq('id', b.id) : await sb.from('bloques_sesion').insert({ ...row, dia_id: dia.id });
    if (error) return fallo(error);
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
    ${st === 'pagado' ? '<span class="pill ok">Pagado</span>' : `<div class="row" style="gap:6px">${st === 'vencido' ? `<button class="btn sm ghost" data-act="recordar" data-id="${p.id}">Recordatorio</button>` : ''}<button class="btn sm${st === 'vencido' ? '' : ' ghost'}" data-act="pagar" data-id="${p.id}">Pagado</button></div>`}</div></div>`;
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
  ${cob.length ? `<section class="section"><h2>Últimos cobrados</h2><div class="card">${cob.map(lineaPago).join('')}</div></section>` : ''}`;
}
function formEditarPago(id) {
  const p = S.c.pagos.find(x => x.id === id); if (!p) return;
  abrirSheet(`<form class="stack" id="f-ep"><h2>Editar cuota</h2>
    <label class="f">Concepto<input type="text" id="ep-con" value="${esc(p.concepto)}" required></label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label class="f">Vence<input type="date" id="ep-vence" value="${p.vence}"></label><label class="f">Importe (€)<input type="text" inputmode="decimal" id="ep-imp" value="${fmtNum(p.importe, 2)}"></label></div>
    <label class="f">Fecha de pago (vacío = pendiente)<input type="date" id="ep-pag" value="${p.pagado_at || ''}"></label>
    <button class="btn full" type="submit">Guardar cambios</button>
    <button class="btn ghost full" type="button" id="ep-del" style="color:var(--bad)">Eliminar cuota</button></form>`);
  $('#f-ep').addEventListener('submit', async e => {
    e.preventDefault();
    const imp = numero($('#ep-imp').value); if (imp == null) return toast('Indica el importe');
    const cambios = { concepto: $('#ep-con').value.trim(), vence: $('#ep-vence').value, importe: imp, pagado_at: $('#ep-pag').value || null };
    const { data, error } = await sb.from('pagos').update(cambios).eq('id', id).select().single(); if (error) return fallo(error);
    S.c.pagos = S.c.pagos.map(x => x.id === id ? data : x).sort((a, b) => a.vence.localeCompare(b.vence)); cerrarSheet(); toast('Cuota actualizada'); render();
  });
  $('#ep-del').addEventListener('click', async ev => {
    const b = ev.currentTarget;
    if (!b.dataset.ok) { b.dataset.ok = 1; b.textContent = 'Pulsa otra vez para eliminarla definitivamente'; return; }
    const { error } = await sb.from('pagos').delete().eq('id', id); if (error) return fallo(error);
    S.c.pagos = S.c.pagos.filter(x => x.id !== id); cerrarSheet(); toast('Cuota eliminada'); render();
  });
}
async function marcarPagado(id) {
  const { data, error } = await sb.from('pagos').update({ pagado_at: hoyISO() }).eq('id', id).select().single();
  if (error) return fallo(error);
  S.c.pagos = S.c.pagos.map(p => p.id === id ? data : p); toast('Pago registrado'); render();
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
const T = { end: 0, total: 0, iv: null, ctx: null, lock: null };
const fmtT = ms => { const t = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
function audio() { try { T.ctx = T.ctx || new (window.AudioContext || window.webkitAudioContext)(); if (T.ctx.state === 'suspended') T.ctx.resume(); } catch (e) { } }
function beep() {
  try { const c = T.ctx; if (!c) return; [0, .35, .7].forEach(d => { const o = c.createOscillator(), g = c.createGain(); o.frequency.value = d < .7 ? 880 : 1320; g.gain.setValueAtTime(.0001, c.currentTime + d); g.gain.exponentialRampToValueAtTime(.45, c.currentTime + d + .02); g.gain.exponentialRampToValueAtTime(.0001, c.currentTime + d + .28); o.connect(g).connect(c.destination); o.start(c.currentTime + d); o.stop(c.currentTime + d + .3); }); } catch (e) { }
}
async function startTimer(sec, lbl) {
  audio(); clearInterval(T.iv); T.total = sec * 1000; T.end = Date.now() + T.total;
  const el = $('#timer'); el.hidden = false; el.classList.remove('done'); $('#t-lbl').textContent = lbl;
  try { if (navigator.wakeLock && !T.lock) T.lock = await navigator.wakeLock.request('screen'); } catch (e) { }
  tick(); T.iv = setInterval(tick, 250);
}
function tick() {
  const left = T.end - Date.now();
  $('#t-clock').textContent = fmtT(left);
  $('#t-bar').style.width = Math.min(100, (1 - left / T.total) * 100) + '%';
  if (left <= 0) {
    clearInterval(T.iv); $('#timer').classList.add('done'); $('#t-lbl').textContent = '¡Descanso terminado! A por la siguiente';
    beep(); try { navigator.vibrate && navigator.vibrate([300, 150, 300]); } catch (e) { }
    setTimeout(() => { if (Date.now() - T.end > 3500) $('#timer').hidden = true; }, 4000);
  }
}
function stopTimer() { clearInterval(T.iv); $('#timer').hidden = true; try { T.lock?.release(); } catch (e) { } T.lock = null; }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !$('#timer').hidden && T.end > Date.now()) tick(); });

/* ---------- Eventos ---------- */
document.addEventListener('click', async e => {
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
    case 'ctab': S.ctab = b.dataset.t; S.ficha = null; S.editor = null; render(); window.scrollTo(0, 0); break;
    case 'modo': S.modo = b.dataset.v; S.ficha = null; if (S.modo === 'coach') await cargarCoach(); render(); window.scrollTo(0, 0); break;
    case 'abrirDia': await abrirDia(+b.dataset.id); break;
    case 'cerrarDia': S.dia = null; S.sesion = null; render(); break;
    case 'serie': await toggleSerie(b); break;
    case 'tramo': { const d = +b.dataset.d; if (d > 0) startTimer(d, 'Pausa · ' + b.dataset.lbl); else toast('Sin pausa: sigue con el siguiente tramo'); break; }
    case 'aprox': b.classList.add('on'); if (b.dataset.j === '2') startTimer(60, 'Descanso tras la aproximación 6·3·1'); else toast(b.dataset.j === '0' ? 'Ahora 3 repeticiones con tu peso objetivo' : 'Ahora 1 repetición por encima del objetivo'); break;
    case 'metodo': { const n = b.dataset.n; abrirSheet(`<div class="stack"><span class="eyebrow">Método</span><h2>${esc(n)}</h2><p>${esc(S.d.metodos[n] || 'Pregúntale a Jesús por este método.')}</p><button class="btn ghost full" data-act="cerrarSheet">Entendido</button></div>`); break; }
    case 'terminar': terminar(); break;
    case 'guardarSesion': await guardarSesion(); break;
    case 'guardarDiario': await guardarDiario(); break;
    case 'ali': await guardarDiario({ alimentacion: b.dataset.v }); break;
    case 'chip': { const v = b.dataset.v; S.chips.has(v) ? S.chips.delete(v) : S.chips.add(v); b.setAttribute('aria-pressed', S.chips.has(v)); break; }
    case 'enviarCheckin': await enviarCheckin(); break;
    case 'ficha': await abrirFicha(b.dataset.id); break;
    case 'cerrarFicha': S.ficha = null; render(); break;
    case 'verSesion': await verSesion(+b.dataset.id); break;
    case 'nuevaMedicion': formMedicion(); break;
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
    case 'cerrarEditor': S.editor = null; render(); window.scrollTo(0, 0); break;
    case 'edDia': formDia(b.dataset.id ? +b.dataset.id : null); break;
    case 'edBloque': formBloque(b.dataset.id ? +b.dataset.id : null, b.dataset.dia ? +b.dataset.dia : null); break;
    case 'edEj': formEjSesion(b.dataset.id ? +b.dataset.id : null, b.dataset.bloque ? +b.dataset.bloque : null); break;
    case 'moverEj': await moverEj(+b.dataset.id, +b.dataset.dir); break;
    case 'nuevoPrograma': formPrograma(); break;
    case 'sinVideo': toast('Jesús todavía no ha subido el vídeo de este ejercicio'); break;
    case 'pagar': await marcarPagado(+b.dataset.id); break;
    case 'recordar': await copiarRecordatorio(+b.dataset.id); break;
    case 'cuenta': vCuenta(); break;
    case 'cambiarClave': cerrarSheet(); vistaNuevaClave(); break;
    case 'cerrarSheet': cerrarSheet(); break;
    case 'salir': cerrarSheet(); stopTimer(); await sb.auth.signOut(); break;
  }
});
document.addEventListener('input', e => {
  if (e.target.id === 'ej-buscar') { S.filtroEj = e.target.value; const pos = e.target.selectionStart; render(); const i = $('#ej-buscar'); i.focus(); try { i.setSelectionRange(pos, pos); } catch (er) { } }
  if (e.target.id === 'k-mot') $('#k-mot-v').textContent = e.target.value + '/10';
  if (e.target.id === 'k-imp') $('#k-imp-v').textContent = e.target.value + '/10';
});

arrancar().catch(err => { console.error(err); vistaMensaje('No se ha podido cargar', 'Revisa tu conexión y vuelve a abrir la app.', false); });
