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
const SEL_PROGRAMA = 'id,nombre,dias_semana,dias(id,numero,nombre,objetivo,volumen,intensidad,foco,bloques_sesion(id,letra,nombre,tipo,agrupacion,duracion,fc_objetivo,maquina,objetivo,detalle,video_url,ejercicios_sesion(id,orden,series,repeticiones,rir,peso_ref,descanso_seg,ajustes,aproximacion_631,grupo,pauta,ejercicios(nombre,video_url),metodos(nombre,explicacion))))';

async function cargarAlumno(uid) {
  const desde = sumaDias(hoyISO(), -60);
  const [srv, prog, med, reg, ses, chk, ruta, met] = await Promise.all([
    sb.from('servicios').select('*').eq('alumno_id', uid).eq('activo', true).order('id', { ascending: false }).limit(1),
    sb.from('programas').select(SEL_PROGRAMA).eq('alumno_id', uid).eq('activo', true).order('id', { ascending: false }).limit(1),
    sb.from('mediciones').select('*').eq('alumno_id', uid).eq('es_objetivo', false).order('fecha'),
    sb.from('registro_diario').select('*').eq('alumno_id', uid).gte('fecha', desde),
    sb.from('sesiones_hechas').select('id,dia_id,fecha,nota').eq('alumno_id', uid).gte('fecha', desde).order('fecha'),
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
  const tabs = coach ? [['alumnos', 'Alumnos'], ['pagos', 'Pagos']] : tabsAlumno();
  const actual = coach ? S.ctab : S.tab;
  const esCoach = S.perfil.rol === 'coach';
  const vistas = { hoy: vHoy, entreno: vEntreno, nutri: vNutri, progreso: vProgreso, checkin: vCheckin, alumnos: vAlumnos, pagos: vPagos };
  $('#app').innerHTML = `<header class="top">
      <div class="badge"><img src="icons/logo-96.jpg" alt=""><div class="t">La Obra Fitness<strong>${coach ? 'Panel coach' : esc(S.perfil.metodologia || 'Tu proceso')}</strong></div></div>
      <div class="row" style="gap:8px">${esCoach ? `<div class="seg" role="group" aria-label="Vista"><button data-act="modo" data-v="alumno" aria-pressed="${!coach}">Yo</button><button data-act="modo" data-v="coach" aria-pressed="${coach}">Coach</button></div>` : ''}
      <button class="avatar" data-act="cuenta" aria-label="Mi cuenta">${esCoach ? '<img src="icons/coach.jpg" alt="">' : esc((S.perfil.nombre || '?').slice(0, 2).toUpperCase())}</button></div>
    </header><main id="main">${(S.ficha && coach) ? vFicha() : vistas[actual]()}</main>`;
  $('#tabs').hidden = false;
  $('#tabs-in').innerHTML = tabs.map(([k, l]) => `<button data-act="${coach ? 'ctab' : 'tab'}" data-t="${k}" ${actual === k && !(S.ficha && coach) ? 'aria-current="page"' : ''}>${svg(k)}<span>${l}</span></button>`).join('');
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

function vEjercicio(e, i) {
  const grupos = gruposDe(e.pauta);
  let n = 0;
  const filas = grupos.map((g, gi) => {
    const descanso = g.tramos[g.tramos.length - 1].d ?? e.descanso_seg ?? 60;
    const cab = `<div class="small" style="grid-column:1/-1;margin-top:${gi ? 6 : 0}px"><b>${grupos.length > 1 ? (gi === 0 && g.s === 1 ? 'Serie principal' : `Series ${n + 1}–${n + g.s}`) : `${g.s} ${g.s === 1 ? 'serie' : 'series'}`}</b> · ${esc(txtTramo(g.tramos[0]))} · descanso ${descanso ? seg(descanso) : 'no, sigue'}</div>
      ${g.tramos.length > 1 ? `<div class="tramos" style="grid-column:1/-1">${g.tramos.map((t, k) => `<button class="tramo" data-act="tramo" data-d="${t.d ?? 0}" data-lbl="${esc(e.ejercicios.nombre)} · tramo ${k + 1}">Tramo ${k + 1}: ${esc(txtTramo(t) || 'igual')}${k < g.tramos.length - 1 ? ` → ${t.d ? seg(t.d) : 'sin pausa'}` : ''}</button>`).join('')}</div>` : ''}`;
    const series = [...Array(g.s)].map(() => {
      n++; const k = `${e.id}-${n}`;
      return `<span class="num muted">${n}</span><input id="kg-${k}" type="text" inputmode="decimal" aria-label="Kg serie ${n}"><input id="rp-${k}" type="number" inputmode="numeric" aria-label="Repeticiones serie ${n}"><input id="ri-${k}" type="number" inputmode="numeric" min="0" max="5" aria-label="RIR serie ${n}"><button class="chk" id="ck-${k}" data-act="serie" data-es="${e.id}" data-n="${n}" data-d="${descanso}" data-lbl="${esc(e.ejercicios.nombre)} · serie ${n}" aria-label="Serie ${n} hecha">${CHK}</button>`;
    }).join('');
    return cab + series;
  }).join('');
  const vid = e.ejercicios.video_url ? `<a class="btn sm ghost" href="${esc(e.ejercicios.video_url)}" target="_blank" rel="noopener">Vídeo</a>` : '';
  return `<div class="card ex">
    <div class="row" style="align-items:flex-start"><span class="exn num">${i}</span><div class="grow"><h3>${esc(e.ejercicios.nombre)}</h3><div class="small muted">${e.series} ${e.series === 1 ? 'serie' : 'series'} · ${esc(e.repeticiones)}${e.rir != null ? ' · RIR ' + e.rir : ''}</div></div>${vid}</div>
    ${e.grupo ? `<p class="note">${esc(e.grupo)}</p>` : ''}
    <div class="chips" style="gap:6px">${e.metodos ? `<button class="pill gold" data-act="metodo" data-n="${esc(e.metodos.nombre)}">Método: ${esc(e.metodos.nombre)} ⓘ</button>` : ''}${e.aproximacion_631 ? '<button class="pill gold" data-act="metodo" data-n="Aproximación 6·3·1">Aproximación 6·3·1 ⓘ</button>' : ''}</div>
    ${e.ajustes ? `<div class="small" style="color:var(--blue-text)">A tu medida: ${esc(e.ajustes)}</div>` : ''}
    ${e.aproximacion_631 ? vAprox(e) : ''}
    <div class="sets"><span class="h">Nº</span><span class="h">Kg</span><span class="h">Reps</span><span class="h">RIR</span><span class="h">Hecha</span>${filas}</div>
  </div>`;
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
  return `<section class="stack"><button class="btn sm ghost" data-act="cerrarDia" style="align-self:flex-start">← Semana</button>
    <span class="eyebrow">${esc(S.d.programa.nombre)} · ${esc(d.nombre)}</span><h1>${esc(d.foco || d.nombre)}</h1>
    <div class="card stack"><span class="eyebrow">Objetivo de hoy</span><div class="small">${esc(d.objetivo || '')}</div>
    <div class="kpis"><div class="kpi"><div class="l">Volumen</div><b>${esc(d.volumen || '—')}</b></div><div class="kpi"><div class="l">Intensidad</div><b>${esc(d.intensidad || '—')}</b></div><div class="kpi"><div class="l">Foco</div><b>${esc(d.foco || '—')}</b></div></div></div></section>
  <section class="section">${d.bloques_sesion.map(b => vBloque(b, cont)).join('')}
  <button class="btn full dark" data-act="terminar">Terminar sesión</button></section>`;
}

async function abrirDia(id) {
  S.dia = S.d.programa.dias.find(d => d.id === id);
  S.sesion = { id: null, regs: {}, valores: {}, ultimos: {} };
  S.tab = 'entreno'; window.scrollTo(0, 0);
  const ids = S.dia.bloques_sesion.flatMap(b => b.ejercicios_sesion.map(e => e.id));
  const hoyS = S.d.sesiones.find(s => s.fecha === hoyISO() && s.dia_id === id);
  if (hoyS) S.sesion.id = hoyS.id;
  if (ids.length) {
    const { data } = await sb.from('registros_series').select('id,sesion_id,ejercicio_sesion_id,serie,kg,repeticiones,rir,creado_at').eq('alumno_id', S.user.id).in('ejercicio_sesion_id', ids).order('creado_at', { ascending: false }).limit(800);
    (data || []).forEach(r => {
      const k = `${r.ejercicio_sesion_id}-${r.serie}`;
      if (hoyS && r.sesion_id === hoyS.id) { if (!S.sesion.regs[k]) { S.sesion.regs[k] = r.id; S.sesion.valores[k] = r; } }
      else if (!S.sesion.ultimos[k]) S.sesion.ultimos[k] = r;
    });
  }
  render();
}
function rellenarSesion() {
  const z = S.sesion; if (!z) return;
  document.querySelectorAll('.chk[data-act="serie"]').forEach(b => {
    const k = `${b.dataset.es}-${b.dataset.n}`, v = z.valores[k], u = z.ultimos[k];
    const kg = $(`#kg-${CSS.escape(k)}`), rp = $(`#rp-${CSS.escape(k)}`), ri = $(`#ri-${CSS.escape(k)}`);
    if (u) { kg.placeholder = u.kg != null ? fmtNum(u.kg, 2) : ''; rp.placeholder = u.repeticiones ?? ''; ri.placeholder = u.rir ?? ''; }
    if (v) { kg.value = v.kg != null ? fmtNum(v.kg, 2) : ''; rp.value = v.repeticiones ?? ''; ri.value = v.rir ?? ''; marcar(b, k, true); }
  });
}
function marcar(b, k, on) {
  b.classList.toggle('on', on);
  ['kg', 'rp', 'ri'].forEach(p => $(`#${p}-${CSS.escape(k)}`)?.classList.toggle('on', on));
}
async function asegurarSesion() {
  if (S.sesion.id) return S.sesion.id;
  const { data, error } = await sb.from('sesiones_hechas').insert({ alumno_id: S.user.id, dia_id: S.dia.id, fecha: hoyISO() }).select().single();
  if (error) throw error;
  S.sesion.id = data.id; S.d.sesiones.push(data); return data.id;
}
async function toggleSerie(b) {
  const k = `${b.dataset.es}-${b.dataset.n}`, z = S.sesion;
  if (b.classList.contains('on')) {
    const id = z.regs[k]; marcar(b, k, false); delete z.regs[k];
    if (id) { const { error } = await sb.from('registros_series').delete().eq('id', id); if (error) fallo(error); }
    return;
  }
  const val = p => $(`#${p}-${CSS.escape(k)}`);
  const u = z.ultimos[k] || {};
  const row = { alumno_id: S.user.id, ejercicio_sesion_id: +b.dataset.es, serie: +b.dataset.n,
    kg: numero(val('kg').value) ?? u.kg ?? null, repeticiones: numero(val('rp').value) ?? u.repeticiones ?? null, rir: numero(val('ri').value) ?? u.rir ?? null };
  marcar(b, k, true);
  const d = +b.dataset.d;
  if (d > 0) startTimer(d, 'Descanso · ' + b.dataset.lbl); else toast('Sin descanso: sigue con el siguiente');
  try {
    row.sesion_id = await asegurarSesion();
    const { data, error } = await sb.from('registros_series').insert(row).select('id').single();
    if (error) throw error;
    z.regs[k] = data.id; z.valores[k] = row;
    if (row.kg != null && !val('kg').value) val('kg').value = fmtNum(row.kg, 2);
    if (row.repeticiones != null && !val('rp').value) val('rp').value = row.repeticiones;
  } catch (err) { marcar(b, k, false); fallo(err, 'No se ha guardado la serie. Revisa tu conexión.'); }
}
function terminar() {
  abrirSheet(`<div class="stack"><h2>Sesión terminada</h2><label class="f">¿Algo que quieras contarle a Jesús? (opcional)<textarea id="s-nota" placeholder="Molestias, sensaciones, máquinas ocupadas…"></textarea></label><button class="btn full" data-act="guardarSesion">Guardar y salir</button></div>`);
}
async function guardarSesion() {
  try {
    const id = await asegurarSesion(), nota = $('#s-nota').value.trim();
    if (nota) { const { error } = await sb.from('sesiones_hechas').update({ nota }).eq('id', id); if (error) throw error; }
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
  const ver = pts.map((p, i) => { const ok = i === 0 || i === pts.length - 1 || (x(i) - ult >= 52 && xl - x(i) >= 52); if (ok) ult = x(i); return ok; });
  const lbl = pts.map((p, i) => ver[i] ? `<text x="${x(i)}" y="${H - 6}" fill="var(--muted)" font-size="10" text-anchor="${i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle'}">${esc(fecha(p.f).toLocaleDateString('es-ES', { day: 'numeric', month: 'numeric', year: '2-digit' }))}</text>` : '').join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolución">${grid}<polygon points="${x(0)},${H - pb} ${line} ${x(pts.length - 1)},${H - pb}" fill="${color}" opacity=".1"/><polyline points="${line}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>${pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.v)}" r="${i === pts.length - 1 ? 4.5 : 2.5}" fill="${color}" stroke="var(--surface)" stroke-width="1.5"/>`).join('')}${lbl}</svg>`;
}
function serie(med, campo) { return med.filter(m => m[campo] != null).map(m => ({ f: m.fecha, v: Number(m[campo]) })); }
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
  const desde = sumaDias(hoyISO(), -28);
  const [per, srv, ses, chk, reg, pag] = await Promise.all([
    sb.from('perfiles').select('*').order('nombre'),
    sb.from('servicios').select('*').eq('activo', true),
    sb.from('sesiones_hechas').select('id,alumno_id,dia_id,fecha,nota').gte('fecha', desde).order('fecha', { ascending: false }),
    sb.from('checkins').select('*').gte('semana_inicio', sumaDias(desde, -7)).order('semana_inicio', { ascending: false }),
    sb.from('registro_diario').select('*').gte('fecha', sumaDias(hoyISO(), -13)),
    sb.from('pagos').select('*').order('vence')
  ]);
  S.c = { perfiles: per.data || [], servicios: srv.data || [], sesiones: ses.data || [], checkins: chk.data || [], diario: reg.data || [], pagos: pag.data || [] };
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
  return { nivel, motivos, ses7, ult, ultSes: ses[0] };
}
function vAlumnos() {
  const c = S.c, als = c.perfiles.filter(p => p.activo !== false);
  const est = als.map(a => ({ a, e: estadoAlumno(a) })), orden = { bad: 0, warn: 1, ok: 2 };
  est.sort((x, y) => orden[x.e.nivel] - orden[y.e.nivel]);
  const lab = { ok: 'En camino', warn: 'Atención', bad: 'Revisar' };
  const venc = c.pagos.filter(p => !p.pagado_at && p.vence < hoyISO());
  return `<section class="stack"><span class="eyebrow">Panel del coach · ${esc(fLarga(hoyISO()))}</span><h1>Tus alumnos</h1></section>
  <section class="section"><div class="kpis"><div class="kpi"><div class="v num">${als.length}</div><div class="l">perfiles activos</div></div><div class="kpi"><div class="v num" style="color:var(--bad)">${est.filter(x => x.e.nivel !== 'ok').length}</div><div class="l">necesitan atención</div></div><div class="kpi"><div class="v num" style="color:${venc.length ? 'var(--bad)' : 'var(--ok)'}">${venc.length}</div><div class="l">pagos vencidos</div></div></div></section>
  <section class="section"><div class="card">${est.map(({ a, e }) => `<div class="line" data-act="ficha" data-id="${a.id}" style="cursor:pointer"><span style="width:4px;align-self:stretch;border-radius:2px;background:var(--${e.nivel})"></span><div class="grow stack" style="gap:3px"><div class="row"><h3 class="grow">${esc(a.nombre)}</h3><span class="pill ${e.nivel}">${lab[e.nivel]}</span></div><div class="small muted">${esc((c.servicios.find(s => s.alumno_id === a.id) || {}).producto || 'Sin servicio')} · ${e.ses7} entrenos en 7 días${e.ult ? ` · motivación ${e.ult.motivacion}/10` : ''}</div>${e.motivos.length ? `<div class="small">${esc(e.motivos.join(' · '))}</div>` : ''}</div></div>`).join('') || '<div class="empty">Aún no hay alumnos.</div>'}</div>
  <p class="note">Para dar de alta a un alumno nuevo, créalo en Supabase → Authentication → Users. Su perfil aparecerá aquí solo.</p></section>`;
}

async function abrirFicha(id) {
  S.ficha = { id, cargando: true }; render(); window.scrollTo(0, 0);
  const [med, ses, notas, prog, srv] = await Promise.all([
    sb.from('mediciones').select('*').eq('alumno_id', id).order('fecha', { ascending: false }),
    sb.from('sesiones_hechas').select('id,fecha,nota,dias(nombre,foco),registros_series(id)').eq('alumno_id', id).order('fecha', { ascending: false }).limit(20),
    sb.from('notas_coach').select('*').eq('alumno_id', id).order('fecha', { ascending: false }).limit(20),
    sb.from('programas').select('nombre,dias_semana').eq('alumno_id', id).eq('activo', true).limit(1),
    sb.from('servicios').select('*').eq('alumno_id', id).eq('activo', true).limit(1)
  ]);
  S.ficha = { id, med: med.data || [], ses: ses.data || [], notas: notas.data || [], prog: prog.data?.[0], srv: srv.data?.[0] };
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

/* ---------- Pagos ---------- */
function lineaPago(p) {
  const hoy = hoyISO(), st = p.pagado_at ? 'pagado' : p.vence < hoy ? 'vencido' : 'pendiente';
  const a = S.c.perfiles.find(x => x.id === p.alumno_id) || {};
  return `<div class="line"><div class="grow"><h3>${esc(a.nombre || '')}</h3><div class="small muted">${esc(p.concepto)} · vence ${esc(fCorta(p.vence))}${p.pagado_at ? ` · pagado ${esc(fCorta(p.pagado_at))}` : ''}</div></div>
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
  ${venc.length ? `<section class="section"><h2>Vencidos</h2><div class="card">${venc.map(lineaPago).join('')}</div></section>` : ''}
  <section class="section"><h2>Próximos cobros</h2><div class="card">${pend.map(lineaPago).join('') || '<div class="empty">No hay cuotas pendientes.</div>'}</div></section>
  ${cob.length ? `<section class="section"><h2>Últimos cobrados</h2><div class="card">${cob.map(lineaPago).join('')}</div></section>` : ''}`;
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
    case 'ctab': S.ctab = b.dataset.t; S.ficha = null; render(); window.scrollTo(0, 0); break;
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
    case 'pagar': await marcarPagado(+b.dataset.id); break;
    case 'recordar': await copiarRecordatorio(+b.dataset.id); break;
    case 'cuenta': vCuenta(); break;
    case 'cambiarClave': cerrarSheet(); vistaNuevaClave(); break;
    case 'cerrarSheet': cerrarSheet(); break;
    case 'salir': cerrarSheet(); stopTimer(); await sb.auth.signOut(); break;
  }
});
document.addEventListener('input', e => {
  if (e.target.id === 'k-mot') $('#k-mot-v').textContent = e.target.value + '/10';
  if (e.target.id === 'k-imp') $('#k-imp-v').textContent = e.target.value + '/10';
});

arrancar().catch(err => { console.error(err); vistaMensaje('No se ha podido cargar', 'Revisa tu conexión y vuelve a abrir la app.', false); });
