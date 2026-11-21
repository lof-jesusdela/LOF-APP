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
    ['plan', '📋', 'Mi proceso'],
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

  /* Añade (o actualiza) un mensaje sin duplicarlo: el tiempo real y el envío pueden llegar en cualquier orden */
  const meter = (L, x) => { const i = L.findIndex(y => y.id === x.id); if (i >= 0) L[i] = { ...L[i], ...x }; else L.unshift(x); };
  /* ---------- Tiempo real: los mensajes llegan al momento, como en WhatsApp (Bloque 113) ---------- */
  let canal = null;
  function refrescar() {
    const act = document.activeElement, id = act?.id, val = act && 'value' in act ? act.value : null;
    if (S.modo === 'coach') { if (S.cqAl && document.getElementById('wa-body')) abrirHilo(S.cqAl); else if (S.cqLista && document.querySelector('.wa-lista')) abrirLista(); }
    else if (document.getElementById('wa-body') || document.querySelector('.wa')) { try { pintaAlumno(); } catch (e) { } }
    render();
    if (id && val != null) { const el = document.getElementById(id); if (el && el.value !== val) el.value = val; el?.focus(); }
  }
  function escuchar(coach, uid) {
    if (canal || S.vista || S.prueba || typeof sb?.channel !== 'function') return;
    try {
      canal = sb.channel('lof-consultas-' + (coach ? 'coach' : uid)).on('postgres_changes', { event: '*', schema: 'public', table: 'consultas', ...(coach ? {} : { filter: `alumno_id=eq.${uid}` }) }, p => {
        const L = coach ? (S.c.consultas ||= []) : (S.d.consultas ||= []), n = p.new || {};
        if (p.eventType === 'DELETE') { const i = L.findIndex(x => x.id === p.old?.id); if (i >= 0) L.splice(i, 1); }
        else { const nuevo = !L.some(x => x.id === n.id); meter(L, n);
          if (nuevo && p.eventType === 'INSERT') { if (coach && n.texto) toast(`💬 ${(nombreAl(n.alumno_id) || 'Alumno').split(' ')[0]}: ${String(n.texto).slice(0, 60)}`); else if (!coach && n.respuesta) toast('💬 Jesús te ha escrito'); }
          /* Doble check al momento: le ha llegado (gris) y, si tiene el chat abierto, lo ha leído (azul) */
          if (!coach && n.respuesta && !n.visto_alumno_at) { if (document.getElementById('wa-body') && document.visibilityState === 'visible') marcarVistas(); else if (!n.entregado_at) { const ahora = new Date().toISOString(); meter(L, { id: n.id, entregado_at: ahora }); sb.from('consultas').update({ entregado_at: ahora }).eq('id', n.id).then(() => { }, () => { }); } }
          /* Jesús con ese chat abierto: el mensaje nuevo queda leído, como en WhatsApp */
          if (coach && n.texto && n.estado === 'abierta' && S.cqAl === n.alumno_id && document.getElementById('wa-body') && document.visibilityState === 'visible') marcarLeido(n.alumno_id); }
        refrescar();
      });
      const ch = canal;
      /* Si el móvil corta la conexión (pantalla bloqueada, cambio de red), se vuelve a conectar sola */
      ch.subscribe(st => { if (canal !== ch || !/CHANNEL_ERROR|TIMED_OUT|CLOSED/.test(st)) return; canal = null; try { sb.removeChannel(ch); } catch (e) { } setTimeout(() => escuchar(coach, uid), 4000); });
    } catch (e) { console.warn('Tiempo real no disponible', e); canal = null; }
  }
  /* Red de seguridad: al volver a la app y cada 30 s con el chat abierto, se recargan los mensajes */
  let alDiaT = 0;
  async function ponerAlDia() {
    if (S.vista || S.prueba || !S.user || Date.now() - alDiaT < 5000) return; alDiaT = Date.now();
    try { if (S.modo === 'coach' && S.c) await cargarCoach(); else if (S.d && S.d.uid === S.user.id) await cargarAlumno(S.user.id, S.d); else return; refrescar(); } catch (e) { }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') ponerAlDia(); });
  window.addEventListener('online', ponerAlDia);
  setInterval(() => { if (document.visibilityState === 'visible' && (document.getElementById('wa-body') || document.querySelector('.wa-lista'))) ponerAlDia(); }, 30000);
  async function cargarAlumno(uid, D) {
    const r = await sb.from('consultas').select('*').eq('alumno_id', uid).order('creado_at', { ascending: false }).limit(60);
    D.consultas = r.error ? [] : (r.data || []); D.consultasErr = !!r.error; if (!r.error && uid === S.user?.id) escuchar(false, uid);
    /* Doble check gris para Jesús: sus mensajes ya han llegado al móvil del alumno */
    if (!S.vista && !S.prueba && uid === S.user?.id) {
      const nuevos = D.consultas.filter(c => c.respuesta && !c.entregado_at && 'entregado_at' in c);
      if (nuevos.length) { const ahora = new Date().toISOString(); nuevos.forEach(c => c.entregado_at = ahora); sb.from('consultas').update({ entregado_at: ahora }).in('id', nuevos.map(c => c.id)).then(() => { }, () => { }); }
    }
  }
  async function cargarCoach() {
    const r = await sb.from('consultas').select('*').order('creado_at', { ascending: false }).limit(600);
    S.c.consultas = r.error ? [] : (r.data || []); S.c.consultasErr = !!r.error;
    if (!r.error) escuchar(true);
    limpiarFotos();
  }
  /* Las fotos se borran a los 60 días (lo hace la app del coach al cargar, sin tarea manual) */
  async function limpiarFotos() {
    const lim = Date.now() - 60 * 864e5, viejas = (S.c.consultas || []).filter(c => c.foto && new Date(c.creado_at).getTime() < lim);
    if (!viejas.length) return;
    const r = await sb.storage.from('consultas').remove(viejas.map(c => c.foto)); if (r.error) return console.warn(r.error.message);
    const u = await sb.from('consultas').update({ foto: null }).in('id', viejas.map(c => c.id)); if (!u.error) viejas.forEach(c => c.foto = null);
  }
  const sinLeer = () => (S.d?.consultas || []).filter(c => c.estado === 'respondida' && c.respuesta && !c.visto_alumno_at);
  const abiertas = () => (S.c?.consultas || []).filter(c => c.estado === 'abierta' && c.texto && !/^wa_/.test(c.tema));
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
  /* Recordatorio de notificaciones dentro de un mensaje: solo lo ve el alumno que aún no las tiene activadas en ese móvil */
  const MARCA_AV = /\[\[avisos\]\]/g;
  function vAvisosMsg(yo) {
    const est = yo === 'je' ? 'falta' : S.push;
    if (yo !== 'je' && (est === 'ok' || est === 'no' || !est)) return '';
    const cuerpo = est === 'instalar' ? 'Para recibirlas en el iPhone: abre la app en Safari → Compartir → «Añadir a pantalla de inicio», y ábrela desde el icono.'
      : est === 'bloqueado' ? 'Las tienes bloqueadas: actívalas en los Ajustes del móvil para esta app.'
      : `<button type="button" class="btn sm" data-act="cq" data-q="push" style="margin-top:6px">🔔 Permitir notificaciones</button>`;
    return `<div class="wa-avisos">🔔 <b>Recuerda permitir las notificaciones</b> para estar al tanto de mis mensajes.<div>${cuerpo}</div>${yo === 'je' ? '<div class="muted" style="font-size:11px;margin-top:4px">Solo lo ven quienes aún no las tienen activadas.</div>' : ''}</div>`;
  }
  function burbuja(m, yo) {
    if (m.sys) return `<div class="wa-sys">${esc(m.txt)} · ${esc(hora(m.t))}</div>`;
    const mio = m.de === yo, c = m.c, [, ico, t] = tm(c.tema);
    const chip = m.de === 'al' && ico ? `<div class="wa-chip">${ico} ${esc(t)}${c.ejercicio ? ' · ' + esc(c.ejercicio) : ''}${c.urgente ? ' · le limita' : ''}</div>` : '';
    const tick = !mio ? '' : m.de === 'al' ? '<span class="wa-tk">✓</span>'
      : c.visto_alumno_at ? '<span class="wa-tk leido">✓✓</span>' : c.entregado_at ? '<span class="wa-tk">✓✓</span>' : '<span class="wa-tk">✓</span>';
    const leidoTxt = yo === 'je' && m.de === 'je' && c.visto_alumno_at ? (() => { const d = new Date(c.visto_alumno_at); return `<div class="wa-leido">Leído ${d.toDateString() === new Date().toDateString() ? 'hoy' : 'el ' + d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} a las ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</div>`; })() : '';
    const ej = m.de === 'al' && yo === 'je' ? ejDeMsg(c) : null;
    const ejHtml = ej ? `<button type="button" class="wa-ejref" data-act="cq" data-q="fotourl" data-u="${esc(ej.imagen_url || '')}">${ej.imagen_url ? `<img src="${esc(ej.imagen_url)}" alt="" loading="lazy">` : '<span class="ph">🏋️</span>'}<b>${esc(ej.nombre)}</b></button>` : '';
    const foto = m.de === 'al' && c.foto ? `<button type="button" class="wa-foto" data-act="cq" data-q="foto" data-p="${esc(c.foto)}"><img data-foto="${esc(c.foto)}" alt="Foto"></button>` : '';
    const marca = MARCA_AV.test(m.txt || ''), txt = marca ? m.txt.replace(MARCA_AV, '').trim() : m.txt;
    return `<div class="wa-msg ${mio ? 'mio' : ''}${yo === 'je' ? ' pulsable' : ''}"${yo === 'je' ? ` data-cid="${c.id}" data-de="${m.de}"` : ''}>${chip}${ejHtml}${foto}${txt && !(foto && txt === '📷') ? `<span class="wa-txt">${esc(txt)}</span>` : ''}${marca ? vAvisosMsg(yo) : ''}<span class="wa-hr">${esc(hora(m.t))}${tick}</span></div>${leidoTxt}`;
  }
  function hilo(L, yo) {
    const M = mensajes(L, yo === 'je'); let ult = '';
    if (!M.length) return `<div class="wa-sys">${yo === 'al' ? 'Escríbeme lo que necesites. Lo leo yo en persona.' : 'Aún no hay mensajes con este alumno.'}</div>`;
    return M.map(m => { const d = dia(m.t), sep = d !== ult ? `<div class="wa-dia">${esc(sepDia(d))}</div>` : ''; ult = d; return sep + burbuja(m, yo); }).join('');
  }
  const FOTOS = {};
  const ajustaAlto = t => { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight + 2, Math.round(window.innerHeight * 0.4)) + 'px'; };
  /* Ejercicio al que se refiere un mensaje (y su foto de la biblioteca), para que Jesús lo vea sin abrir nada */
  function ejDeMsg(c) {
    const lib = S.c?.ejercicios || []; if (!lib.length) return null;
    const busca = n => n && lib.find(z => normaliza(z.nombre) === normaliza(n));
    const cand = [/^ej:/.test(c.sesion_ref || '') ? c.sesion_ref.slice(3) : null, ...(String(c.ejercicio || '').split(' · ').reverse())];
    for (const n of cand) { const e = busca(n); if (e) return e; }
    return null;
  }
  function montar(html) {
    abrirSheet(html); const el = document.getElementById('sheet-in'); el.classList.add('chat');
    const b = document.getElementById('wa-body'); if (b) b.scrollTop = b.scrollHeight;
    pintaFotos();
  }
  /* Fotos privadas: enlaces firmados de 1 h, sin volver a pintar el chat */
  async function pintaFotos() {
    const imgs = [...document.querySelectorAll('#sheet-in img[data-foto]')]; if (!imgs.length) return;
    const faltan = [...new Set(imgs.map(i => i.dataset.foto).filter(p => !FOTOS[p]))];
    if (faltan.length) { const r = await sb.storage.from('consultas').createSignedUrls(faltan, 3600); (r.data || []).forEach(x => { if (x.signedUrl) FOTOS[x.path] = x.signedUrl; }); }
    imgs.forEach(i => { if (FOTOS[i.dataset.foto]) i.src = FOTOS[i.dataset.foto]; else i.closest('.wa-foto')?.classList.add('caducada'); });
    const b = document.getElementById('wa-body'); if (b) setTimeout(() => b.scrollTop = b.scrollHeight, 150);
  }
  function verFoto(p, url) {
    const u = url || FOTOS[p]; if (!u) return;
    const d = document.createElement('div'); d.className = 'wa-lb'; d.innerHTML = `<img src="${esc(u)}" alt=""><span>Toca para cerrar</span>`;
    d.addEventListener('click', () => d.remove()); document.body.appendChild(d);
  }
  /* Reduce la foto en el móvil antes de subirla (máx. 1280 px, JPEG ≈ 150-250 KB) */
  async function comprimir(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image(); await new Promise((ok, ko) => { img.onload = ok; img.onerror = ko; img.src = url; });
      const k = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.72));
    } finally { URL.revokeObjectURL(url); }
  }
  async function elegirFoto(input) {
    const f = input.files?.[0]; if (!f) return;
    if (!/^image\//.test(f.type || 'image/')) return toast('Solo se pueden adjuntar fotos');
    try { const blob = await comprimir(f); if (!blob) throw new Error('foto'); S.cq.foto = blob; S.cq.fotoUrl && URL.revokeObjectURL(S.cq.fotoUrl); S.cq.fotoUrl = URL.createObjectURL(blob); }
    catch (e) { return toast('No se ha podido leer la foto'); }
    const t = document.getElementById('cq-txt')?.value || ''; pintaAlumno(); const ta = document.getElementById('cq-txt'); if (ta) ta.value = t;
  }
  const avatarJ = '<img class="wa-av" src="icons/coach.jpg" alt="" onerror="this.style.visibility=\'hidden\'">';
  const TEL = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>';
  const WA_ICO = '<img src="icons/whatsapp.png" alt="" onerror="this.replaceWith(document.createRange().createContextualFragment(Consultas.TEL))">';
  const cab = (av, nom, sub, der = '', atras = null) => `<div class="wa-head">${atras || '<button type="button" class="wa-back" data-act="cerrarSheetPide" aria-label="Volver">‹</button>'}${av}<div class="grow"><b>${esc(nom)}</b><div class="wa-sub">${esc(sub)}</div></div>${der}</div>`;

  /* ---------- Alumno: conversación guiada por banners ---------- */
  const O = (k, ico, t, sub) => ({ k, ico, t, sub });
  function diasPrograma() {
    const p = S.d?.programa; return (p?.dias || []).filter(d => (d.bloques_sesion || []).some(b => (b.ejercicios_sesion || []).length));
  }
  const NOM_BLOQUE = { calentamiento: 'Calentamiento', fuerza: 'Fuerza', cardio: 'Cardio', movilidad: 'Movilidad', core: 'Core', vuelta: 'Vuelta a la calma' };
  /* Ejercicios de una sesión, con foto y agrupados por bloque en el orden de su planificación */
  function ejerciciosDia(id) {
    const d = diasPrograma().find(x => String(x.id) === String(id)); if (!d) return [];
    const vistos = new Set(), out = [];
    (d.bloques_sesion || []).slice().sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)).forEach((b, bi) => {
      const g = b.nombre || b.titulo || NOM_BLOQUE[b.tipo] || `Bloque ${bi + 1}`;
      (b.ejercicios_sesion || []).slice().sort((x, y) => (x.orden ?? 0) - (y.orden ?? 0)).forEach(e => {
        let x = {}; try { x = ejDe(e); } catch (er) { } if (!x.nombre || vistos.has(x.nombre)) return; vistos.add(x.nombre);
        out.push({ n: x.nombre, img: x.imagen_url || '', g });
      });
    });
    return out;
  }
  const elegirSesion = (preg) => { const ds = diasPrograma(); return { preg, ops: ds.length ? ds.map(d => O('dia:' + d.id, '📅', typeof nomDia === 'function' ? nomDia(d) : (d.nombre || 'Sesión'))).concat(O('dia:otra', '❓', 'Otra / no está en la lista')) : null }; };
  /* Árbol: devuelve la pregunta y sus opciones, o null si ya puede escribir */
  function paso(p) {
    const k = p.map(x => x.k), s = S.d?.servicio || {}, [t0, t1, t2] = k;
    if (!k.length) {
      /* Solo los temas de lo que tiene contratado; para lo demás escribe directamente en la caja */
      const ops = [(s.modulo_entreno ?? true) && O('entreno', '🏋️', 'Entrenamiento', 'Planificación, una sesión o un ejercicio'), s.modulo_nutricion && O('nutricion', '🍽️', 'Alimentación', 'Tu plan, comidas, compra')].filter(Boolean);
      if (!ops.length) return null;
      return { preg: '¿Qué necesitas?', ops };
    }
    if (t0 === 'resp' || t0 === 'urg') return null;
    if (t0 === 'entreno') {
      if (!t1) return { preg: '¿Sobre qué del entrenamiento?', ops: [O('planif', '🗓️', 'Planificación', 'Días, horarios, objetivo'), O('sesion', '📄', 'Una sesión de entrenamiento', 'Una sesión completa de tu plan'), O('ejercicio', '🎯', 'Un ejercicio', 'Dudas o dolor en un ejercicio')] };
      if (t1 === 'planif') return t2 ? null : { preg: '¿Qué necesitas?', ops: [O('dias', '⏰', 'Días u horarios'), O('objetivo', '🎯', 'Objetivo o tipo de entreno'), O('cambio', '🔁', 'Quiero cambiar algo'), O('otra', '❓', 'Otra duda')] };
      if (t1 === 'sesion') {
        if (!t2) return { preg: '¿Qué te pasa con esa sesión?', ops: [O('duda', '❔', 'Tengo una duda'), O('intens', '⚖️', 'Muy duro o muy fácil'), O('tiempo', '⏱️', 'No me da tiempo'), O('dolor', '🩹', 'Me ha molestado algo')] };
        if (!k[3]) { const e = elegirSesion('¿Qué sesión?'); return e.ops ? e : null; }
        return null;
      }
      if (t1 === 'ejercicio') {
        if (!t2) return { preg: '¿Es una duda o un dolor?', ops: [O('duda', '❔', 'Duda', 'Técnica, peso, máquina…'), O('dolor', '🩹', 'Dolor o molestia')] };
        let i = 3;
        if (t2 === 'dolor') { if (!k[3]) return { preg: '¿Te limita para entrenar o moverte con normalidad?', ops: [O('leve', '🙂', 'No, es leve'), O('limita', '⚠️', 'Sí, me limita')] }; if (k[3] === 'limita') return { urg: true }; i = 4; }
        if (!k[i]) { const e = elegirSesion('¿De qué sesión es el ejercicio?'); return e.ops ? e : null; }
        if (!k[i + 1] && k[i] !== 'dia:otra') { const ejs = ejerciciosDia(k[i].slice(4)); if (ejs.length) return { preg: 'Toca el ejercicio', grid: true, ops: ejs.map(x => ({ ...O('ej:' + x.n, '•', x.n), img: x.img, g: x.g })).concat({ ...O('ej:otro', '❓', 'Otro / no está aquí'), g: '' }) }; }
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
      if (!t1) return { preg: '¿Sobre qué de tu proceso?', ops: [O('proceso', '🗓️', 'Fechas y revisiones', 'Duración, próximas revisiones, seguimiento'), O('app', '📱', 'La app', 'Cómo se usa o algo no funciona')] };
      return t2 ? null : { preg: '¿Qué necesitas?', ops: [O('duda', '❔', 'Tengo una duda'), O('problema', '⚠️', 'Algo no va bien')] };
    }
    return null;
  }
  const tieneDolor = p => p.some(x => x.k === 'dolor');
  const resumenRuta = p => p.slice(1).map(x => x.t).join(' · ');
  function abrir() { S.cqLista = false; S.cq = { path: [], libre: sinLeer().length > 0 }; pintaAlumno(); marcarVistas(); }
  function pintaAlumno() {
    const q = S.cq || (S.cq = { path: [] }), L = (S.d?.consultas || []).slice().reverse(), st = paso(q.path);
    const elegidas = q.path.map(x => `<div class="wa-ban sel"><span class="i">${x.ico}</span><span class="grow">${esc(x.t)}</span><span class="ok">✓</span></div>`).join('');
    let guia;
    if (st?.urg) guia = `<div class="wa-msg">Esto no puede esperar a la revisión: escríbeme por WhatsApp y lo vemos hoy. Si es fuerte, repentino o con hormigueo, para y consulta con un médico.</div>
      ${S.whatsapp ? `<button type="button" class="wa-ban wa-ban-wa" data-act="cq" data-q="watel" data-v="wa_dolor"><span class="i">📞</span><span class="grow"><b>Escribir a Jesús por WhatsApp</b></span></button>` : ''}`;
    else if (st?.grid) { let n = 0; const grupos = [...new Set(st.ops.map(o => o.g))];
      guia = `<div class="wa-msg">${esc(st.preg)}</div>${grupos.map(g => { const os = st.ops.map((o, i) => ({ o, i })).filter(z => z.o.g === g);
        return `${g ? `<div class="wa-gh"><span>${esc(g)}</span><small>${os.length} ${os.length === 1 ? 'ejercicio' : 'ejercicios'}</small></div>` : ''}<div class="wa-grid">${os.map(({ o, i }) => `<button type="button" class="wa-ej" data-act="cq" data-q="g" data-i="${i}">${o.k === 'ej:otro' ? '' : `<span class="nu">${++n}</span>`}<span class="nm">${esc(o.t)}</span>${o.img ? `<img src="${esc(o.img)}" alt="" loading="lazy">` : `<span class="ph">${o.k === 'ej:otro' ? '❓' : '🏋️'}</span>`}</button>`).join('')}</div>`; }).join('')}`; }
    else if (st) guia = `<div class="wa-msg">${esc(st.preg)}</div>${st.ops.map((o, i) => `<button type="button" class="wa-ban" data-act="cq" data-q="g" data-i="${i}"><span class="i">${o.ico}</span><span class="grow"><b>${esc(o.t)}</b>${o.sub ? `<span class="sub">${esc(o.sub)}</span>` : ''}</span><span class="fl">›</span></button>`).join('')}`;
    else guia = `<div class="wa-msg">${q.path[0]?.k === 'resp' ? 'Escríbeme abajo tu respuesta.' : 'Perfecto. Cuéntamelo abajo con el detalle que puedas.'}</div>`;
    /* Al entrar: primero el tema (Entrenamiento / Alimentación / Otro). «Otro» o enviar un mensaje = conversación normal, sin opciones */
    if (!q.libre && !q.path.length && st?.ops?.length) {
      return montar(`<div class="wa">${cab(avatarJ, 'Jesús de la Obra', 'Te responde Jesús en persona', S.whatsapp ? `<button type="button" class="wa-tel" data-act="cq" data-q="watel" aria-label="Escribir a Jesús por WhatsApp">${WA_ICO}</button>` : '')}
        <div class="wa-body" id="wa-body"><div class="wa-guia" style="margin-top:8px"><div class="eyebrow" style="margin:4px 0 10px">¿Sobre qué es tu consulta?</div>
        ${st.ops.map((o, i) => `<button type="button" class="wa-ban" data-act="cq" data-q="g" data-i="${i}"><span class="i">${o.ico}</span><span class="grow"><b>${esc(o.t)}</b>${o.sub ? `<span class="sub">${esc(o.sub)}</span>` : ''}</span><span class="fl">›</span></button>`).join('')}
        <button type="button" class="wa-ban" data-act="cq" data-q="libre"><span class="i">💬</span><span class="grow"><b>Otro</b><span class="sub">Ir a la conversación y escribirme</span></span><span class="fl">›</span></button></div></div></div>`);
    }
    if (q.libre) guia = '';
    const nav = q.path.length ? `<div class="wa-nav"><button type="button" data-act="cq" data-q="g1">‹ Atrás</button><button type="button" data-act="cq" data-q="g0">↺ Empezar de nuevo</button></div>` : '';
    const listo = !st || q.libre;
    montar(`<div class="wa">${cab(avatarJ, 'Jesús de la Obra', 'Te responde Jesús en persona', S.whatsapp ? `<button type="button" class="wa-tel" data-act="cq" data-q="watel" aria-label="Escribir a Jesús por WhatsApp">${WA_ICO}</button>` : '')}
      <div class="wa-body" id="wa-body">${hilo(L, 'al')}${q.libre ? '' : `<div class="wa-guia">${elegidas}${guia}${nav}</div>`}</div>
      ${!st?.urg ? `${q.fotoUrl ? `<div class="wa-prevfoto"><img src="${q.fotoUrl}" alt=""><button type="button" data-act="cq" data-q="sinfoto" aria-label="Quitar foto">✕</button><span class="small muted">1 foto · se borra a los 60 días</span></div>` : ''}<div class="wa-bar">${q.foto ? '' : '<label class="wa-clip" aria-label="Adjuntar una foto">📷<input type="file" id="cq-foto" accept="image/*" hidden></label>'}<textarea id="cq-txt" rows="2" placeholder="${esc(!listo ? 'Escribe aquí o elige arriba…' : q.path.length > 1 ? 'Cuéntame sobre «' + q.path[q.path.length - 1].t + '»…' : 'Mensaje')}"></textarea><button type="button" class="wa-send" data-act="cq" data-q="enviar" aria-label="Enviar">➤</button></div>` : ''}</div>`);
    if (listo) setTimeout(() => document.getElementById('cq-txt')?.focus(), 50);
  }
  function elegir(i) {
    const st = paso(S.cq.path); if (!st?.ops?.[+i]) return;
    S.cq.path.push(st.ops[+i]); pintaAlumno();
  }
  async function marcarVistas() {
    const ids = sinLeer().map(c => c.id); if (!ids.length || S.vista || S.prueba) return;
    const ahora = new Date().toISOString(); sinLeer().forEach(c => c.visto_alumno_at = ahora);
    await sb.from('consultas').update({ visto_alumno_at: ahora }).in('id', ids); render();
  }
  async function enviar() {
    const q = S.cq, txt = (document.getElementById('cq-txt')?.value || '').trim();
    if (!txt && !q.foto) return toast('Escribe tu mensaje');
    const p = q.path, t0 = p[0]?.k, ultResp = (S.d?.consultas || []).find(c => c.respuesta);
    const tema = t0 === 'resp' ? (ultResp?.tema && ultResp.tema !== 'jesus' ? ultResp.tema : 'otro') : tieneDolor(p) ? 'dolor' : (t0 || 'otro');
    const fila = { tema, urgente: false, ejercicio: t0 === 'resp' ? (ultResp?.ejercicio || null) : (resumenRuta(p) || null), texto: txt || '📷', alumno_id: S.d.uid };
    { const ej = p.find(x => /^ej:/.test(x.k) && x.k !== 'ej:otro'); if (ej) fila.sesion_ref = 'ej:' + ej.t; }
    const bt = document.querySelector('[data-q="enviar"]'); if (bt) { if (bt.disabled) return; bt.disabled = true; }
    if (q.foto) {
      const ruta = `${S.d.uid}/${Date.now()}.jpg`, up = await sb.storage.from('consultas').upload(ruta, q.foto, { contentType: 'image/jpeg' });
      if (up.error) { if (bt) bt.disabled = false; return fallo(up.error, /bucket|not found/i.test(up.error.message || '') ? 'Falta ejecutar el Bloque 107 en Supabase.' : 'No se ha podido subir la foto: ' + (up.error.message || '')); }
      fila.foto = ruta; FOTOS[ruta] = q.fotoUrl;
    }
    const { data, error } = await sb.from('consultas').insert(fila).select().single();
    if (error) { if (bt) bt.disabled = false; const m = String(error.message || ''); return fallo(error, /does not exist|schema cache|could not find the table/i.test(m) ? 'Falta ejecutar el Bloque 106 en Supabase.' : 'No se ha podido enviar: ' + m); }
    meter((S.d.consultas = S.d.consultas || []), data); S.cq = { path: [], libre: true }; toast('Enviado'); pintaAlumno();
    if (!S.vista && !S.prueba) sb.functions.invoke('enviar-aviso-enviar-aviso', { body: { a_coach: true, cuerpo: data.texto || 'Te ha enviado una foto' } }).catch(() => { });   /* aviso al móvil de Jesús */
  }
  /* Pantalla «Tu coach»: una sola entrada al chat + cómo funciona cada canal */
  function vAlumno() {
    const L = (S.d?.consultas || []).filter(c => !/^wa_/.test(c.tema)), u = mensajes(L.slice(0, 5).reverse()).pop(), n = sinLeer().length;
    return `<section class="section"><button type="button" class="card wa-entrada" data-act="cq" data-q="abrir">
        <div class="row" style="gap:12px;align-items:center">${avatarJ.replace('wa-av', 'wa-av lg')}<div class="grow" style="min-width:0;text-align:left"><div class="row"><b class="grow" style="font-size:17px">Habla con Jesús</b>${n ? `<span class="wa-badge">${n}</span>` : u ? `<span class="small muted">${esc(cuando(u.t))}</span>` : ''}</div>
          <div class="small muted wa-prev">${u ? (u.de === 'al' ? 'Tú: ' : 'Jesús: ') + esc(u.txt) : 'Toca para escribirme'}</div></div><span class="wa-go">›</span></div></button>
        <div class="wa-nota"><b>Para qué es:</b> lo que no puede esperar a tu revisión mensual (dudas de tu entreno, alimentación, hábitos o tu plan).<br><b>Cuándo te respondo:</b> como tarde en tu revisión semanal, y te aviso en Hoy.<br>🔒 Te respondo yo en persona: no es un bot ni una IA.</div>
      ${S.whatsapp ? `<a class="card wa-entrada wa-entrada-wa" href="${esc(waJesus('Hola Jesús, '))}" target="_blank" rel="noopener" data-act="cq" data-q="walog" data-v="wa_chat">
        <div class="row" style="gap:12px;align-items:center"><span class="wa-ico-wa">${WA_ICO}</span><div class="grow" style="text-align:left"><b style="font-size:17px">WhatsApp · solo urgente</b><div class="small muted">Abre WhatsApp con Jesús</div></div><span class="wa-go">›</span></div></a>
        <div class="wa-nota"><b>Para qué es:</b> solo lo urgente: mover una cita, un dolor que te limita, un cambio de plan por un imprevisto o ayuda con un evento de esta semana.<br><b>Cuándo te respondo:</b> en menos de 48 h.</div>` : ''}
      </section>`;
  }
  function vAvisoHoy() {
    const n = sinLeer().length; if (!n) return '';
    return `<section class="section"><div class="card wa-fila wa-nuevo" data-act="cq" data-q="abrir" style="cursor:pointer">${avatarJ}<div class="grow"><b>${sinLeer().every(c => c.texto && c.tema !== 'jesus') ? 'Jesús te ha respondido' : n === 1 ? 'Jesús te ha enviado un mensaje' : 'Tienes mensajes de Jesús'}</b><div class="small muted">${n} ${n === 1 ? 'mensaje nuevo' : 'mensajes nuevos'} · toca para leer</div></div><span class="wa-badge">${n}</span></div></section>`;
  }

  /* Preguntas de fin de entreno → mismas consultas */
  function vFinEntreno(sesionRef, co) {   /* co: la lleva Jesús en presencial → tercera persona, sin WhatsApp */
    const ejs = ejerciciosDeSesion();
    return `<div class="stack" style="gap:6px"><span class="small"><b>${co ? '¿Algún ejercicio le salió mal, le dolió o hay que revisarlo?' : '¿Algún ejercicio te salió mal, te dolió o hay que revisarlo?'}</b></span>
      <div class="choice" role="group" id="fe-q1">${[['no', 'No'], ['si', 'Sí']].map(([v, l]) => `<button type="button" data-act="cq" data-q="fe" data-v="${v}" aria-pressed="${v === 'no'}">${l}</button>`).join('')}</div>
      <div id="fe-box" class="stack" hidden style="gap:8px"><label class="f">¿Cuál?<select id="fe-ej">${ejs.map(n => `<option>${esc(n)}</option>`).join('')}<option value="">Otro / no sé cuál</option></select></label>
      <label class="f">¿Qué ha pasado?<textarea id="fe-txt" placeholder="Dolor, técnica, peso, máquina…"></textarea></label>
      <div class="stack" style="gap:6px"><span class="small"><b>${co ? '¿Le limita para entrenar o moverse?' : '¿Te limita para entrenar o moverte?'}</b></span><div class="choice" role="group" id="fe-lim">${[['no', 'No'], ['si', 'Sí']].map(([v, l]) => `<button type="button" data-act="cq" data-q="felim" data-v="${v}" aria-pressed="${v === 'no'}">${l}</button>`).join('')}</div>
      <div id="fe-wa" hidden ${co ? 'data-co="1"' : ''}><p class="small" style="color:var(--bad);margin:0 0 6px">Esto no puede esperar: escríbeme también por WhatsApp.</p><a class="btn sm" href="${esc(waJesus('Hola Jesús, hoy en el entreno algo me ha dolido y me limita: '))}" target="_blank" rel="noopener" data-act="cq" data-q="walog" data-v="wa_dolor">💬 Escribir por WhatsApp</a></div></div></div></div>
      <label class="f"><b>${co ? 'Notas de la sesión (opcional)' : '¿Alguna otra cosa que no pueda esperar a la revisión?'}</b><textarea id="s-nota" placeholder="Opcional"></textarea></label>`;
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
  /* «No leído» a mano (como en WhatsApp): lista de alumnos guardada en tus ajustes privados, igual en todos tus dispositivos */
  const noLeidos = () => { try { return JSON.parse(S.c?.fiscal?.cq_noleidos || '[]') || []; } catch (e) { return []; } };
  async function ponNoLeido(aid, on) {
    const l = noLeidos().filter(x => x !== aid); if (on) l.push(aid); const v = JSON.stringify(l);
    (S.c.fiscal ||= {}).cq_noleidos = v; await sb.from('ajustes_privados').upsert({ clave: 'cq_noleidos', valor: v }, { onConflict: 'clave' }).then(() => {}, () => {});
  }
  /* Abrir un chat lo da por leído: sus mensajes pendientes quedan atendidos (un «Ok» no hace falta contestarlo) */
  async function marcarLeido(aid) {
    if (S.vista || S.prueba) return; const ahora = new Date().toISOString(), ab = abiertas().filter(c => c.alumno_id === aid);
    if (noLeidos().includes(aid)) await ponNoLeido(aid, false);
    if (!ab.length) return; const { error } = await sb.from('consultas').update({ estado: 'cerrada', cerrada_at: ahora }).in('id', ab.map(c => c.id));
    if (!error) ab.forEach(c => Object.assign(c, { estado: 'cerrada', cerrada_at: ahora }));
  }
  function vCoach(enSheet) {
    if (S.c?.consultasErr) return '';
    const desde = Date.now() - 30 * 864e5, todas = (S.c.consultas || []).filter(c => new Date(c.creado_at).getTime() >= desde), ab = abiertas();
    const ids = [...new Set([...todas.map(c => c.alumno_id), ...noLeidos()])];
    if (!ids.length && !enSheet) return '';
    const NL = noLeidos();
    const fila = aid => { const L = todas.filter(c => c.alumno_id === aid), pend0 = ab.filter(c => c.alumno_id === aid), pend = pend0.length ? pend0 : NL.includes(aid) ? [{ creado_at: new Date().toISOString(), _nl: 1 }] : [], u = mensajes(L.slice().reverse()).pop(), viejo = pend.reduce((m, c) => Math.max(m, edad(c)), 0);
      const col = !pend.length ? '' : viejo > H48 ? 'bad' : viejo > 24 * 36e5 ? 'warn' : 'ok';
      return { pend: pend.length, viejo, html: `<div class="wa-fila" data-act="cq" data-q="hilo" data-v="${aid}" style="cursor:pointer">${avatarDe(perfilDe(aid), 44)}<div class="grow" style="min-width:0"><div class="row"><b class="grow">${esc(nombreAl(aid))}</b>${u ? `<span class="small ${pend.length ? 'wa-nue' : 'muted'}">${esc(cuando(u.t))}</span>` : ''}</div>
        <div class="row"><span class="small muted wa-prev grow">${u ? (u.de === 'je' ? 'Tú: ' : '') + esc(u.txt) : ''}</span>${pend.length ? `<span class="wa-badge ${col}">${pend[0]?._nl ? '●' : pend.length}</span>` : ''}</div></div></div>` }; };
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
    S.cqLista = true; if (!S.pushCoach && typeof estadoPush === 'function') estadoPush().then(async e => { S.pushCoach = e; if (e === 'ok') { try { const j = (await (await navigator.serviceWorker.ready).pushManager.getSubscription()).toJSON(); await sb.from('push_suscripciones').upsert({ alumno_id: S.user.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }, { onConflict: 'endpoint' }); } catch (er) { } } else if (document.querySelector('.wa-lista')) abrirLista(); });
    montar(`<div class="wa"><div class="wa-head"><button type="button" class="wa-back" data-act="cerrarSheetPide" aria-label="Volver">‹</button><div class="grow"><b>Chats</b><div class="wa-sub">Alumnos · respondes tú en persona</div></div></div>
      <div class="wa-lista">${S.pushCoach && S.pushCoach !== 'ok' ? `<button type="button" class="btn full gold" data-act="activarPushCoach" style="margin-bottom:8px">🔔 Avísame en este dispositivo cuando me escriban</button>` : ''}<button type="button" class="btn full" data-act="cq" data-q="difu" style="margin-bottom:10px">📣 Mensaje a varios alumnos</button>${vCoach(true)}</div></div>`);
  }
  /* ---------- Mensaje a varios (difusión): llega a cada alumno como mensaje privado tuyo en su chat ---------- */
  const GRUPOS = [
    ['todos', 'Todos', () => true],
    ['entreno', '🏋️ Entrenamiento', s => s && (s.modulo_entreno ?? true)],
    ['nutricion', '🍽️ Alimentación', s => !!s?.modulo_nutricion],
    ['habitos', '🌱 Hábitos', s => !!s?.modulo_habitos],
    ['oposicion', '🎯 Opositores', s => !!s?.oposicion],
    ['futbol', '⚽ Futbolistas', s => !!s?.modulo_futbol]
  ];
  const PLANTILLAS = [['anuncio', 'Anuncio del chat', `¡Hola {nombre}! 👋

Te cuento una novedad de la app: desde hoy tienes un chat directo conmigo en la pestaña Contacto.

💬 Chat de la app: para tus dudas de entreno, alimentación, hábitos o tu proceso que no puedan esperar a la revisión mensual. Te va guiando paso a paso (puedes tocar la sesión y el ejercicio con su foto, y adjuntarme una foto). Te respondo yo en persona, como tarde en tu revisión semanal, y la app te avisa cuando lo haga.

📲 WhatsApp: solo para lo urgente: mover una cita, un dolor que te limita, un cambio de plan por un imprevisto o algo de un evento de esta semana. Ahí te respondo en menos de 48 h.

Así lo tengo todo ordenado y te puedo responder mejor. ¡Cualquier cosa me dices!

Jesús
[[avisos]]`], ['album', 'Álbum de comidas', `¡Hola {nombre}! 🎉🍽️

¡NOVEDAD en la app y es para ti! Ya puedes guardar tus propias comidas en un ÁLBUM, ordenado en carpetas, para tenerlas siempre a mano.

📁 Cómo funciona: entra en Nutrición y baja hasta «Mis comidas», justo debajo de tu menú semanal y la lista de la compra. Elige cuántas comidas haces al día (3 = desayuno, comida y cena; 4, 5…) y la app te crea tus carpetas.

📸 Guarda lo que comes con una foto, con los alimentos o con la calculadora, y se archiva solo en su carpeta.

💡 Cuando te falten ideas, abre la carpeta, mira lo que ya te funcionó y toca «Repetir hoy». También puedes recalcular las cantidades con la calculadora.

Con el tiempo será tu recetario personal, hecho a tu medida. ¡Estrénalo con tu próxima comida y cuéntame qué tal! 💪

Jesús`, 'nutricion']];
  const destinatarios = sel => (S.c.perfiles || []).filter(p => (typeof esCliente === 'function' ? esCliente(p) : p.rol !== 'coach' && p.activo !== false))
    .filter(p => { const sv = typeof srvDe === 'function' ? srvDe(p.id) : null; return [...sel].some(k => GRUPOS.find(g => g[0] === k)[2](sv)); })
    .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
  const conNombre = (txt, p) => txt.replace(/\{nombre\}/g, (p?.nombre || '').split(' ')[0] || '');
  function abrirDifusion() {
    const d = S.cqDif = S.cqDif || { sel: new Set(['todos']), txt: '', conf: false };
    const L = destinatarios(d.sel), ej = L[0];
    montar(`<div class="wa"><div class="wa-head"><button type="button" class="wa-back" data-act="cq" data-q="lista" aria-label="Volver a chats">‹</button><div class="grow"><b>Mensaje a varios</b><div class="wa-sub">Le llega a cada uno como mensaje privado tuyo</div></div></div>
      <div class="wa-lista stack" style="gap:12px">
        <div><div class="eyebrow">¿A quién?</div><div class="row" style="gap:6px;flex-wrap:wrap;margin-top:6px">${GRUPOS.map(([k, t]) => `<button type="button" class="wa-ch ${d.sel.has(k) ? 'on' : ''}" data-act="cq" data-q="dgrupo" data-v="${k}">${t}</button>`).join('')}</div>
          <details style="margin-top:6px"><summary class="small muted">${L.length} ${L.length === 1 ? 'alumno' : 'alumnos'} · ver quiénes</summary><div class="small" style="padding-top:4px">${L.map(p => esc(p.nombre || '')).join(' · ') || '—'}</div></details></div>
        <div><div class="eyebrow">Mensaje</div><div class="row" style="gap:6px;flex-wrap:wrap;margin:6px 0">${PLANTILLAS.map(([k, t]) => `<button type="button" class="wa-ch" data-act="cq" data-q="dplant" data-v="${k}">📄 ${t}</button>`).join('')}</div>
          <div class="wa-bar" style="padding:0;background:none"><textarea id="cq-dif" placeholder="Escribe tu mensaje. {nombre} se cambia por el nombre de cada alumno.">${esc(d.txt)}</textarea></div>
          <div class="small muted" style="margin-top:4px">Usa {nombre} para que salga su nombre.</div></div>
        ${d.txt.trim() && ej ? `<div><div class="eyebrow">Así lo verá ${esc((ej.nombre || '').split(' ')[0])}</div><div class="wa-muestra">${(() => { const tx = conNombre(d.txt, ej), mk = MARCA_AV.test(tx); return `<div class="wa-msg"><span class="wa-txt">${esc(tx.replace(MARCA_AV, '').trim())}</span>${mk ? vAvisosMsg('je') : ''}</div>`; })()}</div></div>` : ''}
        ${d.txt.trim() && L.length ? `<button type="button" class="btn full ${d.conf ? '' : 'ghost'}" data-act="cq" data-q="denviar">${d.conf ? `✅ Confirmar: enviar a ${L.length} ${L.length === 1 ? 'alumno' : 'alumnos'}` : `Enviar a ${L.length} ${L.length === 1 ? 'alumno' : 'alumnos'}`}</button>` : ''}
        <div id="cq-dres"></div>
      </div></div>`);
    const t = document.getElementById('cq-dif'); if (t) ajustaAlto(t);
  }
  const leeDif = () => { const t = document.getElementById('cq-dif'); if (t && S.cqDif && typeof t.value === 'string') S.cqDif.txt = t.value; };
  async function enviarDifusion() {
    leeDif(); const d = S.cqDif, L = destinatarios(d.sel);
    if (!d.txt.trim() || !L.length) return;
    if (!d.conf) { d.conf = true; return abrirDifusion(); }
    if (S.vista || S.prueba) return toast('En modo prueba no se envía nada');
    const ahora = new Date().toISOString();
    const filas = L.map(p => ({ alumno_id: p.id, tema: 'jesus', texto: null, respuesta: conNombre(d.txt, p).trim(), estado: 'respondida', respondida_at: ahora }));
    const { data, error } = await sb.from('consultas').insert(filas).select();
    if (error) { d.conf = false; return fallo(error, 'No se ha podido enviar el mensaje.'); }
    S.c.consultas = [...(data || []), ...(S.c.consultas || [])];
    let sin = [];
    try { const r = await sb.functions.invoke('enviar-aviso-enviar-aviso', { body: { alumno_ids: L.map(p => p.id), titulo: '💬 Mensaje nuevo de Jesús', cuerpo: 'Tienes un mensaje nuevo en Contacto', url: './' } }); sin = r.data?.sin_movil || []; } catch (e) { }
    S.cqDif = null; abrirDifusion(); render();
    const nom = id => (L.find(p => p.id === id)?.nombre || '');
    const res = document.getElementById('cq-dres');
    if (res) res.innerHTML = `<div class="card small stack" style="gap:4px"><b>✅ Enviado a ${L.length} ${L.length === 1 ? 'alumno' : 'alumnos'}.</b>${sin.length ? `<span class="muted">${sin.length} sin avisos activados en el móvil (lo verán al abrir la app): ${esc(sin.map(nom).join(', '))}</span>` : ''}</div>`;
  }
  /* Pasar a WhatsApp desde el chat (para vídeo, foto o audio): mensaje preparado y el chat queda respondido */
  function temaPara(aid) {
    const L = (S.c.consultas || []).filter(c => c.alumno_id === aid && c.texto && !/^wa_|^jesus$/.test(c.tema)), c = L.find(x => x.estado === 'abierta') || L[0];
    if (!c) return '';
    const ej = ejDeMsg(c); if (ej) return ej.nombre;
    const seg = String(c.ejercicio || '').split(' · ').filter(Boolean); return seg.length ? seg[seg.length - 1] : (tm(c.tema)[2] || '').toLowerCase();
  }
  async function pasarWa(aid) {
    const nom = (nombreAl(aid) || '').split(' ')[0], t = temaPara(aid), n = typeof waNum === 'function' ? waNum(aid) : '';
    const txt = `Hola ${nom}, he visto que me has escrito${t ? ` sobre ${t}` : ''}. Prefiero darte respuesta por aquí para que lo veas más rápido.`;
    window.open(`https://wa.me/${n}?text=${encodeURIComponent(txt)}`, '_blank', 'noopener');
    const ab = abiertas().filter(c => c.alumno_id === aid); if (!ab.length) return;
    const ahora = new Date().toISOString(), ult = ab.sort((a, b) => new Date(a.creado_at) - new Date(b.creado_at))[ab.length - 1];
    const r1 = await sb.from('consultas').update({ estado: 'respondida', respondida_at: ahora }).in('id', ab.map(c => c.id)); if (r1.error) return console.warn(r1.error.message);
    ab.forEach(c => Object.assign(c, { estado: 'respondida', respondida_at: ahora }));
    const cambio = { respuesta: '📲 Te contesto por WhatsApp para que lo veas antes.' };
    const r2 = await sb.from('consultas').update(cambio).eq('id', ult.id); if (!r2.error) Object.assign(ult, cambio);
    abrirHilo(aid); render();
  }
  /* ---------- Mantener pulsado un mensaje (coach): Copiar · Reenviar a otro alumno · Eliminar ---------- */
  const msgDe = (cid, de) => { const c = (S.c.consultas || []).find(x => String(x.id) === String(cid)); return c ? { c, txt: String((de === 'al' ? c.texto : c.respuesta) || '').replace(MARCA_AV, '').trim() } : null; };
  function menuMsg(el) {
    const cid = el.dataset.cid, de = el.dataset.de, m = msgDe(cid, de); if (!m) return;
    document.querySelectorAll('.wa-msg.sel').forEach(x => x.classList.remove('sel')); el.classList.add('sel');
    if (navigator.vibrate) try { navigator.vibrate(15); } catch (e) { }
    capa(`<div class="wa-menu" role="menu">
      ${m.txt ? `<button type="button" data-act="cq" data-q="mcopiar" data-cid="${cid}" data-de="${de}">📋 Copiar</button>` : ''}
      ${m.txt ? `<button type="button" data-act="cq" data-q="mreenv" data-cid="${cid}" data-de="${de}">↪️ Reenviar a otro alumno</button>` : ''}
      <button type="button" class="peligro" data-act="cq" data-q="mborrar" data-cid="${cid}" data-de="${de}">🗑️ Eliminar</button>
      <button type="button" data-act="cq" data-q="mcerrar">Cancelar</button></div>`);
  }
  function capa(html) {
    cerrarCapa(); const d = document.createElement('div'); d.className = 'wa-capa'; d.id = 'wa-capa'; d.innerHTML = html;
    d.addEventListener('click', e => { if (e.target === d) cerrarCapa(); }); (document.getElementById('sheet-in') || document.body).appendChild(d);
  }
  function cerrarCapa() { document.getElementById('wa-capa')?.remove(); document.querySelectorAll('.wa-msg.sel').forEach(x => x.classList.remove('sel')); }
  function reenviarPick(cid, de, filtro = '') {
    const m = msgDe(cid, de); if (!m) return; const f = normaliza(filtro);
    const L = (S.c.perfiles || []).filter(p => (typeof esCliente === 'function' ? esCliente(p) : p.rol !== 'coach') && p.id !== S.cqAl && (!f || normaliza(p.nombre).includes(f))).sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
    capa(`<div class="wa-menu wa-pick"><b style="padding:6px 4px">Reenviar a…</b><div class="small muted" style="padding:0 4px 6px">«${esc(m.txt.slice(0, 80))}${m.txt.length > 80 ? '…' : ''}»</div>
      <input type="search" id="wa-pick-q" placeholder="Buscar alumno" value="${esc(filtro)}" data-cid="${cid}" data-de="${de}">
      <div class="wa-pick-l">${L.map(p => `<button type="button" data-act="cq" data-q="mreenvA" data-cid="${cid}" data-de="${de}" data-al="${p.id}">${avatarDe(p, 28)} ${esc(p.nombre || '')}</button>`).join('') || '<div class="small muted" style="padding:8px">Nadie coincide</div>'}</div>
      <button type="button" data-act="cq" data-q="mcerrar">Cancelar</button></div>`);
    const q = document.getElementById('wa-pick-q'); if (q && filtro) { q.focus(); q.setSelectionRange(filtro.length, filtro.length); }
  }
  async function reenviarA(cid, de, aid) {
    const m = msgDe(cid, de); if (!m) return; cerrarCapa();
    if (S.vista || S.prueba) return toast('En modo prueba no se envía nada');
    const ahora = new Date().toISOString();
    const { data, error } = await sb.from('consultas').insert({ alumno_id: aid, tema: 'jesus', texto: null, respuesta: m.txt, estado: 'respondida', respondida_at: ahora }).select().single();
    if (error) return fallo(error, 'No se ha podido reenviar.');
    meter(S.c.consultas, data); avisarAlumno(aid, m.txt, '💬 Jesús te ha enviado un mensaje'); toast(`Reenviado a ${(nombreAl(aid) || '').split(' ')[0]}`); render();
  }
  async function borrarMsg(cid, de, b) {
    const m = msgDe(cid, de); if (!m) return;
    if (!b.dataset.ok) { b.dataset.ok = '1'; b.textContent = de === 'al' ? '🗑️ Toca otra vez: se borra su mensaje (y tu respuesta)' : '🗑️ Toca otra vez para eliminar tu mensaje'; return; }
    const c = m.c; cerrarCapa();
    let r;
    if (de === 'al' || c.tema === 'jesus' || !c.texto) {
      r = await sb.from('consultas').delete().eq('id', c.id);
      if (!r.error) { if (c.foto) sb.storage.from('consultas').remove([c.foto]).then(() => { }, () => { }); S.c.consultas = S.c.consultas.filter(x => x.id !== c.id); }
    } else {
      const cambio = { respuesta: null, estado: 'abierta', respondida_at: null, visto_alumno_at: null };
      r = await sb.from('consultas').update(cambio).eq('id', c.id); if (!r.error) Object.assign(c, cambio);
    }
    if (r.error) return fallo(r.error, 'No se ha podido eliminar.');
    toast('Mensaje eliminado'); abrirHilo(S.cqAl); render();
  }
  function abrirHilo(aid) {
    S.cqAl = aid; const L = (S.c.consultas || []).filter(c => c.alumno_id === aid).reverse();
    const volver = S.cqLista ? '<button type="button" class="wa-back" data-act="cq" data-q="lista" aria-label="Volver a chats">‹</button>' : null;
    montar(`<div class="wa">${cab(avatarDe(perfilDe(aid), 36), nombreAl(aid), 'Respondes tú en persona', `<button type="button" class="wa-tel" data-act="cq" data-q="cwa" aria-label="Contestar por WhatsApp">${WA_ICO}</button>`, volver)}
      <div class="wa-body" id="wa-body">${hilo(L, 'je')}</div>
      <div class="wa-temas"><button type="button" class="wa-ch wa-ch-wa" data-act="cq" data-q="cwa">📲 Contestar por WhatsApp</button>${RAPIDAS.map((r, i) => `<button type="button" class="wa-ch" data-act="cq" data-q="rapida" data-i="${i}">${esc(r.slice(0, 30))}…</button>`).join('')}</div>
      <div class="wa-bar"><textarea id="cq-resp" rows="1" placeholder="Mensaje"></textarea><button type="button" class="wa-send" data-act="cq" data-q="envresp" aria-label="Enviar">➤</button></div>
      <div class="wa-pie">El alumno ve: «Te responde Jesús en persona, como tarde en tu revisión semanal». Tu objetivo interno: &lt; 48 h.${L.some(c => c.estado === 'abierta' && !/^wa_/.test(c.tema)) ? ' · <button type="button" class="wa-link" data-act="cq" data-q="cerrar">Marcar como atendido sin responder</button>' : ''}</div></div>`);
  }
  /* Notificación al móvil del alumno cuando Jesús responde (como un WhatsApp) */
  /* Mensaje de Jesús iniciado por él (p. ej. «tu semana está lista»): queda en el chat y avisa al móvil */
  async function mensajeJesus(aid, txt) {
    const ahora = new Date().toISOString();
    const { data, error } = await sb.from('consultas').insert({ alumno_id: aid, tema: 'jesus', texto: null, respuesta: txt, estado: 'respondida', respondida_at: ahora }).select().single();
    if (error) throw error; meter((S.c.consultas ||= []), data); avisarAlumno(aid, txt, '💬 Jesús te ha enviado un mensaje'); return data;
  }
  function avisarAlumno(aid, txt, titulo = '💬 Jesús te ha respondido') {
    if (S.vista || S.prueba) return;
    sb.functions.invoke('enviar-aviso-enviar-aviso', { body: { alumno_ids: [aid], titulo, cuerpo: String(txt || '').slice(0, 120), url: './', tag: 'lof-chat' } }).catch(() => { });
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
      const { error } = await sb.from('consultas').update(cambio).eq('id', ult.id); if (error) return fallo(error, 'No se ha podido enviar.'); Object.assign(ult, cambio); avisarAlumno(aid, txt);
    } else {   /* sesion_ref 'chat': mensaje que escribes tú en el chat (no automático ni difusión) → cuenta para «no te ha contestado en 48 h» */
      const { data, error } = await sb.from('consultas').insert({ alumno_id: aid, tema: 'jesus', texto: null, respuesta: txt, estado: 'respondida', respondida_at: ahora, sesion_ref: 'chat' }).select().single();
      if (error) return fallo(error, 'No se ha podido enviar.'); meter(S.c.consultas, data); avisarAlumno(aid, txt, '💬 Jesús te ha enviado un mensaje');
    }
    abrirHilo(aid); render();
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
      case 'libre': S.cq = { path: [], libre: true }; pintaAlumno(); setTimeout(() => document.getElementById('cq-txt')?.focus(), 80); break;
      case 'enviar': await enviar(); break;
      case 'sinfoto': { const t = document.getElementById('cq-txt')?.value || ''; S.cq.foto = null; S.cq.fotoUrl = null; pintaAlumno(); const ta = document.getElementById('cq-txt'); if (ta) ta.value = t; break; }
      case 'foto': verFoto(b.dataset.p); break;
      case 'fe': document.querySelectorAll('#fe-q1 button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); { const bx = document.getElementById('fe-box'); if (bx) bx.hidden = v !== 'si'; } break;
      case 'felim': document.querySelectorAll('#fe-lim button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); { const w = document.getElementById('fe-wa'); if (w) w.hidden = v !== 'si' || !!w.dataset.co; } break;
      case 'wa': { const u = URG.find(x => x[0] === v); if (!u) break; log(v); window.open(waJesus(u[3]), '_blank', 'noopener'); break; }
      case 'walog': log(v); break;
      case 'watel': { const dl = v === 'wa_dolor'; log(dl ? 'wa_dolor' : 'wa_chat'); window.open(waJesus(dl ? 'Hola Jesús, tengo un dolor en un ejercicio que me limita: ' : 'Hola Jesús, '), '_blank', 'noopener'); break; }
      case 'hilo': if (Date.now() - (S._cqLP || 0) < 800) break; S.cqLista = !!b.closest('.wa-lista'); await marcarLeido(v); abrirHilo(v); render(); break;
      case 'lista': abrirLista(); break;
      case 'difu': abrirDifusion(); break;
      case 'mcerrar': cerrarCapa(); break;
      case 'mcopiar': { const m = msgDe(b.dataset.cid, b.dataset.de); cerrarCapa(); try { await navigator.clipboard.writeText(m.txt); toast('Copiado'); } catch (e) { toast('No se ha podido copiar'); } break; }
      case 'mreenv': reenviarPick(b.dataset.cid, b.dataset.de); break;
      case 'mreenvA': await reenviarA(b.dataset.cid, b.dataset.de, b.dataset.al); break;
      case 'mborrar': await borrarMsg(b.dataset.cid, b.dataset.de, b); break;
      case 'push': if (typeof activarPush === 'function' && await activarPush()) { await refrescarPush(); S.push = 'ok'; pintaAlumno(); } break;
      case 'dgrupo': { leeDif(); const d = S.cqDif; d.conf = false; if (v === 'todos') d.sel = new Set(['todos']); else { d.sel.delete('todos'); d.sel.has(v) ? d.sel.delete(v) : d.sel.add(v); if (!d.sel.size) d.sel.add('todos'); } abrirDifusion(); break; }
      case 'dplant': { const pl = PLANTILLAS.find(p => p[0] === v); S.cqDif.txt = pl[2]; if (pl[3]) S.cqDif.sel = new Set([pl[3]]); S.cqDif.conf = false; abrirDifusion(); break; }
      case 'denviar': await enviarDifusion(); break;
      case 'rapida': { const t = document.getElementById('cq-resp'); if (t) { t.value = RAPIDAS[+b.dataset.i]; ajustaAlto(t); t.focus(); } break; }
      case 'cwa': await pasarWa(S.cqAl); break;
      case 'fotourl': if (b.dataset.u) verFoto(null, b.dataset.u); break;
      case 'envresp': await guardaResp(false); break;
      case 'cerrar': await guardaResp(true); break;
    }
  }
  /* Registro mínimo de cada derivación a WhatsApp desde la app (para medir) */
  function log(tema) { if (S.vista || S.prueba || !S.d?.uid) return; sb.from('consultas').insert({ alumno_id: S.d.uid, tema, estado: 'whatsapp', texto: null }).then(r => { if (r.error) console.warn(r.error.message); }); }
  /* Último mensaje que le escribiste tú en el chat sin respuesta suya después: fecha si pasaron más de 48 h (y menos de 3 semanas) */
  function sinRespuesta(aid) {
    const L = (S.c?.consultas || []).filter(c => c.alumno_id === aid); if (!L.length) return null;
    const mio = L.filter(c => c.sesion_ref === 'chat' && c.respondida_at).map(c => c.respondida_at).sort().pop(); if (!mio) return null;
    const suyo = L.filter(c => c.texto).map(c => c.creado_at).sort().pop();
    const t = new Date(mio).getTime(), h = (Date.now() - t) / 36e5;
    return (!suyo || suyo < mio) && h >= 48 && h <= 24 * 21 ? mio.slice(0, 10) : null;
  }
  return { marcarLeido, ponNoLeido, abrirLista, sinRespuesta, mensajeJesus, menuMsg, reenviarPick, difTecleo: () => { if (S.cqDif) { S.cqDif.conf = false; clearTimeout(S.cqDifT); S.cqDifT = setTimeout(() => { const t = document.getElementById('cq-dif'); if (!t) return; const pos = t.selectionStart; S.cqDif.txt = t.value; abrirDifusion(); const n = document.getElementById('cq-dif'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }, 900); } }, ajustaAlto, elegirFoto, TEL, vBoton, abrirLista, vDevolucion, metrica, cargarAlumno, cargarCoach, vAlumno, vAvisoHoy, vCoach, vFinEntreno, leerFinEntreno, crearDeFin, accion, sinLeer, abiertas, abrirHilo };
})();

/* Intro envía el mensaje (Mayús+Intro hace salto de línea) */
document.addEventListener('keydown', e => { if (e.key !== 'Enter' || e.shiftKey || e.isComposing || !e.target.matches?.('.wa-bar textarea')) return; const bt = e.target.parentElement?.querySelector('.wa-send'); if (!bt) return; e.preventDefault(); bt.click(); });
document.addEventListener('input', e => { if (e.target.matches && e.target.matches('.wa-bar textarea')) Consultas.ajustaAlto(e.target); if (e.target.id === 'cq-dif') Consultas.difTecleo(); });
/* Mantén pulsada una conversación: «no leído» (te la deja de recordatorio) o, si ya lo estaba, leída */
(() => { let t = null, x0 = 0, y0 = 0;
  document.addEventListener('pointerdown', e => { const f = e.target.closest?.('.wa-fila[data-v]'); if (!f || S.modo !== 'coach') return; x0 = e.clientX; y0 = e.clientY; clearTimeout(t);
    t = setTimeout(async () => { t = null; S._cqLP = Date.now(); navigator.vibrate?.(15); const aid = f.dataset.v, yaNL = !!f.querySelector('.wa-badge');
      if (yaNL) { await Consultas.marcarLeido(aid); toast('Marcado como leído'); } else { await Consultas.ponNoLeido(aid, true); toast('Marcado como no leído'); }
      if (S.cqLista) Consultas.abrirLista(); render(); }, 550); });
  document.addEventListener('pointermove', e => { if (t && Math.hypot(e.clientX - x0, e.clientY - y0) > 10) { clearTimeout(t); t = null; } });
  ['pointerup', 'pointercancel'].forEach(ev => document.addEventListener(ev, () => { clearTimeout(t); t = null; }));
  document.addEventListener('contextmenu', e => { if (e.target.closest?.('.wa-fila')) e.preventDefault(); });
})();
document.addEventListener('change', e => { const sel = e.target.closest && e.target.closest('[data-cq-nuevo]'); if (sel && sel.value) Consultas.abrirHilo(sel.value); if (e.target.id === 'cq-foto') Consultas.elegirFoto(e.target); });

/* Mantener pulsado (o clic derecho) sobre un mensaje en el chat del coach */
(() => {
  let t = null, x0 = 0, y0 = 0;
  const fin = () => { clearTimeout(t); t = null; };
  document.addEventListener('pointerdown', e => { const el = e.target.closest && e.target.closest('.wa-msg.pulsable'); if (!el || e.target.closest('button,a')) return; x0 = e.clientX; y0 = e.clientY; fin(); t = setTimeout(() => { t = null; Consultas.menuMsg(el); }, 480); });
  document.addEventListener('pointermove', e => { if (t && Math.hypot(e.clientX - x0, e.clientY - y0) > 10) fin(); });
  ['pointerup', 'pointercancel', 'scroll'].forEach(ev => document.addEventListener(ev, fin, true));
  document.addEventListener('contextmenu', e => { const el = e.target.closest && e.target.closest('.wa-msg.pulsable'); if (el) { e.preventDefault(); Consultas.menuMsg(el); } });
  document.addEventListener('input', e => { if (e.target.id === 'wa-pick-q') { clearTimeout(e.target._t); const v = e.target.value, d = e.target.dataset; e.target._t = setTimeout(() => Consultas.reenviarPick(d.cid, d.de, v), 250); } });
})();
