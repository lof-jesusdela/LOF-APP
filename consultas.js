/* «Habla con Jesús»: consultas guiadas (no es un chat libre). El alumno elige tema y detalle, Jesús responde dentro de la app. */
const Consultas = (() => {
  const TEMAS = [
    ['dolor', '🩹', 'Dolor o molestia', 'Algo me duele o me ha molestado'],
    ['ejercicio', '🏋️', 'Un ejercicio', 'Dudas o cambios en un ejercicio'],
    ['nutricion', '🍽️', 'Alimentación', 'Comidas, plan o compras'],
    ['cita', '📅', 'Citas y horarios', 'Cambiar o aclarar una cita'],
    ['pago', '💳', 'Cuota o pagos', 'Dudas sobre mi cuota'],
    ['otro', '❓', 'Otra cosa', 'Cualquier otra duda']
  ];
  const tm = k => TEMAS.find(t => t[0] === k) || ['fin_entreno', '🏁', 'Tras entrenar', ''];
  const nombreAl = id => (S.c?.perfiles || []).find(p => p.id === id)?.nombre || 'Alumno';
  const dia = iso => (iso || '').slice(0, 10);

  async function cargarAlumno(uid, D) {
    const r = await sb.from('consultas').select('*').eq('alumno_id', uid).order('creado_at', { ascending: false }).limit(30);
    D.consultas = r.error ? [] : (r.data || []); D.consultasErr = !!r.error;
  }
  async function cargarCoach() {
    const r = await sb.from('consultas').select('*').order('creado_at', { ascending: false }).limit(150);
    S.c.consultas = r.error ? [] : (r.data || []); S.c.consultasErr = !!r.error;
  }

  /* ---------- Alumno ---------- */
  const sinLeer = () => (S.d?.consultas || []).filter(c => c.estado === 'respondida' && !c.visto_alumno_at);
  function ejerciciosDeSesion() {
    try { return (S.dia?.bloques_sesion || []).flatMap(b => b.ejercicios_sesion || []).map(e => ejDe(e).nombre).filter(Boolean); } catch (e) { return []; }
  }
  function ultimasSesiones() {
    return (S.d?.sesiones || []).filter(s => s.fecha >= sumaDias(hoyISO(), -7)).sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 6)
      .map(s => ({ id: s.id, txt: `${fCorta(s.fecha)} · ${s.dias?.titulo || s.dias?.nombre || 'Entreno'}` }));
  }
  function abrir() { S.cq = { paso: 1, tema: null, urgente: false, ejercicio: '', texto: '' }; pinta(); }
  function guardaCampos() {
    const q = S.cq; if (!q) return;
    const t = document.getElementById('cq-txt'); if (t) q.texto = t.value;
    const e = document.getElementById('cq-ej'); if (e) q.ejercicio = e.value;
  }
  function pinta() {
    const q = S.cq; if (!q) return;
    if (q.paso === 1) return abrirSheet(`<div class="stack"><h2>Habla con Jesús</h2><p class="small muted" style="margin:0">¿Sobre qué es? Así llega ordenado y te responde antes.</p>
      ${TEMAS.map(([k, ico, t, d]) => `<button class="btn ghost full" style="text-align:left" data-act="cq" data-q="tema" data-v="${k}"><b>${ico} ${t}</b><br><span class="small muted">${d}</span></button>`).join('')}</div>`);
    const [, ico, t] = tm(q.tema), ses = ultimasSesiones();
    const sel = q.tema === 'dolor' || q.tema === 'ejercicio';
    abrirSheet(`<div class="stack"><h2>${ico} ${t}</h2>
      ${q.tema === 'dolor' ? `<div class="stack" style="gap:6px"><span class="small"><b>¿Te impide entrenar o moverte con normalidad?</b></span><div class="choice" role="group">${[[false, 'No, es leve'], [true, 'Sí, me limita']].map(([v, l]) => `<button type="button" data-act="cq" data-q="urg" data-v="${v}" aria-pressed="${q.urgente === v}">${l}</button>`).join('')}</div>
        ${q.urgente ? '<p class="small" style="color:var(--bad);margin:0">Si el dolor es fuerte, repentino o con hormigueo, para y consulta con un médico. Jesús te responderá en cuanto pueda.</p>' : ''}</div>` : ''}
      ${sel ? `<label class="f">${q.tema === 'dolor' ? '¿En qué ejercicio o entreno ha pasado? (opcional)' : '¿Qué ejercicio?'}<input type="text" id="cq-ej" list="cq-ejs" value="${esc(q.ejercicio)}" placeholder="Ej. Sentadilla"><datalist id="cq-ejs">${[...new Set([...ejerciciosDeSesion(), ...ses.map(s => s.txt)])].map(x => `<option value="${esc(x)}">`).join('')}</datalist></label>` : ''}
      <label class="f">${q.tema === 'dolor' ? 'Cuéntame qué notas y desde cuándo' : 'Cuéntame con detalle'}<textarea id="cq-txt" placeholder="Cuanto más concreto, más rápido te respondo">${esc(q.texto)}</textarea></label>
      <div class="row" style="gap:8px"><button class="btn ghost" data-act="cq" data-q="atras">Atrás</button><button class="btn grow" data-act="cq" data-q="enviar">Enviar a Jesús</button></div></div>`);
  }
  async function enviar() {
    guardaCampos(); const q = S.cq;
    if (!q.texto.trim()) return toast('Escribe un par de líneas para que Jesús lo entienda');
    const fila = { tema: q.tema, urgente: q.tema === 'dolor' && q.urgente, ejercicio: q.ejercicio.trim() || null, texto: q.texto.trim(), alumno_id: S.d.uid };
    const { data, error } = await sb.from('consultas').insert(fila).select().single();
    if (error) return fallo(error, /consultas|relation/i.test(error.message || '') ? 'Falta ejecutar el Bloque 106 en Supabase.' : 'No se ha podido enviar.');
    (S.d.consultas = S.d.consultas || []).unshift(data); S.cq = null; cerrarSheet(); toast('Enviado. Jesús te responde aquí mismo.'); render();
  }
  /* Preguntas de fin de entreno → mismas consultas */
  function vFinEntreno(sesionRef) {
    const ejs = ejerciciosDeSesion();
    return `<div class="stack" style="gap:6px"><span class="small"><b>¿Algún ejercicio te salió mal, te dolió o hay que revisarlo?</b></span>
      <div class="choice" role="group" id="fe-q1">${[['no', 'No'], ['si', 'Sí']].map(([v, l]) => `<button type="button" data-act="cq" data-q="fe" data-v="${v}" aria-pressed="${v === 'no'}">${l}</button>`).join('')}</div>
      <div id="fe-box" class="stack" hidden style="gap:8px"><label class="f">¿Cuál?<select id="fe-ej">${ejs.map(n => `<option>${esc(n)}</option>`).join('')}<option value="">Otro / no sé cuál</option></select></label>
      <label class="f">¿Qué ha pasado?<textarea id="fe-txt" placeholder="Dolor, técnica, peso, máquina…"></textarea></label></div></div>
      <label class="f"><b>¿Alguna otra cosa que no pueda esperar a la revisión?</b><textarea id="s-nota" placeholder="Opcional"></textarea></label>`;
  }
  function leerFinEntreno() {
    const si = document.querySelector('#fe-q1 [aria-pressed="true"]')?.dataset.v === 'si';
    return { si, ej: si ? (document.getElementById('fe-ej')?.value || '') : '', det: si ? (document.getElementById('fe-txt')?.value.trim() || '') : '', otra: (document.getElementById('s-nota')?.value.trim() || '') };
  }
  async function crearDeFin(r, sesionId) {
    const filas = [];
    if (r.si) filas.push({ tema: 'dolor', urgente: false, ejercicio: r.ej || null, texto: r.det || '(sin detalle)', sesion_ref: String(sesionId) });
    if (r.otra) filas.push({ tema: 'fin_entreno', urgente: false, texto: r.otra, sesion_ref: String(sesionId) });
    if (!filas.length) return;
    const { data, error } = await sb.from('consultas').insert(filas.map(f => ({ ...f, alumno_id: S.d.uid }))).select();
    if (error) console.warn(error.message); else (S.d.consultas = S.d.consultas || []).unshift(...data);
  }

  function vAlumno() {
    const L = S.d?.consultas || [];
    return `<section class="section"><h2>Tus consultas</h2><div class="card">
      ${L.length ? L.slice(0, 6).map(c => { const [, ico, t] = tm(c.tema), nue = c.estado === 'respondida' && !c.visto_alumno_at;
        return `<div class="line" data-act="cq" data-q="ver" data-id="${c.id}" style="cursor:pointer"><div class="grow"><b class="small">${ico} ${esc(t)}${c.ejercicio ? ' · ' + esc(c.ejercicio) : ''}</b><div class="small muted">${esc(fCorta(dia(c.creado_at)))} · ${esc((c.texto || '').slice(0, 70))}</div></div>
        <span class="pill ${nue ? 'ok' : ''}">${nue ? 'Respuesta nueva' : c.estado === 'abierta' ? 'Enviada' : 'Respondida'}</span></div>`; }).join('') : '<div class="empty">Aún no has enviado ninguna consulta.</div>'}</div></section>`;
  }
  function vAvisoHoy() {
    const n = sinLeer().length; if (!n) return '';
    return `<section class="section"><div class="card aprox line" data-act="tab" data-t="coach" style="cursor:pointer"><div class="grow"><b>💬 Jesús te ha respondido</b><div class="small muted">${n} ${n === 1 ? 'respuesta nueva' : 'respuestas nuevas'} · toca para verla</div></div></div></section>`;
  }
  async function ver(id) {
    const c = (S.d?.consultas || []).find(x => x.id == id); if (!c) return; const [, ico, t] = tm(c.tema);
    abrirSheet(`<div class="stack"><h2>${ico} ${esc(t)}</h2><div class="small muted">${esc(fCorta(dia(c.creado_at)))}${c.ejercicio ? ' · ' + esc(c.ejercicio) : ''}</div><div class="card small" style="white-space:pre-wrap">${esc(c.texto || '')}</div>
      ${c.respuesta ? `<div class="stack" style="gap:4px"><span class="eyebrow">Respuesta de Jesús</span><div class="card small" style="white-space:pre-wrap">${esc(c.respuesta)}</div></div>` : '<p class="small muted">Jesús aún no ha respondido.</p>'}</div>`);
    if (c.estado === 'respondida' && !c.visto_alumno_at) { c.visto_alumno_at = new Date().toISOString(); await sb.from('consultas').update({ visto_alumno_at: c.visto_alumno_at }).eq('id', c.id); render(); }
  }

  /* ---------- Coach ---------- */
  const abiertas = () => (S.c?.consultas || []).filter(c => c.estado === 'abierta');
  const RAPIDAS = ['Entendido, lo ajusto en tu próximo entreno.', 'Para hoy, sustituye el ejercicio por una variante sin dolor y avísame mañana.', 'Lo vemos en tu próxima revisión; mientras tanto sigue igual.'];
  function vCoach() {
    const L = abiertas(); if (S.c?.consultasErr && !L.length) return '';
    const urg = L.filter(c => c.urgente || c.tema === 'dolor'), resto = L.filter(c => !urg.includes(c));
    const fila = (c, rojo) => { const [, ico, t] = tm(c.tema);
      return `<div class="line" style="align-items:flex-start;gap:8px;flex-wrap:wrap"><span class="al-dot-s" style="background:var(--${rojo ? 'bad' : 'gold'});margin-top:6px"></span><div class="grow stack" style="gap:2px;min-width:200px"><b class="small">${esc(nombreAl(c.alumno_id))} · ${ico} ${esc(t)}${c.ejercicio ? ' · ' + esc(c.ejercicio) : ''}${c.urgente ? ' · limita' : ''}</b><span class="small">${esc((c.texto || '').slice(0, 160))}</span></div>
        <button class="btn sm" data-act="cq" data-q="resp" data-id="${c.id}">Responder</button></div>`; };
    return `<section class="section"><div class="section-head"><h2>Consultas de alumnos</h2></div><div class="card stack" style="gap:6px">
      ${L.length ? urg.map(c => fila(c, true)).join('') + (resto.length ? `<details ${urg.length ? '' : 'open'}><summary class="small muted">${resto.length} más (no urgentes)</summary>${resto.map(c => fila(c, false)).join('')}</details>` : '') : '<div class="empty">Sin consultas pendientes ✓</div>'}</div></section>`;
  }
  function responder(id) {
    const c = (S.c.consultas || []).find(x => x.id == id); if (!c) return; const [, ico, t] = tm(c.tema);
    abrirSheet(`<div class="stack"><h2>${ico} ${esc(nombreAl(c.alumno_id))}</h2><div class="card small" style="white-space:pre-wrap">${esc(c.texto || '')}${c.ejercicio ? `\n\n(${esc(c.ejercicio)})` : ''}</div>
      <div class="row" style="gap:6px;flex-wrap:wrap">${RAPIDAS.map((r, i) => `<button type="button" class="btn sm ghost" data-act="cq" data-q="rapida" data-i="${i}">${esc(r.slice(0, 28))}…</button>`).join('')}</div>
      <label class="f">Tu respuesta<textarea id="cq-resp" placeholder="Escribe la respuesta"></textarea></label>
      <div class="row" style="gap:8px"><button class="btn ghost" data-act="cq" data-q="cerrar" data-id="${c.id}">Cerrar sin responder</button><button class="btn grow" data-act="cq" data-q="envresp" data-id="${c.id}">Enviar respuesta</button></div></div>`);
  }
  async function guardaResp(id, cerrar) {
    const c = (S.c.consultas || []).find(x => x.id == id); if (!c) return;
    const txt = document.getElementById('cq-resp')?.value.trim();
    if (!cerrar && !txt) return toast('Escribe la respuesta');
    const cambio = cerrar ? { estado: 'cerrada', cerrada_at: new Date().toISOString() } : { estado: 'respondida', respuesta: txt, respondida_at: new Date().toISOString() };
    const { error } = await sb.from('consultas').update(cambio).eq('id', id);
    if (error) return fallo(error, 'No se ha podido guardar la respuesta.');
    Object.assign(c, cambio); cerrarSheet(); toast(cerrar ? 'Consulta cerrada' : 'Respuesta enviada'); render();
  }

  async function accion(b) {
    const q = b.dataset.q, v = b.dataset.v;
    switch (q) {
      case 'abrir': abrir(); break;
      case 'tema': guardaCampos(); S.cq.tema = v; S.cq.paso = 2; pinta(); break;
      case 'urg': guardaCampos(); S.cq.urgente = v === 'true'; pinta(); break;
      case 'atras': guardaCampos(); S.cq.paso = 1; pinta(); break;
      case 'enviar': await enviar(); break;
      case 'ver': await ver(b.dataset.id); break;
      case 'fe': document.querySelectorAll('#fe-q1 button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); { const bx = document.getElementById('fe-box'); if (bx) bx.hidden = v !== 'si'; } break;
      case 'resp': responder(b.dataset.id); break;
      case 'rapida': { const t = document.getElementById('cq-resp'); if (t) t.value = RAPIDAS[+b.dataset.i]; break; }
      case 'envresp': await guardaResp(b.dataset.id, false); break;
      case 'cerrar': await guardaResp(b.dataset.id, true); break;
    }
  }
  return { cargarAlumno, cargarCoach, vAlumno, vAvisoHoy, vCoach, vFinEntreno, leerFinEntreno, crearDeFin, accion, sinLeer, abiertas };
})();
