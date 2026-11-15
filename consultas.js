/* «Habla con Jesús»: chat con el aspecto de WhatsApp y los colores de LOF.
   Responde siempre Jesús en persona (no es un bot ni una IA).
   Compromiso con el alumno = revisión semanal; objetivo interno de Jesús = < 48 h.
   Futuro: un asistente podrá responder lo sencillo aquí mismo, ofreciendo siempre pasar a Jesús. */
const Consultas = (() => {
  /* Temas del chat (pueden esperar) */
  const TEMAS = [
    ['ejercicio', '🏋️', 'Ejercicio'],
    ['dolor', '🩹', 'Molestia leve'],
    ['nutricion', '🍽️', 'Alimentación'],
    ['pago', '💳', 'Cuota'],
    ['otro', '❓', 'Otra cosa']
  ];
  /* Urgente (no puede esperar 24 h) → WhatsApp */
  const URG = [
    ['wa_cita', '📅', 'Mover una cita', 'Hola Jesús, necesito mover una cita: '],
    ['wa_dolor', '🩹', 'Dolor que me limita', 'Hola Jesús, tengo un dolor que me limita: '],
    ['wa_imprevisto', '⚡', 'Imprevisto', 'Hola Jesús, me ha surgido un imprevisto y necesito cambiar el plan: '],
    ['wa_evento', '🎉', 'Evento esta semana', 'Hola Jesús, esta semana tengo un evento y necesito ayuda: ']
  ];
  const H48 = 48 * 36e5;
  const tm = k => TEMAS.find(t => t[0] === k) || URG.find(t => t[0] === k) || (k === 'fin_entreno' ? ['fin_entreno', '🏁', 'Tras entrenar'] : [k, '', '']);
  const perfilDe = id => (S.c?.perfiles || []).find(p => p.id === id) || {};
  const nombreAl = id => perfilDe(id).nombre || 'Alumno';
  const dia = iso => new Date(iso).toLocaleDateString('sv-SE');
  const hora = iso => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const cuando = iso => { const d = dia(iso), h = hoyISO(); return d === h ? hora(iso) : d === sumaDias(h, -1) ? 'Ayer' : fCorta(d); };
  const sepDia = d => { const h = hoyISO(); return d === h ? 'Hoy' : d === sumaDias(h, -1) ? 'Ayer' : fLarga(d); };
  const edad = c => Date.now() - new Date(c.creado_at).getTime();

  async function cargarAlumno(uid, D) {
    const r = await sb.from('consultas').select('*').eq('alumno_id', uid).order('creado_at', { ascending: false }).limit(60);
    D.consultas = r.error ? [] : (r.data || []); D.consultasErr = !!r.error;
  }
  async function cargarCoach() {
    const r = await sb.from('consultas').select('*').order('creado_at', { ascending: false }).limit(300);
    S.c.consultas = r.error ? [] : (r.data || []); S.c.consultasErr = !!r.error;
  }
  const sinLeer = () => (S.d?.consultas || []).filter(c => c.estado === 'respondida' && c.respuesta && !c.visto_alumno_at);
  const abiertas = () => (S.c?.consultas || []).filter(c => c.estado === 'abierta' && !/^wa_|^jesus$/.test(c.tema));
  function ejerciciosDeSesion() {
    try { return (S.dia?.bloques_sesion || []).flatMap(b => b.ejercicios_sesion || []).map(e => ejDe(e).nombre).filter(Boolean); } catch (e) { return []; }
  }

  /* ---------- Hilo tipo WhatsApp ---------- */
  function mensajes(L, conSys) {
    const M = [];
    L.forEach(c => {
      if (/^wa_/.test(c.tema)) { if (conSys) { const [, ico, t] = tm(c.tema); M.push({ sys: true, t: c.creado_at, txt: `${ico} Abrió WhatsApp para: ${t.toLowerCase()}` }); } return; }
      if (c.texto) M.push({ de: 'al', t: c.creado_at, txt: c.texto, c });
      if (c.respuesta) M.push({ de: 'je', t: c.respondida_at || c.creado_at, txt: c.respuesta, c });
    });
    return M.sort((a, b) => new Date(a.t) - new Date(b.t));
  }
  function burbuja(m, yo) {
    if (m.sys) return `<div class="wa-sys">${esc(m.txt)} · ${esc(hora(m.t))}</div>`;
    const mio = m.de === yo, c = m.c, [, ico, t] = tm(c.tema);
    const chip = m.de === 'al' && ico ? `<div class="wa-chip">${ico} ${esc(t)}${c.ejercicio ? ' · ' + esc(c.ejercicio) : ''}${c.urgente ? ' · le limita' : ''}</div>` : '';
    const tick = !mio ? '' : m.de === 'al' ? (c.estado === 'abierta' ? '<span class="wa-tk">✓</span>' : '<span class="wa-tk leido">✓✓</span>') : `<span class="wa-tk ${c.visto_alumno_at ? 'leido' : ''}">✓✓</span>`;
    return `<div class="wa-msg ${mio ? 'mio' : ''}">${chip}<span class="wa-txt">${esc(m.txt)}</span><span class="wa-hr">${esc(hora(m.t))}${tick}</span></div>`;
  }
  function hilo(L, yo) {
    const M = mensajes(L, yo === 'je'); let ult = '';
    if (!M.length) return `<div class="wa-sys">${yo === 'al' ? 'Escríbeme lo que necesites. Lo leo yo en persona.' : 'Aún no hay mensajes con este alumno.'}</div>`;
    return M.map(m => { const d = dia(m.t), sep = d !== ult ? `<div class="wa-dia">${esc(sepDia(d))}</div>` : ''; ult = d; return sep + burbuja(m, yo); }).join('');
  }
  function montar(html) {
    abrirSheet(html); const el = document.getElementById('sheet-in'); el.classList.add('chat');
    const b = document.getElementById('wa-body'); if (b) b.scrollTop = b.scrollHeight;
  }
  const avatarJ = '<img class="wa-av" src="icons/coach.jpg" alt="" onerror="this.style.visibility=\'hidden\'">';
  const cab = (av, nom, sub) => `<div class="wa-head"><button type="button" class="wa-back" data-act="cerrarSheetPide" aria-label="Volver">‹</button>${av}<div class="grow"><b>${esc(nom)}</b><div class="wa-sub">${esc(sub)}</div></div></div>`;

  /* ---------- Alumno ---------- */
  function abrir() { S.cq = S.cq || { tema: null, ejercicio: '' }; pintaAlumno(); marcarVistas(); }
  function pintaAlumno(txt0) {
    const q = S.cq, L = (S.d?.consultas || []).slice().reverse(), conEj = q.tema === 'ejercicio' || q.tema === 'dolor';
    const ses = ejerciciosDeSesion();
    montar(`<div class="wa">${cab(avatarJ, 'Jesús de la Obra', 'Te responde Jesús en persona')}
      <details class="wa-urg"><summary>⚡ ¿Es urgente? <span>(no puede esperar 24 h) → WhatsApp</span></summary><div class="wa-chips">${URG.map(([k, ico, t]) => `<button type="button" class="wa-ch" data-act="cq" data-q="wa" data-v="${k}">${ico} ${t}</button>`).join('')}</div></details>
      <div class="wa-body" id="wa-body">${hilo(L, 'al')}</div>
      <div class="wa-temas"><span>¿Sobre qué?</span>${TEMAS.map(([k, ico, t]) => `<button type="button" class="wa-ch ${q.tema === k ? 'on' : ''}" data-act="cq" data-q="tema" data-v="${k}">${ico} ${t}</button>`).join('')}</div>
      ${conEj ? `<input class="wa-ej" id="cq-ej" list="cq-ejs" value="${esc(q.ejercicio)}" placeholder="¿Qué ejercicio? (opcional)"><datalist id="cq-ejs">${ses.map(x => `<option value="${esc(x)}">`).join('')}</datalist>` : ''}
      <div class="wa-bar"><textarea id="cq-txt" rows="1" placeholder="Mensaje">${esc(txt0 || '')}</textarea><button type="button" class="wa-send" data-act="cq" data-q="enviar" aria-label="Enviar">➤</button></div>
      <div class="wa-pie">🔒 Te responde Jesús en persona: no es un bot ni una IA. Lo revisa como tarde en tu revisión semanal y te avisa en Hoy. Lo urgente, por WhatsApp.</div></div>`);
  }
  async function marcarVistas() {
    const ids = sinLeer().map(c => c.id); if (!ids.length || S.vista || S.prueba) return;
    const ahora = new Date().toISOString(); sinLeer().forEach(c => c.visto_alumno_at = ahora);
    await sb.from('consultas').update({ visto_alumno_at: ahora }).in('id', ids);
  }
  async function enviar() {
    const q = S.cq, txt = (document.getElementById('cq-txt')?.value || '').trim(); q.ejercicio = document.getElementById('cq-ej')?.value || q.ejercicio || '';
    if (!txt) return;
    const fila = { tema: q.tema || 'otro', urgente: false, ejercicio: (q.tema === 'ejercicio' || q.tema === 'dolor') && q.ejercicio.trim() || null, texto: txt, alumno_id: S.d.uid };
    const { data, error } = await sb.from('consultas').insert(fila).select().single();
    if (error) return fallo(error, /consultas|relation/i.test(error.message || '') ? 'Falta ejecutar el Bloque 106 en Supabase.' : 'No se ha podido enviar.');
    (S.d.consultas = S.d.consultas || []).unshift(data); S.cq = { tema: null, ejercicio: '' }; pintaAlumno();
  }
  function vAlumno() {
    const L = (S.d?.consultas || []).filter(c => !/^wa_/.test(c.tema)), u = mensajes(L.slice(0, 5).reverse()).pop(), n = sinLeer().length;
    return `<section class="section"><div class="card wa-fila" data-act="cq" data-q="abrir" style="cursor:pointer">${avatarJ}<div class="grow" style="min-width:0"><div class="row"><b class="grow">Jesús de la Obra</b>${u ? `<span class="small ${n ? 'wa-nue' : 'muted'}">${esc(cuando(u.t))}</span>` : ''}</div>
      <div class="row"><span class="small muted wa-prev grow">${u ? (u.de === 'al' ? 'Tú: ' : '') + esc(u.txt) : 'Escríbeme lo que no pueda esperar a tu revisión'}</span>${n ? `<span class="wa-badge">${n}</span>` : ''}</div></div></div></section>`;
  }
  function vAvisoHoy() {
    const n = sinLeer().length; if (!n) return '';
    return `<section class="section"><div class="card wa-fila" data-act="cq" data-q="abrir" style="cursor:pointer">${avatarJ}<div class="grow"><b>Jesús te ha respondido</b><div class="small muted">${n} ${n === 1 ? 'mensaje nuevo' : 'mensajes nuevos'} · toca para leer</div></div><span class="wa-badge">${n}</span></div></section>`;
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
  /* Métrica: % respondidas en < 48 h (últimos 30 días) y derivaciones a WhatsApp desde la app */
  function metrica() {
    const desde = Date.now() - 30 * 864e5, L = (S.c?.consultas || []).filter(c => new Date(c.creado_at).getTime() >= desde);
    const chat = L.filter(c => !/^wa_|^jesus$/.test(c.tema)), resp = chat.filter(c => c.respondida_at || c.cerrada_at);
    const t = c => new Date(c.respondida_at || c.cerrada_at) - new Date(c.creado_at);
    const venc = chat.filter(c => c.estado === 'abierta' && edad(c) > H48).length, ok = resp.filter(c => t(c) <= H48).length;
    const base = resp.length + venc;
    return { n: chat.length, pct: base ? Math.round(ok / base * 100) : null, media: resp.length ? Math.round(resp.reduce((a, c) => a + t(c), 0) / resp.length / 36e5) : null, wa: L.filter(c => /^wa_/.test(c.tema)).length };
  }
  /* ---------- Coach ---------- */
  const RAPIDAS = ['Entendido, lo ajusto en tu próximo entreno.', 'Para hoy, sustituye el ejercicio por una variante sin dolor y avísame mañana.', 'Lo vemos en tu próxima revisión; mientras tanto sigue igual.'];
  function vCoach() {
    if (S.c?.consultasErr) return '';
    const desde = Date.now() - 30 * 864e5, todas = (S.c.consultas || []).filter(c => new Date(c.creado_at).getTime() >= desde), ab = abiertas();
    const ids = [...new Set(todas.map(c => c.alumno_id))];
    if (!ids.length) return '';
    const fila = aid => { const L = todas.filter(c => c.alumno_id === aid), pend = ab.filter(c => c.alumno_id === aid), u = mensajes(L.slice().reverse()).pop(), viejo = pend.reduce((m, c) => Math.max(m, edad(c)), 0);
      const col = !pend.length ? '' : viejo > H48 ? 'bad' : viejo > 24 * 36e5 ? 'warn' : 'ok';
      return { pend: pend.length, viejo, html: `<div class="wa-fila" data-act="cq" data-q="hilo" data-v="${aid}" style="cursor:pointer">${avatarDe(perfilDe(aid), 44)}<div class="grow" style="min-width:0"><div class="row"><b class="grow">${esc(nombreAl(aid))}</b>${u ? `<span class="small ${pend.length ? 'wa-nue' : 'muted'}">${esc(cuando(u.t))}</span>` : ''}</div>
        <div class="row"><span class="small muted wa-prev grow">${u ? (u.de === 'je' ? 'Tú: ' : '') + esc(u.txt) : ''}</span>${pend.length ? `<span class="wa-badge ${col}">${pend.length}</span>` : ''}</div></div></div>` }; };
    const F = ids.map(fila).sort((a, b) => b.pend - a.pend || b.viejo - a.viejo), conP = F.filter(f => f.pend), sinP = F.filter(f => !f.pend);
    const M = metrica(), venc = ab.filter(c => edad(c) > H48).length;
    const met = M.n ? `<div class="small muted">30 días: ${M.pct != null ? `<b style="color:var(--${M.pct >= 90 ? 'ok' : M.pct >= 70 ? 'warn' : 'bad'})">${M.pct}%</b> respondidas en &lt;48 h` : 'sin respuestas aún'}${M.media != null ? ` · media ${M.media} h` : ''} · ${M.n} mensajes · ${M.wa} derivados a WhatsApp${venc ? ` · <b style="color:var(--bad)">${venc} fuera de plazo</b>` : ''}</div>` : '';
    return `<section class="section"><div class="section-head"><h2>Chats con alumnos</h2></div><div class="card stack" style="gap:4px">${met}
      ${conP.map(f => f.html).join('') || '<div class="small muted">Sin mensajes pendientes ✓</div>'}
      ${sinP.length ? `<details><summary class="small muted">${sinP.length} chat${sinP.length === 1 ? '' : 's'} al día</summary>${sinP.map(f => f.html).join('')}</details>` : ''}</div></section>`;
  }
  function abrirHilo(aid) {
    S.cqAl = aid; const L = (S.c.consultas || []).filter(c => c.alumno_id === aid).reverse();
    montar(`<div class="wa">${cab(avatarDe(perfilDe(aid), 36), nombreAl(aid), 'Respondes tú en persona')}
      <div class="wa-body" id="wa-body">${hilo(L, 'je')}</div>
      <div class="wa-temas">${RAPIDAS.map((r, i) => `<button type="button" class="wa-ch" data-act="cq" data-q="rapida" data-i="${i}">${esc(r.slice(0, 30))}…</button>`).join('')}</div>
      <div class="wa-bar"><textarea id="cq-resp" rows="1" placeholder="Mensaje"></textarea><button type="button" class="wa-send" data-act="cq" data-q="envresp" aria-label="Enviar">➤</button></div>
      <div class="wa-pie">El alumno ve: «Te responde Jesús en persona, como tarde en tu revisión semanal». Tu objetivo interno: &lt; 48 h.${L.some(c => c.estado === 'abierta' && !/^wa_/.test(c.tema)) ? ' · <button type="button" class="wa-link" data-act="cq" data-q="cerrar">Marcar como atendido sin responder</button>' : ''}</div></div>`);
  }
  async function guardaResp(cerrar) {
    const aid = S.cqAl, txt = document.getElementById('cq-resp')?.value.trim(), ahora = new Date().toISOString();
    if (!cerrar && !txt) return;
    const ab = abiertas().filter(c => c.alumno_id === aid).sort((a, b) => new Date(a.creado_at) - new Date(b.creado_at));
    if (cerrar) {
      const { error } = await sb.from('consultas').update({ estado: 'cerrada', cerrada_at: ahora }).in('id', ab.map(c => c.id));
      if (error) return fallo(error, 'No se ha podido guardar.'); ab.forEach(c => Object.assign(c, { estado: 'cerrada', cerrada_at: ahora }));
    } else if (ab.length) {
      const ult = ab[ab.length - 1], prev = ab.slice(0, -1);
      if (prev.length) { const r = await sb.from('consultas').update({ estado: 'respondida', respondida_at: ahora }).in('id', prev.map(c => c.id)); if (r.error) return fallo(r.error, 'No se ha podido enviar.'); prev.forEach(c => Object.assign(c, { estado: 'respondida', respondida_at: ahora })); }
      const cambio = { estado: 'respondida', respuesta: txt, respondida_at: ahora };
      const { error } = await sb.from('consultas').update(cambio).eq('id', ult.id); if (error) return fallo(error, 'No se ha podido enviar.'); Object.assign(ult, cambio);
    } else {
      const { data, error } = await sb.from('consultas').insert({ alumno_id: aid, tema: 'jesus', texto: null, respuesta: txt, estado: 'respondida', respondida_at: ahora }).select().single();
      if (error) return fallo(error, 'No se ha podido enviar.'); S.c.consultas.unshift(data);
    }
    abrirHilo(aid);
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
      case 'tema': { const t = document.getElementById('cq-txt')?.value || ''; S.cq.ejercicio = document.getElementById('cq-ej')?.value || S.cq.ejercicio; S.cq.tema = S.cq.tema === v ? null : v; pintaAlumno(t); break; }
      case 'enviar': await enviar(); break;
      case 'fe': document.querySelectorAll('#fe-q1 button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); { const bx = document.getElementById('fe-box'); if (bx) bx.hidden = v !== 'si'; } break;
      case 'felim': document.querySelectorAll('#fe-lim button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); { const w = document.getElementById('fe-wa'); if (w) w.hidden = v !== 'si'; } break;
      case 'wa': { const u = URG.find(x => x[0] === v); if (!u) break; log(v); window.open(waJesus(u[3]), '_blank', 'noopener'); break; }
      case 'walog': log(v); break;
      case 'hilo': abrirHilo(v); break;
      case 'rapida': { const t = document.getElementById('cq-resp'); if (t) t.value = RAPIDAS[+b.dataset.i]; break; }
      case 'envresp': await guardaResp(false); break;
      case 'cerrar': await guardaResp(true); break;
    }
  }
  /* Registro mínimo de cada derivación a WhatsApp desde la app (para medir) */
  function log(tema) { if (S.vista || S.prueba || !S.d?.uid) return; sb.from('consultas').insert({ alumno_id: S.d.uid, tema, estado: 'whatsapp', texto: null }).then(r => { if (r.error) console.warn(r.error.message); }); }
  return { vDevolucion, metrica, cargarAlumno, cargarCoach, vAlumno, vAvisoHoy, vCoach, vFinEntreno, leerFinEntreno, crearDeFin, accion, sinLeer, abiertas, abrirHilo };
})();
