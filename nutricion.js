/* Nutrición · pestaña del alumno, diario de comidas opcional, creaciones compartidas y vista del coach.
   Método LOF: contexto → feedback → estructura → seguimiento.
   - Los documentos salen de la planificación del coach (tabla planificacion, sección «alimentacion»); el alumno
     solo ve los apartados marcados como visibles (Bloque 37). Imágenes y PDF en el bucket privado «planificacion».
   - «Tus contextos» puede llevar una tabla estructurada (datos.ctx: nombre, cuándo, kcal, P, C, G) para la guía del día.
   - Diario de comidas: tabla comidas_registro (Bloque 37), nunca obligatorio; foto en el bucket «comidas».
   Se carga antes que app.js y usa sus utilidades al ejecutarse. */
'use strict';
const Nutricion = (() => {
  const AVISO = 'Falta ejecutar el Bloque 37 (nutrición) en Supabase.';
  const DOCS = [
    ['contexto', 'Tu contexto y plan de acción', 'El resumen de nuestra reunión, el feedback y lo que vamos a aplicar', '🧭'],
    ['registro7', 'Tu semana real y tu estilo de vida', 'Lo que vimos en tu registro de 7 días', '📋'],
    ['analitica', 'Conclusiones de tu analítica', 'Sangre y orina: qué vimos y qué ajustamos', '🩸'],
    ['contextos', 'Tus contextos', 'Cuánto comer según el día · para imprimir', '📊'],
    ['equivalencias', 'Equivalencias visuales', 'Las cantidades sin báscula · para imprimir', '✋'],
    ['menus', 'Tus menús por contexto', 'Tu semana patrón adaptada a cada tipo de día', '🍽️'],
    ['platos', 'Cómo construir tus platos', 'La guía para montar cualquier comida', '🥗'],
    ['suplementacion', 'Tu plan de suplementación', 'Qué tomar, cuánto, cuándo y hasta cuándo', '💊']
  ];
  const MOMENTOS = ['Desayuno', 'Media mañana', 'Comida', 'Merienda', 'Cena', 'Otro'];
  const ENCAJA = [[2, 'Sí, de mi plan', 'ok'], [1, 'Más o menos', 'warn'], [0, 'No', 'bad']];
  const GRUPOS = [
    ['Proteínas', [['Pechuga de pollo o pavo', '1 palma'], ['Ternera magra', '1 palma'], ['Cerdo magro / lomo', '1 palma'], ['Salmón', '1 palma'], ['Merluza / pescado blanco', '1–2 palmas'], ['Atún al natural', '1 lata'], ['Gambas / marisco', '1 plato pequeño'], ['Huevos', '2 unidades'], ['Claras de huevo', '4 claras'], ['Yogur griego natural', '1 envase'], ['Queso fresco batido', '1 envase'], ['Queso fresco', '1 tarrina'], ['Jamón serrano o cocido', '4 lonchas'], ['Tofu', '1 palma'], ['Proteína en polvo', '1 cacito']]],
    ['Hidratos', [['Arroz cocido', '½ taza'], ['Pasta cocida', '1 taza'], ['Patata o boniato', '1 mediana'], ['Pan integral', '2 rebanadas'], ['Copos de avena', '½ taza'], ['Quinoa o cuscús cocido', '½ taza'], ['Lentejas cocidas', '½ taza'], ['Garbanzos cocidos', '½ taza'], ['Alubias cocidas', '½ taza'], ['Tortitas de arroz o maíz', '3 unidades'], ['Fruta', '1 pieza'], ['Plátano', '1 unidad'], ['Frutos rojos', '1 taza']]],
    ['Grasas', [['Aceite de oliva virgen extra', '1 cucharada'], ['Aguacate', '½ unidad'], ['Frutos secos', '1 puñado'], ['Crema de cacahuete', '1 cucharada'], ['Aceitunas', '10 unidades'], ['Queso curado', '2 lonchas'], ['Chocolate negro 85 %', '2 onzas'], ['Semillas', '1 cucharada']]],
    ['Verduras y lácteos', [['Ensalada', '1 plato'], ['Verdura cocinada', '1 plato'], ['Gazpacho o crema de verduras', '1 vaso'], ['Leche', '1 vaso'], ['Kéfir', '1 vaso'], ['Bebida vegetal', '1 vaso'], ['Café o infusión', '1 taza']]],
    ['Fuera de casa y caprichos', [['Bollería', ''], ['Pizza', ''], ['Hamburguesa', ''], ['Fritos o rebozados', ''], ['Dulces o postre', ''], ['Refresco', ''], ['Cerveza', ''], ['Vino', ''], ['Copa', '']]]
  ];
  const TODOS = GRUPOS.flatMap(([g, l]) => l.map(([n, q]) => ({ n, q, g })));
  const esPdf = r => /\.pdf$/i.test(r || '');
  const vacio = () => ({ plan: [], url: {}, comidas: [] });

  /* ---------- Carga ---------- */
  async function firmar(n) {
    const rutas = [...new Set(n.plan.flatMap(x => x.imagenes || []))].filter(r => !n.url[r]);
    if (!rutas.length) return;
    const r = await sb.storage.from('planificacion').createSignedUrls(rutas, 6 * 3600);
    (r.data || []).forEach(x => { if (x.signedUrl) n.url[x.path] = x.signedUrl; });
  }
  async function cargar(uid, d) {
    d.nutri = vacio();
    if (!d.servicio?.modulo_nutricion) return;
    try {
      const [p, c] = await Promise.all([
        sb.from('planificacion').select('*').eq('alumno_id', uid).eq('seccion', 'alimentacion').order('orden'),
        sb.from('comidas_registro').select('*').eq('alumno_id', uid).gte('fecha', sumaDias(hoyISO(), -60)).order('created_at')
      ]);
      d.nutri.plan = (p.data || []).filter(x => x.visible !== false);
      d.nutri.comErr = !!c.error; d.nutri.comidas = c.data || [];
      await firmar(d.nutri);
      const fotos = d.nutri.comidas.flatMap(fotosDe); if (fotos.length) pedirFotos(fotos);
    } catch (err) { console.error(err); }
  }
  async function cargarFicha(f) {
    const r = await sb.from('comidas_registro').select('*').eq('alumno_id', f.id).gte('fecha', sumaDias(hoyISO(), -60)).order('created_at');
    f.comErr = !!r.error; f.comidas = r.data || [];
    const fotos = f.comidas.flatMap(fotosDe); if (fotos.length) pedirFotos(fotos);
  }
  async function cargarCoach(c) {
    const [r, pl] = await Promise.all([sb.from('comidas_registro').select('id,alumno_id').eq('compartido', true).is('coach_estado', null), sb.from('planificacion').select('alumno_id,visible,contenido,imagenes').eq('seccion', 'alimentacion')]);
    c.creacionesNuevas = r.error ? [] : (r.data || []);
    c.conPlanNutri = new Set((pl.data || []).filter(x => x.visible !== false && (x.contenido || (x.imagenes || []).length)).map(x => x.alumno_id));
  }
  const nuevasDe = aid => (S.c?.creacionesNuevas || []).filter(x => x.alumno_id === aid).length;
  /* Fase de la alimentación: la que fije Jesús en el servicio o, si no, «activo» cuando hay plan visible y «preparación» si no */
  const FASES = { recogida: ['Recogida de información', 'blue'], preparacion: ['Plan en preparación', ''], activo: ['Plan activo', 'ok'], revision: ['Revisión del plan', 'gold'] };
  function faseDe(srv, tienePlan) { if (!srv?.modulo_nutricion) return null; if (FASES[srv.nutri_fase]) return srv.nutri_fase; return tienePlan ? 'activo' : 'preparacion'; }
  const fase = d => faseDe(d?.servicio, (d?.nutri?.plan || []).some(tiene));
  const mide = f => f === 'activo' || f === 'revision';
  const faseCoach = aid => { const srv = (S.c?.servicios || []).find(x => x.alumno_id === aid); return faseDe(srv, (S.c?.conPlanNutri || new Set()).has(aid)); };

  /* ---------- Utilidades de vista ---------- */
  const docDe = (n, k) => n.plan.find(x => x.clave === k);
  const tiene = x => !!x && (!!x.contenido || !!(x.imagenes || []).length || !!(x.datos?.ctx || []).length || !!(x.datos?.guias || []).length || !!(x.datos?.menus || []).length || !!(x.datos?.sup || []).length || !!x.datos?.hidratacion);
  const ctxDe = n => (docDe(n, 'contextos')?.datos?.ctx || []).filter(c => c.n);
  const g = v => v != null && v !== '' ? fmtNum(+v, 0) + ' g' : '—';
  const alimentosTxt = x => (x.alimentos || []).map(a => a.n + (a.q ? ` (${a.q})` : '')).join(', ');
  function parrafos(t) {
    const out = []; let lista = [];
    const cierra = () => { if (lista.length) { out.push(`<ul>${lista.map(l => `<li>${l}</li>`).join('')}</ul>`); lista = []; } };
    const neg = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    String(t).split(/\n/).forEach(l => {
      const s = l.trim();
      if (!s) return cierra();
      if (/^[-•·*]\s+/.test(s)) return lista.push(neg(s.replace(/^[-•·*]\s+/, '')));
      cierra();
      if (/^#+\s+/.test(s)) out.push(`<h3>${neg(s.replace(/^#+\s+/, ''))}</h3>`);
      else if (s.length < 70 && s === s.toUpperCase() && /[A-ZÁÉÍÓÚÑ]{3}/.test(s)) out.push(`<h3>${neg(s.charAt(0) + s.slice(1).toLowerCase())}</h3>`);
      else out.push(`<p>${neg(s)}</p>`);
    });
    cierra(); return out.join('');
  }
  /* Semana tipo: qué contexto toca hoy (si hay varias, la que el alumno marque para esta semana) */
  const semanasDe = n => (docDe(n, 'contextos')?.datos?.semana || []).filter(p => (p.dias || []).some(Boolean));
  function semSel(n) { const l = semanasDe(n); if (l.length < 2) return 0; try { const [f, i] = (localStorage.getItem('lof-nsem') || '').split('|'); if (f === lunesDe(hoyISO())) return Math.min(+i || 0, l.length - 1); } catch (e) { /* */ } return 0; }
  function ctxPorSemana(n) {
    const sem = semanasDe(n)[semSel(n)]; if (!sem) return -1;
    const nom = norm(sem.dias[(new Date().getDay() + 6) % 7] || ''); if (!nom) return -1;
    return ctxDe(n).findIndex(c => norm(c.n) === nom);
  }
  function selCtx(n) {
    if (S.nCtx != null) return S.nCtx;
    try { const [f, i] = (localStorage.getItem('lof-nctx') || '').split('|'); if (f === hoyISO()) return +i || 0; } catch (e) { /* sin almacenamiento */ }
    const k = ctxPorSemana(n); return k >= 0 ? k : 0;
  }

  /* ---------- Pestaña del alumno ---------- */
  function vista(dd, prev) {
    const d = dd || S.d, n = d?.nutri || vacio();
    if (S.nDoc) return vDoc(n, S.nDoc, d);
    const docs = [...DOCS.map(([k, t, s, ic]) => ({ x: docDe(n, k), k, t, s, ic })).filter(o => tiene(o.x)),
      ...n.plan.filter(x => !DOCS.some(([k]) => k === x.clave) && !esInc(x) && tiene(x)).map(x => ({ x, k: x.clave, t: x.titulo, s: '', ic: '📌' }))];
    const cab = prev ? '' : `<section class="stack"><span class="eyebrow">Tu plan de alimentación</span><h1>Nutrición</h1><p class="small muted">Tu guía para comer bien sin pensarlo demasiado. Vuelve aquí siempre que tengas una duda.</p></section>`;
    return cab + vFase(d) + vIncAlumno(n, d) + vHoyCtx(n, d) + vDocs(docs) + (prev ? '' : vDiario(n, d));
  }
  function vFase(d) {
    const f = fase(d); if (!f) return '';
    const txt = {
      recogida: ['Fase 1 · Conocer tu semana real', 'Durante 7 días apunta en tu diario todo lo que comes y bebes, sin cambiar nada y sin pesar. Sirve para que Jesús vea tu día a día y prepare tu plan. <b>No se evalúa:</b> cuanto más real, mejor.'],
      preparacion: ['Tu plan está en preparación', 'Todavía no hay un plan que cumplir, así que no se mide nada. Si quieres, puedes apuntar comidas en tu diario: es opcional.'],
      activo: ['Tu plan está activo', 'Cada día marcas en Hoy cuántas comidas de tu plan has cumplido: eso es la <b>aplicación del plan</b>. El diario es aparte y opcional: sirve para ver qué comes y si encaja con tu plan.'],
      revision: ['Estamos revisando tu plan', 'Sigue con tu plan actual hasta que Jesús te pase los cambios. Si algo no te encaja, cuéntaselo en tu check-in.']
    }[f];
    return `<section class="section"><div class="card stack" style="gap:6px"><div class="row"><span class="eyebrow grow">${txt[0]}</span><span class="pill ${FASES[f][1]}">${FASES[f][0]}</span></div><p class="small" style="margin:0">${txt[1]}</p></div></section>`;
  }
  function vMacros(c, ing) {
    const pc = v => ing > 1 && v ? `<small>≈ ${fmtNum(v / ing, 0)} g por comida</small>` : '';
    return `<div class="nu-macros"><div class="k"><b class="num">${c.kcal ? fmtNum(+c.kcal, 0) : '—'}</b><small>kcal al día</small></div><div><b class="num">${g(c.p)}</b><small>Proteína</small>${pc(+c.p)}</div><div><b class="num">${g(c.c)}</b><small>Hidratos</small>${pc(+c.c)}</div><div><b class="num">${g(c.g)}</b><small>Grasas</small>${pc(+c.g)}</div></div>`;
  }
  function vHoyCtx(n, d) {
    const l = ctxDe(n); if (!l.length) return '';
    const i = Math.min(selCtx(n), l.length - 1), c = l[i], ing = +c.ing || comidasDia(d?.servicio), sems = semanasDe(n), auto = ctxPorSemana(n);
    const ir = (k, t) => tiene(docDe(n, k)) ? `<button class="btn sm ghost" data-act="nuDoc" data-k="${k}">${t}</button>` : '';
    return `<section class="section"><div class="card stack nu-hoy"><span class="eyebrow">¿Qué tipo de día tienes hoy?</span>
      <div class="chips" role="group" aria-label="Contexto de hoy">${l.map((x, k) => `<button class="pill ${k === i ? 'blue' : ''}" data-act="nuCtx" data-i="${k}" aria-pressed="${k === i}">${esc(x.n)}</button>`).join('')}</div>
      ${sems.length > 1 ? `<div class="row small" style="gap:6px;flex-wrap:wrap;align-items:center"><span class="muted">Esta semana:</span>${sems.map((p, k) => `<button class="pill ${k === semSel(n) ? 'gold' : ''}" data-act="nuSem" data-i="${k}">${esc(p.nombre || 'Semana ' + (k + 1))}</button>`).join('')}</div>` : ''}
      ${auto === i ? '<p class="small muted" style="margin:0">📅 Es el que te toca hoy según tu semana tipo. Si tu día ha cambiado, toca otro.</p>' : ''}
      ${c.d ? `<p class="small muted" style="margin:0">${esc(c.d)}</p>` : ''}${vMacros(c, ing)}
      <button class="btn full" data-act="nuCalc">🧮 Calcula tu plato con lo que quieres comer</button>
      <div class="row" style="gap:8px;flex-wrap:wrap">${ir('menus', '🍽️ Ver mis menús')}${ir('equivalencias', '✋ Equivalencias')}${ir('platos', '🥗 Montar un plato')}</div></div></section>`;
  }
  function vDocs(docs) {
    if (!docs.length) return S.d && fase(S.d) ? '' : `<section class="section"><div class="card stack"><b>Tu plan está en camino</b><p class="small muted" style="margin:0">Jesús está preparando tu plan. Aquí tendrás tu contexto, tus menús, las equivalencias visuales, cómo construir tus platos y tu suplementación.</p></div></section>`;
    return `<section class="section"><div class="section-head"><h2>Tu plan</h2></div><div class="nu-docs">${docs.map(o => `<button class="card nu-doc" data-act="nuDoc" data-k="${esc(o.k)}"><span class="nu-ic" aria-hidden="true">${o.ic}</span><span class="grow"><b>${esc(o.t)}</b>${o.s ? `<small>${esc(o.s)}</small>` : ''}</span><span class="nu-fl" aria-hidden="true">›</span></button>`).join('')}</div>
      <p class="note">Consejo de Jesús: imprime tu tabla de contextos y la de equivalencias y tenlas a mano en la cocina.</p></section>`;
  }
  function vTablaCtx(l, ing) {
    return `<section class="section"><div class="card stack"><div class="tbl" style="overflow-x:auto"><table class="nu-tab"><thead><tr><th>Tipo de día</th><th class="num">kcal</th><th class="num">Prot.</th><th class="num">Hidr.</th><th class="num">Grasas</th></tr></thead><tbody>${l.map(c => `<tr><td><b>${esc(c.n)}</b>${c.d ? `<div class="small muted">${esc(c.d)}</div>` : ''}</td><td class="num"><b>${c.kcal ? fmtNum(+c.kcal, 0) : '—'}</b></td><td class="num">${g(c.p)}</td><td class="num">${g(c.c)}</td><td class="num">${g(c.g)}</td></tr>`).join('')}</tbody></table></div>
      ${ing > 1 ? `<p class="small muted" style="margin:0">Reparte cada cantidad entre tus ${ing} comidas del día.</p>` : ''}
      <button class="btn ghost" data-act="nuPdfCtx">⬇ Descargar para imprimir (PDF)</button></div></section>`;
  }
  function vDoc(n, k, d) {
    const x = docDe(n, k), meta = DOCS.find(([c]) => c === k);
    const vuelta = `<button class="btn sm ghost" data-act="nuCerrar" style="align-self:flex-start">← Nutrición</button>`;
    if (!x) return `<section class="stack">${vuelta}<div class="card empty">Este apartado ya no está disponible.</div></section>`;
    const rutas = x.imagenes || [], imgs = rutas.filter(r => !esPdf(r)).map(r => n.url[r]).filter(Boolean), pdfs = rutas.filter(esPdf).map(r => n.url[r]).filter(Boolean);
    const ctx = k === 'contextos' ? ctxDe(n) : [];
    return `<section class="stack">${vuelta}<span class="eyebrow">Tu plan de alimentación</span><h1>${esc(meta?.[1] || x.titulo)}</h1>${meta?.[2] ? `<p class="small muted" style="margin:0">${esc(meta[2])}</p>` : ''}</section>
      ${ctx.length ? vTablaCtx(ctx, comidasDia(d?.servicio)) : ''}
      ${k === 'equivalencias' && (x.datos?.guias || []).length ? vGuias(x, n) : ''}${k === 'menus' && (x.datos?.menus || []).length ? vMenus(x, n) : ''}${k === 'suplementacion' && ((x.datos?.sup || []).length || x.datos?.hidratacion) ? vSup(x) : ''}
      ${x.contenido ? `<section class="section"><div class="card nu-texto">${parrafos(x.contenido)}</div></section>` : ''}
      ${pdfs.length ? `<section class="section"><div class="stack" style="gap:8px">${pdfs.map((u, i) => `<a class="btn full" href="${esc(u)}" target="_blank" rel="noopener">📄 Abrir ${pdfs.length > 1 ? 'el documento ' + (i + 1) : 'el documento'} (PDF)</a>`).join('')}</div><p class="small muted">Se abre en tu móvil: desde ahí puedes guardarlo o imprimirlo.</p></section>` : ''}
      ${imgs.length ? `<section class="section"><div class="nu-imgs">${imgs.map(u => `<button class="img" data-act="verImagen" data-src="${esc(u)}" aria-label="Ampliar imagen"><img src="${esc(u)}" alt="" loading="lazy"></button>`).join('')}</div><p class="small muted">Toca una imagen para verla en grande, guardarla o imprimirla.</p></section>` : ''}`;
  }

  /* ---------- Diario de comidas (opcional) ---------- */
  const ventana = () => [...Array(7)].map((_, i) => sumaDias(hoyISO(), i - 6));
  const ordMom = (a, b) => (MOMENTOS.indexOf(a.momento) + 1 || 9) - (MOMENTOS.indexOf(b.momento) + 1 || 9) || String(a.created_at).localeCompare(String(b.created_at));
  const pillEnc = x => { const e = ENCAJA.find(([v]) => v === x.encaja); return e ? `<span class="pill ${e[2]}">${e[0] === 2 ? 'De su plan' : e[1]}</span>` : ''; };
  const pillEncA = x => { const e = ENCAJA.find(([v]) => v === x.encaja); return e ? `<span class="pill ${e[2]}">${e[0] === 2 ? 'De tu plan' : e[1]}</span>` : ''; };
  function lineaComida(x, coach) {
    const fs = fotosDe(x), u = fs[0] && fotoUrl(fs[0]), todas = fs.map(fotoUrl).filter(Boolean).join('|');
    const mini = u ? (coach ? `<button class="img nu-mini" data-act="verImagenes" data-s="${esc(todas)}" aria-label="Ver fotos" style="position:relative"><img src="${esc(u)}" alt="">${fs.length > 1 ? `<span class="pill" style="position:absolute;right:2px;bottom:2px">+${fs.length - 1}</span>` : ''}</button>` : `<span style="position:relative;display:inline-block"><img class="nu-mini" src="${esc(u)}" alt="">${fs.length > 1 ? `<span class="pill" style="position:absolute;right:2px;bottom:2px">+${fs.length - 1}</span>` : ''}</span>`) : `<span class="nu-mini nu-ph" aria-hidden="true">🍽</span>`;
    return `<div class="line nu-com" ${coach ? '' : `data-act="nuEditar" data-id="${x.id}"`}>${mini}<div class="grow stack" style="gap:2px;min-width:0"><span class="small"><b>${esc(x.momento || 'Comida')}</b>${x.plato ? ' · ' + esc(x.plato) : ''}${x.contexto ? ` <span class="muted">· ${esc(x.contexto)}</span>` : ''}</span>
      ${alimentosTxt(x) ? `<span class="small muted">${esc(alimentosTxt(x))}</span>` : ''}${x.nota ? `<span class="small muted">«${esc(x.nota)}»</span>` : ''}</div>${coach ? pillEnc(x) : pillEncA(x)}</div>`;
  }
  function estadoCreacion(x) {
    return x.coach_estado === 'anadido' ? '<span class="pill ok">✓ Añadida a tus menús</span>' : x.coach_estado === 'visto' ? '<span class="pill blue">Revisada por Jesús</span>' : '<span class="pill">Enviada · pendiente de revisión</span>';
  }
  function vDiario(n, d) {
    const f = fase(d || S.d);
    const dias = ventana(), sel = dias.includes(S.nDia) ? S.nDia : hoyISO(), l = n.comidas.filter(x => x.fecha === sel).sort(ordMom), mias = n.comidas.filter(x => x.compartido);
    if (n.comErr) return `<section class="section" id="nu-diario"><div class="section-head"><h2>Tu diario de comidas</h2></div><div class="card small muted">${S.perfil?.rol === 'coach' ? AVISO : 'El diario de comidas estará disponible muy pronto.'}</div></section>`;
    return `<section class="section" id="nu-diario"><div class="section-head"><h2>Tu diario de comidas</h2><span class="pill ${f === 'recogida' ? 'blue' : ''}">${f === 'recogida' ? 'Pedido por Jesús · 7 días' : 'Opcional'}</span></div><div class="card stack">
      <p class="small muted" style="margin:0">${f === 'recogida' ? `Apunta cada comida con una foto, marcando alimentos o las dos cosas. Llevas <b>${new Set(n.comidas.filter(x => x.fecha >= sumaDias(hoyISO(), -6)).map(x => x.fecha)).size} de 7 días</b> con algo apuntado.` : 'No es obligatorio y no cuenta como cumplimiento. Apunta lo que comes cuando te ayude a ser consciente o tengas dudas. En cada comida puedes marcar si encaja con tu plan: así Jesús ve la calidad, no solo la cantidad.'}</p>
      <div class="reg-dias" role="group" aria-label="Día" style="--n:7">${dias.map(f => `<button type="button" data-act="nuDia" data-f="${f}" aria-pressed="${f === sel}" class="${n.comidas.some(x => x.fecha === f) ? 'hecho' : ''}"><small>${DIA3[fecha(f).getDay()]}</small><b class="num">${fecha(f).getDate()}</b></button>`).join('')}</div>
      ${l.length ? `<div>${l.map(x => lineaComida(x, false)).join('')}</div>` : `<p class="small muted" style="margin:0">${sel === hoyISO() ? 'Hoy' : 'Ese día'} no has apuntado nada.</p>`}
      <button class="btn" data-act="nuFoto7">📷 Subir foto de una comida</button><button class="btn ghost" data-act="nuNueva">＋ Apuntar con detalle (alimentos, creación propia…)</button></div></section>
      <section class="section"><div class="section-head"><h2>Tus creaciones</h2></div><div class="card stack">
        ${mias.length ? `<div>${mias.slice().reverse().map(x => `<div class="line" style="align-items:flex-start" data-act="nuEditar" data-id="${x.id}"><div class="grow stack" style="gap:2px"><span class="small"><b>${esc(x.plato || 'Plato sin nombre')}</b> <span class="muted">· ${esc(fCorta(x.fecha))}</span></span>${alimentosTxt(x) ? `<span class="small muted">${esc(alimentosTxt(x))}</span>` : ''}${x.coach_nota ? `<span class="small"><b>Jesús:</b> ${esc(x.coach_nota)}</span>` : ''}</div>${estadoCreacion(x)}</div>`).join('')}</div>` : ''}
        <p class="small muted" style="margin:0">¿Has inventado un plato que encaja con tu plan? Apúntalo y marca «Es una creación mía». Jesús la revisará y, si encaja con tu plan, puede añadirla a tus menús. Verás aquí en qué punto está.</p></div></section>`;
  }
  function momentoSugerido(dia) {
    if (dia !== hoyISO()) return 'Comida';
    const h = new Date().getHours() + new Date().getMinutes() / 60;
    return h < 11 ? 'Desayuno' : h < 13 ? 'Media mañana' : h < 16.5 ? 'Comida' : h < 19.5 ? 'Merienda' : 'Cena';
  }
  function formComida(id) {
    const n = S.d?.nutri; if (!n) return;
    const x = id ? n.comidas.find(c => c.id === id) : null; if (id && !x) return;
    const dia = x?.fecha || (ventana().includes(S.nDia) ? S.nDia : hoyISO());
    const st = { mom: x?.momento || momentoSugerido(dia), sel: (x?.alimentos || []).map(a => ({ n: a.n, q: a.q || '' })), enc: x?.encaja ?? null, files: [], rutas: fotosDe(x || {}) };
    const propios = [...new Set(n.comidas.flatMap(c => (c.alimentos || []).map(a => a.n)))].filter(v => v && !TODOS.some(t => t.n === v));
    const ctx = ctxDe(n), chip = v => `<button type="button" class="pill" data-al="${esc(v)}">${esc(v)}</button>`;
    abrirSheet(`<form class="stack" id="f-nu"><h2>${x ? (x.compartido ? 'Tu creación' : 'Editar comida') : 'Apuntar una comida'}</h2><span class="small muted" style="margin-top:-8px">${esc(fLarga(dia))}</span>
      <div class="choice" role="group" aria-label="Momento">${MOMENTOS.map(m => `<button type="button" data-mom="${m}" aria-pressed="${m === st.mom}">${m}</button>`).join('')}</div>
      <div class="stack" style="gap:6px"><span class="small"><b>Fotos</b> <span class="muted">(opcional · puedes añadir varias)</span></span><div id="nu-foto" class="nu-foto"></div><label class="btn ghost full"><input type="file" id="nu-f" accept="image/*" multiple hidden><span id="nu-fl">📷 ${fotosDe(x || {}).length ? 'Añadir más fotos' : 'Hacer o subir fotos'}</span></label></div>
      <div class="stack" style="gap:8px"><span class="small"><b>Qué has comido</b> <span class="muted">(opcional · la cantidad también)</span></span>
        <div id="nu-sel" class="stack" style="gap:6px"></div>
        <div class="row" style="gap:8px"><input type="text" id="nu-q" list="nu-lista" placeholder="Busca o escribe un alimento nuevo" autocomplete="off"><button type="button" class="btn sm" id="nu-add">Añadir</button></div>
        <datalist id="nu-lista">${[...propios, ...TODOS.map(t => t.n)].map(v => `<option value="${esc(v)}">`).join('')}</datalist>
        ${propios.length ? `<details class="nu-gr" open><summary class="small"><b>Tus alimentos</b></summary><div class="chips">${propios.map(chip).join('')}</div></details>` : ''}
        ${GRUPOS.map(([gr, l]) => `<details class="nu-gr"><summary class="small"><b>${gr}</b></summary><div class="chips">${l.map(([v]) => chip(v)).join('')}</div></details>`).join('')}</div>
      ${ctx.length ? `<label class="f">¿Qué tipo de día era?<select id="nu-ctx"><option value="">Sin indicar</option>${ctx.map(c => `<option ${x?.contexto === c.n ? 'selected' : ''}>${esc(c.n)}</option>`).join('')}</select></label>` : ''}
      ${mide(fase(S.d)) ? `<div class="stack" style="gap:6px"><span class="small"><b>¿Encaja con tu plan?</b> <span class="muted">(opcional)</span></span><div class="choice" role="group">${ENCAJA.map(([v, t]) => `<button type="button" data-enc="${v}" aria-pressed="${st.enc === v}">${t}</button>`).join('')}</div></div>` : ''}
      <label class="f"><span>Nota <span class="muted">(opcional)</span></span><textarea id="nu-n" rows="2" placeholder="Dónde estabas, cómo te sentiste, alguna duda…">${esc(x?.nota || '')}</textarea></label>
      <label class="row nu-comp"><input type="checkbox" id="nu-c" ${x?.compartido ? 'checked' : ''}><span class="small"><b>Es una creación mía</b><br><span class="muted">Compártela con Jesús para que la añada a tus menús y contextos</span></span></label>
      <label class="f" id="nu-pl" ${x?.compartido ? '' : 'hidden'}>Nombre del plato<input type="text" id="nu-p" value="${esc(x?.plato || '')}" placeholder="Ej. Bowl de salmón y quinoa"></label>
      <p class="err" id="nu-err"></p><button class="btn full" type="submit" id="nu-b">Guardar</button>
      ${x ? '<button class="btn ghost full" type="button" id="nu-del" style="color:var(--bad)">Borrar</button>' : ''}</form>`);
    const form = $('#f-nu');
    const pintar = () => {
      $('#nu-sel').innerHTML = st.sel.map((a, i) => { const t = TODOS.find(z => z.n === a.n); return `<div class="nu-it"><b>${esc(a.n)}</b><input type="text" data-qi="${i}" value="${esc(a.q)}" placeholder="${esc(t?.q ? 'ej. ' + t.q : 'cantidad')}" aria-label="Cantidad de ${esc(a.n)}"><button type="button" class="nu-x" data-quita="${i}" aria-label="Quitar">✕</button></div>`; }).join('');
      form.querySelectorAll('[data-al]').forEach(b => b.classList.toggle('blue', st.sel.some(a => a.n === b.dataset.al)));
      const us = [...st.rutas.map((r, k) => [fotoUrl(r), 'r', k]), ...st.files.map((f, k) => [URL.createObjectURL(f), 'f', k])].filter(z => z[0]);
      $('#nu-foto').innerHTML = us.map(([u, t, k]) => `<span style="position:relative;display:inline-block;margin:0 6px 6px 0"><img src="${esc(u)}" alt="Foto de la comida" style="max-width:120px;max-height:120px;border-radius:10px"><button type="button" data-qf="${t}${k}" aria-label="Quitar foto" style="position:absolute;top:-6px;right:-6px;width:22px;height:22px;border-radius:50%;border:0;background:var(--bad);color:#fff;font-weight:700">×</button></span>`).join('');
    };
    const anadir = v => { v = String(v || '').trim(); if (!v) return; const t = TODOS.find(z => z.n.toLowerCase() === v.toLowerCase()); const nom = t ? t.n : v.charAt(0).toUpperCase() + v.slice(1); if (!st.sel.some(a => a.n === nom)) st.sel.push({ n: nom, q: '' }); $('#nu-q').value = ''; pintar(); };
    form.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.mom) { st.mom = b.dataset.mom; form.querySelectorAll('[data-mom]').forEach(z => z.setAttribute('aria-pressed', z === b)); }
      else if (b.dataset.enc != null) { const v = +b.dataset.enc; st.enc = st.enc === v ? null : v; form.querySelectorAll('[data-enc]').forEach(z => z.setAttribute('aria-pressed', +z.dataset.enc === st.enc)); }
      else if (b.dataset.al) { const i = st.sel.findIndex(a => a.n === b.dataset.al); i >= 0 ? st.sel.splice(i, 1) : st.sel.push({ n: b.dataset.al, q: '' }); pintar(); }
      else if (b.dataset.qf) { const k = +b.dataset.qf.slice(1); b.dataset.qf[0] === 'r' ? st.rutas.splice(k, 1) : st.files.splice(k, 1); pintar(); }
      else if (b.dataset.quita != null) { st.sel.splice(+b.dataset.quita, 1); pintar(); }
      else if (b.id === 'nu-add') anadir($('#nu-q').value);
    });
    form.addEventListener('input', e => { if (e.target.dataset.qi != null) st.sel[+e.target.dataset.qi].q = e.target.value; });
    $('#nu-q').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); anadir(e.target.value); } });
    $('#nu-q').addEventListener('change', e => { if (TODOS.some(t => t.n === e.target.value) || propios.includes(e.target.value)) anadir(e.target.value); });
    $('#nu-f').addEventListener('change', e => { st.files.push(...[...e.target.files]); e.target.value = ''; if (st.files.length) $('#nu-fl').textContent = '📷 Añadir más fotos'; pintar(); });
    $('#nu-c').addEventListener('change', e => { $('#nu-pl').hidden = !e.target.checked; if (e.target.checked) $('#nu-p').focus(); });
    $('#nu-del')?.addEventListener('click', async () => {
      if (!confirm('¿Borrar esta comida de tu diario?')) return;
      const { error } = await sb.from('comidas_registro').delete().eq('id', x.id); if (error) return fallo(error);
      n.comidas = n.comidas.filter(c => c.id !== x.id); cerrarSheet(); toast('Borrada'); render();
    });
    pintar();
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const comp = $('#nu-c').checked, plato = $('#nu-p').value.trim(), nota = $('#nu-n').value.trim(), alimentos = st.sel.filter(a => a.n).map(a => a.q.trim() ? { n: a.n, q: a.q.trim() } : { n: a.n });
      if (!st.files.length && !st.rutas.length && !alimentos.length && !nota && !plato) { $('#nu-err').textContent = 'Añade una foto o algún alimento.'; return; }
      if (comp && !plato) { $('#nu-err').textContent = 'Ponle un nombre a tu plato para compartirlo.'; $('#nu-p').focus(); return; }
      const btn = $('#nu-b'); btn.disabled = true; btn.textContent = 'Guardando…';
      try {
        const rutas = [...st.rutas];
        for (const fl of st.files) {
          const blob = await reducirImagen(fl, 960), ruta = `${S.user.id}/menu/${dia}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}.jpg`;
          const up = await sb.storage.from('comidas').upload(ruta, blob, { contentType: 'image/jpeg' }); if (up.error) throw up.error;
          rutas.push(ruta);
        }
        const foto = rutas.join(';') || null;
        const fila = { alumno_id: S.user.id, fecha: dia, momento: st.mom, alimentos, foto, encaja: st.enc, contexto: $('#nu-ctx')?.value || null, nota: nota || null, compartido: comp, plato: plato || null };
        const r = x ? await sb.from('comidas_registro').update(fila).eq('id', x.id).select().single() : await sb.from('comidas_registro').insert(fila).select().single();
        if (r.error) throw r.error;
        const nueva = r.data || { ...x, ...fila };
        n.comidas = x ? n.comidas.map(c => c.id === x.id ? nueva : c) : [...n.comidas, nueva];
        if (rutas.length) await pedirFotos(rutas);
        S.nDia = dia; cerrarSheet(); toast(comp && !x?.compartido ? 'Creación enviada a Jesús' : x ? 'Guardado' : 'Comida apuntada'); render();
      } catch (err) {
        console.error(err); btn.disabled = false; btn.textContent = 'Guardar';
        $('#nu-err').textContent = /comidas_registro|bucket|not found|relation/i.test(err.message || '') ? AVISO : 'No se ha podido guardar. Revisa la conexión e inténtalo de nuevo.';
      }
    });
  }

  /* ---------- Coach: seguimiento del diario y de las creaciones ---------- */
  function vCoach(f, a) {
    const nom = (a?.nombre || '').split(' ')[0] || 'Tu alumno';
    if (f.comidas === undefined) return '<section class="section"><div class="card small muted">Cargando su diario de comidas…</div></section>';
    if (f.comErr) return `<section class="section"><div class="card small muted">${AVISO} Con él, ${esc(nom)} podrá ver su plan en la pestaña Nutrición y apuntar lo que come.</div></section>`;
    const lim = sumaDias(hoyISO(), -13), l = f.comidas.filter(x => x.fecha >= lim), dias = [...new Set(l.map(x => x.fecha))].sort().reverse();
    const conE = l.filter(x => x.encaja != null), pct = conE.length ? Math.round(conE.reduce((t, x) => t + x.encaja, 0) / (conE.length * 2) * 100) : null;
    const crea = f.comidas.filter(x => x.compartido).slice().reverse();
    return `<section class="section"><div class="section-head"><h2>Creaciones que comparte</h2>${crea.filter(x => !x.coach_estado).length ? `<span class="pill gold">${crea.filter(x => !x.coach_estado).length} nueva${crea.filter(x => !x.coach_estado).length > 1 ? 's' : ''}</span>` : ''}</div><div class="card stack">
      ${crea.length ? crea.map(x => { const u = fotosDe(x)[0] && fotoUrl(fotosDe(x)[0]); return `<div class="stack nu-crea" style="gap:6px"><div class="row" style="align-items:flex-start;gap:10px">${u ? `<button class="img nu-mini" data-act="verImagen" data-src="${esc(u)}" aria-label="Ver foto"><img src="${esc(u)}" alt=""></button>` : ''}<div class="grow stack" style="gap:2px"><b class="small">${esc(x.plato || 'Plato sin nombre')}</b><span class="small muted">${esc(fCorta(x.fecha))}${x.momento ? ' · ' + esc(x.momento) : ''}${x.contexto ? ' · ' + esc(x.contexto) : ''}</span>${alimentosTxt(x) ? `<span class="small">${esc(alimentosTxt(x))}</span>` : ''}${x.nota ? `<span class="small muted">«${esc(x.nota)}»</span>` : ''}${x.coach_nota ? `<span class="small"><b>Tu respuesta:</b> ${esc(x.coach_nota)}</span>` : ''}</div>${x.coach_estado === 'anadido' ? '<span class="pill ok">Añadida</span>' : x.coach_estado === 'visto' ? '<span class="pill blue">Vista</span>' : '<span class="pill gold">Nueva</span>'}</div>
        <div class="row" style="gap:6px;flex-wrap:wrap">${x.coach_estado !== 'anadido' ? `<button class="btn sm" data-act="nuEstado" data-id="${x.id}" data-v="anadido">Añadida a sus contextos</button>` : ''}${!x.coach_estado ? `<button class="btn sm ghost" data-act="nuEstado" data-id="${x.id}" data-v="visto">Marcar vista</button>` : ''}<button class="btn sm ghost" data-act="nuNota" data-id="${x.id}">${x.coach_nota ? 'Cambiar respuesta' : 'Responder'}</button></div></div>`; }).join('') : `<p class="small muted" style="margin:0">Cuando ${esc(nom)} comparta un plato que ha creado, te aparecerá aquí para que lo añadas a sus contextos.</p>`}</div></section>
    <section class="section"><div class="section-head"><h2>Su diario de comidas</h2><span class="small muted">opcional · 14 días</span></div><div class="card stack">
      <div class="kpis" style="grid-template-columns:repeat(3,1fr)"><div class="kpi"><div class="l">Días con algo apuntado</div><b class="num">${dias.length} / 14</b></div><div class="kpi"><div class="l">Comidas apuntadas</div><b class="num">${l.length}</b></div><div class="kpi"><div class="l">Encajan con su plan</div><b class="num">${pct == null ? '—' : pct + ' %'}</b></div></div>
      ${dias.length ? dias.map(d => `<div class="stack" style="gap:0"><span class="small muted" style="padding-top:6px">${esc(fLarga(d))}</span>${l.filter(x => x.fecha === d).sort(ordMom).map(x => lineaComida(x, true)).join('')}</div>`).join('') : `<p class="small muted" style="margin:0">${esc(nom)} no ha apuntado comidas estas dos semanas. Es opcional: puedes animarle a usarlo en los días de duda.</p>`}
      <p class="note">«Encajan» cuenta «sí» como 100 % y «más o menos» como 50 %, sobre las comidas en las que lo ha indicado.</p></div></section>`;
  }
  async function estado(id, v) {
    const f = S.ficha, x = f?.comidas?.find(c => c.id === id); if (!x) return;
    const { error } = await sb.from('comidas_registro').update({ coach_estado: v }).eq('id', id); if (error) return fallo(error);
    x.coach_estado = v; if (S.c?.creacionesNuevas) S.c.creacionesNuevas = S.c.creacionesNuevas.filter(c => c.id !== id);
    toast(v === 'anadido' ? 'Marcada como añadida a sus contextos' : 'Marcada como vista'); render();
  }
  function formNota(id) {
    const f = S.ficha, x = f?.comidas?.find(c => c.id === id); if (!x) return;
    abrirSheet(`<form class="stack" id="f-nun"><h2>Responder</h2><p class="small muted">${esc(x.plato || 'Su creación')}: lo verá en su pestaña Nutrición.</p><label class="f">Tu respuesta<textarea id="nun-t" rows="4" placeholder="Ej. ¡Genial! La añado como opción de comida en tu día de entreno.">${esc(x.coach_nota || '')}</textarea></label><button class="btn full" type="submit">Guardar</button></form>`);
    $('#f-nun').addEventListener('submit', async e => {
      e.preventDefault(); const t = $('#nun-t').value.trim() || null, c = { coach_nota: t, coach_estado: x.coach_estado || 'visto' };
      const { error } = await sb.from('comidas_registro').update(c).eq('id', id); if (error) return fallo(error);
      Object.assign(x, c); if (S.c?.creacionesNuevas) S.c.creacionesNuevas = S.c.creacionesNuevas.filter(z => z.id !== id);
      cerrarSheet(); toast('Respuesta guardada'); render();
    });
  }
  /* Vista previa para el coach: lo que ve el alumno (sin su diario) */
  function datosPrevia(f) { return { nutri: { plan: (f.plan || []).filter(x => x.seccion === 'alimentacion' && x.visible !== false), url: f.planImg || {}, comidas: [] }, servicio: f.srv }; }

  function pdfContextos(btn) {
    const coach = S.modo === 'coach' && S.ficha, d = coach ? datosPrevia(S.ficha) : S.d, l = ctxDe(d.nutri);
    const nombre = coach ? (S.c.perfiles.find(p => p.id === S.ficha.id)?.nombre || '') : (S.perfil?.nombre || '');
    if (!l.length) return toast('No hay tabla de contextos');
    return PDF.contextos(nombre, l, comidasDia(d.servicio), btn);
  }

  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const a = b.dataset.act;
    if (['tab', 'ctab', 'modo', 'cerrarSub', 'fichaSub', 'cerrarFicha'].includes(a)) { S.nDoc = null; return; }
    if (!a.startsWith('nu')) return;
    switch (a) {
      case 'nuDoc': S.nDoc = b.dataset.k; render(); window.scrollTo(0, 0); break;
      case 'nuCerrar': S.nDoc = null; render(); window.scrollTo(0, 0); break;
      case 'nuCtx': S.nCtx = +b.dataset.i; try { localStorage.setItem('lof-nctx', hoyISO() + '|' + S.nCtx); } catch (err) { /* sin almacenamiento */ } render(); break;
      case 'nuDia': S.nDia = b.dataset.f; render(); break;
      case 'nuCalc': formPlato(); break;
      case 'nuInc': formInc(b.dataset.k); break;
      case 'nuIncIni': { const v = $('#inc-ini')?.value; if (!v) return toast('Elige la fecha'); try { await guardarResumen(S.ficha, d => { d.inicio = v; }); await cargarPlanificacion(S.ficha); render(); toast('Fecha guardada'); } catch (err) { fallo(err); } break; }
      case 'nuGuia': S.nGuia = +b.dataset.i; render(); break;
      case 'nuImportar': formImportar(); break;
      case 'nuFoto7': formFoto7(); break;
      case 'nuR7Obs': formR7Obs(+b.dataset.id); break;
      case 'nuR7Conc': formR7Conc(); break;
      case 'nuR7Copia': await copiarR7(); break;
      case 'nuR7Mov': { const r = resumenInc(S.ficha?.plan || []), base = S.r7ini || (r.inicio && r.inicio <= hoyISO() ? r.inicio : sumaDias(hoyISO(), -6)); S.r7ini = sumaDias(base, +b.dataset.d); render(); break; }
      case 'nuSem': try { localStorage.setItem('lof-nsem', lunesDe(hoyISO()) + '|' + b.dataset.i); localStorage.removeItem('lof-nctx'); } catch (err) { /* */ } S.nCtx = null; render(); break;
      case 'nuNueva': formComida(); break;
      case 'nuEditar': formComida(+b.dataset.id); break;
      case 'nuPdfCtx': await pdfContextos(b); break;
      case 'nuIrDiario': S.tab = 'nutri'; S.nDoc = null; S.nDia = b.dataset.f; render(); setTimeout(() => document.getElementById('nu-diario')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60); break;
      case 'nuEstado': await estado(+b.dataset.id, b.dataset.v); break;
      case 'nuNota': formNota(+b.dataset.id); break;
      case 'nuPrev': S.nDoc = null; await abrirSub('nutriPrev'); break;
    }
  });

  const aislar = fn => (...args) => { try { return fn(...args); } catch (err) { console.error(err); return `<section class="section"><div class="card small muted">No se ha podido mostrar esta parte de Nutrición. Cierra y vuelve a abrir la app.</div></section>`; } };
  /* ---------- Incorporación · primeros 14 días ----------
     Semana 1: 5 entradas (composición, estilo de vida, registro de 7 días, analítica, preferencias).
     Semana 2: reunión, entrega del plan (apartados publicados) y suplementación.
     Cada entrada se guarda como fila privada de planificación (clave «inc-…», no visible: notas y archivos solo del coach)
     y un resumen sin contenido (clave «incorporacion», visible) para que el alumno vea en qué punto está. */
  const INC = [['composicion', 'Composición corporal', '📏', 'Peso, % de grasa, percentil y objetivos realistas'], ['estilo', 'Cuestionario de estilo de vida', '📝', 'Trabajo, descanso, entrenamiento, estrés, hábitos, digestión'], ['registro7', 'Registro de alimentación · 7 días', '📷', 'Todo lo que come y bebe, mejor con fotos'], ['analitica', 'Analítica de sangre y orina', '🩸', 'Y de heces si hiciera falta'], ['preferencias', 'Preferencias alimentarias', '🥦', 'Qué alimentos le gustan y cuáles no; alergias e intolerancias']];
  const INC_EST = { pendiente: ['Pendiente', ''], recibido: ['Recibido', 'blue'], revision: ['Revisar', 'warn'], validado: ['Validado', 'ok'], no_disponible: ['No disponible', ''], no_aplica: ['No aplica', ''] };
  const ENTREGAS = [['contexto', 'Informe de contexto y plan de acción'], ['contextos', 'Contextos y macros'], ['equivalencias', 'Guía visual de equivalencias'], ['menus', 'Menús por contexto'], ['platos', 'Cómo construir tus platos'], ['suplementacion', 'Plan de suplementación']];
  const esInc = x => /^inc-|^incorporacion$/.test(x?.clave || '');
  const incHecho = e => ['recibido', 'revision', 'validado', 'no_aplica', 'no_disponible'].includes(e);
  const resumenInc = plan => plan.find(x => x.clave === 'incorporacion')?.datos || {};
  const diaInc = r => r.inicio ? Math.max(1, Math.floor((fecha(hoyISO()) - fecha(r.inicio)) / 864e5) + 1) : null;
  /* Composición corporal de referencia para la incorporación: la medición sobre la que se fijaron los objetivos
     (la última hasta el día en que se creó el objetivo; si no consta, la primera medición) */
  function refComp(f, a) {
    const med = conKgGrasa((f?.med || []).slice().sort((x, y) => String(x.fecha).localeCompare(String(y.fecha)))), obj = f?.medObj || null;
    if (!med.length) return { ref: null, obj };
    const dia = String(obj?.created_at || obj?.creado_at || '').slice(0, 10), antes = dia ? med.filter(m => m.fecha <= dia) : [];
    const ref = antes.length ? antes[antes.length - 1] : med[0];
    const cl = clasifGrasa(ref.grasa_pct, a?.sexo, edadDe(a?.fecha_nacimiento, ref.fecha));
    return { ref, obj, cl, edad: edadDe(a?.fecha_nacimiento, ref.fecha) };
  }
  const CAMPOS_REF = [['peso', 'Peso', ' kg'], ['grasa_pct', '% grasa', ' %'], ['grasa_kg', 'Kg de grasa', ' kg'], ['cintura', 'Cintura', ' cm'], ['cadera', 'Cadera', ' cm'], ['abd_bajo', 'Abdomen bajo', ' cm']];
  function textoComp(c, a) {
    if (!c.ref) return '';
    const r = c.ref, o = c.obj || {}, mm = r.peso && r.grasa_kg != null ? r.peso - r.grasa_kg : null;
    const l = [`Composición corporal de referencia (${fCorta(r.fecha)})${a?.sexo ? ` · ${a.sexo}` : ''}${c.edad != null ? `, ${c.edad} años` : ''}`];
    CAMPOS_REF.forEach(([k, t, u]) => { if (r[k] != null) l.push(`- ${t}: ${fmtNum(r[k])}${u}${o[k] != null ? ` → objetivo ${fmtNum(Number(o[k]))}${u}` : ''}`); });
    if (mm != null) l.push(`- Masa magra: ${fmtNum(mm)} kg`);
    if (c.cl) l.push(`- Percentil de grasa: ${c.cl.l} (rango saludable ${RANGOS_GRASA[a.sexo].find(x => (c.edad ?? 30) <= x[0]).slice(1, 3).join('–')} %, tramo ${c.cl.tramo} años)`);
    if (c.obj) l.push(`- Objetivo${o.fecha ? ` para el ${fCorta(o.fecha)}` : ''}${o.nota ? `: ${o.nota}` : ''}`);
    return l.join('\n');
  }
  function vRefComp(c, a) {
    if (!c.ref) return `<div class="card small muted">Aún no tiene mediciones. Añade la valoración inicial en «Composición corporal» de su ficha y aquí aparecerá sola.</div>`;
    const r = c.ref, o = c.obj || {};
    return `<div class="card stack" style="gap:6px"><div class="row" style="gap:8px"><b class="grow small">Medición de referencia · ${esc(fCorta(r.fecha))}</b>${c.cl ? `<span class="pill ${c.cl.n}">${esc(c.cl.l)}</span>` : ''}</div>
      ${CAMPOS_REF.filter(([k]) => r[k] != null).map(([k, t, u]) => `<div class="row small"><span class="grow">${t}</span><b>${fmtNum(r[k])}${u}</b>${o[k] != null ? `<span class="muted">&nbsp;→ 🎯 ${fmtNum(Number(o[k]))}${u}</span>` : ''}</div>`).join('')}
      ${c.obj ? (o.nota ? `<p class="small" style="margin:0">🎯 ${esc(o.nota)}</p>` : '') : '<p class="small" style="color:var(--warn);margin:0">Falta fijar el objetivo de composición corporal (botón 🎯 Objetivo en su ficha).</p>'}
      <button type="button" class="btn sm ghost" id="inc-cc" style="align-self:flex-start">📋 Copiar para ChatGPT</button></div>`;
  }
  function vIncCoach(f, a) {
    const plan = f.plan; if (!plan) return '<section class="section"><div class="card small muted">Cargando su incorporación…</div></section>';
    const r = resumenInc(plan), it0 = r.items || {}, dia = diaInc(r), nom = (a?.nombre || '').split(' ')[0], cc = refComp(f, a);
    // la composición corporal se rellena sola con la medición de referencia y el objetivo de su ficha
    const it = { ...it0, composicion: it0.composicion?.estado && it0.composicion.estado !== 'pendiente' ? it0.composicion : cc.ref ? { ...(it0.composicion || {}), estado: cc.obj ? 'recibido' : 'revision', fecha: cc.ref.fecha } : it0.composicion };
    const resComp = cc.ref ? `Ref. ${fCorta(cc.ref.fecha)}: ${[cc.ref.peso != null && fmtNum(cc.ref.peso) + ' kg', cc.ref.grasa_pct != null && fmtNum(cc.ref.grasa_pct) + ' %'].filter(Boolean).join(' · ')}${cc.cl ? ' (' + cc.cl.l + ')' : ''}${cc.obj ? ` → 🎯 ${[cc.obj.peso != null && fmtNum(Number(cc.obj.peso)) + ' kg', cc.obj.grasa_pct != null && fmtNum(Number(cc.obj.grasa_pct)) + ' %'].filter(Boolean).join(' · ')}` : ' · falta objetivo'}` : '';
    const filaE = ([k, t, ic, s]) => { const x = plan.find(z => z.clave === 'inc-' + k), e = it[k]?.estado || 'pendiente', st = INC_EST[e], nf = (x?.imagenes || []).length;
      return `<button class="line inc-l" data-act="nuInc" data-k="${k}" style="width:100%;text-align:left;cursor:pointer"><span class="inc-ic">${ic}</span><div class="grow"><b class="small">${esc(t)}</b><div class="small muted">${k === 'composicion' && resComp ? esc(resComp) : `${it[k]?.fecha ? esc(fCorta(it[k].fecha)) + ' · ' : ''}${nf ? `${nf} archivo${nf > 1 ? 's' : ''} · ` : ''}${it[k]?.calidad ? esc(it[k].calidad) + ' · ' : ''}${x?.contenido ? 'con notas' : esc(s)}`}</div></div><span class="pill ${st[1]}">${st[0]}</span></button>`; };
    const pub = k => { const x = plan.find(z => z.clave === k); return !x || !(x.contenido || (x.imagenes || []).length || (x.datos?.ctx || []).length) ? ['Vacío', ''] : x.visible === false ? ['Borrador', 'warn'] : ['Publicado', 'ok']; };
    const hechos = INC.filter(([k]) => incHecho(it[k]?.estado)).length;
    return `<section class="section"><div class="section-head"><h2>Primeros 14 días</h2><span class="small muted">${dia ? `Día ${Math.min(dia, 99)}${dia <= 14 ? ' de 14' : ''}` : ''}</span></div>
      <div class="card stack" style="gap:10px"><div class="row small" style="gap:8px;flex-wrap:wrap;align-items:center"><span class="grow">Inicio de su incorporación</span><input type="date" id="inc-ini" value="${esc(r.inicio || '')}" style="max-width:170px"><button class="btn sm ghost" data-act="nuIncIni">Guardar</button></div>
        <div class="inc-bar"><i style="width:${Math.round(hechos / INC.length * 100)}%"></i></div>
        <span class="eyebrow">Semana 1 · toma de datos · ${hechos}/${INC.length}</span>${INC.map(filaE).join('')}
        <span class="eyebrow" style="margin-top:6px">Semana 2 · análisis y estrategia</span>
        <button class="line inc-l" data-act="nuInc" data-k="reunion" style="width:100%;text-align:left;cursor:pointer"><span class="inc-ic">🤝</span><div class="grow"><b class="small">Reunión personalizada</b><div class="small muted">${it.reunion?.fecha ? esc(fCorta(it.reunion.fecha)) + ' · ' : ''}Lo que hace bien, lo que le limita y sus 3–4 prioridades</div></div><span class="pill ${INC_EST[it.reunion?.estado || 'pendiente'][1]}">${it.reunion?.estado === 'validado' ? 'Hecha' : it.reunion?.estado === 'recibido' ? 'Programada' : 'Pendiente'}</span></button>
        ${ENTREGAS.map(([k, t]) => { const p = pub(k); return `<button class="line inc-l" data-act="editarApartado" data-sec="alimentacion" data-k="${k}" style="width:100%;text-align:left;cursor:pointer"><span class="inc-ic">${(DOCS.find(d => d[0] === k) || [])[3] || '📄'}</span><div class="grow"><b class="small">${esc(t)}</b><div class="small muted">${p[0] === 'Publicado' ? `${esc(nom)} ya lo ve en Nutrición` : p[0] === 'Borrador' ? 'Guardado, aún no lo ve' : 'Sin subir todavía'}</div></div><span class="pill ${p[1]}">${p[0]}</span></button>`; }).join('')}
        <button class="btn full" data-act="nuImportar">📥 Importar su plan desde ChatGPT</button>
        <p class="note">Las notas y archivos de la semana 1 son privados. ${esc(nom)} solo ve en qué punto está cada paso.</p></div></section>`;
  }
  function formInc(k) {
    const f = S.ficha, def = k === 'reunion' ? ['reunion', 'Reunión personalizada', '🤝', 'Presencial o digital'] : INC.find(z => z[0] === k); if (!f || !def) return;
    const x = (f.plan || []).find(z => z.clave === 'inc-' + k) || {}, r = resumenInc(f.plan || []), cur = (r.items || {})[k] || {};
    const est = k === 'reunion' ? [['pendiente', 'Pendiente'], ['recibido', 'Programada'], ['validado', 'Hecha']] : Object.entries(INC_EST).map(([v, [t]]) => [v, t]);
    abrirSheet(`<form class="stack" id="f-inc"><h2>${def[2]} ${esc(def[1])}</h2><p class="small muted" style="margin-top:-8px">${esc(def[3])}</p>
      ${k === 'composicion' ? vRefComp(refComp(f, (S.c?.perfiles || []).find(p => p.id === f.id)), (S.c?.perfiles || []).find(p => p.id === f.id)) : ''}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><label class="f">Estado<select id="inc-e">${est.map(([v, t]) => `<option value="${v}" ${(cur.estado || 'pendiente') === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label><label class="f">Fecha<input type="date" id="inc-f" value="${esc(cur.fecha || '')}"></label></div>
      ${k === 'reunion' ? '' : `<label class="f">Calidad de la información<select id="inc-q"><option value="">Sin valorar</option>${['Completa', 'Parcial', 'Insuficiente'].map(v => `<option ${cur.calidad === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>`}
      <label class="f">Notas (solo tú)<textarea id="inc-n" rows="6" placeholder="${k === 'reunion' ? 'Lo que hace bien, lo que le limita, prioridades acordadas…' : k === 'analitica' ? 'Valores destacados con su unidad y rango del laboratorio, fecha de extracción…' : 'Lo más importante de lo recibido…'}">${esc(x.contenido || '')}</textarea></label>
      ${(x.imagenes || []).length ? `<div class="stack" style="gap:6px"><span class="small"><b>Archivos</b> · marca los que quieras quitar</span><div class="plan-imgs">${x.imagenes.map((p, i) => `<label class="plan-q">${esPdf(p) ? `<a class="plan-pdf" href="${esc(f.planImg?.[p] || '#')}" target="_blank" rel="noopener">📄 PDF</a>` : `<img src="${esc(f.planImg?.[p] || '')}" alt="">`}<span><input type="checkbox" data-quitar="${i}"> Quitar</span></label>`).join('')}</div></div>` : ''}
      ${k === 'reunion' ? '' : '<label class="f">Añadir fotos o PDF (informes, capturas, analítica, cuestionario…)<input type="file" id="inc-a" accept="image/*,application/pdf" multiple></label>'}
      <p class="err" id="inc-err"></p><button class="btn full" id="inc-b">Guardar</button></form>`);
    $('#inc-cc')?.addEventListener('click', async () => { const al = (S.c?.perfiles || []).find(p => p.id === f.id), t = textoComp(refComp(f, al), al); try { await navigator.clipboard.writeText(t); toast('Copiado'); } catch (e) { prompt('Copia el texto', t); } });
    $('#f-inc').addEventListener('submit', async e => {
      e.preventDefault(); const btn = $('#inc-b'); btn.disabled = true; btn.textContent = 'Guardando…';
      try {
        const quitar = [...document.querySelectorAll('#f-inc [data-quitar]:checked')].map(c => x.imagenes[+c.dataset.quitar]);
        const imagenes = (x.imagenes || []).filter(p => !quitar.includes(p));
        for (const file of ($('#inc-a')?.files || [])) {
          const pdf = /pdf/i.test(file.type) || /\.pdf$/i.test(file.name), blob = pdf ? file : await reducirImagen(file, 1800), ruta = `${f.id}/inc-${k}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${pdf ? 'pdf' : 'jpg'}`;
          const up = await sb.storage.from('planificacion').upload(ruta, blob, { contentType: pdf ? 'application/pdf' : 'image/jpeg' }); if (up.error) throw up.error; imagenes.push(ruta);
        }
        if (quitar.length) await sb.storage.from('planificacion').remove(quitar);
        const estado = $('#inc-e').value, item = { estado, fecha: $('#inc-f').value || (estado !== 'pendiente' ? hoyISO() : null), calidad: $('#inc-q')?.value || null };
        const fila = { alumno_id: f.id, seccion: 'alimentacion', clave: 'inc-' + k, titulo: def[1], contenido: $('#inc-n').value.trim() || null, imagenes, orden: 90, visible: false, actualizado_at: new Date().toISOString() };
        let q = x.id ? await sb.from('planificacion').update(fila).eq('id', x.id) : await sb.from('planificacion').insert(fila); if (q.error) throw q.error;
        await guardarResumen(f, d => { d.items = { ...(d.items || {}), [k]: item }; if (!d.inicio && estado !== 'pendiente') d.inicio = item.fecha; });
        cerrarSheet(); toast('Guardado'); await cargarPlanificacion(f); render();
      } catch (err) { btn.disabled = false; btn.textContent = 'Guardar'; $('#inc-err').textContent = 'No se ha podido guardar' + (err?.message ? ` (${err.message.slice(0, 120)})` : ''); console.error(err); }
    });
  }
  async function guardarResumen(f, cambia) {
    const x = (f.plan || []).find(z => z.clave === 'incorporacion'), d = JSON.parse(JSON.stringify(x?.datos || {})); cambia(d);
    const fila = { alumno_id: f.id, seccion: 'alimentacion', clave: 'incorporacion', titulo: 'Primeros 14 días', datos: d, imagenes: [], orden: 91, visible: true, actualizado_at: new Date().toISOString() };
    const q = x?.id ? await sb.from('planificacion').update({ datos: d, actualizado_at: fila.actualizado_at }).eq('id', x.id) : await sb.from('planificacion').insert(fila);
    if (q.error) throw q.error;
  }
  /* Lo que ve el alumno: en qué punto están sus 14 primeros días */
  function vIncAlumno(n, d) {
    const r = resumenInc(n.plan), it = r.items || {}, f = fase(d);
    if (!r.items && !r.inicio) return '';
    const pub = k => { const x = docDe(n, k); return !!x && tiene(x); };
    const planListo = ['contextos', 'equivalencias', 'menus', 'contexto'].some(pub);
    if (f === 'activo' && planListo && INC.every(([k]) => incHecho(it[k]?.estado))) return '';
    const dia = diaInc(r), TXT = { composicion: 'Mediremos tu porcentaje de grasa y fijaremos objetivos realistas.', estilo: 'Rellena el cuestionario: trabajo, descanso, estrés, digestión…', registro7: 'Apunta todo lo que comes y bebes, mejor con foto, sin cambiar nada.', analitica: 'Te indicaremos qué parámetros necesitamos analizar.', preferencias: 'Dinos qué alimentos te gustan y cuáles no.' };
    const fila = ([k, t, ic]) => { const e = it[k]?.estado || 'pendiente', ok = incHecho(e); return `<div class="inc-a ${ok ? 'ok' : ''}"><span class="inc-ic">${ok ? '✓' : ic}</span><div class="grow"><b>${esc(t)}</b><small>${ok ? (e === 'no_aplica' ? 'No hace falta en tu caso' : e === 'no_disponible' ? 'Seguimos sin este dato, no pasa nada' : 'Recibido') : esc(TXT[k])}</small></div>${!ok && k === 'registro7' ? '<button class="btn sm" data-act="nuIrDiario">Apuntar</button>' : ''}</div>`; };
    return `<section class="section"><div class="card inc-alu stack"><div class="row"><div class="grow"><span class="eyebrow">Tus primeros 14 días</span><h3 style="margin:2px 0 0">Primero te conocemos. Después construimos tu estrategia.</h3></div>${dia && dia <= 14 ? `<span class="pill gold">Día ${dia}/14</span>` : ''}</div>
      <div class="inc-sem"><b>Semana 1 · Toma de datos</b>${INC.map(fila).join('')}</div>
      <div class="inc-sem"><b>Semana 2 · Análisis y estrategia</b>
        <div class="inc-a ${it.reunion?.estado === 'validado' ? 'ok' : ''}"><span class="inc-ic">${it.reunion?.estado === 'validado' ? '✓' : '🤝'}</span><div class="grow"><b>Reunión personalizada</b><small>${it.reunion?.estado === 'validado' ? 'Hecha' : it.reunion?.estado === 'recibido' ? 'Programada' + (it.reunion?.fecha ? ' · ' + esc(fCorta(it.reunion.fecha)) : '') : 'Revisaremos juntos lo que haces bien, lo que te limita y tus 3–4 prioridades.'}</small></div></div>
        <div class="inc-a ${planListo ? 'ok' : ''}"><span class="inc-ic">${planListo ? '✓' : '🍽️'}</span><div class="grow"><b>Entrega de tu plan personalizado</b><small>${planListo ? 'Ya lo tienes aquí abajo, en «Tu plan»' : 'Menú adaptado a tu contexto, guía visual de cantidades y estructura de platos.'}</small></div></div>
        <div class="inc-a ${pub('suplementacion') ? 'ok' : ''}"><span class="inc-ic">${pub('suplementacion') ? '✓' : '💊'}</span><div class="grow"><b>Plan de suplementación</b><small>${pub('suplementacion') ? 'Ya lo tienes en «Tu plan»' : 'Si ya tenemos tu analítica, te lo entregamos individualizado.'}</small></div></div></div>
      <p class="small muted" style="margin:0">No es una dieta estricta: es una estrategia personalizada, comiendo lo que te gusta y sin efecto rebote.</p></div></section>`;
  }
  /* ---------- Calcula tu plato ----------
     El alumno elige contexto, comida y alimentos; se calculan los gramos para acercarse a los macros de esa comida
     (como la calculadora de pesos del entreno). Composición media por 100 g de tablas de composición (orientativa:
     marca y cocción la cambian). u = medida casera [nombre singular, nombre plural, gramos]. */
  const ALI = [
    // proteínas
    ['Pollo (pechuga) en crudo', 110, 23, 0, 1.5, 'P', ['filete tamaño palma', 'filetes tamaño palma', 130]],
    ['Pollo (pechuga) cocinado', 165, 31, 0, 3.6, 'P', ['filete tamaño palma', 'filetes tamaño palma', 100]],
    ['Pavo (pechuga) en crudo', 105, 24, 0, 1, 'P', ['filete tamaño palma', 'filetes tamaño palma', 130]],
    ['Ternera magra en crudo', 130, 21, 0, 5, 'P', ['filete tamaño palma', 'filetes tamaño palma', 130]],
    ['Ternera magra cocinada', 180, 29, 0, 7, 'P', ['filete tamaño palma', 'filetes tamaño palma', 100]],
    ['Lomo de cerdo en crudo', 140, 21, 0, 6, 'P', ['filete tamaño palma', 'filetes tamaño palma', 130]],
    ['Salmón en crudo', 200, 20, 0, 13, 'P', ['lomo mediano', 'lomos medianos', 150]],
    ['Pescado blanco en crudo (merluza, bacalao…)', 80, 17, 0, 1, 'P', ['filete mediano', 'filetes medianos', 150]],
    ['Atún al natural (escurrido)', 110, 25, 0, 1, 'P', ['lata pequeña', 'latas pequeñas', 60]],
    ['Gambas o langostinos pelados', 85, 18, 0, 1, 'P', ['taza', 'tazas', 150]],
    ['Huevo entero', 145, 12.5, 0.7, 10, 'P', ['huevo', 'huevos', 50]],
    ['Claras de huevo', 50, 11, 0.7, 0.2, 'P', ['clara', 'claras', 33]],
    ['Jamón serrano', 240, 31, 0, 13, 'P', ['loncha fina', 'lonchas finas', 10]],
    ['Queso fresco batido 0 %', 46, 8, 3.5, 0.2, 'P', ['tarrina', 'tarrinas', 250]],
    ['Yogur alto en proteína', 60, 10, 4, 0.2, 'P', ['envase', 'envases', 200]],
    ['Tofu firme', 120, 13, 2, 7, 'P', ['taza en dados', 'tazas en dados', 150]],
    ['Proteína en polvo (whey)', 380, 78, 6, 6, 'P', ['cacito', 'cacitos', 30]],
    // hidratos
    ['Arroz blanco cocido', 130, 2.7, 28, 0.3, 'C', ['taza', 'tazas', 190]],
    ['Arroz integral cocido', 112, 2.6, 23, 0.9, 'C', ['taza', 'tazas', 190]],
    ['Pasta cocida', 150, 5.5, 30, 0.9, 'C', ['taza', 'tazas', 145]],
    ['Patata cocida', 80, 2, 17, 0.1, 'C', ['patata mediana', 'patatas medianas', 180]],
    ['Boniato cocido', 86, 1.6, 20, 0.1, 'C', ['boniato mediano', 'boniatos medianos', 200]],
    ['Yuca cocida', 125, 1, 30, 0.3, 'C', ['taza en trozos', 'tazas en trozos', 185]],
    ['Quinoa cocida', 120, 4.4, 21, 1.9, 'C', ['taza', 'tazas', 185]],
    ['Cuscús cocido', 112, 3.8, 23, 0.2, 'C', ['taza', 'tazas', 160]],
    ['Ñoquis', 133, 3, 28, 0.5, 'C', ['taza', 'tazas', 180]],
    ['Pan integral', 240, 10, 41, 3.5, 'C', ['rebanada', 'rebanadas', 30]],
    ['Pan blanco', 265, 9, 49, 3.2, 'C', ['rebanada', 'rebanadas', 30]],
    ['Copos de avena', 370, 13, 60, 7, 'C', ['taza', 'tazas', 80]],
    ['Tortitas de arroz', 380, 8, 81, 3, 'C', ['tortita', 'tortitas', 8]],
    ['Maíz cocido', 96, 3.4, 19, 1.5, 'C', ['taza', 'tazas', 165]],
    ['Lentejas cocidas', 116, 9, 17, 0.4, 'C', ['taza', 'tazas', 200]],
    ['Garbanzos cocidos', 140, 8, 19, 2.6, 'C', ['taza', 'tazas', 200]],
    ['Alubias cocidas', 110, 7.5, 16, 0.5, 'C', ['taza', 'tazas', 200]],
    ['Plátano', 89, 1.1, 21, 0.3, 'C', ['plátano mediano', 'plátanos medianos', 110]],
    ['Manzana', 52, 0.3, 12, 0.2, 'C', ['manzana mediana', 'manzanas medianas', 150]],
    ['Naranja', 47, 0.9, 10, 0.1, 'C', ['naranja mediana', 'naranjas medianas', 160]],
    ['Fresas', 32, 0.7, 6, 0.3, 'C', ['taza', 'tazas', 150]],
    ['Arándanos', 57, 0.7, 12, 0.3, 'C', ['taza', 'tazas', 145]],
    ['Dátiles', 280, 2.5, 66, 0.4, 'C', ['dátil', 'dátiles', 8]],
    ['Miel', 304, 0.3, 82, 0, 'C', ['cucharada', 'cucharadas', 20]],
    // grasas
    ['Aceite de oliva virgen extra', 884, 0, 0, 100, 'G', ['cucharada', 'cucharadas', 13.5]],
    ['Aguacate (pulpa)', 160, 2, 2, 15, 'G', ['aguacate mediano', 'aguacates medianos', 140]],
    ['Nueces', 654, 15, 7, 65, 'G', ['puñado pequeño', 'puñados pequeños', 20]],
    ['Almendras', 580, 21, 9, 50, 'G', ['puñado pequeño', 'puñados pequeños', 20]],
    ['Crema de cacahuete 100 %', 590, 25, 15, 50, 'G', ['cucharada rasa', 'cucharadas rasas', 15]],
    ['Aceitunas', 145, 1, 0.5, 15, 'G', ['aceituna', 'aceitunas', 4]],
    ['Queso curado', 400, 26, 0.5, 33, 'G', ['loncha fina', 'lonchas finas', 15]],
    ['Chocolate negro 85 %', 600, 10, 20, 50, 'G', ['onza', 'onzas', 10]],
    // lácteos y verdura
    ['Leche semidesnatada', 46, 3.3, 4.8, 1.6, 'L', ['vaso', 'vasos', 250]],
    ['Leche entera', 64, 3.2, 4.7, 3.6, 'L', ['vaso', 'vasos', 250]],
    ['Kéfir natural', 60, 3.3, 4, 3.5, 'L', ['vaso pequeño', 'vasos pequeños', 200]],
    ['Yogur griego natural', 120, 4, 4, 10, 'L', ['envase', 'envases', 125]],
    ['Verdura variada (ensalada, brócoli, judías…)', 30, 2, 4, 0.3, 'V', ['plato', 'platos', 250]],
    ['Calabaza o zanahoria cocida', 25, 0.8, 5, 0.1, 'V', ['taza', 'tazas', 150]]
  ].map(([n, kcal, p, c, gr, t, u]) => ({ n, kcal, p, c, g: gr, t, u }));
  const FRAC = [[0, ''], [0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾']];
  function equivVisual(a, gramos) {
    const x = gramos / a.u[2]; if (x < 0.2) return `${fmtNum(gramos, 0)} g`;
    const ent = Math.floor(x), r = x - ent, [fv, fs] = FRAC.reduce((m, f) => Math.abs(f[0] - r) < Math.abs(m[0] - r) ? f : m, [1, '']), n = fv === 1 ? ent + 1 : ent;
    const txt = (n ? String(n) : '') + (fv !== 1 && fs ? (n ? ' ' : '') + fs : '');
    return `≈ ${txt || '¼'} ${(n > 1 || (n === 1 && fs && fv !== 1)) ? a.u[1] : a.u[0]}`;
  }
  /* Reparto de los macros del contexto en sus ingestas: por defecto a partes iguales; «reparto» del contexto (ej. 70,30) si lo hay */
  function objetivoComida(c, k, nIng) {
    const rep = String(c.rep || '').split(/[,;/ ]+/).map(Number).filter(v => v > 0), n = Math.max(1, +c.ing || nIng || 1);
    const w = rep.length === n ? rep[k] / rep.reduce((a, b) => a + b, 0) : 1 / n;
    return { p: (+c.p || 0) * w, c: (+c.c || 0) * w, g: (+c.g || 0) * w, kcal: (+c.kcal || 0) * w, w };
  }
  /* Límites de sentido común por comida: [mín, máx] en gramos, paso de redondeo y «ud» = se cuenta en unidades enteras
     (huevos, rebanadas, latas…). «comp» = alimento complemento (aporta varios macros, p. ej. el huevo con pollo): va en
     unidades razonables y la fuente principal completa el resto. Así nunca salen 4 huevos ni 60 g de aceite. */
  const LIM_T = { P: [80, 220, 10], C: [50, 350, 10], G: [0, 20, 5], L: [0, 500, 25], V: [0, 500, 25] };
  const LIM = {
    'Pollo (pechuga) en crudo': [90, 260], 'Pollo (pechuga) cocinado': [70, 200], 'Pavo (pechuga) en crudo': [90, 260],
    'Ternera magra en crudo': [90, 250], 'Ternera magra cocinada': [70, 200], 'Lomo de cerdo en crudo': [90, 250],
    'Salmón en crudo': [100, 220], 'Pescado blanco en crudo (merluza, bacalao…)': [100, 300], 'Gambas o langostinos pelados': [80, 250],
    'Atún al natural (escurrido)': [1, 3, 1, 'ud'], 'Huevo entero': [1, 3, 1, 'ud', 0.35], 'Claras de huevo': [2, 8, 1, 'ud'],
    'Jamón serrano': [20, 80, 10], 'Queso fresco batido 0 %': [100, 350, 25], 'Yogur alto en proteína': [1, 2, 1, 'ud'],
    'Tofu firme': [80, 250], 'Proteína en polvo (whey)': [15, 45, 5],
    'Patata cocida': [80, 500], 'Boniato cocido': [80, 450], 'Yuca cocida': [80, 350], 'Quinoa cocida': [60, 300], 'Cuscús cocido': [60, 300],
    'Ñoquis': [80, 300], 'Pan integral': [1, 4, 1, 'ud'], 'Pan blanco': [1, 4, 1, 'ud'], 'Copos de avena': [20, 120, 5], 'Tortitas de arroz': [1, 6, 1, 'ud'],
    'Maíz cocido': [50, 250], 'Lentejas cocidas': [80, 300], 'Garbanzos cocidos': [80, 300], 'Alubias cocidas': [80, 300],
    'Plátano': [0.5, 2, 0.5, 'ud'], 'Manzana': [0.5, 2, 0.5, 'ud'], 'Naranja': [1, 2, 1, 'ud'], 'Fresas': [50, 300], 'Arándanos': [50, 200],
    'Dátiles': [1, 6, 1, 'ud'], 'Miel': [5, 30, 5],
    'Aceite de oliva virgen extra': [0, 20, 5], 'Aguacate (pulpa)': [0, 140, 10], 'Nueces': [0, 30, 5], 'Almendras': [0, 30, 5],
    'Crema de cacahuete 100 %': [0, 30, 5], 'Aceitunas': [0, 15, 1, 'ud'], 'Queso curado': [0, 3, 1, 'ud'], 'Chocolate negro 85 %': [0, 3, 1, 'ud'],
  };
  /* Límites en gramos: { min, max, paso, ud, comp } */
  function lim(a) {
    const b = LIM_T[a.t] || [0, 500, 10], o = LIM[a.n] || [], ud = o[3] === 'ud', k = ud ? a.u[2] : 1;
    return { min: (o[0] ?? b[0]) * k, max: (o[1] ?? b[1]) * k, paso: (o[2] ?? b[2]) * k, ud, comp: o[4] || 0 };
  }
  const rolDe = a => a.t === 'P' ? 'p' : a.t === 'C' ? 'c' : a.t === 'G' ? 'g' : null;
  const NOM_M = { p: 'proteína', c: 'hidratos', g: 'grasa' };
  /* Cálculo por prioridades:
     1) Verdura y lácteos: una ración. Complementos (huevo junto a otra proteína): 1–2 unidades, ~⅓ de la proteína.
     2) Cada macro lo completa su fuente principal descontando lo que ya aportan los demás, sin salirse de sus límites.
     3) Lo que se cuenta en unidades se redondea a unidades enteras y se recalcula el resto.
     4) Si no se puede llegar sin exagerar, se avisa en lugar de inventar cantidades. */
  function calcular(sel, obj) {
    const L = sel.map(s => lim(s.a)), fijo = sel.map(s => s.fijo != null), q = sel.map((s, i) => s.fijo != null ? s.fijo : 0);
    const hayOtra = m => i => sel.some((s, j) => j !== i && rolDe(s.a) === m && !L[j].comp);
    sel.forEach((s, i) => {
      if (fijo[i]) return;
      if (s.a.t === 'V' || s.a.t === 'L') { q[i] = s.a.u[2]; fijo[i] = true; }
      else if (L[i].comp && hayOtra(rolDe(s.a))(i)) {
        const m = rolDe(s.a), u = s.a.u[2], n = Math.round(obj[m] * L[i].comp / (s.a[m] * u / 100));
        q[i] = Math.min(2, Math.max(1, n)) * u; fijo[i] = true;
      }
    });
    const resolver = () => {
      for (let it = 0; it < 30; it++) ['p', 'c', 'g'].forEach(m => {
        const idx = sel.map((s, i) => i).filter(i => !fijo[i] && rolDe(sel[i].a) === m); if (!idx.length) return;
        const otros = sel.reduce((t, s, i) => t + (idx.includes(i) ? 0 : s.a[m] * q[i] / 100), 0);
        let falta = Math.max(0, obj[m] - otros), libres = idx.slice();
        // reparto: la primera fuente elegida es la principal (peso 1), las demás acompañan (peso 0,6); respetando máximos
        for (let pase = 0; pase < 4 && libres.length && falta > 0.01; pase++) {
          const w = libres.map(i => i === idx[0] ? 1 : 0.6), tw = w.reduce((a, b) => a + b, 0); let sobra = 0;
          libres = libres.filter((i, k) => {
            const g = falta * w[k] / tw / (sel[i].a[m] || 1) * 100;
            if (g > L[i].max) { q[i] = L[i].max; sobra += (g - L[i].max) * sel[i].a[m] / 100; return false; }
            q[i] = g; return true;
          });
          falta = sobra;
        }
        if (!libres.length && falta > 0.01) return;
        idx.forEach(i => { if (!libres.includes(i) && q[i] < L[i].max) q[i] = Math.min(q[i], L[i].max); });
      });
    };
    resolver();
    // unidades enteras (o medias) primero y se vuelve a ajustar lo que va en gramos
    sel.forEach((s, i) => { if (!fijo[i] && L[i].ud) { q[i] = Math.min(L[i].max, Math.max(L[i].min, Math.round(q[i] / L[i].paso) * L[i].paso)); fijo[i] = true; } });
    resolver();
    const gr = sel.map((s, i) => {
      if (s.fijo != null) return s.fijo;
      if (fijo[i]) return Math.round(q[i]);
      const l = L[i]; let v = Math.round(q[i] / l.paso) * l.paso;
      if (s.a.t === 'G' && v < l.paso) return 0;                 // la grasa ya la ponen los demás
      return Math.min(l.max, Math.max(l.min, v));                 // nunca un plato ridículo (30 g de pollo) ni exagerado
    });
    const tot = ['kcal', 'p', 'c', 'g'].reduce((o, m) => ({ ...o, [m]: sel.reduce((t, s, i) => t + s.a[m] * gr[i] / 100, 0) }), {});
    // avisos honestos cuando no cuadra sin exagerar
    const avisos = [];
    ['p', 'c', 'g'].forEach(m => {
      const dif = tot[m] - obj[m], tol = m === 'g' ? Math.max(6, obj[m] * 0.25) : Math.max(8, obj[m] * 0.15);
      if (Math.abs(dif) <= tol || obj[m] < 5) return;
      const fuentes = sel.map((s, i) => i).filter(i => rolDe(sel[i].a) === m && !L[i].comp);
      if (dif < 0) {
        const tope = fuentes.filter(i => gr[i] >= L[i].max - 0.5).map(i => sel[i].a.n.split(' (')[0].toLowerCase());
        avisos.push(!fuentes.length ? `Faltan ~${fmtNum(-dif, 0)} g de ${NOM_M[m]}: añade una fuente (${m === 'p' ? 'pollo, atún, claras, yogur proteico…' : m === 'c' ? 'arroz, patata, pan, fruta…' : 'aceite, aguacate, frutos secos…'}).`
          : tope.length ? `Faltan ~${fmtNum(-dif, 0)} g de ${NOM_M[m]}: ${tope.join(' y ')} ya está en una ración generosa. Mejor añade otra fuente que poner más cantidad.` : `Faltan ~${fmtNum(-dif, 0)} g de ${NOM_M[m]}.`);
      } else {
        const top = sel.map((s, i) => [i, s.a[m] * gr[i] / 100]).filter(([i]) => rolDe(sel[i].a) !== m || L[i].comp).sort((a, b) => b[1] - a[1])[0];
        avisos.push(`Te pasas ~${fmtNum(dif, 0)} g de ${NOM_M[m]}${top && top[1] > 2 ? ` por ${sel[top[0]].a.n.split(' (')[0].toLowerCase()}` : ''}${m === 'g' ? '. Cocina sin aceite o elige una opción más magra.' : m === 'p' ? '. No pasa nada: la proteína de más no es un problema.' : '.'}`);
      }
    });
    return { gr, tot, avisos };
  }
  /* Explica que la cantidad de una fuente ya descuenta lo que ponen los alimentos mixtos (la grasa de la yema, la proteína del queso…) */
  function descuento(sel, gr, i) {
    const m = rolDe(sel[i].a); if (!m || lim(sel[i].a).comp && sel.some((s, j) => j !== i && rolDe(s.a) === m)) return '';
    const otros = sel.map((s, j) => [s.a.n.split(' (')[0].toLowerCase(), j === i || rolDe(s.a) === m && !lim(s.a).comp ? 0 : s.a[m] * gr[j] / 100]).filter(x => x[1] >= 2);
    if (!otros.length) return '';
    return `<small class="calc-desc">↳ Ya descuenta ${fmtNum(otros.reduce((t, x) => t + x[1], 0), 0)} g de ${NOM_M[m]} que ponen ${otros.map(x => x[0]).join(' y ')}</small>`;
  }
  const st0 = () => ({ ctx: null, k: 0, sel: [] });
  function formPlato() {
    const d = S.modo === 'coach' && S.ficha ? datosPrevia(S.ficha) : S.d, n = d?.nutri || vacio(), l = ctxDe(n);
    if (!l.length) return toast('Aún no tienes contextos con macros en tu plan');
    const st = S.calc ||= st0(); if (st.ctx == null || st.ctx >= l.length) st.ctx = Math.min(selCtx(n), l.length - 1);
    const pinta = () => {
      const c = l[st.ctx], nI = Math.max(1, +c.ing || comidasDia(d?.servicio)), obj = objetivoComida(c, Math.min(st.k, nI - 1), nI);
      const r = st.sel.length ? calcular(st.sel, obj) : null;
      $('#calc-cuerpo').innerHTML = `<div class="stack" style="gap:6px"><span class="small"><b>¿Qué tipo de día es?</b></span><div class="chips">${l.map((x, i) => `<button type="button" class="pill ${i === st.ctx ? 'blue' : ''}" data-cctx="${i}">${esc(x.n)}</button>`).join('')}</div></div>
        <div class="stack" style="gap:6px"><span class="small"><b>¿Qué comida?</b></span><div class="chips">${[...Array(nI)].map((_, i) => `<button type="button" class="pill ${i === Math.min(st.k, nI - 1) ? 'blue' : ''}" data-ck="${i}">Comida ${i + 1}</button>`).join('')}</div>
          <div class="calc-obj small">Objetivo de esta comida: <b>${fmtNum(obj.kcal, 0)} kcal</b> · P ${fmtNum(obj.p, 0)} g · C ${fmtNum(obj.c, 0)} g · G ${fmtNum(obj.g, 0)} g${obj.w < 1 && !c.rep ? ' <span class="muted">(reparto a partes iguales)</span>' : ''}</div></div>
        <div class="stack" style="gap:6px"><span class="small"><b>¿Qué quieres comer?</b> <span class="muted">Elige una proteína, un hidrato y una grasa (y verdura si quieres)</span></span>
          <input type="search" id="calc-q" list="calc-ali" placeholder="Escribe un alimento: pollo, arroz, aguacate…" autocomplete="off"><datalist id="calc-ali">${ALI.map(a => `<option value="${esc(a.n)}">`).join('')}</datalist>
          <div class="chips">${['Pollo (pechuga) cocinado', 'Arroz blanco cocido', 'Patata cocida', 'Huevo entero', 'Aceite de oliva virgen extra', 'Verdura variada (ensalada, brócoli, judías…)'].filter(x => !st.sel.some(s => s.a.n === x)).map(x => `<button type="button" class="pill" data-cadd="${esc(x)}">＋ ${esc(x.split(' (')[0])}</button>`).join('')}</div></div>
        ${r ? `<div class="calc-res">${st.sel.map((s, i) => `<div class="calc-al"><div class="grow"><b>${esc(s.a.n)}</b><span>${r.gr[i] ? equivVisual(s.a, r.gr[i]) : 'No hace falta: ya lo cubren los demás alimentos'}</span>${r.gr[i] ? `<small class="calc-ap">Aporta P ${fmtNum(s.a.p * r.gr[i] / 100, 0)} · C ${fmtNum(s.a.c * r.gr[i] / 100, 0)} · G ${fmtNum(s.a.g * r.gr[i] / 100, 0)} g</small>` : ''}${descuento(st.sel, r.gr, i)}</div><div class="calc-g"><b class="num">${r.gr[i] ? fmtNum(r.gr[i], 0) + ' g' : '—'}</b>${s.fijo != null ? '<small>fijado</small>' : s.a.t === 'V' || s.a.t === 'L' ? '<small>1 ración</small>' : ''}</div><button type="button" class="btn sm ghost" data-cfix="${i}" aria-label="Fijar cantidad">✎</button><button type="button" class="btn sm ghost" data-cdel="${i}" aria-label="Quitar">✕</button></div>`).join('')}
          <div class="calc-tot small">Total: <b>${fmtNum(r.tot.kcal, 0)} kcal</b> · P ${fmtNum(r.tot.p, 0)} g · C ${fmtNum(r.tot.c, 0)} g · G ${fmtNum(r.tot.g, 0)} g ${Math.abs(r.tot.kcal - obj.kcal) <= Math.max(40, obj.kcal * 0.08) && !r.avisos.length ? '<span class="pill ok">✓ encaja</span>' : `<span class="pill warn">${r.tot.kcal > obj.kcal ? '+' : ''}${fmtNum(r.tot.kcal - obj.kcal, 0)} kcal</span>`}</div>
          ${r.avisos.map(x => `<p class="small" style="color:var(--warn);margin:0">${esc(x)}</p>`).join('')}
          <button type="button" class="btn full" id="calc-diario">🍽 Apuntar este plato en mi diario</button></div>` : ''}
        <p class="note">Cantidades orientativas con valores medios de tablas de composición: la marca, la receta y la cocción los cambian. Si tu plan de Jesús dice otra cantidad, manda la de tu plan.</p>`;
    };
    abrirSheet(`<div class="stack"><h2>🧮 Calcula tu plato</h2><div id="calc-cuerpo" class="stack" style="gap:14px"></div><button type="button" class="btn ghost full" data-act="cerrarSheet">Cerrar</button></div>`);
    pinta();
    const cuerpo = $('#calc-cuerpo');
    const add = nom => { const a = ALI.find(x => norm(x.n) === norm(nom)) || ALI.find(x => norm(x.n).includes(norm(nom))); if (!a) return toast('No encuentro ese alimento: prueba con otro nombre'); if (st.sel.some(s => s.a.n === a.n)) return; if (st.sel.length >= 5) return toast('Máximo 5 alimentos'); st.sel.push({ a }); pinta(); };
    cuerpo.addEventListener('click', async ev => {
      const t = ev.target.closest('button'); if (!t) return;
      if (t.dataset.cctx != null) { st.ctx = +t.dataset.cctx; pinta(); }
      else if (t.dataset.ck != null) { st.k = +t.dataset.ck; pinta(); }
      else if (t.dataset.cadd) add(t.dataset.cadd);
      else if (t.dataset.cdel != null) { st.sel.splice(+t.dataset.cdel, 1); pinta(); }
      else if (t.dataset.cfix != null) { const s = st.sel[+t.dataset.cfix], v = prompt(`¿Cuántos gramos de ${s.a.n}? (vacío = que lo calcule la app)`, s.fijo ?? ''); if (v === null) return; s.fijo = numero(v) ?? null; pinta(); }
      else if (t.id === 'calc-diario') {
        const c = l[st.ctx], nI = Math.max(1, +c.ing || comidasDia(d?.servicio)), r = calcular(st.sel, objetivoComida(c, Math.min(st.k, nI - 1), nI));
        if (S.modo === 'coach') return toast('Vista previa: el alumno lo apunta desde su app');
        const { error } = await sb.from('comidas_registro').insert({ alumno_id: S.user.id, fecha: hoyISO(), momento: 'Otro', contexto: c.n, alimentos: st.sel.map((s, i) => ({ n: s.a.n, q: `${fmtNum(r.gr[i], 0)} g` })), encaja: mide(fase(d)) ? 2 : null, nota: `Calculado para la comida ${Math.min(st.k, nI - 1) + 1} (${fmtNum(r.tot.kcal, 0)} kcal)` });
        if (error) return fallo(error, AVISO); cerrarSheet(); toast('Apuntado en tu diario'); await cargar(S.user.id, S.d); render();
      }
    });
    cuerpo.addEventListener('change', ev => { if (ev.target.id === 'calc-q' && ev.target.value.trim()) { add(ev.target.value.trim()); } });
    cuerpo.addEventListener('keydown', ev => { if (ev.target.id === 'calc-q' && ev.key === 'Enter') { ev.preventDefault(); if (ev.target.value.trim()) add(ev.target.value.trim()); } });
  }
  /* ---------- Importar el plan que prepara ChatGPT (formato «LOF nutri 1») ----------
     ChatGPT entrega, además del PDF, un bloque JSON con contextos, semanas, guías por macro, menús y suplementos.
     Se pega aquí, se revisa y se guarda como BORRADOR en los apartados del alumno (no lo ve hasta publicar). */
  const PROMPT_GPT = `Además del informe en PDF, entrégame al final un bloque de código JSON (sin comentarios ni texto dentro) con este formato exacto. Usa null cuando un dato no exista; no inventes valores. Cantidades de alimento en gramos (o ml para líquidos) indicando si es cocinado, crudo, seco o escurrido.

{
  "lof": "nutri-1",
  "alumno": "Nombre del alumno",
  "fecha": "AAAA-MM-DD",
  "medidas": { "taza_ml": 250, "cucharada_ml": 15, "cucharadita_ml": 5, "palma": "sin dedos, grosor 1–1,5 cm" },
  "ingestas": 3,
  "resumen": "Texto breve del contexto y plan de acción (lo que lee el alumno)",
  "contextos": [
    { "nombre": "Entrenas y trabajas", "cuando": "Lunes, miércoles y viernes", "kcal": 2400, "p": 180, "c": 240, "g": 80, "ingestas": 3,
      "reparto": [ { "ingesta": "Comida", "kcal": 900, "p": 60, "c": 100, "g": 25 } ], "nota": "" }
  ],
  "semanas": [ { "nombre": "Semana normal", "dias": ["Contexto lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"] } ],
  "guias": [
    { "macro": "c", "titulo": "Carbohidratos", "contexto_ref": "Día de menor actividad", "ref_g_por_ingesta": 41, "nota": "Mensaje «quédate con esto»",
      "alimentos": [ { "nombre": "Patata cocida", "g": 240, "unidad": "g", "estado": "cocinado", "equivalencia": "2 patatas pequeñas", "complemento": false } ] }
  ],
  "menus": [ { "contexto": "Entrenas y trabajas", "ingesta": "Comida", "opciones": [ { "nombre": "Arroz con pollo y verduras", "ingredientes": [ { "n": "Arroz cocido", "q": "145 g" } ], "preparacion": "Breve" } ] } ],
  "suplementos": [ { "nombre": "Creatina monohidrato", "dosis": "5 g", "frecuencia": "al día", "momento": "Con una comida", "duracion": "Uso continuo", "revision": "12 semanas", "objetivo": "Fuerza y acciones repetidas" } ],
  "hidratacion": "Texto breve o null"
}

Reglas: "macro" es "p", "c" o "g" (o "mixto" para legumbres, lácteos y huevos). "ref_g_por_ingesta" son los gramos de ese macronutriente que aporta cada fila en una ingesta del contexto de referencia. "complemento": true para las raciones de acompañamiento (las marcadas con *). Las semanas usan exactamente los nombres de los contextos. No incluyas datos clínicos ni notas privadas.`;
  const num = v => v == null || v === '' ? null : typeof v === 'number' ? v : numero(String(v));
  function leerJSON(t) {
    const m = String(t || '').match(/\{[\s\S]*\}/); if (!m) throw new Error('No encuentro el bloque { … } en lo que has pegado.');
    let o; try { o = JSON.parse(m[0]); } catch (e) { throw new Error('El bloque no es JSON válido (' + e.message.slice(0, 80) + '). Copia el bloque de código completo de ChatGPT.'); }
    return o;
  }
  /* Reparto entre comidas en % (formato del editor: «70,30»), a partir de las kcal (o la proteína) de cada ingesta */
  const repPct = l => { const v = (l || []).map(r => num(r.kcal) ?? num(r.p)).filter(x => x != null && x > 0), t = v.reduce((a, b) => a + b, 0); return v.length > 1 && t ? v.map(x => Math.round(x / t * 100)).join(',') : ''; };
  function normalizar(o, nombreAlumno) {
    const av = [], ok = [];
    if (o.alumno && nombreAlumno && !norm(nombreAlumno).split(' ').some(p => p.length > 2 && norm(o.alumno).includes(p))) av.push(`⚠️ El documento es de «${o.alumno}» y estás en la ficha de ${nombreAlumno}. Revisa que sea el alumno correcto.`);
    const ctx = (o.contextos || []).map(c => ({ n: String(c.nombre || '').trim(), d: c.cuando || '', kcal: num(c.kcal), p: num(c.p), c: num(c.c), g: num(c.g), ing: num(c.ingestas) || num(o.ingestas), rep: repPct(c.reparto), nota: c.nota || '' })).filter(c => c.n);
    ctx.forEach(c => { if (c.p != null && c.c != null && c.g != null && c.kcal != null) { const calc = Math.round(4 * c.p + 4 * c.c + 9 * c.g); if (calc !== c.kcal) av.push(`«${c.n}»: ${fmtNum(c.kcal, 0)} kcal escritas frente a ${fmtNum(calc, 0)} calculadas con los macros (se guarda lo escrito).`); } });
    const nombres = new Set(ctx.map(c => norm(c.n)));
    const semana = (o.semanas || []).map(s => ({ nombre: s.nombre || '', dias: (s.dias || []).slice(0, 7).map(x => String(x || '').trim()) })).filter(s => s.dias.some(Boolean));
    semana.forEach(s => s.dias.forEach((d, i) => { if (d && !nombres.has(norm(d))) av.push(`Semana «${s.nombre}», día ${i + 1}: «${d}» no coincide con ningún contexto.`); }));
    const guias = (o.guias || []).map(gu => ({ macro: ['p', 'c', 'g', 'mixto'].includes(gu.macro) ? gu.macro : 'mixto', titulo: gu.titulo || '', ref: num(gu.ref_g_por_ingesta), ctxRef: gu.contexto_ref || '', nota: gu.nota || '',
      alimentos: (gu.alimentos || []).map(a => ({ n: String(a.nombre || '').trim(), g: num(a.g), u: a.unidad || 'g', est: a.estado || '', eq: a.equivalencia || '', comp: !!a.complemento })).filter(a => a.n) })).filter(gu => gu.alimentos.length);
    guias.forEach(gu => { if (gu.ref == null && gu.macro !== 'mixto') av.push(`Guía «${gu.titulo}»: falta «ref_g_por_ingesta»; las cantidades no se podrán adaptar a cada contexto.`); const sinG = gu.alimentos.filter(a => a.g == null && !a.comp).length; if (sinG) av.push(`Guía «${gu.titulo}»: ${sinG} alimento(s) sin gramos.`); });
    const menus = (o.menus || []).map(m => ({ ctx: m.contexto || '', ing: m.ingesta || '', ops: (m.opciones || []).map(p => ({ n: p.nombre || '', ingr: (p.ingredientes || []).map(i => ({ n: i.n || i.nombre || '', q: i.q || i.cantidad || '' })), prep: p.preparacion || '' })) })).filter(m => m.ops.length);
    const sup = (o.suplementos || []).map(s => ({ n: s.nombre || '', dosis: s.dosis || '', frec: s.frecuencia || '', mom: s.momento || '', dur: s.duracion || '', rev: s.revision || '', obj: s.objetivo || '' })).filter(s => s.n);
    if (ctx.length) ok.push(`${ctx.length} contexto${ctx.length > 1 ? 's' : ''}`); if (semana.length) ok.push(`${semana.length} semana${semana.length > 1 ? 's' : ''} tipo`); if (guias.length) ok.push(`${guias.length} guía${guias.length > 1 ? 's' : ''} con ${guias.reduce((t, gu) => t + gu.alimentos.length, 0)} alimentos`); if (menus.length) ok.push(`${menus.length} bloque${menus.length > 1 ? 's' : ''} de menús`); if (sup.length) ok.push(`${sup.length} suplemento${sup.length > 1 ? 's' : ''}`);
    return { ctx, semana, guias, menus, sup, medidas: o.medidas || null, resumen: o.resumen || '', hidratacion: o.hidratacion || '', fecha: o.fecha || hoyISO(), ingestas: num(o.ingestas), av, ok };
  }
  function formImportar() {
    const f = S.ficha, a = (S.c?.perfiles || []).find(p => p.id === f?.id) || {}; if (!f) return;
    abrirSheet(`<div class="stack"><h2>📥 Importar su plan desde ChatGPT</h2>
      <p class="small muted" style="margin-top:-8px">Pega el bloque de datos que te da ChatGPT junto al PDF. Se guarda como <b>borrador</b>: ${esc((a.nombre || '').split(' ')[0])} no ve nada hasta que publiques cada apartado.</p>
      <details class="card"><summary class="small"><b>¿Qué le pido a ChatGPT?</b> · copia esta instrucción una vez en tu conversación</summary><textarea id="imp-p" rows="8" readonly style="font-size:12px;margin-top:8px">${esc(PROMPT_GPT)}</textarea><button class="btn sm ghost" type="button" id="imp-cp" style="margin-top:6px">📋 Copiar instrucción</button></details>
      <textarea id="imp-t" rows="10" placeholder="Pega aquí el bloque { … } de ChatGPT" style="font-size:12px"></textarea>
      <div id="imp-r"></div><button class="btn full" id="imp-a">Revisar antes de guardar</button></div>`);
    $('#imp-cp').addEventListener('click', async () => { try { await navigator.clipboard.writeText(PROMPT_GPT); toast('Copiado'); } catch (e) { $('#imp-p').select(); toast('Selecciona y copia'); } });
    let res = null;
    $('#imp-a').addEventListener('click', async () => {
      const box = $('#imp-r'), btn = $('#imp-a');
      if (res && btn.dataset.paso === 'guardar') { btn.disabled = true; btn.textContent = 'Guardando…'; try { await guardarImport(f, res); cerrarSheet(); toast('Guardado como borrador: revisa y publica cada apartado'); await cargarPlanificacion(f); render(); } catch (err) { btn.disabled = false; btn.textContent = 'Guardar como borrador'; box.insertAdjacentHTML('beforeend', `<p class="err">No se ha podido guardar (${esc(err.message || '')})</p>`); } return; }
      try { res = normalizar(leerJSON($('#imp-t').value), a.nombre); } catch (err) { box.innerHTML = `<p class="err">${esc(err.message)}</p>`; return; }
      box.innerHTML = `<div class="card stack small"><b>Encontrado:</b> ${res.ok.join(' · ') || 'nada útil'}${res.av.length ? `<div class="stack" style="gap:4px;margin-top:6px">${res.av.map(x => `<div style="color:var(--warn)">${esc(x)}</div>`).join('')}</div>` : '<div style="color:var(--ok)">✓ Sin incoherencias detectadas</div>'}
        <div class="muted">Se guardará en: ${[res.resumen && 'Informe de contexto', (res.ctx.length || res.semana.length) && 'Contextos', res.guias.length && 'Equivalencias visuales', res.menus.length && 'Menús', (res.sup.length || res.hidratacion) && 'Suplementación'].filter(Boolean).join(', ')}. Los textos y PDF que ya tengas en esos apartados se conservan.</div></div>`;
      btn.dataset.paso = 'guardar'; btn.textContent = 'Guardar como borrador';
    });
  }
  async function guardarImport(f, r) {
    const plan = f.plan || [], base = clave => plan.find(x => x.clave === clave);
    const up = async (clave, titulo, orden, cambios) => {
      const x = base(clave), now = new Date().toISOString();
      const fila = x?.id ? { ...cambios, datos: { ...(x.datos || {}), ...(cambios.datos || {}) }, visible: false, actualizado_at: now } : { alumno_id: f.id, seccion: 'alimentacion', clave, titulo, imagenes: [], orden, visible: false, actualizado_at: now, ...cambios };
      const q = x?.id ? await sb.from('planificacion').update(fila).eq('id', x.id) : await sb.from('planificacion').insert(fila); if (q.error) throw q.error;
    };
    const ord = k => DOCS.findIndex(d => d[0] === k), tit = k => (DOCS.find(d => d[0] === k) || [])[1];
    const meta = { origen: 'chatgpt', importado: hoyISO(), fecha_doc: r.fecha };
    if (r.resumen) await up('contexto', tit('contexto'), ord('contexto'), { contenido: r.resumen, datos: { meta } });
    if (r.ctx.length || r.semana.length) await up('contextos', tit('contextos'), ord('contextos'), { datos: { ctx: r.ctx, semana: r.semana, meta } });
    if (r.guias.length) await up('equivalencias', tit('equivalencias'), ord('equivalencias'), { datos: { guias: r.guias, medidas: r.medidas, meta } });
    if (r.menus.length) await up('menus', tit('menus'), ord('menus'), { datos: { menus: r.menus, meta } });
    if (r.sup.length || r.hidratacion) await up('suplementacion', tit('suplementacion'), ord('suplementacion'), { datos: { sup: r.sup, hidratacion: r.hidratacion, meta } });
  }

  /* ---------- Vistas del alumno para los datos estructurados ---------- */
  const MACRO = { c: ['Hidratos', '🍚'], p: ['Proteínas', '🍗'], g: ['Grasas', '🥑'], mixto: ['Mixtos', '🥚'] };
  const objetivoIng = (c, macro) => c && c[macro] != null ? +c[macro] / (+c.ing || comidasDia(S.d?.servicio) || 3) : null;
  function vGuias(x, n) {
    const gs = x.datos.guias, l = ctxDe(n), i = Math.min(selCtx(n), Math.max(0, l.length - 1)), c = l[i], tab = Math.min(S.nGuia || 0, gs.length - 1), gu = gs[tab];
    const obj = objetivoIng(c, gu.macro), fac = obj && gu.ref ? obj / gu.ref : null, md = x.datos.medidas;
    const cant = a => { if (a.g == null) return '—'; const v = a.comp || !fac ? a.g : Math.round(a.g * fac / 5) * 5; return `${fmtNum(v, 0)} ${esc(a.u || 'g')}`; };
    return `<section class="section"><div class="card stack">
      ${l.length ? `<div class="stack" style="gap:6px"><span class="small muted">Cantidades para una ingesta de tu día:</span><div class="chips">${l.map((z, k) => `<button class="pill ${k === i ? 'blue' : ''}" data-act="nuCtx" data-i="${k}">${esc(z.n)}</button>`).join('')}</div></div>` : ''}
      <div class="chips nu-gtabs">${gs.map((z, k) => `<button class="pill ${k === tab ? 'gold' : ''}" data-act="nuGuia" data-i="${k}">${(MACRO[z.macro] || MACRO.mixto)[1]} ${esc(z.titulo || (MACRO[z.macro] || MACRO.mixto)[0])}</button>`).join('')}</div>
      ${obj ? `<div class="aprox small">Objetivo por ingesta en «${esc(c.n)}»: <b>≈ ${fmtNum(obj, 0)} g de ${(MACRO[gu.macro] || MACRO.mixto)[0].toLowerCase()}</b>${fac && Math.abs(fac - 1) > 0.05 ? ` · cantidades ajustadas ×${fmtNum(fac, 2)} respecto a tu guía` : ''}. Elige <b>una</b> fila (o combina medias raciones).</div>` : gu.macro === 'mixto' ? '<div class="aprox small">Cuentan en varios macronutrientes a la vez: úsalos como complemento y ajusta el resto del plato.</div>' : ''}
      <div class="nu-guia">${gu.alimentos.map(a => `<div class="nu-gf ${a.comp ? 'comp' : ''}"><div class="grow"><b>${esc(a.n)}</b>${a.est ? ` <span class="muted small">· ${esc(a.est)}</span>` : ''}<div class="small muted">${esc(a.eq || '')}${a.eq && !a.comp && fac && Math.abs(fac - 1) > 0.05 ? ` <b>×${fmtNum(Math.round(fac * 4) / 4, 2)}</b>` : ''}${a.comp ? ' · acompañamiento' : ''}</div></div><b class="num">${cant(a)}</b></div>`).join('')}</div>
      ${gu.nota ? `<div class="nu-quedate small"><b>Quédate con esto</b><br>${esc(gu.nota)}</div>` : ''}
      ${md ? `<p class="small muted" style="margin:0">Tus medidas: taza ${md.taza_ml ?? '—'} ml · cucharada ${md.cucharada_ml ?? '—'} ml${md.cucharadita_ml ? ' · cucharadita ' + md.cucharadita_ml + ' ml' : ''}${md.palma ? ' · palma: ' + esc(md.palma) : ''}. Medidas aproximadas: no son intercambios exactos.</p>` : ''}
      <button class="btn ghost" data-act="nuCalc">🧮 Calcula tu plato con otros alimentos</button></div></section>`;
  }
  function vMenus(x, n) {
    const l = ctxDe(n), i = Math.min(selCtx(n), Math.max(0, l.length - 1)), c = l[i], ms = x.datos.menus, mios = c ? ms.filter(m => !m.ctx || norm(m.ctx) === norm(c.n)) : ms, ver = mios.length ? mios : ms;
    return `<section class="section"><div class="card stack">${l.length ? `<div class="chips">${l.map((z, k) => `<button class="pill ${k === i ? 'blue' : ''}" data-act="nuCtx" data-i="${k}">${esc(z.n)}</button>`).join('')}</div>` : ''}
      ${ver.map(m => `<div class="stack" style="gap:6px"><span class="eyebrow">${esc(m.ing || 'Comida')}${!mios.length && m.ctx ? ' · ' + esc(m.ctx) : ''}</span>${m.ops.length > 1 ? '<span class="small muted">Elige una opción</span>' : ''}${m.ops.map(p => `<details class="nu-op"><summary><b>${esc(p.n || 'Opción')}</b></summary><ul class="small">${p.ingr.map(g => `<li>${esc(g.n)}${g.q ? ` · <b>${esc(g.q)}</b>` : ''}</li>`).join('')}</ul>${p.prep ? `<p class="small muted">${esc(p.prep)}</p>` : ''}</details>`).join('')}</div>`).join('')}</div></section>`;
  }
  function vSup(x) {
    const l = x.datos.sup || [];
    return `<section class="section"><div class="stack" style="gap:10px">${l.map(s => `<div class="card stack nu-sup" style="gap:4px"><div class="row"><b class="grow">💊 ${esc(s.n)}</b><span class="pill gold">${esc([s.dosis, s.frec].filter(Boolean).join(' · '))}</span></div>${s.mom ? `<div class="small">🕒 ${esc(s.mom)}</div>` : ''}${s.obj ? `<div class="small muted">${esc(s.obj)}</div>` : ''}${s.dur || s.rev ? `<div class="small muted">${esc([s.dur, s.rev && 'Revisar: ' + s.rev].filter(Boolean).join(' · '))}</div>` : ''}</div>`).join('') || '<div class="card small muted">Sin suplementos indicados.</div>'}
      ${x.datos.hidratacion ? `<div class="card small"><b>💧 Hidratación</b><br>${esc(x.datos.hidratacion)}</div>` : ''}<p class="small muted">Si notas cualquier molestia, deja de tomarlo y escríbele a Jesús. Si olvidas una toma, no la dupliques.</p></div></section>`;
  }
  /* ---------- Registro de 7 días: foto rápida (alumno) + vista semanal y conclusiones (coach) ----------
     El alumno sube la foto con hora, nº de ingesta y observación (columnas hora y n_ingesta del Bloque 77;
     sin ese bloque se guardan en momento «Ingesta N» y al principio de la nota).
     Las observaciones del coach por foto y sus conclusiones son SOLO suyas (fila privada «inc-registro7»)
     hasta que publique el apartado «registro7». Nada de esto lo genera la IA. */
  const horaDe = x => x.hora ? String(x.hora).slice(0, 5) : (/^(\d{1,2}:\d{2})\s·/.exec(x.nota || '') || [])[1] || (x.created_at ? new Date(x.created_at).toTimeString().slice(0, 5) : '');
  const ingDe = x => x.n_ingesta || +(/^Ingesta (\d+)/.exec(x.momento || '') || [])[1] || null;
  const notaLimpia = x => String(x.nota || '').replace(/^\d{1,2}:\d{2}\s·\s?/, '');
  function formFoto7() {
    const n = S.d?.nutri; if (!n) return;
    const dias = ventana(), dia0 = dias.includes(S.nDia) ? S.nDia : hoyISO(), ahora = new Date().toTimeString().slice(0, 5);
    const sig = d => (n.comidas.filter(x => x.fecha === d).map(ingDe).filter(Boolean).reduce((a, b) => Math.max(a, b), 0) || 0) + 1;
    const st = { files: [], ing: Math.min(8, sig(dia0)) };
    abrirSheet(`<form class="stack" id="f-f7"><h2>📷 Subir una comida</h2><p class="small muted" style="margin-top:-8px">Foto de todo lo que comes o bebes, tal cual, sin cambiar nada. Jesús lo revisará personalmente.</p>
      <label class="btn full" id="f7-fl"><input type="file" id="f7-f" accept="image/*" multiple hidden>📷 Hacer o elegir foto</label><div id="f7-prev" class="nu-foto"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><label class="f">Día<select id="f7-d">${dias.slice().reverse().map(d => `<option value="${d}" ${d === dia0 ? 'selected' : ''}>${d === hoyISO() ? 'Hoy' : d === sumaDias(hoyISO(), -1) ? 'Ayer' : esc(fLarga(d))}</option>`).join('')}</select></label><label class="f">Hora<input type="time" id="f7-h" value="${ahora}"></label></div>
      <div class="stack" style="gap:6px"><span class="small"><b>¿Qué ingesta del día es?</b></span><div class="choice f7-ing" role="group">${[1, 2, 3, 4, 5, 6, 7, 8].map(i => `<button type="button" data-ing="${i}" aria-pressed="${i === st.ing}">${i}ª</button>`).join('')}</div></div>
      <label class="f"><span>Observación <span class="muted">(opcional)</span></span><textarea id="f7-o" rows="3" placeholder="Si en la foto no se ve bien: qué es, cantidades, salsas, aceite, bebida, dónde comiste…"></textarea></label>
      <p class="err" id="f7-err"></p><button class="btn full" id="f7-b">Guardar</button></form>`);
    const form = $('#f-f7');
    const pinta = () => { $('#f7-prev').innerHTML = st.files.map((f, k) => `<span style="position:relative;display:inline-block;margin:0 6px 6px 0"><img src="${esc(URL.createObjectURL(f))}" alt="" style="max-width:110px;max-height:110px;border-radius:10px"><button type="button" data-qf="${k}" class="pill" style="position:absolute;top:2px;right:2px">✕</button></span>`).join(''); $('#f7-fl').lastChild.textContent = st.files.length ? '📷 Añadir otra foto' : '📷 Hacer o elegir foto'; };
    $('#f7-f').addEventListener('change', e => { st.files.push(...e.target.files); e.target.value = ''; pinta(); });
    $('#f7-d').addEventListener('change', e => { st.ing = Math.min(8, sig(e.target.value)); form.querySelectorAll('[data-ing]').forEach(b => b.setAttribute('aria-pressed', +b.dataset.ing === st.ing)); });
    form.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.ing) { st.ing = +b.dataset.ing; form.querySelectorAll('[data-ing]').forEach(z => z.setAttribute('aria-pressed', z === b)); } if (b.dataset.qf != null) { st.files.splice(+b.dataset.qf, 1); pinta(); } });
    form.addEventListener('submit', async e => {
      e.preventDefault(); const obs = $('#f7-o').value.trim(), dia = $('#f7-d').value, hora = $('#f7-h').value || null;
      if (!st.files.length && !obs) { $('#f7-err').textContent = 'Añade una foto (o escribe qué has comido).'; return; }
      const btn = $('#f7-b'); btn.disabled = true; btn.textContent = 'Subiendo…';
      try {
        const rutas = [];
        for (const fl of st.files) { const blob = await reducirImagen(fl, 1280), ruta = `${S.user.id}/menu/${dia}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}.jpg`; const up = await sb.storage.from('comidas').upload(ruta, blob, { contentType: 'image/jpeg' }); if (up.error) throw up.error; rutas.push(ruta); }
        const base = { alumno_id: S.user.id, fecha: dia, momento: 'Ingesta ' + st.ing, alimentos: [], foto: rutas.join(';') || null, nota: obs || null, compartido: false };
        let r = await sb.from('comidas_registro').insert({ ...base, hora, n_ingesta: st.ing }).select().single();
        if (r.error && /hora|n_ingesta|column/i.test(r.error.message || '')) r = await sb.from('comidas_registro').insert({ ...base, nota: (hora ? hora + ' · ' : '') + (obs || '') || null }).select().single();
        if (r.error) throw r.error;
        n.comidas = [...n.comidas, r.data]; if (rutas.length) await pedirFotos(rutas);
        S.nDia = dia; cerrarSheet(); toast('¡Subida! Gracias'); render();
      } catch (err) { console.error(err); btn.disabled = false; btn.textContent = 'Guardar'; $('#f7-err').textContent = 'No se ha podido subir' + (err?.message && !/fetch|network/i.test(err.message) ? ` (${err.message.slice(0, 100)})` : '. Revisa la conexión.'); }
    });
  }
  /* Vista semanal del coach: 7 columnas (días) × filas (ingesta 1, 2, 3…) */
  function vSemana7(f, a) {
    if (!f.comidas) return '';
    const r = resumenInc(f.plan || []), ini0 = S.r7ini || (r.inicio && r.inicio <= hoyISO() ? r.inicio : sumaDias(hoyISO(), -6)), dias = [...Array(7)].map((_, i) => sumaDias(ini0, i));
    const l = f.comidas.filter(x => x.fecha >= dias[0] && x.fecha <= dias[6] && !x.compartido), priv = (f.plan || []).find(z => z.clave === 'inc-registro7')?.datos || {}, obs = priv.obs || {};
    const fila = x => ingDe(x) || 9;
    const maxI = Math.max(3, ...l.map(fila).filter(v => v < 9)), filas = [...Array(maxI)].map((_, i) => i + 1).concat(l.some(x => fila(x) === 9) ? [9] : []);
    const celda = (d, i) => l.filter(x => x.fecha === d && fila(x) === i).sort((p, q) => horaDe(p).localeCompare(horaDe(q))).map(x => { const fs = fotosDe(x), us = fs.map(fotoUrl).filter(Boolean); return `<div class="r7-c ${obs[x.id] ? 'con' : ''}">${us[0] ? `<button class="img r7-img" data-act="verImagenes" data-s="${esc(us.join('|'))}"><img src="${esc(us[0])}" alt="" loading="lazy">${us.length > 1 ? `<span class="pill">+${us.length - 1}</span>` : ''}</button>` : fs.length ? '<span class="r7-sin">📷</span>' : ''}<div class="r7-t"><b>${esc(horaDe(x))}</b>${x.contexto ? ` · ${esc(x.contexto)}` : ''}${notaLimpia(x) ? `<span>${esc(notaLimpia(x))}</span>` : ''}${(x.alimentos || []).length ? `<span>${esc(alimentosTxt(x))}</span>` : ''}</div><button class="r7-obs" data-act="nuR7Obs" data-id="${x.id}" title="Tu observación (privada)">${obs[x.id] ? '📝 ' + esc(obs[x.id].slice(0, 60)) + (obs[x.id].length > 60 ? '…' : '') : '＋ observación'}</button></div>`; }).join('');
    const conc = priv.conc || {}, hayConc = Object.values(conc).some(v => Array.isArray(v) ? v.some(Boolean) : v);
    return `<section class="section"><div class="section-head"><h2>Registro de 7 días · su semana</h2><div class="row" style="gap:6px"><button class="btn sm ghost" data-act="nuR7Mov" data-d="-7">‹</button><button class="btn sm ghost" data-act="nuR7Mov" data-d="7">›</button></div></div>
      <div class="small muted" style="margin:-6px 0 8px">${esc(fLarga(dias[0]))} – ${esc(fLarga(dias[6]))} · ${l.length} registros en ${new Set(l.map(x => x.fecha)).size} de 7 días</div>
      <div class="r7-wrap"><div class="r7-grid" style="--n:${dias.length}"><div class="r7-h"></div>${dias.map(d => `<div class="r7-h"><b>${DIA3[fecha(d).getDay()]}</b> ${fecha(d).getDate()}</div>`).join('')}
        ${filas.map(i => `<div class="r7-f">${i === 9 ? 'Sin nº' : i + 'ª'}</div>${dias.map(d => `<div class="r7-cel">${celda(d, i)}</div>`).join('')}`).join('')}</div></div>
      <div class="card stack" style="margin-top:12px"><div class="row"><b class="grow">Tus conclusiones del registro</b><span class="pill ${hayConc ? 'blue' : ''}">${hayConc ? 'Escritas' : 'Pendientes'}</span></div>
        <p class="small muted" style="margin:0">Son tuyas: feedback del desayuno y del resto de comidas, contexto de la semana y sus 3–4 primeros pasos. Se guardan en privado; cuando quieras se las publicas en «Análisis del registro de 7 días».</p>
        <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn sm" data-act="nuR7Conc">✎ ${hayConc ? 'Editar' : 'Escribir'} conclusiones</button><button class="btn sm ghost" data-act="nuR7Copia">📋 Copiar todo para ChatGPT</button></div></div></section>`;
  }
  async function guardarPriv7(f, cambia) {
    const x = (f.plan || []).find(z => z.clave === 'inc-registro7'), d = JSON.parse(JSON.stringify(x?.datos || {})); cambia(d);
    const q = x?.id ? await sb.from('planificacion').update({ datos: d, actualizado_at: new Date().toISOString() }).eq('id', x.id) : await sb.from('planificacion').insert({ alumno_id: f.id, seccion: 'alimentacion', clave: 'inc-registro7', titulo: INC.find(z => z[0] === 'registro7')[1], datos: d, imagenes: [], orden: 90, visible: false });
    if (q.error) throw q.error; await cargarPlanificacion(f);
  }
  function formR7Obs(id) {
    const f = S.ficha, x = f?.comidas?.find(c => c.id === id); if (!x) return; const obs = ((f.plan || []).find(z => z.clave === 'inc-registro7')?.datos || {}).obs || {};
    const us = fotosDe(x).map(fotoUrl).filter(Boolean);
    abrirSheet(`<form class="stack" id="f-r7o"><h2>Tu observación</h2><p class="small muted" style="margin-top:-8px">${esc(fLarga(x.fecha))} · ${ingDe(x) ? ingDe(x) + 'ª ingesta' : esc(x.momento || '')} · ${esc(horaDe(x))} · <b>solo la ves tú</b></p>
      ${us.length ? `<div class="nu-imgs">${us.map(u => `<button type="button" class="img" data-act="verImagen" data-src="${esc(u)}"><img src="${esc(u)}" alt=""></button>`).join('')}</div>` : ''}${notaLimpia(x) ? `<div class="aprox small"><b>Lo que dice:</b> ${esc(notaLimpia(x))}</div>` : ''}
      <textarea id="r7o-t" rows="4" placeholder="Qué ves: estructura del plato, proteína, verdura, ultraprocesados, horario…">${esc(obs[id] || '')}</textarea><button class="btn full">Guardar</button></form>`);
    $('#f-r7o').addEventListener('submit', async e => { e.preventDefault(); const t = $('#r7o-t').value.trim(); try { await guardarPriv7(f, d => { d.obs = { ...(d.obs || {}) }; if (t) d.obs[id] = t; else delete d.obs[id]; }); cerrarSheet(); render(); } catch (err) { fallo(err); } });
  }
  const CONC = [['desayuno', 'Feedback del desayuno'], ['comidas', 'Feedback del resto de comidas'], ['contexto', 'Contexto general de la semana'], ['bien', 'Lo que hace bien'], ['limita', 'Lo que le está limitando']];
  function formR7Conc() {
    const f = S.ficha, c = ((f?.plan || []).find(z => z.clave === 'inc-registro7')?.datos || {}).conc || {}, pasos = c.pasos || [];
    abrirSheet(`<form class="stack" id="f-r7c"><h2>Conclusiones del registro de 7 días</h2><p class="small muted" style="margin-top:-8px">Privadas hasta que las publiques.</p>
      ${CONC.map(([k, t]) => `<label class="f">${t}<textarea data-k="${k}" rows="3">${esc(c[k] || '')}</textarea></label>`).join('')}
      <div class="stack" style="gap:6px"><b class="small">Primeros pasos para tener resultados rápidos (3–4)</b>${[0, 1, 2, 3].map(i => `<input type="text" data-p="${i}" value="${esc(pasos[i] || '')}" placeholder="Paso ${i + 1}">`).join('')}</div>
      <button class="btn full" type="submit" value="guardar">Guardar (privado)</button><button class="btn ghost full" type="submit" value="publicar">Guardar y publicar al alumno como «Análisis de tu registro»</button></form>`);
    $('#f-r7c').addEventListener('submit', async e => {
      e.preventDefault(); const pub = e.submitter?.value === 'publicar', conc = {}; document.querySelectorAll('#f-r7c [data-k]').forEach(t => { conc[t.dataset.k] = t.value.trim(); }); conc.pasos = [...document.querySelectorAll('#f-r7c [data-p]')].map(i => i.value.trim()).filter(Boolean);
      try {
        await guardarPriv7(f, d => { d.conc = conc; });
        if (pub) {
          const txt = [...CONC.filter(([k]) => conc[k] && k !== 'limita').map(([k, t]) => `${t.toUpperCase()}\n${conc[k]}`), conc.limita ? `LO QUE TE ESTÁ LIMITANDO\n${conc.limita}` : '', conc.pasos.length ? `TUS PRIMEROS PASOS\n${conc.pasos.map(p => '- ' + p).join('\n')}` : ''].filter(Boolean).join('\n\n');
          const x = (f.plan || []).find(z => z.clave === 'registro7'), fila = { contenido: txt, visible: true, actualizado_at: new Date().toISOString() };
          const q = x?.id ? await sb.from('planificacion').update(fila).eq('id', x.id) : await sb.from('planificacion').insert({ ...fila, alumno_id: f.id, seccion: 'alimentacion', clave: 'registro7', titulo: 'Análisis del registro de 7 días y estilo de vida', imagenes: [], orden: 1 });
          if (q.error) throw q.error; await cargarPlanificacion(f);
        }
        cerrarSheet(); toast(pub ? 'Publicado: lo ve en su pestaña Nutrición' : 'Conclusiones guardadas'); render();
      } catch (err) { fallo(err); }
    });
  }
  async function copiarR7() {
    const f = S.ficha, a = (S.c?.perfiles || []).find(p => p.id === f.id) || {}, r = resumenInc(f.plan || []), ini0 = S.r7ini || (r.inicio && r.inicio <= hoyISO() ? r.inicio : sumaDias(hoyISO(), -6)), dias = [...Array(7)].map((_, i) => sumaDias(ini0, i));
    const priv = (f.plan || []).find(z => z.clave === 'inc-registro7')?.datos || {}, obs = priv.obs || {}, c = priv.conc || {};
    const l = (f.comidas || []).filter(x => x.fecha >= dias[0] && x.fecha <= dias[6] && !x.compartido);
    const t = [`REGISTRO DE 7 DÍAS · ${a.nombre || ''} · ${dias[0]} a ${dias[6]}`, ...dias.map(d => { const z = l.filter(x => x.fecha === d).sort((p, q) => (ingDe(p) || 9) - (ingDe(q) || 9) || horaDe(p).localeCompare(horaDe(q))); return `\n${fLarga(d)}${z.length ? '' : ': sin registros'}\n` + z.map(x => `- ${ingDe(x) ? ingDe(x) + 'ª ingesta' : x.momento || 'Comida'}${horaDe(x) ? ' · ' + horaDe(x) : ''}${x.contexto ? ' · ' + x.contexto : ''}${notaLimpia(x) ? ' · Alumno: ' + notaLimpia(x) : ''}${(x.alimentos || []).length ? ' · ' + alimentosTxt(x) : ''}${obs[x.id] ? ' · Jesús: ' + obs[x.id] : ''}`).join('\n'); }),
      '\nCONCLUSIONES DE JESÚS', ...CONC.filter(([k]) => c[k]).map(([k, tt]) => `${tt}: ${c[k]}`), (c.pasos || []).length ? 'Primeros pasos:\n' + c.pasos.map((p, i) => `${i + 1}. ${p}`).join('\n') : ''].filter(v => v !== '').join('\n');
    try { await navigator.clipboard.writeText(t); toast('Copiado: pégalo en ChatGPT junto al resto de su información'); } catch (e) { abrirSheet(`<div class="stack"><h2>Copia este texto</h2><textarea rows="16" style="font-size:12px">${esc(t)}</textarea></div>`); }
  }
  return { fase, faseDe, faseCoach, mide, FASES, vSemana7: aislar(vSemana7), formImportar, formPlato, calcular, ALI, objetivoComida, equivVisual, vIncCoach: aislar(vIncCoach), formInc, esInc, guardarResumen, vista: aislar(vista), vCoach: aislar(vCoach), cargar, cargarFicha, cargarCoach, datosPrevia, nuevasDe, DOCS, esPdf, ctxDe };
})();
