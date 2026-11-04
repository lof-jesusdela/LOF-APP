/* Cuestionario de estilo de vida y lista de alimentos (preferencias) dentro de la app.
   - El alumno los rellena en su incorporación (y puede corregirlos después). Se guardan en «cuestionarios» (Bloque 83),
     uno por tipo; se pueden dejar a medias («borrador») y se envían a Jesús.
   - Las preguntas son las del formulario de Google de Jesús, con respuestas más rápidas donde ayuda (escalas, horas, opciones).
   - Lo que la app ya sabe (pasos, comidas al día, entrenos por semana) aparece prerrellenado para no preguntarlo dos veces.
   - Las preferencias las usa la calculadora (no propone lo que no le gusta ni sus alergias) y la revisión de coherencia del plan.
   Se carga antes que app.js y usa sus utilidades al ejecutarse. */
'use strict';
const Cuest = (() => {
  const AVISO = 'Falta ejecutar el Bloque 83 en Supabase para guardar el cuestionario.';
  const SINO = ['Sí', 'A veces', 'No'];
  /* [clave, pregunta, tipo, opciones, ayuda]. Tipos: txt, esc (1-10), ops (una), multi (varias), hora, num */
  const ESTILO = [
    ['Tu contexto real', '🧭', [
      ['trabajo', 'Tu trabajo actual', 'ops', ['Presencial', 'Teletrabajo', 'Mixto', 'Por turnos', 'No trabajo ahora']],
      ['trabajo_horario', '¿Qué horario tienes y a qué te dedicas?', 'txt', null, 'Ej. oficina de 8 a 15, de pie todo el día…'],
      ['trabajo_estres', 'Estrés en el trabajo', 'esc'],
      ['convivencia', '¿Con quién vives?', 'multi', ['Solo/a', 'En pareja', 'Con hijos', 'Con familia', 'Piso compartido']],
      ['hijos', 'Si tienes hijos, ¿qué edades tienen?', 'txt'],
      ['energia', 'Tu nivel de energía en el día a día', 'esc'],
      ['empeoro', '¿Desde cuándo sientes que tu estado de forma empeoró?', 'txt']]],
    ['Descanso y ritmos', '💤', [
      ['acostarse', 'Hora habitual de acostarte', 'hora'],
      ['levantarse', 'Hora habitual de levantarte', 'hora'],
      ['sueno_h', 'Horas reales de sueño', 'num', null, 'horas'],
      ['sueno_cal', 'Calidad de tu sueño', 'esc'],
      ['despierta_cansado', '¿Te despiertas cansado/a?', 'ops', SINO],
      ['pantallas', '¿Usas pantallas antes de dormir?', 'ops', ['No', 'Menos de 30 min', '30-60 min', 'Más de 1 hora']],
      ['luz_solar', '¿Te da la luz del sol por las mañanas?', 'ops', SINO],
      ['cena', '¿Cómo suelen ser tus cenas?', 'multi', ['Tarde', 'Pesadas', 'Ligeras', 'Temprano']],
      ['cena_hora', 'Hora habitual de la cena', 'hora']]],
    ['Actividad diaria', '🚶', [
      ['sentado_h', '¿Cuántas horas al día pasas sentado/a?', 'num', null, 'horas'],
      ['pasos', 'Pasos diarios aproximados', 'num', null, 'pasos'],
      ['moverse', '¿Te mueves al margen de los entrenamientos? ¿Cómo?', 'txt'],
      ['dolores', '¿Te sientes rígido/a o con dolores en el día a día?', 'txt']]],
    ['Entrenamiento', '🏋️', [
      ['entreno_frec', '¿Cuántos días a la semana vas a entrenar y qué tipo de entrenamiento?', 'txt'],
      ['entreno_dur', 'Duración media de tus entrenamientos', 'ops', ['30 min', '45 min', '1 hora', '1 h 15', '1 h 30 o más']],
      ['entreno_sensacion', 'Después de entrenar te sientes…', 'ops', ['Con más energía', 'Igual', 'Cansado/a']],
      ['lesiones', 'Historial de lesiones', 'txt', null, 'Qué, cuándo y si te sigue molestando']]],
    ['Alimentación', '🥗', [
      ['comidas', 'Número de comidas al día', 'ops', ['1', '2', '3', '4', '5', '6 o más']],
      ['horarios', 'Tus horarios habituales: hazme una línea temporal de cómo suele ser tu día', 'txt', null, 'Ej. 7:00 café · 10:30 tostada · 14:30 comida · 21:30 cena'],
      ['desayuno', '¿Desayunas? ¿Qué sueles tomar?', 'txt'],
      ['hambre', '¿Comes con hambre real o por horarios o emociones?', 'multi', ['Hambre real', 'Por horario', 'Por emociones', 'Por aburrimiento']],
      ['alimentos', '¿Qué alimentos consumes a diario?', 'txt'],
      ['ultraprocesados', 'Consumo de ultraprocesados', 'ops', ['Bajo', 'Medio', 'Alto']],
      ['alcohol', 'Consumo de alcohol', 'ops', ['Nunca', 'Ocasional', 'Fines de semana', 'Varias veces por semana', 'A diario']],
      ['alcohol_cant', 'Si bebes, ¿qué y cuánto?', 'txt'],
      ['azucar', 'Tu relación con el azúcar (antojos, ansiedad, control)', 'txt']]],
    ['Estrés y sistema nervioso', '🧠', [
      ['estres', 'Nivel de estrés diario', 'esc'],
      ['estres_fuente', 'Principal fuente de estrés', 'txt'],
      ['calma', '¿Tienes momentos de calma real durante el día?', 'ops', SINO],
      ['practicas', '¿Practicas alguna de estas?', 'multi', ['Respiración', 'Meditación', 'Ratos de silencio', 'Ninguna']],
      ['dias_dificiles', '¿Cómo gestionas emocionalmente los días difíciles?', 'txt']]],
    ['Historial corporal', '📈', [
      ['mejor_forma', '¿Cuál y cuándo ha sido tu mejor forma física?', 'txt'],
      ['cambio', '¿Qué crees que ha cambiado desde entonces?', 'txt'],
      ['habitos_mal', '¿Qué hábitos sabes que te están perjudicando hoy?', 'txt'],
      ['recuperar', '¿Qué sería para ti recuperar energía y salud?', 'txt']]]
  ];
  /* Lista de alimentos (la lámina de Jesús). r = alimentos de la calculadora a los que afecta */
  const PREF = [
    ['Carbohidratos', '🌾', [['patata', 'Patata', /^Patata/], ['yuca', 'Yuca', /^Yuca/], ['boniato', 'Boniato', /^Boniato/], ['lenteja', 'Lenteja', /^Lentejas/], ['garbanzo', 'Garbanzo', /^Garbanzos/], ['alubia', 'Alubia', /^Alubias/],
      ['platano', 'Plátano', /^Plátano/], ['datiles', 'Dátiles', /^Dátiles/], ['uvas', 'Uvas', /^Uvas/], ['calabaza', 'Calabaza', /Calabaza/], ['zanahoria', 'Zanahoria', /zanahoria/i], ['otras_frutas', 'Otras frutas', /^(Manzana|Naranja|Pera|Kiwi|Mandarina|Melocotón|Piña|Mango|Sandía|Melón|Cerezas|Fresas|Arándanos|Frambuesas)/],
      ['leche', 'Leche', /^Leche (semi|entera)/], ['kefir', 'Kéfir', /^Kéfir/], ['yogur', 'Yogur griego', /^Yogur griego/], ['cacahuete', 'Cacahuete', /Cacahuete|cacahuete/], ['semillas', 'Otras semillas', /^Semillas/],
      ['maiz', 'Maíz', /^Maíz/], ['arroz_blanco', 'Arroz blanco', /^Arroz blanco/], ['arroz_integral', 'Arroz integral', /^Arroz integral/], ['pan', 'Pan integral', /^Pan /], ['pasta', 'Pasta (todas sus formas) y ñoquis', /^Pasta|^Ñoquis/],
      ['miel', 'Miel', /^Miel/], ['avena', 'Avena', /avena/i], ['quinoa', 'Quinoa', /^Quinoa/]]],
    ['Proteínas', '🍗', [['pollo', 'Pollo', /^Pollo/], ['ternera', 'Ternera', /^Ternera/], ['cerdo', 'Cerdo (jamón y cecina)', /cerdo|^Jamón|^Cecina/i], ['cordero', 'Cordero', /^Cordero/],
      ['pescado_azul', 'Pescado azul (salmón, atún, caballa…)', /^(Salmón|Atún|Caballa|Otros pescados azules)/], ['marisco', 'Mariscos y moluscos', /^(Gambas|Marisco|Calamar|Otros moluscos)/], ['pescado_blanco', 'Pescado blanco', /^Pescado blanco/],
      ['clara', 'Huevo (clara)', /^Claras/], ['legumbres', 'Lenteja, garbanzo y alubia', /^(Lentejas|Garbanzos|Alubias)/], ['cacao', 'Cacao 100 %', /^Cacao/], ['soja', 'Soja, edamame o guisante', /^(Soja|Edamame|Guisantes|Tofu)/], ['lacteos_p', 'Leche, kéfir o yogur griego', /^(Leche|Kéfir|Yogur|Queso fresco)/]]],
    ['Grasas', '🥑', [['aove', 'Aceite de oliva virgen extra y aceitunas', /^(Aceite de oliva|Aceitunas)/], ['coco', 'Aceite de coco, leche de coco y coco', /coco/i], ['aguacate', 'Aguacate y guacamole', /^(Aguacate|Guacamole)/],
      ['lacteos_g', 'Queso, leche, kéfir o yogur griego (no desnatados)', /^(Queso curado|Queso semicurado|Mozzarella|Gouda|Leche entera|Yogur griego|Kéfir)/], ['bacon', 'Bacon', /^Bacon/], ['frutos_secos', 'Frutos secos y semillas', /^(Nueces|Almendras|Frutos secos|Pistachos|Anacardos|Avellanas|Semillas|Cacahuetes)/],
      ['yema', 'Huevo (yema)', /^Huevo entero/], ['mantequilla', 'Mantequilla 100 %', /^Mantequilla/], ['higado_pescado', 'Hígado de pescado', /^Hígado de bacalao/], ['higado_ternera', 'Hígado de ternera', /^Hígado de ternera/], ['cremas', 'Cremas de frutos secos', /^Crema de/]]]
  ];
  const ALERGIAS = [['gluten', 'Gluten', /^(Pan|Pasta|Cuscús|Copos de avena|Tortilla de trigo|Ñoquis)/], ['lactosa', 'Lactosa', /^(Leche|Kéfir|Yogur|Queso|Mozzarella|Gouda|Mantequilla)/], ['frutos_secos', 'Frutos secos', /^(Nueces|Almendras|Frutos secos|Pistachos|Anacardos|Avellanas|Crema de pistacho)/],
    ['cacahuete', 'Cacahuete', /acahuete/], ['marisco', 'Marisco', /^(Gambas|Marisco|Calamar|Otros moluscos)/], ['pescado', 'Pescado', /^(Salmón|Atún|Caballa|Otros pescados|Pescado blanco|Hígado de bacalao)/], ['huevo', 'Huevo', /^(Huevo|Claras)/], ['soja', 'Soja', /^(Soja|Edamame|Tofu)/]];
  const DIETAS = ['Como de todo', 'Vegetariana', 'Vegana', 'Pescetariana', 'Sin cerdo'];
  const DIETA_EXCL = { Vegetariana: /^(Pollo|Pavo|Ternera|Lomo|Cordero|Cecina|Jamón|Bacon|Salmón|Atún|Caballa|Otros pescados|Pescado|Gambas|Marisco|Calamar|Otros moluscos|Hígado)/, Vegana: /^(Pollo|Pavo|Ternera|Lomo|Cordero|Cecina|Jamón|Bacon|Salmón|Atún|Caballa|Otros pescados|Pescado|Gambas|Marisco|Calamar|Otros moluscos|Hígado|Huevo|Claras|Leche|Kéfir|Yogur|Queso|Mozzarella|Gouda|Mantequilla|Miel|Proteína en polvo \(whey\))/, Pescetariana: /^(Pollo|Pavo|Ternera|Lomo|Cordero|Cecina|Jamón|Bacon|Hígado de ternera)/, 'Sin cerdo': /cerdo|^Jamón|^Cecina|^Bacon/i };

  /* ---------- Datos ---------- */
  const deTipo = (l, t) => (l || []).find(x => x && x.tipo === t) || null;
  async function cargar(uid, dst) {
    const r = await sb.from('cuestionarios').select('*').eq('alumno_id', uid);
    dst.cuest = r.error ? [] : (r.data || []); dst.cuestErr = !!r.error;
  }
  const cargarFicha = f => cargar(f.id, f);
  const mios = () => S.modo === 'coach' ? (S.ficha?.cuest || []) : (S.d?.cuest || []);
  const estado = (t, l) => { const x = deTipo(l || mios(), t); return !x ? 'pendiente' : x.enviado_at ? 'enviado' : 'borrador'; };
  async function guardar(tipo, datos, enviar) {
    const ya = deTipo(S.d.cuest, tipo), now = new Date().toISOString();
    const fila = { alumno_id: S.user.id, tipo, datos, actualizado_at: now, ...(enviar ? { enviado_at: ya?.enviado_at || now } : {}) };
    const q = await sb.from('cuestionarios').upsert(fila, { onConflict: 'alumno_id,tipo' }).select().single();
    if (q.error) throw q.error;
    const row = q.data || { ...(ya || {}), ...fila };
    S.d.cuest = [row, ...(S.d.cuest || []).filter(x => x && x.tipo !== tipo)];
    return row;
  }

  /* ---------- Preferencias: qué alimentos evitar en la calculadora ---------- */
  function prefDe(l) { return deTipo(l || mios(), 'preferencias')?.datos || null; }
  /* Motivo por el que un alimento de la calculadora no conviene a este alumno (o null) */
  function excluye(nombreAli, l) {
    const p = prefDe(l); if (!p) return null;
    for (const [k, t, re] of ALERGIAS) if ((p.alergias || []).includes(k) && re.test(nombreAli)) return `alergia o intolerancia: ${t.toLowerCase()}`;
    if (p.dieta && DIETA_EXCL[p.dieta]?.test(nombreAli)) return `alimentación ${p.dieta.toLowerCase()}`;
    for (const [, , items] of PREF) for (const [k, t, re] of items) if ((p.no || []).includes(k) && re.test(nombreAli)) return 'marcaste que no te gusta';
    return null;
  }
  /* Para la revisión de coherencia: ingredientes de un texto libre (menús) que choquen con sus preferencias */
  function chocaTexto(txt, l) {
    const p = prefDe(l); if (!p || !txt) return null;
    const t = norm(txt), ALI = Nutricion.ALI.filter(a => t.includes(norm(a.n.split(' (')[0]).split(' ')[0]));
    for (const a of ALI) { const m = excluye(a.n, l); if (m) return m; }
    return null;
  }

  /* ---------- Formulario de estilo de vida (por pasos) ---------- */
  function prerrelleno() {
    const d = {}, D = S.d || {}, srv = D.servicio || {}, p = D.programaBase || D.programa;
    const reg = (D.diario || []).filter(r => r.pasos != null && r.fecha >= sumaDias(hoyISO(), -13)); if (reg.length) d.pasos = Math.round(reg.reduce((t, r) => t + r.pasos, 0) / reg.length / 100) * 100;
    if (srv.comidas_dia) d.comidas = srv.comidas_dia >= 6 ? '6 o más' : String(srv.comidas_dia);
    if (p?.dias_semana) d.entreno_frec = `${p.dias_semana} días a la semana`;
    return d;
  }
  let st = null;
  function abrirEstilo() {
    const ya = deTipo(S.d.cuest, 'estilo');
    st = { tipo: 'estilo', paso: 0, d: { ...prerrelleno(), ...(ya?.datos || {}) } };
    abrirSheet(`<div class="stack cq"><div id="cq-cuerpo" class="stack" style="gap:14px"></div></div>`); pintar();
  }
  const campo = ([k, l, t, ops, ayuda]) => {
    const v = st.d[k];
    if (t === 'esc') return `<div class="stack" style="gap:6px"><b class="small">${esc(l)}</b><div class="cq-esc" role="group" aria-label="${esc(l)}">${[...Array(10)].map((_, i) => `<button type="button" data-cq="${k}" data-v="${i + 1}" aria-pressed="${+v === i + 1}">${i + 1}</button>`).join('')}</div><div class="row small muted"><span class="grow">Nada</span><span>Mucho</span></div></div>`;
    if (t === 'ops' || t === 'multi') return `<div class="stack" style="gap:6px"><b class="small">${esc(l)}${t === 'multi' ? ' <span class="muted" style="font-weight:400">(puedes marcar varias)</span>' : ''}</b><div class="chips">${ops.map(o => `<button type="button" data-cq="${k}" data-v="${esc(o)}" data-multi="${t === 'multi' ? 1 : ''}" aria-pressed="${t === 'multi' ? (v || []).includes(o) : v === o}">${esc(o)}</button>`).join('')}</div></div>`;
    if (t === 'hora') return `<label class="f">${esc(l)}<input type="time" data-cqi="${k}" value="${esc(v || '')}"></label>`;
    if (t === 'num') return `<label class="f">${esc(l)}<span class="row" style="gap:8px"><input type="number" inputmode="decimal" data-cqi="${k}" value="${esc(v ?? '')}" style="max-width:140px"><span class="small muted">${esc(ayuda || '')}</span></span></label>`;
    return `<label class="f">${esc(l)}<textarea data-cqi="${k}" rows="2" placeholder="${esc(ayuda || '')}">${esc(v || '')}</textarea></label>`;
  };
  function pintar() {
    const [tit, ic, campos] = ESTILO[st.paso], n = ESTILO.length;
    $('#cq-cuerpo').innerHTML = `<div class="row"><span class="eyebrow grow">Cuestionario de estilo de vida · ${st.paso + 1} de ${n}</span><button type="button" class="linkbtn small" data-cqa="salir">Seguir luego</button></div>
      <div class="inc-bar"><i style="width:${Math.round((st.paso + 1) / n * 100)}%"></i></div>
      <h2 style="margin:0">${ic} ${esc(tit)}</h2>
      ${st.paso === 0 ? '<p class="small muted" style="margin:0">Unos 10 minutos. Sirve para adaptar tu plan a tu vida real. Responde con sinceridad: no hay respuestas buenas ni malas. Se guarda solo al pasar de apartado.</p>' : ''}
      ${campos.map(campo).join('')}
      <p class="err" id="cq-err"></p>
      <div class="row" style="gap:8px">${st.paso ? '<button type="button" class="btn ghost grow" data-cqa="atras">← Anterior</button>' : ''}<button type="button" class="btn grow" data-cqa="${st.paso === n - 1 ? 'enviar' : 'sig'}">${st.paso === n - 1 ? 'Enviar a Jesús' : 'Siguiente →'}</button></div>`;
    $('#cq-cuerpo').scrollIntoView?.({ block: 'start' });
  }
  function leer() { document.querySelectorAll('#cq-cuerpo [data-cqi]').forEach(i => { const v = i.value.trim(); if (v === '') delete st.d[i.dataset.cqi]; else st.d[i.dataset.cqi] = i.type === 'number' ? numero(v) : v; }); }

  /* ---------- Lista de alimentos ---------- */
  function abrirPref() {
    const ya = deTipo(S.d.cuest, 'preferencias'), d = ya?.datos || {};
    st = { tipo: 'preferencias', d: { no: [...(d.no || [])], alergias: [...(d.alergias || [])], dieta: d.dieta || '', otros: d.otros || '', alergia_otra: d.alergia_otra || '' } };
    abrirSheet(`<div class="stack cq"><span class="eyebrow">Tus preferencias</span><h2 style="margin:0">Lista de alimentos</h2>
      <p class="small muted" style="margin:0">Toca los alimentos que <b>no te gustan</b> o que no quieras en tu plan. Tu plan estará hecho solo con alimentos que te gustan.</p>
      <div id="cq-pref" class="stack" style="gap:14px"></div></div>`); pintarPref();
  }
  function pintarPref() {
    const d = st.d, chip = (k, t, on, attr) => `<button type="button" ${attr}="${k}" aria-pressed="${on}" class="${on ? 'cq-no' : ''}">${on ? '✕ ' : ''}${esc(t)}</button>`;
    $('#cq-pref').innerHTML = PREF.map(([tit, ic, items]) => `<div class="stack" style="gap:6px"><b>${ic} ${esc(tit)}</b><div class="chips">${items.map(([k, t]) => chip(k, t, d.no.includes(k), 'data-cqno')).join('')}</div></div>`).join('')
      + `<div class="stack" style="gap:6px"><b>⚠️ Alergias o intolerancias</b><div class="chips">${ALERGIAS.map(([k, t]) => chip(k, t, d.alergias.includes(k), 'data-cqal')).join('')}</div><input type="text" id="cq-alo" value="${esc(d.alergia_otra)}" placeholder="Otra alergia o intolerancia (opcional)"></div>
      <div class="stack" style="gap:6px"><b>🍽 Tu tipo de alimentación</b><div class="chips">${DIETAS.map(t => `<button type="button" data-cqdi="${esc(t)}" aria-pressed="${d.dieta === t}">${esc(t)}</button>`).join('')}</div></div>
      <label class="f">¿Algún otro alimento que no tomes o quieras evitar?<textarea id="cq-otros" rows="2" placeholder="Opcional">${esc(d.otros)}</textarea></label>
      <p class="err" id="cq-err"></p><button type="button" class="btn full" data-cqa="prefEnviar">Guardar y enviar a Jesús</button>
      <p class="small muted" style="margin:0">${d.no.length ? `Has marcado ${d.no.length} alimento${d.no.length > 1 ? 's' : ''}. ` : ''}La calculadora no te propondrá lo que marques aquí. Puedes cambiarlo cuando quieras desde Nutrición.</p>`;
  }

  /* ---------- Textos para el coach (y para ChatGPT) ---------- */
  const fmtV = v => Array.isArray(v) ? v.join(', ') : String(v);
  function textoEstilo(datos) {
    if (!datos) return '';
    return ESTILO.map(([tit, , campos]) => { const l = campos.filter(([k]) => datos[k] != null && datos[k] !== '' && !(Array.isArray(datos[k]) && !datos[k].length)); return l.length ? `${tit.toUpperCase()}\n${l.map(([k, q, t]) => `- ${q}: ${fmtV(datos[k])}${t === 'esc' ? '/10' : ''}`).join('\n')}` : ''; }).filter(Boolean).join('\n\n');
  }
  function textoPref(datos) {
    if (!datos) return '';
    const no = PREF.map(([tit, , items]) => { const l = items.filter(([k]) => (datos.no || []).includes(k)).map(x => x[1]); return l.length ? `- ${tit}: ${l.join(', ')}` : ''; }).filter(Boolean);
    const al = ALERGIAS.filter(([k]) => (datos.alergias || []).includes(k)).map(x => x[1]).concat(datos.alergia_otra ? [datos.alergia_otra] : []);
    return ['PREFERENCIAS DE ALIMENTOS', no.length ? `No le gustan o no quiere:\n${no.join('\n')}` : 'No ha marcado alimentos que no le gusten.', al.length ? `Alergias o intolerancias: ${al.join(', ')}` : 'Sin alergias ni intolerancias indicadas.', datos.dieta ? `Tipo de alimentación: ${datos.dieta}` : '', datos.otros ? `Otros que evita: ${datos.otros}` : ''].filter(Boolean).join('\n');
  }
  /* Bloque de respuestas en la ficha del coach (dentro de «Primeros 14 días» → estilo / preferencias) */
  function vCoach(f, tipo) {
    if (f.cuest === undefined) { cargarFicha(f).then(() => { if (S.ficha === f) render(); }); return '<div class="card small muted">Cargando sus respuestas…</div>'; }
    if (f.cuestErr) return `<div class="card small muted">${AVISO}</div>`;
    const x = deTipo(f.cuest, tipo), t = tipo === 'estilo' ? textoEstilo(x?.datos) : textoPref(x?.datos);
    if (!x) return `<div class="card small muted">Aún no lo ha empezado en la app. ${tipo === 'estilo' ? 'Le aparece en «Tus primeros 14 días» para rellenarlo.' : 'Le aparece la lista de alimentos para marcar lo que no le gusta.'}</div>`;
    return `<div class="card stack" style="gap:6px"><div class="row"><b class="small grow">Sus respuestas en la app</b><span class="pill ${x.enviado_at ? 'ok' : 'warn'}">${x.enviado_at ? 'Enviado ' + esc(fCorta(x.enviado_at.slice(0, 10))) : 'A medias'}</span></div><div class="small pre" style="max-height:340px;overflow:auto">${esc(t)}</div><button type="button" class="btn sm ghost" data-cqa="copiar" data-t="${tipo}" style="align-self:flex-start">📋 Copiar para ChatGPT</button></div>`;
  }

  /* ---------- Eventos ---------- */
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-cq],[data-cqa],[data-cqno],[data-cqal],[data-cqdi],[data-act="cqEstilo"],[data-act="cqPref"]'); if (!b) return;
    if (b.dataset.act === 'cqEstilo') { if (S.modo === 'coach' || S.vista) return toast('Esto lo rellena el alumno desde su app'); return abrirEstilo(); }
    if (b.dataset.act === 'cqPref') { if (S.modo === 'coach' || S.vista) return toast('Esto lo rellena el alumno desde su app'); return abrirPref(); }
    if (b.dataset.cq) { e.preventDefault(); const k = b.dataset.cq, v = b.dataset.v;
      if (b.dataset.multi) { const l = st.d[k] = Array.isArray(st.d[k]) ? st.d[k] : []; const i = l.indexOf(v); if (i >= 0) l.splice(i, 1); else l.push(v); b.setAttribute('aria-pressed', i < 0); }
      else { const same = String(st.d[k]) === v; leer(); if (same) delete st.d[k]; else st.d[k] = /^\d+$/.test(v) && b.closest('.cq-esc') ? +v : v; b.parentElement.querySelectorAll('[data-cq]').forEach(x => x.setAttribute('aria-pressed', x === b && !same)); }
      return; }
    if (b.dataset.cqno || b.dataset.cqal) { const l = b.dataset.cqno ? st.d.no : st.d.alergias, k = b.dataset.cqno || b.dataset.cqal, i = l.indexOf(k); if (i >= 0) l.splice(i, 1); else l.push(k); st.d.otros = $('#cq-otros')?.value || ''; st.d.alergia_otra = $('#cq-alo')?.value || ''; pintarPref(); return; }
    if (b.dataset.cqdi) { st.d.dieta = st.d.dieta === b.dataset.cqdi ? '' : b.dataset.cqdi; st.d.otros = $('#cq-otros')?.value || ''; st.d.alergia_otra = $('#cq-alo')?.value || ''; pintarPref(); return; }
    const a = b.dataset.cqa;
    if (a === 'copiar') { const f = S.ficha, x = deTipo(f?.cuest, b.dataset.t), t = b.dataset.t === 'estilo' ? 'CUESTIONARIO DE ESTILO DE VIDA\n\n' + textoEstilo(x?.datos) : textoPref(x?.datos); try { await navigator.clipboard.writeText(t); toast('Copiado'); } catch (err) { prompt('Copia el texto', t); } return; }
    if (!st) return;
    try {
      if (a === 'sig' || a === 'atras' || a === 'salir') { leer(); await guardar('estilo', st.d, false); if (a === 'salir') { cerrarSheet(); toast('Guardado: puedes seguir cuando quieras'); render(); return; } st.paso += a === 'sig' ? 1 : -1; pintar(); return; }
      if (a === 'enviar') { leer(); await guardar('estilo', st.d, true); cerrarSheet(); toast('Enviado a Jesús. ¡Gracias!'); render(); return; }
      if (a === 'prefEnviar') { st.d.otros = $('#cq-otros').value.trim(); st.d.alergia_otra = $('#cq-alo').value.trim(); await guardar('preferencias', st.d, true); cerrarSheet(); toast('Preferencias guardadas'); render(); return; }
    } catch (err) { const m = $('#cq-err'); if (m) m.textContent = /cuestionarios|relation|schema/i.test(err.message || '') ? AVISO : 'No se ha podido guardar. Revisa la conexión e inténtalo de nuevo.'; console.error(err); }
  });

  return { cargar, cargarFicha, estado, excluye, chocaTexto, textoEstilo, textoPref, vCoach, prefDe, abrirEstilo, abrirPref, ESTILO, PREF };
})();
window.Cuest = Cuest;
