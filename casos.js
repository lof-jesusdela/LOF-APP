/* Permisos y casos de éxito · consentimiento RGPD, autorización de testimonio y de fotos antes/después,
   fotos de progreso mensuales y publicaciones que el alumno aprueba antes de que Jesús las comparta.
   Datos: tablas consentimientos, fotos_progreso y casos_exito, bucket privado «progreso» (Bloque 52).
   Se carga antes que app.js y usa sus utilidades al ejecutarse. */
'use strict';
const Casos = (() => {
  const VERSION = '2026-10';
  const AVISO = 'Falta ejecutar el Bloque 52 (permisos y fotos de progreso) en Supabase.';
  const IDENT = { anonimo: 'Sin identificar', pila: 'Solo mi nombre de pila', completo: 'Mi nombre y apellidos' };
  const VISTAS = [['frente', 'Frente'], ['perfil', 'Perfil'], ['espalda', 'Espalda']];
  const URL = {};
  const url = p => URL[p] || null;
  async function firmar(rutas) {
    const faltan = [...new Set(rutas || [])].filter(r => r && !(r in URL)); if (!faltan.length) return;
    faltan.forEach(p => { URL[p] = null; });
    const r = await sb.storage.from('progreso').createSignedUrls(faltan, 6 * 3600);
    (r.data || []).forEach(x => { if (x.signedUrl) URL[x.path] = x.signedUrl; });
    render();
  }
  const pide = l => { if ((l || []).some(p => p && !(p in URL))) firmar(l); };

  /* ---------- Textos del consentimiento (documento revisado por la gestoría) ---------- */
  const textoInfo = () => `<details class="small"><summary><b>Información sobre tus datos</b> (léela)</summary><div class="stack" style="gap:6px;margin-top:8px">
    <p style="margin:0"><b>Responsable:</b> LAOBRAFITNESS S.L. · CIF B25921669 · C/ Villanueva 35, Madrid · lof.jesusdela@gmail.com · 620459453.</p>
    <p style="margin:0"><b>Qué datos:</b> identificación y contacto; facturación; historial de entrenamientos y adherencia; medidas corporales; fotos de seguimiento; lesiones o limitaciones (dato de salud); comunicaciones por WhatsApp, email o esta app.</p>
    <p style="margin:0"><b>Para qué:</b> (A) gestionar tu servicio: alta, planificación, seguimiento y facturación; (B) usar tus medidas y datos de salud para adaptar el programa con seguridad; (C) hacerte seguimiento por mensajería y email.</p>
    <p style="margin:0"><b>Encargados:</b> proveedores necesarios (gestoría, software, nube, email, mensajería). No hay cesiones salvo obligación legal. Algunas plataformas (WhatsApp/Meta) pueden tratar datos fuera del EEE con las garantías previstas.</p>
    <p style="margin:0"><b>Conservación:</b> durante la relación y los plazos legales. Testimonios e imágenes, hasta que retires el permiso; un contenido ya publicado puede haber sido compartido por terceros.</p>
    <p style="margin:0"><b>Tus derechos:</b> acceso, rectificación, supresión, oposición, limitación y portabilidad, y retirar tu consentimiento cuando quieras (desde Progreso › Privacidad y permisos o escribiendo a Jesús). Puedes reclamar ante la AEPD.</p></div></details>`;
  const opcionales = (c = {}) => `<div class="stack" style="gap:10px"><span class="eyebrow">Opcional · compartir tu caso</span>
    <p class="small muted" style="margin:0">Voluntario: no cambia en nada tu servicio y puedes cambiarlo cuando quieras. Antes de publicar algo, Jesús te lo enseñará aquí y solo saldrá si tú lo apruebas.</p>
    <label class="row small" style="align-items:flex-start;gap:10px"><input type="checkbox" id="cs-t" ${c.testimonio ? 'checked' : ''} style="width:22px;height:22px;flex:none;margin-top:1px"> <span>Jesús puede compartir mi <b>testimonio</b> sobre el servicio (web y redes sociales).</span></label>
    <label class="row small" style="align-items:flex-start;gap:10px"><input type="checkbox" id="cs-f" ${c.fotos ? 'checked' : ''} style="width:22px;height:22px;flex:none;margin-top:1px"> <span>Jesús puede compartir mis <b>fotos de antes y después, siempre sin la cara</b>, para mostrar casos de éxito.</span></label>
    <label class="f" id="cs-iw">Si comparte algo, cómo aparezco<select id="cs-i">${Object.entries(IDENT).map(([k, l]) => `<option value="${k}" ${(c.identificacion || 'pila') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>`;
  const leerOpc = () => ({ testimonio: !!$('#cs-t')?.checked, fotos: !!$('#cs-f')?.checked, identificacion: $('#cs-i')?.value || 'pila' });

  /* Pantalla de primer acceso (sustituye a la anterior): datos obligatorio + opcionales */
  function vistaInicial() {
    $('#tabs').hidden = true;
    $('#app').innerHTML = `<div class="login"><img src="icons/logo-96.jpg" alt="LOF">
      <div class="card stack"><span class="eyebrow">Antes de empezar</span><h2>Tus datos, protegidos</h2>
      <p class="small">En esta app registrarás tus entrenamientos, tu actividad diaria, tus medidas y cómo te sientes. Son datos de salud: solo los ves tú y Jesús, se guardan en servidores de la Unión Europea y se usan únicamente para acompañarte.</p>
      ${textoInfo()}
      <label class="row small" style="align-items:flex-start;gap:10px"><input type="checkbox" id="c-ok" style="width:22px;height:22px;flex:none;margin-top:1px"> <span><b>Acepto</b> el tratamiento de mis datos, incluidos los de salud, para mi proceso de acompañamiento (A, B y C). <span class="muted">Obligatorio para usar la app.</span></span></label>
      <hr style="border:0;border-top:1px solid var(--line);margin:4px 0">
      ${opcionales()}
      <button class="btn full" id="c-btn" disabled>Empezar</button><p class="small" id="c-err" style="color:var(--bad)"></p></div></div>`;
    $('#c-ok').addEventListener('change', e => $('#c-btn').disabled = !e.target.checked);
    $('#c-btn').addEventListener('click', async () => {
      const bt = $('#c-btn'); bt.disabled = true;
      const { error } = await sb.from('perfiles').update({ consentimiento_at: new Date().toISOString() }).eq('id', S.user.id);
      if (error) { bt.disabled = false; return fallo(error); }
      await guardar({ datos: true, ...leerOpc() }, true);
      await cargarPerfil(); Bienvenida.abrir(0);
    });
  }
  async function guardar(v, silencioso) {
    const row = { alumno_id: S.user.id, datos: v.datos !== false, testimonio: !!v.testimonio, fotos: !!v.fotos, identificacion: v.identificacion || 'pila', version: VERSION, agente: (navigator.userAgent || '').slice(0, 160) };
    const { data, error } = await sb.from('consentimientos').insert(row).select().single();
    if (error) { if (!silencioso) fallo(error, AVISO); return false; }
    if (S.d) S.d.consent = data; return true;
  }

  /* ---------- Datos del alumno ---------- */
  async function cargar(uid, dst) {
    const [c, f, k] = await Promise.all([
      sb.from('consentimientos').select('*').eq('alumno_id', uid).order('created_at', { ascending: false }).limit(1),
      sb.from('fotos_progreso').select('*').eq('alumno_id', uid).order('fecha', { ascending: false }),
      sb.from('casos_exito').select('*').eq('alumno_id', uid).order('created_at', { ascending: false })
    ]);
    dst.consent = c.data?.[0] || null; dst.fotosProg = f.data || []; dst.casos = k.data || []; dst.casosErr = !!(c.error || f.error);
  }
  const porFecha = l => { const m = {}; (l || []).forEach(x => (m[x.fecha] ||= []).push(x)); return Object.entries(m).sort((a, b) => b[0].localeCompare(a[0])); };

  /* Galería por fechas + comparador antes/después (alumno y coach) */
  function vGaleria(fotos, coach, sel = {}) {
    const g = porFecha(fotos); pide(fotos.map(x => x.ruta));
    if (!g.length) return `<div class="card empty">${coach ? 'Aún no ha subido fotos de progreso.' : 'Aún no tienes fotos. Súbelas en cada control mensual (frente, perfil y espalda): verte cambiar es lo que más motiva.'}</div>`;
    const fechas = g.map(x => x[0]), a = fechas.includes(sel.a) ? sel.a : fechas[fechas.length - 1], d = fechas.includes(sel.d) ? sel.d : fechas[0];
    const de = f => (g.find(x => x[0] === f) || [, []])[1];
    const img = x => x && url(x.ruta) ? `<button class="img" data-act="verImagen" data-src="${esc(url(x.ruta))}" aria-label="Ver foto"><img src="${esc(url(x.ruta))}" alt="" loading="lazy" style="width:100%;aspect-ratio:3/4;object-fit:cover;border-radius:10px"></button>` : '<div class="small muted" style="aspect-ratio:3/4;display:grid;place-items:center;background:var(--soft,#f2f2f4);border-radius:10px">—</div>';
    const comp = fechas.length > 1 ? `<div class="card stack"><b class="small">Antes y después</b>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><label class="f">Antes<select data-fp="a">${fechas.slice().reverse().map(f => `<option value="${f}" ${f === a ? 'selected' : ''}>${esc(fCorta(f))} ${fecha(f).getFullYear()}</option>`).join('')}</select></label><label class="f">Después<select data-fp="d">${fechas.map(f => `<option value="${f}" ${f === d ? 'selected' : ''}>${esc(fCorta(f))} ${fecha(f).getFullYear()}</option>`).join('')}</select></label></div>
      ${VISTAS.filter(([v]) => de(a).some(x => x.vista === v) || de(d).some(x => x.vista === v)).map(([v, l]) => `<div class="stack" style="gap:4px"><span class="small muted">${l}</span><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${img(de(a).find(x => x.vista === v))}${img(de(d).find(x => x.vista === v))}</div></div>`).join('')}</div>` : '';
    return comp + `<div class="card stack">${g.map(([f, l]) => `<div class="stack" style="gap:6px"><div class="row"><b class="small grow">${esc(fLarga(f))}</b>${coach ? '' : `<button class="linkbtn small" data-act="fpBorrar" data-f="${f}" style="color:var(--bad)">Borrar</button>`}</div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">${VISTAS.map(([v]) => img(l.find(x => x.vista === v))).join('')}</div></div>`).join('<hr style="border:0;border-top:1px solid var(--line);margin:4px 0">')}</div>`;
  }
  /* Sección al final de Progreso */
  function vSeccionAlumno() {
    const D = S.d; if (!D) return '';
    if (D.casosErr) return '';
    return `<section class="section"><div class="section-head"><h2>Fotos de progreso</h2><button class="btn sm" data-act="fpSubir">＋ Añadir fotos</button></div>
      <p class="small muted">Solo las ves tú y Jesús. Lo ideal: una vez al mes, en tu control, con la misma luz, ropa y postura.</p>
      ${vGaleria(D.fotosProg || [], false, S.fpSel || {})}
      <button class="linkbtn small" data-act="permisos" style="margin-top:10px">🔒 Privacidad y permisos ›</button></section>`;
  }
  /* Campos de fotos para el formulario de medidas o el suelto */
  const camposFotos = () => `<div class="stack" style="gap:8px"><span class="small"><b>Fotos de progreso</b> <span class="muted">(opcional · solo las veis tú y Jesús)</span></span>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">${VISTAS.map(([v, l]) => `<label class="f small">${l}<input type="file" accept="image/*" data-fpv="${v}"></label>`).join('')}</div>
    <p class="small muted" style="margin:0">Mismo sitio, misma luz y ropa ajustada. Puedes taparte la cara si quieres.</p></div>`;
  async function subirDesde(form, fechaF) {
    const ins = [...form.querySelectorAll('[data-fpv]')].filter(i => i.files?.[0]); if (!ins.length) return 0;
    const filas = [];
    for (const i of ins) {
      const blob = await reducirImagen(i.files[0], 1280), ruta = `${S.user.id}/${fechaF}/${i.dataset.fpv}-${Date.now().toString(36)}.jpg`;
      const up = await sb.storage.from('progreso').upload(ruta, blob, { contentType: 'image/jpeg' }); if (up.error) throw up.error;
      filas.push({ alumno_id: S.user.id, fecha: fechaF, vista: i.dataset.fpv, ruta });
    }
    const viejas = (S.d.fotosProg || []).filter(x => x.fecha === fechaF && filas.some(f => f.vista === x.vista));
    if (viejas.length) { await sb.from('fotos_progreso').delete().in('id', viejas.map(x => x.id)); await sb.storage.from('progreso').remove(viejas.map(x => x.ruta)); }
    const { error } = await sb.from('fotos_progreso').insert(filas); if (error) throw error;
    return filas.length;
  }
  function formSubir() {
    abrirSheet(`<form class="stack" id="f-fp"><h2>Fotos de progreso</h2><label class="f">Fecha<input type="date" id="fp-f" value="${hoyISO()}" max="${hoyISO()}"></label>${camposFotos()}<button class="btn full" type="submit">Guardar fotos</button></form>`);
    $('#f-fp').addEventListener('submit', async e => {
      e.preventDefault(); const bt = e.target.querySelector('[type=submit]'); if (bt.disabled) return; bt.disabled = true; bt.textContent = 'Subiendo…';
      try { const n = await subirDesde($('#f-fp'), $('#fp-f').value || hoyISO()); if (!n) { bt.disabled = false; bt.textContent = 'Guardar fotos'; return toast('Elige al menos una foto'); } }
      catch (err) { bt.disabled = false; bt.textContent = 'Guardar fotos'; return fallo(err, /bucket|not found|relation|fotos_progreso/i.test(err.message || '') ? AVISO : 'No se han podido subir las fotos.'); }
      cerrarSheet(); toast('Fotos guardadas'); await cargar(S.user.id, S.d); render();
    });
  }
  async function borrarFecha(f) {
    if (!confirm('¿Borrar las fotos de este día?')) return;
    const l = (S.d.fotosProg || []).filter(x => x.fecha === f);
    await sb.from('fotos_progreso').delete().in('id', l.map(x => x.id)); await sb.storage.from('progreso').remove(l.map(x => x.ruta));
    await cargar(S.user.id, S.d); render(); toast('Fotos borradas');
  }

  /* ---------- Permisos (el alumno los cambia cuando quiera) ---------- */
  function formPermisos() {
    const c = S.d?.consent || {};
    abrirSheet(`<div class="stack"><h2>Privacidad y permisos</h2>
      <div class="aprox small">✓ Aceptaste el tratamiento de tus datos para tu proceso${S.perfil?.consentimiento_at ? ' el ' + esc(fLarga(S.perfil.consentimiento_at.slice(0, 10))) : ''}. Para retirarlo o pedir tus datos, escribe a Jesús.</div>
      ${textoInfo()}${opcionales(c)}
      ${c.created_at ? `<p class="small muted" style="margin:0">Última decisión: ${esc(fLarga(c.created_at.slice(0, 10)))}.</p>` : ''}
      <button class="btn full" id="pm-g">Guardar</button></div>`);
    $('#pm-g').addEventListener('click', async () => { if (await guardar({ datos: true, ...leerOpc() })) { cerrarSheet(); toast('Permisos guardados'); render(); } });
  }
  /* Alumnos que ya estaban: una vez el aviso completo y luego, cada mes, una línea discreta en Hoy */
  const kAviso = () => 'lof-casos-aviso-' + (S.user?.id || '');
  function avisoNovedad() {
    if (S.modo !== 'alumno' || !S.d || S.d.casosErr || S.d.consent || S.vista || S.prueba) return;
    let ult = null; try { ult = localStorage.getItem(kAviso()); } catch (e) { }
    if (ult) return;
    try { localStorage.setItem(kAviso(), hoyISO()); } catch (e) { }
    abrirSheet(`<div class="stack"><span class="eyebrow">Novedad</span><h2>¿Quieres compartir tu caso?</h2>
      <p class="small">Tu progreso puede inspirar a otras personas. Si quieres, Jesús podrá compartir tu testimonio o tus fotos de antes y después (siempre sin la cara). Antes de publicar nada te lo enseñará aquí para que lo apruebes.</p>
      ${opcionales()}<div class="row" style="gap:8px"><button class="btn ghost" data-act="cerrarSheet">Ahora no</button><button class="btn grow" id="nv-g">Guardar mi decisión</button></div></div>`);
    $('#nv-g').addEventListener('click', async () => { if (await guardar({ datos: true, ...leerOpc() })) { cerrarSheet(); toast('Decisión guardada. Puedes cambiarla en Progreso'); render(); } });
  }
  function lineaHoy() {
    const D = S.d; if (!D || D.casosErr || S.vista || S.prueba) return '';
    const pend = (D.casos || []).filter(x => x.estado === 'pendiente');
    let out = pend.map(vPropuesta).join('');
    if (!D.consent) { let ult = null; try { ult = localStorage.getItem(kAviso()); } catch (e) { } if (!ult || ult <= sumaDias(hoyISO(), -30)) out += `<section class="section"><button class="card row" data-act="permisos" style="width:100%;text-align:left;gap:10px"><span>🤝</span><span class="small grow">¿Quieres compartir tu caso de éxito? Decide aquí, sin compromiso.</span><span class="small" style="color:var(--blue-text)">›</span></button></section>`; }
    return out;
  }
  function vPropuesta(x) {
    pide(x.rutas || []);
    return `<section class="section"><div class="card stack" style="border:2px solid var(--gold)"><span class="eyebrow">Jesús quiere compartir esto</span>
      <p class="small" style="margin:0">${x.tipo === 'testimonio' ? 'Tu testimonio' : x.tipo === 'fotos' ? 'Tus fotos de antes y después' : 'Tu caso'} aparecerá ${x.identificacion === 'anonimo' ? 'sin tu nombre' : x.identificacion === 'completo' ? 'con tu nombre y apellidos' : 'con tu nombre de pila'}${x.donde ? ' en ' + esc(x.donde) : ' en su web y redes sociales'}. Míralo y decide:</p>
      ${(x.rutas || []).length ? `<div style="display:grid;grid-template-columns:repeat(${Math.min(2, x.rutas.length)},1fr);gap:8px">${x.rutas.map(p => url(p) ? `<button class="img" data-act="verImagen" data-src="${esc(url(p))}"><img src="${esc(url(p))}" alt="" style="width:100%;border-radius:10px"></button>` : '').join('')}</div>` : ''}
      ${x.texto ? `<blockquote class="small pre" style="margin:0;padding:10px 12px;border-left:3px solid var(--gold);background:var(--soft,#f6f6f8);border-radius:8px">${esc(x.texto)}</blockquote>` : ''}
      <div class="row" style="gap:8px"><button class="btn ghost" data-act="casoResp" data-id="${x.id}" data-ok="0">No, prefiero que no</button><button class="btn grow" data-act="casoResp" data-id="${x.id}" data-ok="1">✓ Sí, puede publicarlo</button></div></div></section>`;
  }
  async function responder(id, ok) {
    let nota = null; if (!ok) nota = prompt('Si quieres, dile a Jesús por qué o qué cambiarías (opcional):') || null;
    const { error } = await sb.rpc('responder_caso', { caso: id, aprobado: ok, nota });
    if (error) return fallo(error, AVISO);
    const x = (S.d.casos || []).find(c => c.id === id); if (x) { x.estado = ok ? 'aprobado' : 'rechazado'; x.respondido_at = new Date().toISOString(); }
    toast(ok ? '¡Gracias! Jesús ya puede compartirlo' : 'Entendido: no se publicará'); render();
  }

  /* ---------- Coach ---------- */
  async function cargarCoach() {
    const [c, f, k] = await Promise.all([
      sb.from('consentimientos').select('alumno_id,testimonio,fotos,identificacion,created_at').order('created_at', { ascending: false }),
      sb.from('fotos_progreso').select('alumno_id,fecha').gte('fecha', sumaDias(hoyISO(), -120)),
      sb.from('casos_exito').select('id,alumno_id,estado,tipo,created_at,respondido_at')
    ]);
    const ult = {}; (c.data || []).forEach(x => { if (!ult[x.alumno_id]) ult[x.alumno_id] = x; });
    S.c.consent = ult; S.c.fotosProg = f.data || []; S.c.casos = k.data || []; S.c.casosErr = !!(c.error || f.error);
  }
  /* Alerta: pasó la semana del control mensual y no hay fotos de progreso cerca de esa fecha */
  function alertaFotos(aid, srv) {
    if (S.c?.casosErr || !srv?.inicio) return null;
    const hoy = hoyISO(), c = controlesMensuales(srv, sumaDias(hoy, -4)).slice(-1)[0]; if (!c || c.fecha < sumaDias(hoy, -35)) return null;
    const hay = (S.c.fotosProg || []).some(x => x.alumno_id === aid && x.fecha >= sumaDias(c.fecha, -10));
    return hay ? null : `Fotos de progreso del control mensual ${c.n} (${fCorta(c.fecha)}) sin subir`;
  }
  async function cargarFicha(f) {
    const [c, fp, k] = await Promise.all([
      sb.from('consentimientos').select('*').eq('alumno_id', f.id).order('created_at', { ascending: false }),
      sb.from('fotos_progreso').select('*').eq('alumno_id', f.id).order('fecha', { ascending: false }),
      sb.from('casos_exito').select('*').eq('alumno_id', f.id).order('created_at', { ascending: false })
    ]);
    f.consentHist = c.data || []; f.fotosProg = fp.data || []; f.casos = k.data || []; f.casosErr = !!(c.error || fp.error);
  }
  const resumenPermiso = c => !c ? '<span class="pill">Sin decidir</span>' : `<span class="pill ${c.testimonio ? 'ok' : ''}">Testimonio: ${c.testimonio ? 'sí' : 'no'}</span> <span class="pill ${c.fotos ? 'ok' : ''}">Fotos sin cara: ${c.fotos ? 'sí' : 'no'}</span> <span class="pill">${esc(IDENT[c.identificacion] || '')}</span>`;
  const EST = { pendiente: ['warn', 'Esperando su respuesta'], aprobado: ['ok', 'Aprobado'], rechazado: ['bad', 'No quiere'] };
  function vFicha(f, a) {
    if (!f.fotosProg) { cargarFicha(f).then(() => { if (S.ficha === f) render(); }); return '<section class="section"><div class="card empty">Cargando fotos…</div></section>'; }
    if (f.casosErr) return `<section class="section"><div class="card small muted">${AVISO}</div></section>`;
    const c = f.consentHist[0], nom = (a.nombre || '').split(' ')[0];
    pide(f.casos.flatMap(x => x.rutas || []));
    return `<section class="section"><div class="section-head"><h2>Fotos de progreso</h2></div>${vGaleria(f.fotosProg, true, S.fpSel || {})}</section>
      <section class="section"><div class="section-head"><h2>Caso de éxito</h2>${c && (c.testimonio || c.fotos) ? `<button class="btn sm" data-act="casoNuevo">＋ Proponer publicación</button>` : ''}</div><div class="card stack">
        <div class="small">${resumenPermiso(c)}</div>
        ${c ? `<p class="small muted" style="margin:0">Decidido el ${esc(fLarga(c.created_at.slice(0, 10)))} · versión del texto ${esc(c.version || '')}.</p>` : `<p class="small muted" style="margin:0">${esc(nom)} aún no ha decidido. Le sale en su app.</p>`}
        ${c && !c.testimonio && !c.fotos ? `<p class="small muted" style="margin:0">No ha dado permiso para compartir nada: respétalo, puede cambiarlo cuando quiera desde su app.</p>` : ''}
        ${f.casos.map(x => `<div class="line" style="align-items:flex-start"><div class="grow stack" style="gap:4px"><div class="small"><b>${x.tipo === 'testimonio' ? 'Testimonio' : x.tipo === 'fotos' ? 'Antes y después' : 'Testimonio + fotos'}</b> · ${esc(fCorta((x.created_at || hoyISO()).slice(0, 10)))} <span class="pill ${EST[x.estado][0]}">${EST[x.estado][1]}</span></div>${x.texto ? `<div class="small muted">${esc(x.texto.slice(0, 120))}${x.texto.length > 120 ? '…' : ''}</div>` : ''}${x.nota_alumno ? `<div class="small">💬 ${esc(x.nota_alumno)}</div>` : ''}${(x.rutas || []).length ? `<div class="plan-imgs">${x.rutas.map(p => url(p) ? `<button class="img" data-act="verImagen" data-src="${esc(url(p))}"><img src="${esc(url(p))}" alt=""></button>` : '').join('')}</div>` : ''}</div>${x.estado !== 'aprobado' ? `<button class="linkbtn small" data-act="casoBorrar" data-id="${x.id}" style="color:var(--bad)">Quitar</button>` : ''}</div>`).join('')}
      </div></section>`;
  }
  function formNuevo() {
    const f = S.ficha, c = f.consentHist?.[0] || {}, a = S.c.perfiles.find(p => p.id === f.id) || {};
    abrirSheet(`<form class="stack" id="f-cx"><h2>Proponer publicación</h2>
      <p class="small">${esc((a.nombre || '').split(' ')[0])} lo verá en su Hoy y solo podrás compartirlo si lo aprueba. Aparecerá: <b>${esc(IDENT[c.identificacion] || IDENT.pila)}</b>.</p>
      ${c.fotos ? `<label class="f">Imágenes a publicar (ya editadas, <b>sin la cara</b>)<input type="file" id="cx-img" accept="image/*" multiple></label><p class="small muted" style="margin:0">Prepara el montaje antes/después en tu móvil (puedes partir de sus fotos de progreso) y súbelo aquí tal cual se publicará.</p>` : '<p class="small muted">No ha autorizado fotos: solo puedes proponer su testimonio.</p>'}
      ${c.testimonio ? `<label class="f">Testimonio (sus palabras)<textarea id="cx-t" rows="5" placeholder="Copia aquí su testimonio tal y como se publicaría"></textarea></label>` : '<p class="small muted">No ha autorizado testimonio: solo puedes proponer fotos.</p>'}
      <label class="f">Dónde se publicará (opcional)<input type="text" id="cx-d" placeholder="Ej. Instagram y web"></label>
      <button class="btn full" type="submit">Enviar para que lo apruebe</button></form>`);
    $('#f-cx').addEventListener('submit', async e => {
      e.preventDefault(); const bt = e.target.querySelector('[type=submit]'); if (bt.disabled) return; bt.disabled = true;
      const files = [...($('#cx-img')?.files || [])], texto = $('#cx-t')?.value.trim() || null;
      if (!files.length && !texto) { bt.disabled = false; return toast('Sube una imagen o escribe el testimonio'); }
      try {
        const rutas = [];
        for (const fl of files) { const blob = await reducirImagen(fl, 1600), ruta = `${f.id}/casos/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}.jpg`; const up = await sb.storage.from('progreso').upload(ruta, blob, { contentType: 'image/jpeg' }); if (up.error) throw up.error; rutas.push(ruta); }
        const { error } = await sb.from('casos_exito').insert({ alumno_id: f.id, tipo: rutas.length && texto ? 'ambos' : rutas.length ? 'fotos' : 'testimonio', texto, rutas, donde: $('#cx-d').value.trim() || null, identificacion: c.identificacion || 'pila', estado: 'pendiente' });
        if (error) throw error;
      } catch (err) { bt.disabled = false; return fallo(err, AVISO); }
      cerrarSheet(); toast('Enviado: te avisará en cuanto responda'); f.fotosProg = null; await cargarCoach(); render();
    });
  }
  async function borrarCaso(id) {
    if (!confirm('¿Quitar esta propuesta?')) return;
    const x = (S.ficha?.casos || []).find(c => c.id === id);
    await sb.from('casos_exito').delete().eq('id', id); if (x?.rutas?.length) await sb.storage.from('progreso').remove(x.rutas);
    S.ficha.fotosProg = null; await cargarCoach(); render();
  }
  /* Resumen en el panel: casos de éxito disponibles */
  function resumenCoach() {
    if (S.c?.casosErr || !S.c?.consent) return '';
    const act = S.c.perfiles.filter(p => p.activo !== false && p.rol !== 'coach'), con = Object.values(S.c.consent).filter(c => act.some(a => a.id === c.alumno_id));
    const t = con.filter(c => c.testimonio).length, fo = con.filter(c => c.fotos).length, ap = (S.c.casos || []).filter(x => x.estado === 'aprobado').length, pe = (S.c.casos || []).filter(x => x.estado === 'pendiente').length, sin = act.length - con.length;
    return `<section class="section"><h2>Casos de éxito</h2><div class="kpis"><div class="kpi"><div class="v num">${t}</div><div class="l">autorizan testimonio</div></div><div class="kpi"><div class="v num">${fo}</div><div class="l">autorizan fotos sin cara</div></div><div class="kpi"><div class="v num" style="color:var(--ok)">${ap}</div><div class="l">aprobados para publicar${pe ? ` · ${pe} esperando` : ''}</div></div></div>${sin ? `<p class="small muted">${sin} ${sin === 1 ? 'alumno aún no ha decidido' : 'alumnos aún no han decidido'}.</p>` : ''}</section>`;
  }
  /* Respuestas nuevas de los alumnos (aprobado/rechazado en los últimos 7 días) para las alertas */
  function avisosCoach(aid) {
    return (S.c?.casos || []).filter(x => x.alumno_id === aid && x.estado !== 'pendiente' && x.respondido_at && x.respondido_at.slice(0, 10) >= sumaDias(hoyISO(), -7)).map(x => x.estado === 'aprobado' ? 'Ha aprobado que compartas su caso de éxito' : 'No quiere que se publique la propuesta de caso de éxito');
  }

  return { VERSION, vistaInicial, cargar, cargarCoach, vSeccionAlumno, camposFotos, subirDesde, formSubir, borrarFecha, formPermisos, avisoNovedad, lineaHoy, responder, alertaFotos, vFicha, formNuevo, borrarCaso, resumenCoach, avisosCoach, cargarFicha };
})();
