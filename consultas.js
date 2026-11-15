/* «Habla con Jesús»: consultas guiadas (no es un chat libre). El alumno elige tema y detalle, Jesús responde dentro de la app. */
const Consultas = (() => {
  /* Chat: compromiso con el alumno = revisión semanal; objetivo interno de Jesús = < 48 h */
  const TEMAS = [
    ['dolor', '🩹', 'Dolor o molestia', 'Algo me duele o me ha molestado'],
    ['ejercicio', '🏋️', 'Un ejercicio', 'Dudas o cambios en un ejercicio'],
    ['nutricion', '🍽️', 'Alimentación', 'Comidas, plan o compras'],
    ['pago', '💳', 'Cuota o pagos', 'Dudas sobre mi cuota'],
    ['otro', '❓', 'Otra cosa', 'Cualquier otra duda']
  ];
  /* Urgente (no puede esperar 24 h) → WhatsApp */
  const URG = [
    ['wa_cita', '📅', 'Mover una cita', 'Hola Jesús, necesito mover una cita: '],
    ['wa_imprevisto', '⚡', 'Cambio de plan por un imprevisto', 'Hola Jesús, me ha surgido un imprevisto y necesito cambiar el plan: '],
    ['wa_evento', '🎉', 'Ayuda con un evento de esta semana', 'Hola Jesús, esta semana tengo un evento y necesito ayuda: ']
  ];
  const H48 = 48 * 36e5;
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
    if (q.paso === 1) return abrirSheet(`<div class="stack"><h2>Habla con Jesús</h2>
      <span class="eyebrow">Urgente · no puede esperar 24 h</span>
      ${URG.map(([k, ico, t]) => `<button class="btn ghost full" style="text-align:left" data-act="cq" data-q="wa" data-v="${k}"><b>${ico} ${t}</b> <span class="small muted">· por WhatsApp</span></button>`).join('')}
      <span class="eyebrow" style="margin-top:6px">Puede esperar · te respondo aquí, como tarde en tu revisión semanal</span>
      ${TEMAS.map(([k, ico, t, d]) => `<button class="btn ghost full" style="text-align:left" data-act="cq" data-q="tema" data-v="${k}"><b>${ico} ${t}</b><br><span class="small muted">${d}</span></button>`).join('')}</div>`);
    const [, ico, t] = tm(q.tema), ses = ultimasSesiones();
    const sel = q.tema === 'dolor' || q.tema === 'ejercicio';
    abrirSheet(`<div class="stack"><h2>${ico} ${t}</h2>
      ${q.tema === 'dolor' ? `<div class="stack" style="gap:6px"><span class="small"><b>¿Te impide entrenar o moverte con normalidad?</b></span><div class="choice" role="group">${[[false, 'No, es leve'], [true, 'Sí, me limita']].map(([v, l]) => `<button type="button" data-act="cq" data-q="urg" data-v="${v}" aria-pressed="${q.urgente === v}">${l}</button>`).join('')}</div>
        ${q.urgente ? `<p class="small" style="color:var(--bad);margin:0">Si te limita, no esperes: escríbeme por WhatsApp. Si es fuerte, repentino o con hormigueo, para y consulta con un médico.</p><a class="btn full" href="${esc(waJesus('Hola Jesús, tengo un dolor que me limita: '))}" target="_blank" rel="noopener" data-act="cq" data-q="walog" data-v="wa_dolor">💬 Escribir por WhatsApp</a>` : ''}</div>` : ''}
      ${sel ? `<label class="f">${q.tema === 'dolor' ? '¿En qué ejercicio o entreno ha pasado? (opcional)' : '¿Qué ejercicio?'}<input type="text" id="cq-ej" list="cq-ejs" value="${esc(q.ejercicio)}" placeholder="Ej. Sentadilla"><datalist id="cq-ejs">${[...new Set([...ejerciciosDeSesion(), ...ses.map(s => s.txt)])].map(x => `<option value="${esc(x)}">`).join('')}</datalist></label>` : ''}
      <label class="f">${q.tema === 'dolor' ? 'Cuéntame qué notas y desde cuándo' : 'Cuéntame con detalle'}<textarea id="cq-txt" placeholder="Cuanto más concreto, más rápido te respondo">${esc(q.texto)}</textarea></label>
      <p class="small muted" style="margin:0">Te respondo aquí, como tarde en tu revisión semanal, y te avisará en Hoy.</p>
      <div class="row" style="gap:8px"><button class="btn ghost" data-act="cq" data-q="atras">Atrás</button><button class="btn grow" data-act="cq" data-q="enviar">Enviar a Jesús</button></div></div>`);
  }
  async function enviar() {
    guardaCampos(); const q = S.cq;
    if (!q.texto.trim()) return toast('Escribe un par de líneas para que Jesús lo entienda');
    const fila = { tema: q.tema, urgente: q.tema === 'dolor' && q.urgente, ejercicio: q.ejercicio.trim() || null, texto: q.texto.trim(), alumno_id: S.d.uid };
    const { data, error } = await sb.from('consultas').insert(fila).select().single();
    if (error) return fallo(error, /consultas|relation/i.test(error.message || '') ? 'Falta ejecutar el Bloque 106 en Supabase.' : 'No se ha podido enviar.');
    (S.d.consultas = S.d.consultas || []).unshift(data); S.cq = null; cerrarSheet(); toast('Enviado. Te respondo aquí, como tarde en tu revisión semanal.'); render();
  }
  /* Preguntas de fin de entreno → mismas consultas */
  function vFinEntreno(sesionRef) {
    const ejs = ejerciciosDeSesion();
    return `<div class="stack" style="gap:6px"><span class="small"><b>¿Algún ejercicio te salió mal, te dolió o hay que revisarlo?</b></span>
      <div class="choice" role="group" id="fe-q1">${[['no', 'No'], ['si', 'Sí']].map(([v, l]) => `<button type="button" data-act="cq" data-q="fe" data-v="${v}" aria-pressed="${v === 'no'}">${l}</button>`).join('')}</div>
      <div id="fe-box" class="stack" hidden style="gap:8px"><label class="f">¿Cuál?<select id="fe-ej">${ejs.map(n => `<option>${esc(n)}</option>`).join('')}<option value="">Otro / no sé cuál</option></select></label>
      <label class="f">¿Qué ha pasado?<textarea id="fe-txt" placeholder="Dolor, técnica, peso, máquina…"></textarea></label>
      <div class="stack" style="gap:6px"><span class="small"><b>¿Te limita para entrenar o moverte?</b></span><div class="choice" role="group" id="fe-lim">${[['no', 'No'], ['si', 'Sí']].map(([v, l]) => `<button type="button" data-act="cq" data-q="felim" data-v="${v}" aria-pressed="${v === 'no'}">${l}</button>`).join('')}</div>
      <div id="fe-wa" hidden><p class="small" style="color:var(--bad);margin:0 0 6px">Esto no puede esperar: escríbeme también por WhatsApp.</p><a class="btn sm" href="${esc(waJesus('Hola Jesús, hoy en el entreno algo me ha dolido y me limita: '))}" target="_blank" rel="noopener" data-act="cq" data-q="walog" data-v="wa_dolor">💬 Escribir por WhatsApp</a></div></div></div></div>
      <label class="f"><b>¿Alguna otra cosa que no pueda esperar a la revisión?</b><textarea id="s-nota" placeholder="Opcional"></textarea></label>`;
  }
  function leerFinEntreno() {
    const si = document.querySelector('#fe-q1 [aria-pressed="true"]')?.dataset.v === 'si';
    const lim = si && document.querySelector('#fe-lim [aria-pressed="true"]')?.dataset.v === 'si';
    return { si, lim, ej: si ? (document.getElementById('fe-ej')?.value || '') : '', det: si ? (document.getElementById('fe-txt')?.value.trim() || '') : '', otra: (document.getElementById('s-nota')?.value.trim() || '') };
  }
  async function crearDeFin(r, sesionId) {
    const filas = [];
    if (r.si) filas.push({ tema: 'dolor', urgente: !!r.lim, ejercicio: r.ej || null, texto: r.det || '(sin detalle)', sesion_ref: String(sesionId) });
    if (r.otra) filas.push({ tema: 'fin_entreno', urgente: false, texto: r.otra, sesion_ref: String(sesionId) });
    if (!filas.length) return;
    const { data, error } = await sb.from('consultas').insert(filas.map(f => ({ ...f, alumno_id: S.d.uid }))).select();
    if (error) console.warn(error.message); else (S.d.consultas = S.d.consultas || []).unshift(...data);
  }

  function vAlumno() {
    const L = (S.d?.consultas || []).filter(c => !/^wa_/.test(c.tema));
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
  const abiertas = () => (S.c?.consultas || []).filter(c => c.estado === 'abierta' && !/^wa_/.test(c.tema));
  const edad = c => Date.now() - new Date(c.creado_at).getTime();
  /* Métrica: % respondidas en < 48 h (últimos 30 días) y derivaciones a WhatsApp desde la app */
  function metrica() {
    const desde = Date.now() - 30 * 864e5, L = (S.c?.consultas || []).filter(c => new Date(c.creado_at).getTime() >= desde);
    const chat = L.filter(c => !/^wa_/.test(c.tema)), resp = chat.filter(c => c.respondida_at || c.cerrada_at);
    const t = c => new Date(c.respondida_at || c.cerrada_at) - new Date(c.creado_at);
    const venc = chat.filter(c => c.estado === 'abierta' && edad(c) > H48).length, ok = resp.filter(c => t(c) <= H48).length;
    const base = resp.length + venc;
    return { n: chat.length, pct: base ? Math.round(ok / base * 100) : null, media: resp.length ? Math.round(resp.reduce((a, c) => a + t(c), 0) / resp.length / 36e5) : null, wa: L.length - chat.length };
  }
  const RAPIDAS = ['Entendido, lo ajusto en tu próximo entreno.', 'Para hoy, sustituye el ejercicio por una variante sin dolor y avísame mañana.', 'Lo vemos en tu próxima revisión; mientras tanto sigue igual.'];
  function vCoach() {
    const L = abiertas(); if (S.c?.consultasErr && !L.length) return '';
    L.sort((a, b) => edad(b) - edad(a));
    const col = c => edad(c) > H48 ? 'bad' : edad(c) > 24 * 36e5 ? 'warn' : 'ok', hrs = c => Math.max(1, Math.round(edad(c) / 36e5));
    const fila = c => { const [, ico, t] = tm(c.tema);
      return `<div class="line" style="align-items:flex-start;gap:8px;flex-wrap:wrap"><span class="al-dot-s" style="background:var(--${col(c)});margin-top:6px"></span><div class="grow stack" style="gap:2px;min-width:200px"><b class="small">${esc(nombreAl(c.alumno_id))} · ${ico} ${esc(t)}${c.ejercicio ? ' · ' + esc(c.ejercicio) : ''}${c.urgente ? ' · le limita' : ''}</b><span class="small">${esc((c.texto || '').slice(0, 160))}</span><span class="small muted">hace ${hrs(c)} h${edad(c) > H48 ? ' · fuera de plazo' : ''}</span></div>
        <button class="btn sm" data-act="cq" data-q="resp" data-id="${c.id}">Responder</button></div>`; };
    const M = metrica(), venc = L.filter(c => edad(c) > H48).length;
    const met = M.n ? `<div class="small muted">30 días: ${M.pct != null ? `<b style="color:var(--${M.pct >= 90 ? 'ok' : M.pct >= 70 ? 'warn' : 'bad'})">${M.pct}%</b> respondidas en &lt;48 h` : 'sin respuestas aún'}${M.media != null ? ` · media ${M.media} h` : ''} · ${M.n} consultas · ${M.wa} derivadas a WhatsApp</div>` : '';
    return `<section class="section"><div class="section-head"><h2>Consultas de alumnos</h2></div><div class="card stack" style="gap:6px">${met}
      ${L.length ? `<details ${venc ? 'open' : ''}><summary><b>${L.length} pendiente${L.length === 1 ? '' : 's'}</b>${venc ? ` <span class="pill bad">${venc} fuera de plazo</span>` : ` <span class="small muted">· la más antigua hace ${hrs(L[0])} h</span>`}</summary>${L.map(fila).join('')}</details>` : '<div class="empty">Sin consultas pendientes ✓</div>'}</div></section>`;
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

  /* Contexto en la devolución semanal: consultas del alumno esa semana */
  function vDevolucion(aid, semana) {
    const fin = sumaDias(semana, 7), L = (S.c?.consultas || []).filter(c => c.alumno_id === aid && !/^wa_/.test(c.tema) && dia(c.creado_at) >= semana && dia(c.creado_at) < fin);
    if (!L.length) return '';
    return `<div class="aprox small stack" style="gap:4px"><b>Sus consultas de la semana</b>${L.map(c => { const [, ico, t] = tm(c.tema); return `<div>${ico} ${esc(t)}${c.ejercicio ? ' · ' + esc(c.ejercicio) : ''}: «${esc((c.texto || '').slice(0, 120))}» <span class="muted">· ${c.estado === 'abierta' ? 'sin responder' : c.estado}</span></div>`; }).join('')}</div>`;
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
      case 'wa': { const u = URG.find(x => x[0] === v); if (!u) break; log(v); window.open(waJesus(u[3]), '_blank', 'noopener'); cerrarSheet(); S.cq = null; break; }
      case 'walog': log(v); break;
      case 'felim': document.querySelectorAll('#fe-lim button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); { const w = document.getElementById('fe-wa'); if (w) w.hidden = v !== 'si'; } break;
      case 'rapida': { const t = document.getElementById('cq-resp'); if (t) t.value = RAPIDAS[+b.dataset.i]; break; }
      case 'envresp': await guardaResp(b.dataset.id, false); break;
      case 'cerrar': await guardaResp(b.dataset.id, true); break;
    }
  }
  /* Registro mínimo de cada derivación a WhatsApp desde la app (para medir) */
  function log(tema) { if (S.vista || S.prueba || !S.d?.uid) return; sb.from('consultas').insert({ alumno_id: S.d.uid, tema, estado: 'whatsapp', texto: null }).then(r => { if (r.error) console.warn(r.error.message); }); }
  return { vDevolucion, metrica, cargarAlumno, cargarCoach, vAlumno, vAvisoHoy, vCoach, vFinEntreno, leerFinEntreno, crearDeFin, accion, sinLeer, abiertas };
})();
