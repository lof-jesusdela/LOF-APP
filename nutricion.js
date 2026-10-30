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
  const tiene = x => !!x && (!!x.contenido || !!(x.imagenes || []).length || !!(x.datos?.ctx || []).length);
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
  function selCtx(n) {
    if (S.nCtx != null) return S.nCtx;
    try { const [f, i] = (localStorage.getItem('lof-nctx') || '').split('|'); if (f === hoyISO()) return +i || 0; } catch (e) { /* sin almacenamiento */ }
    return 0;
  }

  /* ---------- Pestaña del alumno ---------- */
  function vista(dd, prev) {
    const d = dd || S.d, n = d?.nutri || vacio();
    if (S.nDoc) return vDoc(n, S.nDoc, d);
    const docs = [...DOCS.map(([k, t, s, ic]) => ({ x: docDe(n, k), k, t, s, ic })).filter(o => tiene(o.x)),
      ...n.plan.filter(x => !DOCS.some(([k]) => k === x.clave) && tiene(x)).map(x => ({ x, k: x.clave, t: x.titulo, s: '', ic: '📌' }))];
    const cab = prev ? '' : `<section class="stack"><span class="eyebrow">Tu plan de alimentación</span><h1>Nutrición</h1><p class="small muted">Tu guía para comer bien sin pensarlo demasiado. Vuelve aquí siempre que tengas una duda.</p></section>`;
    return cab + vFase(d) + vHoyCtx(n, d) + vDocs(docs) + (prev ? '' : vDiario(n, d));
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
    const i = Math.min(selCtx(n), l.length - 1), c = l[i], ing = comidasDia(d?.servicio);
    const ir = (k, t) => tiene(docDe(n, k)) ? `<button class="btn sm ghost" data-act="nuDoc" data-k="${k}">${t}</button>` : '';
    return `<section class="section"><div class="card stack nu-hoy"><span class="eyebrow">¿Qué tipo de día tienes hoy?</span>
      <div class="chips" role="group" aria-label="Contexto de hoy">${l.map((x, k) => `<button class="pill ${k === i ? 'blue' : ''}" data-act="nuCtx" data-i="${k}" aria-pressed="${k === i}">${esc(x.n)}</button>`).join('')}</div>
      ${c.d ? `<p class="small muted" style="margin:0">${esc(c.d)}</p>` : ''}${vMacros(c, ing)}
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
      <button class="btn" data-act="nuNueva">＋ Apuntar una comida</button></div></section>
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
      <div class="stack" style="gap:6px"><span class="small"><b>¿Encaja con tu plan?</b> <span class="muted">(opcional)</span></span><div class="choice" role="group">${ENCAJA.map(([v, t]) => `<button type="button" data-enc="${v}" aria-pressed="${st.enc === v}">${t}</button>`).join('')}</div></div>
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
  return { fase, faseDe, faseCoach, mide, FASES, vista: aislar(vista), vCoach: aislar(vCoach), cargar, cargarFicha, cargarCoach, datosPrevia, nuevasDe, DOCS, esPdf, ctxDe };
})();
