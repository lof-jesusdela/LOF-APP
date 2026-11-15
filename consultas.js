/* «Habla con Jesús»: chat con el aspecto de WhatsApp y los colores de LOF.
   Responde siempre Jesús en persona (no es un bot ni una IA).
   Compromiso con el alumno = revisión semanal; objetivo interno de Jesús = < 48 h.
   Futuro: un asistente podrá responder lo sencillo aquí mismo, ofreciendo siempre pasar a Jesús. */
const Consultas = (() => {
  /* Temas del chat (pueden esperar). Los 4 primeros son los de entrada; el resto, históricos o derivados */
  const TEMAS = [
    ['entreno', '🏋️', 'Entrenamiento'],
    ['nutricion', '🍽️', 'Alimentación'],
    ['habitos', '🌙', 'Hábitos'],
    ['plan', '📋', 'Mi plan'],
    ['dolor', '🩹', 'Dolor o molestia'],
    ['ejercicio', '🏋️', 'Ejercicio'],
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
  const tm = k => TEMAS.find(t => t[0] === k) || URG.find(t => t[0] === k) || (k === 'wa_chat' ? ['wa_chat', '📞', 'Algo urgente'] : null) || (k === 'fin_entreno' ? ['fin_entreno', '🏁', 'Tras entrenar'] : [k, '', '']);
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
  const TEL = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>';
  const cab = (av, nom, sub, der = '', atras = null) => `<div class="wa-head">${atras || '<button type="button" class="wa-back" data-act="cerrarSheetPide" aria-label="Volver">‹</button>'}${av}<div class="grow"><b>${esc(nom)}</b><div class="wa-sub">${esc(sub)}</div></div>${der}</div>`;

  /* ---------- Alumno: conversación guiada por banners ---------- */
  const O = (k, ico, t, sub) => ({ k, ico, t, sub });
  function diasPrograma() {
    const p = S.d?.programa; return (p?.dias || []).filter(d => (d.bloques_sesion || []).some(b => (b.ejercicios_sesion || []).length));
  }
  function ejerciciosDia(id) {
    const d = diasPrograma().find(x => String(x.id) === String(id)); if (!d) return [];
    return [...new Set(d.bloques_sesion.flatMap(b => b.ejercicios_sesion || []).map(e => { try { return ejDe(e).nombre; } catch (er) { return ''; } }).filter(Boolean))];
  }
  const elegirSesion = (preg) => { const ds = diasPrograma(); return { preg, ops: ds.length ? ds.map(d => O('dia:' + d.id, '📅', typeof nomDia === 'function' ? nomDia(d) : (d.nombre || 'Sesión'))).concat(O('dia:otra', '❓', 'Otra / no está en la lista')) : null }; };
  /* Árbol: devuelve la pregunta y sus opciones, o null si ya puede escribir */
  function paso(p) {
    const k = p.map(x => x.k), s = S.d?.servicio || {}, [t0, t1, t2] = k;
    if (!k.length) {
      const ops = [(s.modulo_entreno ?? true) && O('entreno', '🏋️', 'Entrenamiento', 'Planificación, una sesión o un ejercicio'), s.modulo_nutricion && O('nutricion', '🍽️', 'Alimentación', 'Tu plan, comidas, compra'), s.modulo_habitos && O('habitos', '🌙', 'Hábitos', 'Sueño, pasos, rutinas'), O('plan', '📋', 'Mi plan', 'Cuota, fechas, revisiones o la app')].filter(Boolean);
      const ult = (S.d?.consultas || []).find(c => c.respuesta); if (ult && edad({ creado_at: ult.respondida_at || ult.creado_at }) < 14 * 864e5) ops.push(O('resp', '↩️', 'Responder a Jesús', 'Seguir con lo último que te contestó'));
      return { preg: '¿Sobre qué quieres hablar?', ops };
    }
    if (t0 === 'resp' || t0 === 'urg') return null;
    if (t0 === 'entreno') {
      if (!t1) return { preg: '¿Sobre qué del entrenamiento?', ops: [O('planif', '🗓️', 'Planificación', 'Días, horarios, objetivo'), O('sesion', '📄', 'Un entrenamiento', 'Una sesión concreta'), O('ejercicio', '🎯', 'Un ejercicio', 'Dudas o dolor en un ejercicio')] };
      if (t1 === 'planif') return t2 ? null : { preg: '¿Qué necesitas?', ops: [O('dias', '⏰', 'Días u horarios'), O('objetivo', '🎯', 'Objetivo o tipo de entreno'), O('cambio', '🔁', 'Quiero cambiar algo'), O('otra', '❓', 'Otra duda')] };
      if (t1 === 'sesion') {
        if (!t2) return { preg: '¿Qué te pasa con ese entrenamiento?', ops: [O('duda', '❔', 'Tengo una duda'), O('intens', '⚖️', 'Muy duro o muy fácil'), O('tiempo', '⏱️', 'No me da tiempo'), O('dolor', '🩹', 'Me ha molestado algo')] };
        if (!k[3]) { const e = elegirSesion('¿Qué sesión?'); return e.ops ? e : null; }
        return null;
      }
      if (t1 === 'ejercicio') {
        if (!t2) return { preg: '¿Es una duda o un dolor?', ops: [O('duda', '❔', 'Duda', 'Técnica, peso, máquina…'), O('dolor', '🩹', 'Dolor o molestia')] };
        let i = 3;
        if (t2 === 'dolor') { if (!k[3]) return { preg: '¿Te limita para entrenar o moverte con normalidad?', ops: [O('leve', '🙂', 'No, es leve'), O('limita', '⚠️', 'Sí, me limita')] }; if (k[3] === 'limita') return { urg: true }; i = 4; }
        if (!k[i]) { const e = elegirSesion('¿De qué sesión es el ejercicio?'); return e.ops ? e : null; }
        if (!k[i + 1] && k[i] !== 'dia:otra') { const ejs = ejerciciosDia(k[i].slice(4)); if (ejs.length) return { preg: '¿Qué ejercicio?', ops: ejs.map(n => O('ej:' + n, '•', n)).concat(O('ej:otro', '❓', 'Otro')) }; }
        return null;
      }
    }
    if (t0 === 'nutricion') {
      if (!t1) return { preg: '¿Sobre qué de tu alimentación?', ops: [O('plan', '📊', 'Mi plan y contextos'), O('comida', '🥗', 'Una comida o alimento'), O('compra', '🛒', 'Compra y organización'), O('fuera', '🍽️', 'Comer fuera o un evento')] };
      return t2 ? null : { preg: '¿Qué necesitas?', ops: [O('duda', '❔', 'Tengo una duda'), O('cambiar', '🔁', 'Quiero cambiar algo'), O('cuesta', '😮‍💨', 'Me está costando cumplirlo')] };
    }
    if (t0 === 'habitos') {
      const hs = (S.d?.habitos || []).filter(h => h.titulo && h.estado !== 'archivado');
      if (!t1) return { preg: '¿Qué hábito?', ops: (hs.length ? hs.map(h => O('h:' + h.id, '•', h.titulo)) : [O('sueno', '😴', 'Sueño y descanso'), O('pasos', '🚶', 'Pasos y actividad'), O('estres', '🧘', 'Estrés')]).concat(O('otro', '❓', 'Otro hábito')) };
      return t2 ? null : { preg: '¿Qué te pasa?', ops: [O('cuesta', '😮‍💨', 'Me cuesta cumplirlo'), O('duda', '❔', 'Tengo una duda'), O('ajustar', '🔁', 'Quiero ajustarlo')] };
    }
    if (t0 === 'plan') {
      if (!t1) return { preg: '¿Sobre qué de tu plan?', ops: [O('cuota', '💳', 'Cuota y pagos'), O('proceso', '🗓️', 'Mi proceso', 'Fechas, duración, revisiones'), O('cambio', '⬆️', 'Cambiar o ampliar mi plan'), O('app', '📱', 'La app')] };
      return t2 ? null : { preg: '¿Qué necesitas?', ops: [O('duda', '❔', 'Tengo una duda'), O('problema', '⚠️', 'Algo no va bien')] };
    }
    return null;
  }
  const tieneDolor = p => p.some(x => x.k === 'dolor');
  const resumenRuta = p => p.slice(1).map(x => x.t).join(' · ');
  function abrir() { S.cqLista = false; S.cq = { path: [] }; pintaAlumno(); marcarVistas(); }
  function pintaAlumno() {
    const q = S.cq || (S.cq = { path: [] }), L = (S.d?.consultas || []).slice().reverse(), st = paso(q.path);
    const elegidas = q.path.map(x => `<div class="wa-ban sel"><span class="i">${x.ico}</span><span class="grow">${esc(x.t)}</span><span class="ok">✓</span></div>`).join('');
    let guia;
    if (st?.urg) guia = `<div class="wa-msg">Esto no puede esperar a la revisión: escríbeme por WhatsApp y lo vemos hoy. Si es fuerte, repentino o con hormigueo, para y consulta con un médico.</div>
      ${S.whatsapp ? `<button type="button" class="wa-ban wa-ban-wa" data-act="cq" data-q="watel" data-v="wa_dolor"><span class="i">📞</span><span class="grow"><b>Escribir a Jesús por WhatsApp</b></span></button>` : ''}`;
    else if (st) guia = `<div class="wa-msg">${esc(st.preg)}</div>${st.ops.map((o, i) => `<button type="button" class="wa-ban" data-act="cq" data-q="g" data-i="${i}"><span class="i">${o.ico}</span><span class="grow"><b>${esc(o.t)}</b>${o.sub ? `<span class="sub">${esc(o.sub)}</span>` : ''}</span><span class="fl">›</span></button>`).join('')}`;
    else guia = `<div class="wa-msg">${q.path[0]?.k === 'resp' ? 'Escríbeme abajo tu respuesta.' : 'Perfecto. Cuéntamelo abajo con el detalle que puedas.'}</div>`;
    const nav = q.path.length ? `<div class="wa-nav"><button type="button" data-act="cq" data-q="g1">‹ Atrás</button><button type="button" data-act="cq" data-q="g0">↺ Empezar de nuevo</button></div>` : '';
    const listo = !st;
    montar(`<div class="wa">${cab(avatarJ, 'Jesús de la Obra', 'Te responde Jesús en persona', S.whatsapp ? `<button type="button" class="wa-tel" data-act="cq" data-q="watel" aria-label="Escribir a Jesús por WhatsApp">${TEL}</button>` : '')}
      <div class="wa-body" id="wa-body">${hilo(L, 'al')}<div class="wa-guia">${elegidas}${guia}${nav}</div></div>
      ${listo ? `<div class="wa-bar"><textarea id="cq-txt" rows="2" placeholder="${esc(q.path.length > 1 ? 'Cuéntame sobre «' + q.path[q.path.length - 1].t + '»…' : 'Mensaje')}"></textarea><button type="button" class="wa-send" data-act="cq" data-q="enviar" aria-label="Enviar">➤</button></div>` : ''}</div>`);
    if (listo) setTimeout(() => document.getElementById('cq-txt')?.focus(), 50);
  }
  function elegir(i) {
    const st = paso(S.cq.path); if (!st?.ops?.[+i]) return;
    S.cq.path.push(st.ops[+i]); pintaAlumno();
  }
  async function marcarVistas() {
    const ids = sinLeer().map(c => c.id); if (!ids.length || S.vista || S.prueba) return;
    const ahora = new Date().toISOString(); sinLeer().forEach(c => c.visto_alumno_at = ahora);
    await sb.from('consultas').update({ visto_alumno_at: ahora }).in('id', ids);
  }
  async function enviar() {
    const q = S.cq, txt = (document.getElementById('cq-txt')?.value || '').trim();
    if (!txt) return toast('Escribe tu mensaje');
    const p = q.path, t0 = p[0]?.k, ultResp = (S.d?.consultas || []).find(c => c.respuesta);
    const tema = t0 === 'resp' ? (ultResp?.tema || 'otro') : tieneDolor(p) ? 'dolor' : (t0 || 'otro');
    const fila = { tema, urgente: false, ejercicio: t0 === 'resp' ? (ultResp?.ejercicio || null) : (resumenRuta(p) || null), texto: txt, alumno_id: S.d.uid };
    const { data, error } = await sb.from('consultas').insert(fila).select().single();
    if (error) { const m = String(error.message || ''); return fallo(error, /does not exist|schema cache|could not find the table/i.test(m) ? 'Falta ejecutar el Bloque 106 en Supabase.' : 'No se ha podido enviar: ' + m); }
    (S.d.consultas = S.d.consultas || []).unshift(data); S.cq = { path: [] }; toast('Enviado'); pintaAlumno();
  }
  /* Pantalla «Tu coach»: una sola entrada al chat + cómo funciona cada canal */
  function vAlumno() {
    const L = (S.d?.consultas || []).filter(c => !/^wa_/.test(c.tema)), u = mensajes(L.slice(0, 5).reverse()).pop(), n = sinLeer().length;
    return `<section class="section"><button type="button" class="card wa-entrada" data-act="cq" data-q="abrir">
        <div class="row" style="gap:12px;align-items:center">${avatarJ.replace('wa-av', 'wa-av lg')}<div class="grow" style="min-width:0;text-align:left"><div class="row"><b class="grow" style="font-size:17px">Habla con Jesús</b>${n ? `<span class="wa-badge">${n}</span>` : u ? `<span class="small muted">${esc(cuando(u.t))}</span>` : ''}</div>
          <div class="small muted wa-prev">${u ? (u.de === 'al' ? 'Tú: ' : 'Jesús: ') + esc(u.txt) : 'Toca para escribirme'}</div></div><span class="wa-go">›</span></div></button>
      <div class="card stack wa-reglas">
        <div class="wa-reg"><span class="i">💬</span><div><b>Chat de la app</b><div class="small muted">Lo que no puede esperar a tu revisión mensual. Te respondo aquí, como tarde en tu revisión semanal, y te aviso en Hoy.</div></div></div>
        <div class="wa-reg"><span class="i" style="background:#25D366;color:#fff">${TEL}</span><div><b>WhatsApp</b><div class="small muted">Solo lo urgente, que no puede esperar 24 h: mover una cita, un dolor que te limita, un imprevisto o un evento de esta semana. Está en el teléfono de arriba del chat.</div></div></div>
        <div class="wa-reg"><span class="i">🔒</span><div><b>Te respondo yo, en persona</b><div class="small muted">No es un bot ni una IA: cada mensaje lo leo y lo contesto yo.</div></div></div>
      </div></section>`;
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
  function vCoach(enSheet) {
    if (S.c?.consultasErr) return '';
    const desde = Date.now() - 30 * 864e5, todas = (S.c.consultas || []).filter(c => new Date(c.creado_at).getTime() >= desde), ab = abiertas();
    const ids = [...new Set(todas.map(c => c.alumno_id))];
    if (!ids.length && !enSheet) return '';
    const fila = aid => { const L = todas.filter(c => c.alumno_id === aid), pend = ab.filter(c => c.alumno_id === aid), u = mensajes(L.slice().reverse()).pop(), viejo = pend.reduce((m, c) => Math.max(m, edad(c)), 0);
      const col = !pend.length ? '' : viejo > H48 ? 'bad' : viejo > 24 * 36e5 ? 'warn' : 'ok';
      return { pend: pend.length, viejo, html: `<div class="wa-fila" data-act="cq" data-q="hilo" data-v="${aid}" style="cursor:pointer">${avatarDe(perfilDe(aid), 44)}<div class="grow" style="min-width:0"><div class="row"><b class="grow">${esc(nombreAl(aid))}</b>${u ? `<span class="small ${pend.length ? 'wa-nue' : 'muted'}">${esc(cuando(u.t))}</span>` : ''}</div>
        <div class="row"><span class="small muted wa-prev grow">${u ? (u.de === 'je' ? 'Tú: ' : '') + esc(u.txt) : ''}</span>${pend.length ? `<span class="wa-badge ${col}">${pend.length}</span>` : ''}</div></div></div>` }; };
    const F = ids.map(fila).sort((a, b) => b.pend - a.pend || b.viejo - a.viejo), conP = F.filter(f => f.pend), sinP = F.filter(f => !f.pend);
    const M = metrica(), venc = ab.filter(c => edad(c) > H48).length;
    const met = M.n ? `<div class="small muted">30 días: ${M.pct != null ? `<b style="color:var(--${M.pct >= 90 ? 'ok' : M.pct >= 70 ? 'warn' : 'bad'})">${M.pct}%</b> respondidas en &lt;48 h` : 'sin respuestas aún'}${M.media != null ? ` · media ${M.media} h` : ''} · ${M.n} mensajes · ${M.wa} derivados a WhatsApp${venc ? ` · <b style="color:var(--bad)">${venc} fuera de plazo</b>` : ''}</div>` : '';
    const nuevo = enSheet ? `<select class="wa-nuevo" data-cq-nuevo><option value="">＋ Nuevo chat con…</option>${(S.c.perfiles || []).filter(p => p.rol !== 'coach' && p.activo !== false && (typeof esCliente !== 'function' || esCliente(p))).sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '')).map(p => `<option value="${p.id}">${esc(p.nombre || '')}</option>`).join('')}</select>` : '';
    if (enSheet) return `${met}${nuevo}${conP.map(f => f.html).join('') || '<div class="small muted" style="padding:8px 0">Sin mensajes pendientes ✓</div>'}${sinP.length ? `<div class="eyebrow" style="margin-top:8px">Al día</div>${sinP.map(f => f.html).join('')}` : ''}`;
    return `<section class="section"><div class="section-head"><h2>Chats con alumnos</h2></div><div class="card stack" style="gap:4px">${met}
      ${conP.map(f => f.html).join('') || '<div class="small muted">Sin mensajes pendientes ✓</div>'}
      ${sinP.length ? `<details><summary class="small muted">${sinP.length} chat${sinP.length === 1 ? '' : 's'} al día</summary>${sinP.map(f => f.html).join('')}</details>` : ''}</div></section>`;
  }
  /* Acceso al chat desde la cabecera del coach (Tu día, Alumnos, Metodología, Negocio) */
  function pendAl() { return new Set(abiertas().map(c => c.alumno_id)).size; }
  function vBoton() {
    if (S.c?.consultasErr) return ''; const n = pendAl();
    return `<button type="button" class="wa-hbtn" data-act="cq" data-q="lista" aria-label="Chats con alumnos${n ? ': ' + n + ' pendientes' : ''}"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.6A8.4 8.4 0 1 1 21 11.5z"/></svg>${n ? `<span class="n">${n}</span>` : ''}</button>`;
  }
  function abrirLista() {
    S.cqLista = true;
    montar(`<div class="wa"><div class="wa-head"><button type="button" class="wa-back" data-act="cerrarSheetPide" aria-label="Volver">‹</button><div class="grow"><b>Chats</b><div class="wa-sub">Alumnos · respondes tú en persona</div></div></div>
      <div class="wa-lista">${vCoach(true)}</div></div>`);
  }
  function abrirHilo(aid) {
    S.cqAl = aid; const L = (S.c.consultas || []).filter(c => c.alumno_id === aid).reverse();
    const volver = S.cqLista ? '<button type="button" class="wa-back" data-act="cq" data-q="lista" aria-label="Volver a chats">‹</button>' : null;
    montar(`<div class="wa">${cab(avatarDe(perfilDe(aid), 36), nombreAl(aid), 'Respondes tú en persona', typeof waNum === 'function' && waNum(aid) ? `<a class="wa-tel" href="https://wa.me/${waNum(aid)}" target="_blank" rel="noopener" aria-label="Abrir su WhatsApp">${TEL}</a>` : '', volver)}
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
      case 'g': elegir(b.dataset.i); break;
      case 'g1': S.cq.path.pop(); pintaAlumno(); break;
      case 'g0': S.cq = { path: [] }; pintaAlumno(); break;
      case 'enviar': await enviar(); break;
      case 'fe': document.querySelectorAll('#fe-q1 button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); { const bx = document.getElementById('fe-box'); if (bx) bx.hidden = v !== 'si'; } break;
      case 'felim': document.querySelectorAll('#fe-lim button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); { const w = document.getElementById('fe-wa'); if (w) w.hidden = v !== 'si'; } break;
      case 'wa': { const u = URG.find(x => x[0] === v); if (!u) break; log(v); window.open(waJesus(u[3]), '_blank', 'noopener'); break; }
      case 'walog': log(v); break;
      case 'watel': { const dl = v === 'wa_dolor'; log(dl ? 'wa_dolor' : 'wa_chat'); window.open(waJesus(dl ? 'Hola Jesús, tengo un dolor en un ejercicio que me limita: ' : 'Hola Jesús, '), '_blank', 'noopener'); break; }
      case 'hilo': S.cqLista = !!b.closest('.wa-lista'); abrirHilo(v); break;
      case 'lista': abrirLista(); break;
      case 'rapida': { const t = document.getElementById('cq-resp'); if (t) t.value = RAPIDAS[+b.dataset.i]; break; }
      case 'envresp': await guardaResp(false); break;
      case 'cerrar': await guardaResp(true); break;
    }
  }
  /* Registro mínimo de cada derivación a WhatsApp desde la app (para medir) */
  function log(tema) { if (S.vista || S.prueba || !S.d?.uid) return; sb.from('consultas').insert({ alumno_id: S.d.uid, tema, estado: 'whatsapp', texto: null }).then(r => { if (r.error) console.warn(r.error.message); }); }
  return { vBoton, abrirLista, vDevolucion, metrica, cargarAlumno, cargarCoach, vAlumno, vAvisoHoy, vCoach, vFinEntreno, leerFinEntreno, crearDeFin, accion, sinLeer, abiertas, abrirHilo };
})();

document.addEventListener('change', e => { const sel = e.target.closest && e.target.closest('[data-cq-nuevo]'); if (sel && sel.value) Consultas.abrirHilo(sel.value); });
