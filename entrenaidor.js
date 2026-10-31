/* EntrenIAdor: asistente de IA con los conocimientos de Jesús
   - Alumno: chat (botón flotante 🕵🏻‍♂️ y tarjeta en «Tu coach"), valoraciones y paso a WhatsApp
   - Coach: bandeja de consultas derivadas, preguntas diarias para enseñarle y chat propio con el asistente */
const IA = (() => {
  const NOMBRE = 'EntrenIAdor', ICO = '🕵🏻‍♂️';
  const st = { msgs: null, enviando: false, error: '', coach: null, cEnviando: false, cError: '', resumen: undefined, mas: false };
  const activo = () => !!S.perfil?.ia_activa && !S.prueba && !S.vista;
  const html = t => esc(t || '').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
  const waCon = q => waJesus(`Hola Jesús, le he preguntado al ${NOMBRE} y prefiero comentarlo contigo:${q ? '\n«' + q.slice(0, 300) + '»' : ''}`);
  const preguntaDe = (l, i) => { for (let k = i - 1; k >= 0; k--) if (l[k].rol === 'alumno') return l[k].texto; return ''; };
  const nomAl = id => (S.c?.perfiles || []).find(p => p.id === id)?.nombre || 'Alumno';
  const diaDe = iso => new Date(iso).toLocaleDateString('sv-SE');
  const fHora = iso => new Date(iso).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
  const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (_) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };

  /* ---------- Plan de 30 días: 3 preguntas diarias para que el EntrenIAdor aprenda de Jesús ---------- */
  const PREG = [
    ['tono', '¿Cómo saludas y cómo te despides cuando escribes a un alumno? Pon un par de ejemplos reales tuyos.'],
    ['tono', '¿Qué expresiones o muletillas usas mucho? (ej. «vamos con todo», «crack»…)'],
    ['tono', '¿Usas emojis? ¿Cuáles y en qué momentos?'],
    ['tono', '¿Cómo motivas a alguien que te dice que esta semana lo ha hecho fatal? Escríbelo como se lo dirías.'],
    ['tono', '¿Cómo le dices a alguien que no está cumpliendo, sin que se sienta juzgado?'],
    ['tono', '¿Qué NO quieres que diga nunca el EntrenIAdor? Palabras, temas o formas de hablar que no van contigo.'],
    ['filosofia', 'Explica «Tu cuerpo es la consecuencia de cómo vives» como se lo dirías a un alumno nuevo.'],
    ['filosofia', 'Cuando alguien no puede con todo, ¿qué priorizas? Ordena: pasos, entreno, alimentación, sueño…'],
    ['filosofia', '¿Cómo explicas la diferencia entre perder peso y perder grasa?'],
    ['entreno', 'Un alumno te dice «hoy no me da la vida para ir al gimnasio». ¿Qué le respondes?'],
    ['entreno', '«La máquina del programa está ocupada / no la tiene mi gimnasio». ¿Qué criterio sigue para sustituirla?'],
    ['entreno', '«No sé qué peso poner hoy». ¿Cómo le guías?'],
    ['entreno', 'Explica el RIR como se lo explicas a alguien que empieza.'],
    ['entreno', '¿Cuándo y cuánto subes de peso? ¿Qué regla de progresión quieres que siga el alumno?'],
    ['entreno', '«Tengo agujetas fuertes, ¿entreno igual?» ¿Qué respondes?'],
    ['entreno', '«Noto una molestia pequeña al hacer un ejercicio». ¿Hasta dónde puede orientar el EntrenIAdor y cuándo te lo pasa a ti?'],
    ['entreno', '¿Cómo debe ser el calentamiento antes de entrenar según tu método?'],
    ['entreno', '«¿Puedo hacer el entreno en otro orden o juntar dos días?» ¿Qué criterio tienes?'],
    ['entreno', 'Cardio: ¿cuándo zona 1 y cuándo zona 3? ¿Cómo lo explicas fácil?'],
    ['entreno', '«Me voy de viaje / vacaciones y no tengo gimnasio». ¿Qué le dices que haga?'],
    ['entreno', '«¿Puedo hacer otro deporte además del programa (pádel, correr, fútbol)?» ¿Qué respondes?'],
    ['entreno', '¿Cómo explicarías el rest-pause y el dropset en un mensaje corto de WhatsApp?'],
    ['entreno', '«No llego a las repeticiones que me pones». ¿Qué le dices?'],
    ['entreno', '«Me sobra, el peso es muy fácil». ¿Qué le dices?'],
    ['entreno', 'Si se salta una semana entera de entrenos, ¿retoma igual o baja algo?'],
    ['entreno', '¿Qué descanso entre series quieres que respete y qué pasa si se lo salta?'],
    ['entreno', '«Hoy solo tengo 30 minutos». ¿Qué prioriza del entreno?'],
    ['nutricion', '«Hoy como fuera / tengo una boda / cena de empresa». ¿Qué consejos le das?'],
    ['nutricion', '«Me he pasado comiendo el fin de semana». ¿Qué le respondes y qué hace el lunes?'],
    ['nutricion', '«Tengo mucha hambre por la noche». ¿Qué le dices?'],
    ['nutricion', '¿Qué opinas del alcohol durante el proceso y cómo se lo dices al alumno?'],
    ['nutricion', '«¿Puedo cambiar este alimento del plan por otro?» ¿Qué criterio de equivalencias sigue?'],
    ['nutricion', 'Explica las equivalencias visuales (sin báscula) como lo haces tú.'],
    ['nutricion', '«¿Cuántas comidas hago? ¿Puedo saltarme el desayuno?» ¿Cuál es tu criterio?'],
    ['nutricion', 'Picoteo entre horas o ansiedad por el dulce: ¿qué estrategias das?'],
    ['nutricion', '¿Cuánta agua recomiendas y cómo lo explicas?'],
    ['nutricion', 'Proteína: ¿cómo explicas por qué importa y cómo llegar a ella en el día a día?'],
    ['nutricion', '«¿Qué ceno si llego tarde y cansado?» Dame 3 ideas típicas tuyas.'],
    ['nutricion', '«¿Qué como antes y después de entrenar?» ¿Qué respondes?'],
    ['nutricion', 'Suplementos: ¿qué postura tienes? (El EntrenIAdor no recomienda nuevos, pero puede explicar los que ya tiene pautados.)'],
    ['nutricion', '«La báscula ha subido aunque lo hago todo bien». ¿Qué le explicas?'],
    ['nutricion', '«Esta semana no he bajado». ¿Qué le respondes antes de que tú lo revises?'],
    ['habitos', 'Pasos: «no llego a los 10.000». Dame tus trucos favoritos.'],
    ['habitos', 'Sueño: ¿qué recomiendas a quien duerme mal o poco?'],
    ['habitos', 'Estrés y trabajo: ¿cómo ayudas a alguien que va desbordado y lo abandona todo?'],
    ['habitos', '¿Cómo debe registrar el alumno en la app (entrenos, pasos, comidas) y por qué es importante para ti?'],
    ['habitos', 'Check-in de los lunes: ¿para qué sirve y qué esperas que pongan?'],
    ['habitos', '¿Qué le dices a alguien que tiene vergüenza de mandarte fotos o medidas?'],
    ['situaciones', '«Estoy desmotivado, no veo resultados». ¿Qué le respondes?'],
    ['situaciones', '«Me comparo con otros y me frustro». ¿Qué le dices?'],
    ['situaciones', '¿Cómo celebras los logros de un alumno? Pon un ejemplo de mensaje.'],
    ['situaciones', 'Mujeres y ciclo menstrual: ¿cómo adaptas entreno o alimentación y qué puede decir el EntrenIAdor?'],
    ['situaciones', 'Personas +55 o con patologías: ¿qué precauciones quieres que tenga siempre el EntrenIAdor?'],
    ['situaciones', 'Embarazo, lactancia, medicación o analíticas: ¿qué mensaje exacto quieres que dé antes de pasártelo?'],
    ['futbol', 'Futbolista el día antes del partido: ¿qué le recomiendas (entreno, comida, descanso)?'],
    ['futbol', 'Futbolista el día después del partido: ¿qué hace para recuperar?'],
    ['futbol', '«He jugado 90 minutos y mañana me toca fuerza». ¿Qué le dices?'],
    ['futbol', 'En el check-in diario de los futbolistas, ¿qué señales (sueño, fatiga, molestias) quieres que te avise?'],
    ['futbol', 'Comidas en concentración o viaje con el equipo: ¿qué consejos das?'],
    ['futbol', '¿Cambia tu tono con los futbolistas respecto al resto de alumnos? ¿Cómo les hablas?'],
    ['app', 'Explica en dos frases cómo registrar un entreno y el registro diario en la app.'],
    ['app', '«No me deja subir la foto / no me carga». ¿Qué pasos le da antes de escribirte?'],
    ['app', '«¿Dónde veo mi plan de alimentación o mis medidas?» ¿Qué le indica?'],
    ['proceso', '¿Cómo funcionan las revisiones mensuales y qué preparas en ellas?'],
    ['proceso', 'Presenciales: ¿qué debe saber el alumno de la norma de cancelación de 24 h?'],
    ['proceso', '«¿Cuánto falta para terminar mi bloque? ¿Qué pasa después?» ¿Qué le explica?'],
    ['limites', '¿Qué temas quieres que te pase SIEMPRE a ti, aunque parezcan sencillos?'],
    ['limites', '¿Cuánto tardas en responder normalmente? ¿Qué debe decir el EntrenIAdor sobre eso?'],
    ['limites', 'Si un alumno pregunta por otro alumno o por precios, ¿qué responde?'],
    ['casos', 'Un error típico de tus alumnos al empezar y cómo lo corriges.'],
    ['casos', '¿Qué ejercicio explicas más veces y qué claves técnicas das siempre?'],
    ['casos', '¿Qué le dices a alguien que quiere resultados en 2 semanas para un evento?'],
    ['casos', 'Recomposición en hombres: ¿qué mensaje clave repites?'],
    ['casos', 'Recomposición en mujeres: ¿qué mensaje clave repites?'],
    ['casos', '¿Qué le dices a alguien que tiene miedo a «ponerse grande» con la fuerza?'],
    ['casos', '¿Cómo explicas que la fuerza es el «chasis» y que no basta con cardio?'],
    ['casos', '«¿Hago abdominales para quitar la tripa?» ¿Qué respondes?'],
    ['casos', '«¿Puedo entrenar si estoy resfriado o con fiebre?» ¿Qué respondes?'],
    ['ejemplos', 'Escribe cómo contestarías: «Jesús, ¿me mandas otro entreno que me aburro?»'],
    ['ejemplos', 'Escribe cómo contestarías: «Esta semana no voy a poder cumplir nada».'],
    ['ejemplos', 'Escribe cómo contestarías: «Gracias por todo, estoy muy contento».'],
    ['filosofia', '¿Qué idea te gustaría que cada alumno se llevara grabada de trabajar contigo?'],
    ['filosofia', '¿Qué te diferencia de otros entrenadores? (para que lo transmita sin venderse)'],
    ['filosofia', '¿Te apoyas en algún libro, autor o referencia que pueda citar?'],
    ['revision', 'Lee alguna conversación reciente del EntrenIAdor: ¿qué cambiarías en general de su forma de responder?'],
    ['revision', '¿Sus respuestas son largas, cortas, formales…? Dame una regla de longitud y estilo.'],
    ['revision', '¿Qué está haciendo bien y quieres que mantenga?'],
    ['ejemplos', 'Pega un mensaje real tuyo de WhatsApp a un alumno que te guste cómo quedó (sin datos personales).'],
    ['ejemplos', 'Otro mensaje real tuyo, de un tema distinto (alimentación, motivación…).'],
    ['ejemplos', '¿Qué pregunta te hacen tus alumnos que no sale en este plan? Escríbela con tu respuesta.'],
  ].map(([cat, p], i) => ({ id: 'p' + String(i + 1).padStart(2, '0'), cat, p }));
  const CAT = { tono: 'Tu forma de hablar', filosofia: 'Filosofía', entreno: 'Entrenamiento', nutricion: 'Nutrición', habitos: 'Hábitos', situaciones: 'Situaciones', futbol: 'Futbolistas', app: 'Uso de la app', proceso: 'Tu proceso', limites: 'Límites', casos: 'Casos', ejemplos: 'Ejemplos tuyos', revision: 'Revisión', chat: 'Aprendido en el chat', libre: 'Libre' };

  /* ---------- Botón flotante ---------- */
  function vFab(coach) {
    if (coach) {
      if (S.iaCoach || S.editor || S.obj || S.factura || S.perfil?.rol !== 'coach') return '';
      if (st.resumen === undefined) cargarResumen();
      const n = st.resumen?.pend || 0;
      return `<button class="ia-fab" data-act="ia" data-op="abrirCoach" aria-label="Abrir tu ${NOMBRE}">${ICO}${n ? `<span class="n">${n}</span>` : ''}</button>`;
    }
    if (!activo() || S.ia || (S.dia && S.tab === 'entreno') || (typeof Temperamento !== 'undefined' && Temperamento.activo())) return '';
    return `<button class="ia-fab" data-act="ia" data-op="abrir" aria-label="Preguntar al ${NOMBRE}">${ICO}</button>`;
  }
  async function cargarResumen() {
    st.resumen = null;
    const [p, h] = await Promise.all([
      sb.from('ia_mensajes').select('id', { count: 'exact', head: true }).eq('canal', 'alumno').eq('rol', 'ia').eq('visto', false).or('derivar.eq.true,valoracion.eq.-1'),
      sb.from('ia_conocimiento').select('id,pregunta_id,creado_at').not('pregunta_id', 'is', null),
    ]);
    if (p.error || h.error) { st.resumen = { err: true, pend: 0, hoy: 0, hechas: 0 }; return; }
    const hoy = hoyISO();
    st.resumen = { pend: p.count || 0, hoy: (h.data || []).filter(x => diaDe(x.creado_at) === hoy).length, hechas: (h.data || []).length };
    render();
  }

  /* ---------- Alumno ---------- */
  function vEntrada() {
    if (!activo()) return '';
    return `<section class="section"><button class="card row" data-act="ia" data-op="abrir" style="gap:12px;align-items:center;width:100%;text-align:left;cursor:pointer;border:1px solid #a855f7">
      <span class="ia-ico">${ICO}</span><div class="grow"><b>${NOMBRE}</b><div class="small muted">Dudas pequeñas del día a día, al momento. Es una IA con los conocimientos de Jesús.</div></div><span class="pill" style="background:#a855f7;color:#fff">Preguntar</span></button></section>`;
  }
  async function cargar() {
    const { data, error } = await sb.from('ia_mensajes').select('id,rol,texto,derivar,valoracion,creado_at').eq('alumno_id', S.user.id).eq('canal', 'alumno').order('id', { ascending: false }).limit(60);
    st.msgs = (data || []).reverse(); st.error = error ? 'Falta ejecutar el Bloque 72 en Supabase.' : '';
  }
  const cabecera = (titulo, sub) => `<section class="stack"><button class="btn sm ghost" data-act="ia" data-op="cerrar" style="align-self:flex-start">← Volver</button>
      <div class="row" style="gap:10px;align-items:center"><span class="ia-ico grande">${ICO}</span><div class="grow"><span class="eyebrow">${sub}</span><h1 style="margin:0">${titulo}</h1></div></div></section>`;
  function vChat() {
    const wa = S.whatsapp ? waCon('') : null, cab = cabecera(NOMBRE, 'Asistente de IA de Jesús');
    if (!S.perfil.ia_acepta_at) return cab + `<section class="section"><div class="card stack">
      <p>Hola, soy el <b>${NOMBRE}</b>: una <b>inteligencia artificial</b> entrenada con los conocimientos, la metodología y la forma de trabajar de Jesús. <b>No soy Jesús.</b></p>
      <p class="small">Estoy para las dudas pequeñas del día a día (entreno, alimentación, hábitos, uso de la app) y te respondo al momento. Para darte respuestas a tu medida leo tu programa y tus registros de la app y los envío a un servicio de IA externo (Anthropic) solo para generar la respuesta. Jesús puede leer las conversaciones para mejorar el asistente.</p>
      <p class="small">No sustituyo a Jesús: en temas de salud, dolor o cambios de plan te mandaré con él, y siempre puedes escribirle por WhatsApp. Usarme es voluntario.</p>
      <button class="btn full" data-act="ia" data-op="aceptar">Entendido, quiero usarlo</button><button class="btn ghost full" data-act="ia" data-op="cerrar">Ahora no</button></div></section>`;
    if (!st.msgs) { cargar().then(() => { render(); bajar(); }); return cab + '<div class="empty">Cargando…</div>'; }
    const l = st.msgs;
    const burbuja = (m, i) => m.rol === 'alumno'
      ? `<div class="ia-msg yo">${html(m.texto)}</div>`
      : `<div class="ia-msg ia">${html(m.texto)}
          <div class="row" style="gap:6px;flex-wrap:wrap;margin-top:8px">${m.id ? `<button class="pill ${m.valoracion === 1 ? 'gold' : ''}" data-act="ia" data-op="valorar" data-id="${m.id}" data-v="1" aria-label="Me ha servido">👍</button><button class="pill ${m.valoracion === -1 ? 'gold' : ''}" data-act="ia" data-op="valorar" data-id="${m.id}" data-v="-1" aria-label="No me ha servido">👎</button>` : ''}
          ${(m.derivar || m.valoracion === -1) && wa ? `<a class="pill gold" href="${esc(waCon(preguntaDe(l, i)))}" target="_blank" rel="noopener">💬 Hablar con Jesús</a>` : ''}</div></div>`;
    return cab + `<section class="section"><div class="ia-chat" id="ia-chat">
        ${!l.length ? `<div class="ia-msg ia">¡Hola${S.perfil.nombre ? ' ' + esc(S.perfil.nombre.split(' ')[0]) : ''}! Soy el ${NOMBRE}, la IA de Jesús. Pregúntame lo que quieras del día a día: un ejercicio, cómo cuadrar una comida, qué hacer si hoy no puedes entrenar…</div>` : ''}
        ${l.map(burbuja).join('')}
        ${st.enviando ? '<div class="ia-msg ia muted">Pensando…</div>' : ''}
      </div>${st.error ? `<p class="err">${esc(st.error)}</p>` : ''}
      <form id="ia-form" class="row ia-form" style="gap:8px;margin-top:10px"><textarea id="ia-txt" rows="2" class="grow" placeholder="Escribe tu duda…" maxlength="2000" ${st.enviando ? 'disabled' : ''}></textarea><button class="btn" type="submit" ${st.enviando ? 'disabled' : ''}>Enviar</button></form>
      ${wa ? `<a class="btn ghost full" style="margin-top:10px" href="${esc(wa)}" target="_blank" rel="noopener">💬 Prefiero hablar con Jesús por WhatsApp</a>` : ''}
      <p class="note">Respuestas generadas por IA con los criterios de Jesús. Pueden equivocarse: ante cualquier duda de salud, habla con él.</p></section>`;
  }
  const bajar = () => { const c = $('#ia-chat'); if (c) c.lastElementChild?.scrollIntoView({ block: 'end' }); };
  async function llamar(body) {
    const { data, error } = await sb.functions.invoke('asistente', { body });
    let msg = data?.error;
    if (error) { try { msg = (await error.context?.json())?.error; } catch (_) {} msg = msg || (/fetch|network|Failed to send/i.test(error.message || '') ? 'No encuentro la función «asistente» en Supabase o no hay conexión.' : 'No he podido responder ahora. Inténtalo en un momento.'); }
    return { data, msg };
  }
  async function enviar(texto) {
    texto = texto.trim(); if (!texto || st.enviando) return;
    st.msgs.push({ rol: 'alumno', texto }); st.enviando = true; st.error = ''; render(); bajar();
    try { const { data, msg } = await llamar({ mensaje: texto }); st.msgs.pop(); if (msg) st.error = msg; else st.msgs.push(...(data.mensajes || [])); }
    catch (err) { st.msgs.pop(); st.error = 'Sin conexión. Inténtalo de nuevo.'; }
    st.enviando = false; render(); bajar();
    if (st.error && $('#ia-txt')) $('#ia-txt').value = texto;
  }

  /* ---------- Coach: bandeja, preguntas diarias y chat propio ---------- */
  async function cargarPanel() {
    const desde = new Date(Date.now() - 30 * 864e5).toISOString();
    const [m, k, c] = await Promise.all([
      sb.from('ia_mensajes').select('id,alumno_id,rol,texto,derivar,valoracion,visto,correccion,creado_at').eq('canal', 'alumno').gte('creado_at', desde).order('id').limit(1500),
      sb.from('ia_conocimiento').select('*').order('id'),
      sb.from('ia_mensajes').select('id,rol,texto,creado_at').eq('alumno_id', S.user.id).eq('canal', 'coach').order('id', { ascending: false }).limit(60),
    ]);
    if (m.error || k.error || c.error) { st.coach = { err: true }; return; }
    const ult = {}, pend = [];
    for (const x of m.data || []) {
      if (x.rol === 'alumno') ult[x.alumno_id] = x.texto;
      else if (!x.visto && (x.derivar || x.valoracion === -1)) pend.push({ ...x, pregunta: ult[x.alumno_id] || '' });
    }
    st.coach = { pend: pend.reverse(), conoc: k.data || [], chat: (c.data || []).reverse() };
  }
  function cola() {
    const hechas = new Set((st.coach?.conoc || []).map(x => x.pregunta_id).filter(Boolean)), salta = lsGet('lof-ia-salta', []);
    const l = PREG.filter(q => !hechas.has(q.id));
    return [...l.filter(q => !salta.includes(q.id)), ...l.filter(q => salta.includes(q.id))];
  }
  function vCoach() {
    const cab = cabecera('Tu ' + NOMBRE, 'Asistente de IA · solo lo ves tú');
    if (!st.coach) { cargarPanel().then(render); return cab + '<div class="empty">Cargando…</div>'; }
    if (st.coach.err) return cab + '<section class="section"><div class="card">Falta ejecutar el <b>Bloque 72</b> (versión nueva) en Supabase.</div></section>';
    const { pend, conoc, chat } = st.coach, hoy = hoyISO();
    const hechas = conoc.filter(x => x.pregunta_id).length, hoyN = conoc.filter(x => x.pregunta_id && diaDe(x.creado_at) === hoy).length;
    const q = cola(), cuantas = st.mas ? 3 : Math.max(0, 3 - hoyN), lista = q.slice(0, cuantas);
    const bandeja = `<section class="section"><div class="section-head"><h2>Para ti${pend.length ? ` · ${pend.length}` : ''}</h2></div>
      ${pend.length ? pend.map(x => `<div class="card stack" style="gap:6px;margin-bottom:10px">
        <div class="row small"><b class="grow">${esc(nomAl(x.alumno_id))}</b><span class="muted">${esc(fHora(x.creado_at))}</span></div>
        <div class="row" style="gap:6px;flex-wrap:wrap">${x.derivar ? '<span class="pill" style="color:var(--warn)">Te la ha pasado a ti</span>' : ''}${x.valoracion === -1 ? '<span class="pill" style="color:var(--bad)">👎 No le sirvió</span>' : ''}</div>
        ${x.pregunta ? `<div class="ia-msg yo small" style="max-width:100%">${html(x.pregunta)}</div>` : ''}
        <details><summary class="small muted">Lo que respondió el ${NOMBRE}</summary><div class="ia-msg ia small" style="max-width:100%;margin-top:6px">${html(x.texto)}</div></details>
        <div class="row" style="gap:6px;flex-wrap:wrap"><a class="btn sm" href="https://wa.me/?text=${encodeURIComponent('Hola ' + nomAl(x.alumno_id).split(' ')[0] + ', he visto tu pregunta al ' + NOMBRE + ': ')}" target="_blank" rel="noopener">💬 WhatsApp</a>
          <button class="btn sm ghost" data-act="ia" data-op="corregir" data-id="${x.id}" data-al="${x.alumno_id}" data-desde="coach">✎ Cómo lo habría dicho yo</button>
          <button class="btn sm ghost" data-act="ia" data-op="verChat" data-id="${x.alumno_id}">Ver conversación</button>
          <button class="btn sm ghost" data-act="ia" data-op="resuelta" data-id="${x.id}">✓ Resuelta</button></div></div>`).join('')
        : '<div class="card small muted">Nada pendiente: no hay consultas derivadas ni respuestas con 👎 sin revisar.</div>'}</section>`;
    const plan = `<section class="section"><div class="section-head"><h2>Entrénalo · hoy</h2><span class="small muted">${hechas}/${PREG.length} · día ${Math.min(30, Math.floor(hechas / 3) + 1)} de 30</span></div>
      <div class="ia-barra"><i style="width:${Math.round(hechas / PREG.length * 100)}%"></i></div>
      ${!q.length ? `<div class="card small">✅ Plan de 30 días completado. Sigue enseñándole desde el chat de abajo («apunta que…») o corrigiendo respuestas de la bandeja.</div>`
        : !lista.length ? `<div class="card row" style="gap:10px;align-items:center"><span class="grow small">✅ Hoy ya le has enseñado ${hoyN} cosas. Mañana te esperan 3 preguntas nuevas.</span><button class="btn sm ghost" data-act="ia" data-op="mas">Responder más</button></div>`
        : lista.map(x => `<div class="card stack" style="gap:8px;margin-bottom:10px"><span class="eyebrow">${esc(CAT[x.cat] || x.cat)}</span><b>${esc(x.p)}</b>
          <textarea id="iaq-${x.id}" data-borr="${x.id}" rows="4" placeholder="Contesta como si se lo explicaras a un alumno. Puedes dictar con el micrófono del teclado.">${esc((st.borr || {})[x.id] || '')}</textarea>
          <div class="row" style="gap:8px"><button class="btn sm" data-act="ia" data-op="respQ" data-id="${x.id}">Guardar</button><button class="btn sm ghost" data-act="ia" data-op="saltaQ" data-id="${x.id}">Saltar</button></div></div>`).join('')}
      <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn sm ghost" data-act="ia" data-op="saber">📚 Lo que sabe (${conoc.length})</button><button class="btn sm ghost" data-act="ia" data-op="criterios">✎ Criterios y tono</button></div></section>`;
    const sug = ['¿Qué han preguntado mis alumnos esta semana?', '¿Qué dudas se repiten más?', '¿Hay algún alumno que te preocupe?', 'Hazme 5 preguntas para conocerme mejor'];
    const chatH = `<section class="section"><h2>Habla con tu ${NOMBRE}</h2><p class="small muted" style="margin-top:-4px">Pregúntale por las conversaciones de tus alumnos, pídele borradores de respuesta o enséñale: «apunta que…».</p>
      <div class="ia-chat" id="ia-chat">${chat.map(m => `<div class="ia-msg ${m.rol === 'ia' ? 'ia' : 'yo'}">${html(m.texto)}</div>`).join('')}${st.cEnviando ? '<div class="ia-msg ia muted">Pensando…</div>' : ''}</div>
      ${!chat.length ? `<div class="row" style="gap:6px;flex-wrap:wrap;margin-top:8px">${sug.map(t => `<button class="pill" data-act="ia" data-op="sugerir" data-t="${esc(t)}">${esc(t)}</button>`).join('')}</div>` : ''}
      ${st.cError ? `<p class="err">${esc(st.cError)}</p>` : ''}
      <form id="ia-cform" class="row ia-form" style="gap:8px;margin-top:10px"><textarea id="ia-ctxt" rows="2" class="grow" placeholder="Escribe al ${NOMBRE}…" maxlength="4000" ${st.cEnviando ? 'disabled' : ''}></textarea><button class="btn" type="submit" ${st.cEnviando ? 'disabled' : ''}>Enviar</button></form></section>`;
    return cab + bandeja + plan + chatH;
  }
  async function enviarCoach(texto) {
    texto = texto.trim(); if (!texto || st.cEnviando) return;
    st.coach.chat.push({ rol: 'coach', texto }); st.cEnviando = true; st.cError = ''; render(); bajar();
    try {
      const { data, msg } = await llamar({ mensaje: texto, modo: 'coach' });
      st.coach.chat.pop();
      if (msg) st.cError = msg; else { st.coach.chat.push(...(data.mensajes || [])); if (data.aprendido) { toast(`Apuntado: ${data.aprendido} ${data.aprendido === 1 ? 'cosa nueva' : 'cosas nuevas'}`); const k = await sb.from('ia_conocimiento').select('*').order('id'); if (!k.error) st.coach.conoc = k.data || []; } }
    } catch (err) { st.coach.chat.pop(); st.cError = 'Sin conexión. Inténtalo de nuevo.'; }
    st.cEnviando = false; render(); bajar();
    if (st.cError && $('#ia-ctxt')) $('#ia-ctxt').value = texto;
  }
  function vTarjetaCoach() {
    if (st.resumen === undefined) cargarResumen();
    const r = st.resumen; if (!r) return '';
    const faltan = r.err ? 0 : r.hechas >= PREG.length ? 0 : Math.max(0, 3 - r.hoy);
    const txt = r.err ? 'Falta ejecutar el Bloque 72 en Supabase' : [faltan ? `${faltan} ${faltan === 1 ? 'pregunta' : 'preguntas'} de hoy para enseñarle` : 'Preguntas de hoy hechas ✓', r.pend ? `${r.pend} ${r.pend === 1 ? 'consulta' : 'consultas'} para ti` : ''].filter(Boolean).join(' · ');
    return `<section class="section"><button class="card row" data-act="ia" data-op="abrirCoach" style="gap:12px;align-items:center;width:100%;text-align:left;cursor:pointer;border:1px solid #a855f7">
      <span class="ia-ico">${ICO}</span><div class="grow"><b>Entrena al ${NOMBRE}</b><div class="small muted">${txt}</div></div>${r.pend ? `<span class="pill" style="background:var(--bad,#e11d48);color:#fff">${r.pend}</span>` : ''}</button></section>`;
  }
  function verSaber() {
    const l = (st.coach?.conoc || []).slice().reverse();
    abrirSheet(`<div class="stack"><h2>📚 Lo que sabe el ${NOMBRE}</h2><p class="small muted">Todo esto lo usa para responder a tus alumnos. Corrígelo o bórralo cuando quieras.</p>
      <form class="card stack" id="f-ial"><b class="small">＋ Añadir algo que deba saber</b><textarea id="ial-t" rows="3" placeholder="Ej. A los futbolistas nunca les pongo pierna pesada 48 h antes del partido."></textarea><button class="btn sm" style="align-self:flex-start">Añadir</button></form>
      ${l.map(x => `<details class="card"><summary class="stack" style="gap:2px"><span class="eyebrow">${esc(CAT[x.categoria] || x.categoria || '')}</span><span class="small"><b>${esc(x.pregunta || 'Apunte')}</b></span><span class="small muted">${esc((x.respuesta || '').slice(0, 120))}${(x.respuesta || '').length > 120 ? '…' : ''}</span></summary>
        <textarea data-k="${x.id}" rows="5" style="margin-top:8px">${esc(x.respuesta || '')}</textarea><div class="row" style="gap:8px;margin-top:6px"><button class="btn sm" data-act="ia" data-op="saberGuarda" data-id="${x.id}">Guardar</button><button class="btn sm ghost" style="color:var(--bad)" data-act="ia" data-op="saberBorra" data-id="${x.id}">Borrar</button></div></details>`).join('') || '<div class="empty">Aún no sabe nada tuyo: empieza por las preguntas de hoy.</div>'}
      <button class="btn ghost full" data-act="cerrarSheet">Cerrar</button></div>`);
    $('#f-ial').addEventListener('submit', async e => {
      e.preventDefault(); const t = $('#ial-t').value.trim(); if (!t) return;
      const { error } = await sb.from('ia_conocimiento').insert({ categoria: 'libre', respuesta: t }); if (error) return fallo(error);
      await cargarPanel(); verSaber(); render(); toast('Añadido');
    });
  }

  document.addEventListener('submit', e => {
    if (e.target.id === 'ia-form') { e.preventDefault(); enviar($('#ia-txt').value); }
    if (e.target.id === 'ia-cform') { e.preventDefault(); enviarCoach($('#ia-ctxt').value); }
  });
  document.addEventListener('input', e => { const k = e.target.dataset?.borr; if (k) (st.borr ||= {})[k] = e.target.value; });
  document.addEventListener('keydown', e => {
    if ((e.target.id === 'ia-txt' || e.target.id === 'ia-ctxt') && e.key === 'Enter' && !e.shiftKey && matchMedia('(pointer:fine)').matches) { e.preventDefault(); e.target.id === 'ia-txt' ? enviar(e.target.value) : enviarCoach(e.target.value); }
  });

  /* ---------- Coach: ficha del alumno ---------- */
  function vFicha(f, a) {
    const n = f.ia;
    return `<section class="section"><div class="section-head"><h2>${ICO} ${NOMBRE}</h2><label class="row small" style="gap:8px"><input type="checkbox" data-act="ia" data-op="activar" data-id="${a.id}" ${a.ia_activa ? 'checked' : ''} style="width:20px;height:20px"> Activado</label></div>
      <div class="card stack">${a.ia_activa ? `<div class="small muted">${a.ia_acepta_at ? 'Ha aceptado usarlo' : 'Aún no lo ha abierto ni aceptado'}${n ? ` · ${n.total} mensajes${n.derivadas ? ` · <b style="color:var(--warn)">${n.derivadas} derivadas a ti</b>` : ''}${n.malas ? ` · <b style="color:var(--bad)">${n.malas} 👎</b>` : ''}` : ''}</div>` : '<div class="small muted">Desactivado: el alumno no ve el asistente.</div>'}
        <div class="row" style="gap:8px;flex-wrap:wrap">${n?.total ? `<button class="btn sm" data-act="ia" data-op="verChat" data-id="${a.id}">Ver conversación${n.sinVer ? ` (${n.sinVer} nuevas)` : ''}</button>` : ''}<button class="btn sm ghost" data-act="ia" data-op="abrirCoach">${ICO} Tu ${NOMBRE}</button></div></div></section>`;
  }
  async function cargarFicha(f) {
    const { data, error } = await sb.from('ia_mensajes').select('id,rol,derivar,valoracion,visto').eq('alumno_id', f.id).eq('canal', 'alumno');
    if (error) { f.ia = null; return; }
    const l = data || [];
    f.ia = { total: l.length, sinVer: l.filter(m => m.rol === 'ia' && !m.visto).length, derivadas: l.filter(m => m.derivar && !m.visto).length, malas: l.filter(m => m.valoracion === -1 && !m.visto).length };
  }
  async function verChat(aid) {
    const { data, error } = await sb.from('ia_mensajes').select('*').eq('alumno_id', aid).eq('canal', 'alumno').order('id', { ascending: false }).limit(120);
    if (error) return fallo(error, 'Falta ejecutar el Bloque 72 en Supabase.');
    const l = (data || []).reverse();
    abrirSheet(`<div class="stack"><h2>${ICO} ${esc(nomAl(aid))} · conversación</h2><div class="ia-chat">${l.map(m => m.rol === 'alumno' ? `<div class="ia-msg yo">${html(m.texto)}<div class="small" style="opacity:.7">${esc(fHora(m.creado_at))}</div></div>`
      : `<div class="ia-msg ia ${!m.visto ? 'nuevo' : ''}">${html(m.texto)}
          <div class="row small" style="gap:6px;flex-wrap:wrap;margin-top:6px">${m.derivar ? '<span class="pill" style="color:var(--warn)">Derivada a ti</span>' : ''}${m.valoracion === 1 ? '<span class="pill">👍</span>' : m.valoracion === -1 ? '<span class="pill" style="color:var(--bad)">👎</span>' : ''}</div>
          ${m.correccion ? `<div class="aprox small" style="margin-top:6px"><b>Cómo lo dirías tú:</b> ${html(m.correccion)}</div>` : ''}
          <button class="btn sm ghost" data-act="ia" data-op="corregir" data-id="${m.id}" data-al="${aid}" style="margin-top:6px">✎ ${m.correccion ? 'Cambiar' : 'Cómo lo habría dicho yo'}</button></div>`).join('') || '<div class="empty">Sin mensajes.</div>'}</div>
      <button class="btn ghost full" data-act="cerrarSheet">Cerrar</button></div>`);
    const ids = l.filter(m => !m.visto).map(m => m.id);
    if (ids.length) { await sb.from('ia_mensajes').update({ visto: true }).in('id', ids); if (S.ficha?.id === aid) await cargarFicha(S.ficha); refrescarCoach(false); }
  }
  async function refrescarCoach(pintar = true) { st.resumen = undefined; if (S.iaCoach) await cargarPanel(); if (pintar) render(); }
  async function corregir(id, aid, desde) {
    const { data } = await sb.from('ia_mensajes').select('texto,correccion').eq('id', id).single();
    abrirSheet(`<form class="stack" id="f-iac"><h2>Cómo lo habría dicho yo</h2><div class="ia-msg ia small">${html(data?.texto)}</div>
      <label class="f">Tu respuesta (el ${NOMBRE} aprenderá tu criterio y tu tono)<textarea id="iac-t" rows="6">${esc(data?.correccion || '')}</textarea></label>
      <button class="btn full">Guardar</button>${desde === 'coach' ? '<button type="button" class="btn ghost full" data-act="cerrarSheet">Cancelar</button>' : `<button type="button" class="btn ghost full" data-act="ia" data-op="verChat" data-id="${aid}">Volver a la conversación</button>`}</form>`);
    $('#f-iac').addEventListener('submit', async e => {
      e.preventDefault();
      const { error } = await sb.from('ia_mensajes').update({ correccion: $('#iac-t').value.trim() || null, visto: true }).eq('id', id);
      if (error) return fallo(error); toast('Guardado: lo usará como ejemplo');
      if (desde === 'coach') { cerrarSheet(); refrescarCoach(); } else verChat(aid);
    });
  }
  async function criterios() {
    const { data } = await sb.from('ajustes_privados').select('valor').eq('clave', 'ia_instrucciones').maybeSingle();
    abrirSheet(`<form class="stack" id="f-iai"><h2>Criterios y tono del ${NOMBRE}</h2>
      <p class="small muted">Tu metodología y tu forma de responder, como se lo explicarías a un entrenador nuevo de tu equipo. Sirve para todos los alumnos.</p>
      <textarea id="iai-t" rows="18" style="font-size:14px">${esc(data?.valor || '')}</textarea>
      <label class="row small" style="gap:8px"><input type="checkbox" id="iai-yo" ${S.perfil.ia_activa ? 'checked' : ''} style="width:20px;height:20px"> Activarlo también para mí (vista «Yo»), para probarlo como alumno</label>
      <button class="btn full">Guardar</button><button type="button" class="btn ghost full" data-act="cerrarSheet">Cancelar</button></form>`);
    $('#f-iai').addEventListener('submit', async e => {
      e.preventDefault();
      const { error } = await sb.from('ajustes_privados').upsert({ clave: 'ia_instrucciones', valor: $('#iai-t').value.trim() }, { onConflict: 'clave' });
      if (error) return fallo(error);
      const yo = $('#iai-yo').checked; if (yo !== !!S.perfil.ia_activa) { const r = await sb.from('perfiles').update({ ia_activa: yo }).eq('id', S.user.id); if (r.error) return fallo(r.error, 'Falta ejecutar el Bloque 72 en Supabase.'); S.perfil.ia_activa = yo; }
      cerrarSheet(); toast('Criterios guardados');
    });
  }

  async function accion(b) {
    const op = b.dataset.op;
    if (op === 'abrir') { S.ia = true; st.msgs = null; render(); window.scrollTo(0, 0); }
    else if (op === 'cerrar') { S.ia = false; S.iaCoach = false; st.resumen = undefined; render(); window.scrollTo(0, 0); }
    else if (op === 'abrirCoach') { cerrarSheet(); S.iaCoach = true; S.ficha = null; S.editor = null; st.coach = null; st.mas = false; render(); window.scrollTo(0, 0); }
    else if (op === 'aceptar') { const { error } = await sb.rpc('ia_aceptar'); if (error) return fallo(error, 'Falta ejecutar el Bloque 72 en Supabase.'); S.perfil.ia_acepta_at = new Date().toISOString(); render(); }
    else if (op === 'valorar') {
      const id = +b.dataset.id, m = st.msgs?.find(x => x.id === id), v = +b.dataset.v === m?.valoracion ? null : +b.dataset.v;
      const { error } = await sb.rpc('ia_valorar', { p_id: id, p_v: v }); if (error) return fallo(error);
      if (m) m.valoracion = v; render(); if (v === -1) toast(S.whatsapp ? 'Gracias. Si quieres, háblalo con Jesús con el botón' : 'Gracias, Jesús lo revisará');
    }
    else if (op === 'activar') {
      const a = S.c.perfiles.find(x => x.id === b.dataset.id), on = b.checked;
      const { error } = await sb.from('perfiles').update({ ia_activa: on }).eq('id', b.dataset.id);
      if (error) { b.checked = !on; return fallo(error, 'Falta ejecutar el Bloque 72 en Supabase.'); }
      if (a) a.ia_activa = on; if (b.dataset.id === S.user.id) S.perfil.ia_activa = on;
      toast(on ? `${NOMBRE} activado` : `${NOMBRE} desactivado`); render();
    }
    else if (op === 'verChat') verChat(b.dataset.id);
    else if (op === 'corregir') corregir(+b.dataset.id, b.dataset.al, b.dataset.desde);
    else if (op === 'criterios') criterios();
    else if (op === 'resuelta') { const { error } = await sb.from('ia_mensajes').update({ visto: true }).eq('id', +b.dataset.id); if (error) return fallo(error); toast('Marcada como resuelta'); refrescarCoach(); }
    else if (op === 'respQ') {
      const q = PREG.find(x => x.id === b.dataset.id), t = $('#iaq-' + q.id)?.value.trim(); if (!t) return toast('Escribe tu respuesta');
      b.disabled = true;
      const { error } = await sb.from('ia_conocimiento').insert({ pregunta_id: q.id, categoria: q.cat, pregunta: q.p, respuesta: t });
      if (error) { b.disabled = false; return fallo(error, 'Falta ejecutar el Bloque 72 (versión nueva) en Supabase.'); }
      if (st.borr) delete st.borr[q.id]; toast('Aprendido ✓'); await cargarPanel(); st.resumen = undefined; render();
    }
    else if (op === 'saltaQ') { const l = lsGet('lof-ia-salta', []).filter(x => x !== b.dataset.id); l.push(b.dataset.id); lsSet('lof-ia-salta', l); render(); }
    else if (op === 'mas') { st.mas = true; render(); }
    else if (op === 'saber') verSaber();
    else if (op === 'saberGuarda') { const t = document.querySelector(`textarea[data-k="${b.dataset.id}"]`)?.value.trim(); if (!t) return toast('Escribe algo o bórralo'); const { error } = await sb.from('ia_conocimiento').update({ respuesta: t }).eq('id', +b.dataset.id); if (error) return fallo(error); await cargarPanel(); toast('Guardado'); }
    else if (op === 'saberBorra') { if (!confirm('¿Borrar esto de lo que sabe el ' + NOMBRE + '?')) return; const { error } = await sb.from('ia_conocimiento').delete().eq('id', +b.dataset.id); if (error) return fallo(error); await cargarPanel(); verSaber(); render(); }
    else if (op === 'sugerir') enviarCoach(b.dataset.t);
  }
  return { NOMBRE, ICO, activo, vFab, vEntrada, vChat, vCoach, vTarjetaCoach, vFicha, cargarFicha, accion };
})();
