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
    ['Hidratos', [['Arroz cocido', '½ taza'], ['Pasta cocida', '1 taza'], ['Patata o boniato', '1 mediana'], ['Pan integral', '2 rebanadas'], ['Copos de avena', '½ taza'], ['Quinoa o cuscús cocido', '½ taza'], ['Arroz o cuscús crudos', '¼ de taza (≈ 45 g)'], ['Pasta corta cruda (macarrones…)', '½ taza (≈ 50 g)'], ['Espaguetis crudos', '1 manojo del grosor de una moneda de 2 € (≈ 60 g)'], ['Lentejas cocidas', '½ taza'], ['Garbanzos cocidos', '½ taza'], ['Alubias cocidas', '½ taza'], ['Tortitas de arroz o maíz', '3 unidades'], ['Fruta', '1 pieza'], ['Plátano', '1 unidad'], ['Frutos rojos', '1 taza']]],
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
    const [r, pl] = await Promise.all([sb.from('comidas_registro').select('id,alumno_id').eq('compartido', true).is('coach_estado', null), sb.from('planificacion').select('alumno_id,clave,visible,contenido,imagenes,datos').eq('seccion', 'alimentacion')]);
    c.creacionesNuevas = r.error ? [] : (r.data || []);
    // mismo criterio que ve el alumno: un apartado publicado con contenido (texto, archivos o datos del plan)
    c.conPlanNutri = new Set((pl.data || []).filter(x => x.visible !== false && !esInc(x) && tiene(x)).map(x => x.alumno_id));
    c.seguimientos = Object.fromEntries((pl.data || []).filter(x => x.clave === 'seguimiento').map(x => [x.alumno_id, x]));
    c.planNutri = {}; (pl.data || []).forEach(x => { (c.planNutri[x.alumno_id] ||= []).push(x); });
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
  const ctxDe = n => { const x = docDe(n, 'contextos'), ing = +x?.datos?.ingestas || null; return (x?.datos?.ctx || []).filter(c => c.n).map(c => ing && !+c.ing ? { ...c, ing } : c); };
  /* ---------- Reparto por comida: fuente única para resumen, calculadora, equivalencias, menú semanal y PDF ----------
     Prioridad: 1) «r» = objetivos de cada comida escritos por Jesús (kcal, P, C y G propios de cada una);
     2) «rep» antiguo = % de calorías por comida (se aplica igual a P, C y G y se avisa al coach);
     3) sin reparto = el día dividido entre las comidas, marcado siempre como orientativo.
     Nunca se cambia lo prescrito para que cuadre: si falta un dato se queda vacío y se señala. */
  const NOMBRES_ING = { 1: ['Comida'], 2: ['Comida', 'Cena'], 3: ['Desayuno', 'Comida', 'Cena'], 4: ['Desayuno', 'Comida', 'Merienda', 'Cena'], 5: ['Desayuno', 'Media mañana', 'Comida', 'Merienda', 'Cena'], 6: ['Desayuno', 'Media mañana', 'Comida', 'Merienda', 'Cena', 'Recena'] };
  const nombresIng = n => NOMBRES_ING[n] || [...Array(n)].map((_, i) => 'Comida ' + (i + 1));
  const nv = v => v == null || v === '' || isNaN(+v) ? null : +v;
  function comidasPlan(c, nIng) {
    const r = (Array.isArray(c?.r) ? c.r : []).filter(x => x && (x.n || ['kcal', 'p', 'c', 'g'].some(k => nv(x[k]) != null)));
    if (r.length) { const nom = nombresIng(r.length); return { n: r.length, origen: 'definido', items: r.map((x, i) => ({ n: String(x.n || '').trim() || nom[i], kcal: nv(x.kcal), p: nv(x.p), c: nv(x.c), g: nv(x.g) })) }; }
    const n = Math.max(1, Math.min(8, +c?.ing || +nIng || 3)), nom = nombresIng(n), w0 = String(c?.rep || '').split(/[,;/ ]+/).map(Number).filter(v => v > 0);
    const rep = w0.length === n, tw = w0.reduce((a, b) => a + b, 0), parte = (v, i) => nv(v) == null ? null : +v * (n === 1 ? 1 : rep ? w0[i] / tw : 1 / n);
    return { n, origen: n === 1 ? 'definido' : rep ? 'reparto_kcal' : 'iguales', items: nom.map((nm, i) => ({ n: nm, kcal: parte(c?.kcal, i), p: parte(c?.p, i), c: parte(c?.c, i), g: parte(c?.g, i) })) };
  }
  const esCenaIng = (P, k) => P.n > 1 && (P.items.some(x => /^cena/i.test(x.n)) ? /^cena/i.test(P.items[k]?.n || '') : k === P.n - 1);
  const ORIGEN_TXT = { definido: 'según tu plan', reparto_kcal: 'según el reparto de tu plan', iguales: 'orientativo: tu día dividido entre tus comidas' };
  const fmtObj = x => [x.kcal != null && `${fmtNum(x.kcal, 0)} kcal`, x.p != null && `P ${fmtNum(x.p, 0)}`, x.c != null && `C ${fmtNum(x.c, 0)}`, x.g != null && `G ${fmtNum(x.g, 0)}`].filter(Boolean).join(' · ') || 'sin datos';
  /* ---------- Revisión de coherencia del plan (coach, antes de publicar) ----------
     Comprueba nº de comidas, sumas por comida y contexto, correspondencia entre menús, calculadora y equivalencias,
     unidades y estado de los alimentos y si los materiales son de la versión vigente de los contextos.
     Solo señala: nunca cambia lo prescrito. Tolerancias: ±3 g o 3 % por macro; ±30 kcal o 3 %. */
  const DEPENDE = [['contexto', 'Informe de contexto'], ['equivalencias', 'Equivalencias visuales'], ['menus', 'Menús por contexto'], ['platos', 'Cómo construir tus platos']];
  const LBL_M = { kcal: 'kcal', p: 'proteína', c: 'hidratos', g: 'grasa' };
  const tolM = (k, v) => k === 'kcal' ? Math.max(30, Math.abs(v) * 0.03) : Math.max(3, Math.abs(v) * 0.03);
  const PIDE_ESTADO = /arroz|pasta|macarr|espagu|tallar|fideo|quinoa|cusc|lentej|garbanz|alubia|avena|pollo|pavo|ternera|cerdo|lomo|cordero|salm[oó]n|merluza|bacalao|pescado|at[uú]n|patata|boniato|yuca|ñoqui|maíz|maiz/i;
  const DICE_ESTADO = /crud|cocid|cocin|seco|seca|escurrid|en lata|hervid|asad|plancha|sin cocer|tal como|listo|lista|cruda|frito|horno/i;
  const fmt0 = v => fmtNum(+v, 0), ts = x => x ? Date.parse(x) || 0 : 0;
  function coherencia(plan, srv) {
    const out = [], vistos = new Map(), add = (niv, txt, k, grupo) => { if (grupo) { const y = vistos.get(grupo); if (y) { y.items.push(txt); return; } const o = { niv, txt: '', k, items: [txt], grupo }; vistos.set(grupo, o); out.push(o); return; } out.push({ niv, txt, k }); };
    const row = k => (plan || []).find(x => x.clave === k), cx = row('contextos'), ctx = (cx?.datos?.ctx || []).filter(c => c.n), ingPlan = +cx?.datos?.ingestas || null, nSrv = srv?.comidas_dia || null;
    if (!ctx.length) { add('info', 'Aún no hay tabla de contextos: la calculadora, las equivalencias y el menú semanal no tienen objetivos.', 'contextos'); return out; }
    const PDe = c => comidasPlan(c, ingPlan || nSrv || 3), byN = new Map(ctx.map(c => [norm(c.n), c]));
    ctx.forEach(c => {
      const P = PDe(c), nom = `«${c.n}»`;
      ['kcal', 'p', 'c', 'g'].forEach(m => { if (nv(c[m]) == null) add('aviso', `${nom}: falta ${LBL_M[m]} del día.`, 'contextos'); });
      if (['p', 'c', 'g', 'kcal'].every(m => nv(c[m]) != null)) { const calc = 4 * c.p + 4 * c.c + 9 * c.g, dif = c.kcal - calc; if (Math.abs(dif) > tolM('kcal', calc)) add('aviso', `${nom}: ${fmt0(c.kcal)} kcal escritas y ${fmt0(calc)} kcal con sus macros (${dif > 0 ? '+' : ''}${fmt0(dif)}).`, 'contextos'); }
      if ((c.r || []).length && +c.ing && +c.ing !== P.n) add('error', `${nom}: dice ${c.ing} ingestas y su reparto tiene ${P.n} comidas.`, 'contextos');
      if (nSrv && P.n !== nSrv) add('aviso', `«${c.n}» (${P.n})`, 'contextos', 'n-ing');
      if (P.n > 1 && P.origen === 'iguales') add('aviso', `${nom}: sin reparto por comida. Calculadora, equivalencias y menú semanal usan el día a partes iguales y se lo muestran como orientativo.`, 'contextos');
      if (P.origen === 'reparto_kcal') add('aviso', `${nom}: el reparto ${esc(c.rep)} es de calorías y se aplica igual a proteína, hidratos y grasa. Si cada macro va distinto, rellena «Reparto por comida».`, 'contextos');
      if ((c.r || []).length) { const mal = [];
        ['kcal', 'p', 'c', 'g'].forEach(m => {
          const v = P.items.map(x => x[m]); if (v.every(x => x == null)) return;
          if (v.some(x => x == null)) return add('aviso', `${nom}: falta ${LBL_M[m]} en ${P.items.filter(x => x[m] == null).map(x => x.n).join(', ')}.`, 'contextos');
          const sum = v.reduce((a, b) => a + b, 0); if (nv(c[m]) != null && Math.abs(sum - c[m]) > tolM(m, c[m])) mal.push(`${LBL_M[m]} ${fmt0(sum)} de ${fmt0(c[m])}${m === 'kcal' ? '' : ' g'}`);
        });
        if (mal.length) add('error', `${nom}: las comidas no suman el total del día (${mal.join(' · ')}).`, 'contextos'); }
    });
    (row('menus')?.datos?.menus || []).forEach(m => {
      const c = byN.get(norm(m.ctx)), P = c ? PDe(c) : null;
      if (m.ctx && !c) add('aviso', `Menús de «${m.ctx}»: no coincide con ningún contexto.`, 'menus');
      if (P && m.ing && !P.items.some(x => norm(x.n) === norm(m.ing))) add('aviso', `Menús de «${m.ctx}»: la comida «${m.ing}» no está en su reparto (${P.items.map(x => x.n).join(', ')}).`, 'menus');
      (m.ops || []).forEach(o => (o.ingr || []).forEach(i => {
        if (/^\s*\d+([.,]\d+)?\s*$/.test(i.q || '')) add('aviso', `${i.n} (${i.q})`, 'menus', 'menu-unidad');
        if (PIDE_ESTADO.test(i.n || '') && !DICE_ESTADO.test(`${i.n} ${i.q || ''}`)) add('aviso', i.n, 'menus', 'menu-estado');
      }));
    });
    (row('equivalencias')?.datos?.guias || []).forEach(gu => {
      const nm = `Guía «${gu.titulo || MACRO[gu.macro]?.[0] || 'equivalencias'}»`, c = byN.get(norm(gu.ctxRef)) || null;
      if (gu.ctxRef && !c) add('aviso', `${nm}: su contexto de referencia «${gu.ctxRef}» no existe.`, 'equivalencias');
      if (['p', 'c', 'g'].includes(gu.macro)) {
        if (gu.ref == null) add('aviso', `${nm}: sin gramos de referencia por comida; no se puede adaptar a cada comida.`, 'equivalencias');
        else { const cc = c || ctx[0], vals = PDe(cc).items.map(x => x[gu.macro]).filter(v => v != null); if (vals.length && !vals.some(v => Math.abs(v - gu.ref) <= Math.max(3, v * 0.1))) add('aviso', `${nm}: hecha para ${fmt0(gu.ref)} g de ${LBL_M[gu.macro]} por comida; en «${cc.n}» sus comidas piden ${vals.map(fmt0).join(' / ')} g. Las cantidades se adaptan solas: revisa que la guía sea de esta versión.`, 'equivalencias'); }
      }
      (gu.alimentos || []).forEach(a => { if (!a.comp && a.g == null) add('aviso', `${a.n} (${gu.titulo || gu.macro})`, 'equivalencias', 'eq-sin-g'); if (PIDE_ESTADO.test(a.n) && !a.est && !DICE_ESTADO.test(a.n)) add('aviso', a.n, 'equivalencias', 'eq-estado'); });
    });
    const v = cx?.datos?.version;
    if (v?.n) DEPENDE.forEach(([k, t]) => { const x = row(k); if (!x || !tiene(x)) return; const ok = x.datos?.ver_ok, viejo = ok != null ? ok < v.n : ts(x.actualizado_at) < ts(v.fecha) - 6e4, img = (x.imagenes || []).length;
      if (viejo) add(img ? 'error' : 'aviso', `«${t}» es de antes de la versión ${v.n} de los contextos (${fCorta(String(v.fecha).slice(0, 10))})${img ? ': sus imágenes o PDF no se pueden comprobar solos; al publicarlo tendrás que confirmar que corresponden.' : ': revisa que siga cuadrando y guárdalo.'}`, k); });
    const GT = { 'n-ing': `Su seguimiento por ingestas cuenta ${nSrv} comidas al día y el plan tiene otro número en`, 'menu-unidad': 'Menús: cantidades sin unidad', 'menu-estado': 'Menús: alimentos sin crudo/cocido/seco/escurrido', 'eq-sin-g': 'Equivalencias: alimentos sin gramos', 'eq-estado': 'Equivalencias: alimentos sin crudo/cocido/seco/escurrido' };
    out.forEach(o => { if (o.grupo) o.txt = `${GT[o.grupo]}: ${[...new Set(o.items)].slice(0, 6).join(', ')}${new Set(o.items).size > 6 ? ` y ${new Set(o.items).size - 6} más` : ''}.`; });
    return out;
  }
  /* Nueva versión de los contextos cuando cambian sus cifras (para saber qué materiales quedan por revisar) */
  function versionCtx(prevRow, nuevo) {
    const firma = d => JSON.stringify({ ctx: (d?.ctx || []).map(c => [c.n, c.kcal, c.p, c.c, c.g, c.ing, c.rep, c.r]), ing: d?.ingestas || null });
    const pv = prevRow?.datos?.version, cambia = !prevRow || firma(prevRow.datos) !== firma(nuevo);
    if (pv?.n && !cambia) return pv;
    return { n: (pv?.n || 0) + (cambia || !pv ? 1 : 0) || 1, fecha: cambia ? new Date().toISOString() : (prevRow?.actualizado_at || new Date().toISOString()) };
  }
  const ICO_COH = { error: '⛔', aviso: '⚠️', info: 'ℹ️' };
  const lineaCoh = o => `<div class="coh-l"><span class="ic">${ICO_COH[o.niv]}</span><span class="grow">${o.txt}</span></div>`;
  function vCoherencia(f) {
    if (!f?.plan) return '';
    const l = coherencia(f.plan, f.srv), v = (f.plan.find(x => x.clave === 'contextos')?.datos?.version) || null, e = l.filter(o => o.niv === 'error').length;
    return `<section class="section"><div class="section-head"><h2>Coherencia del plan</h2><span class="small muted">${v?.n ? `Contextos v${v.n} · ${esc(fCorta(String(v.fecha).slice(0, 10)))}` : ''}</span></div><div class="card">
      ${l.length ? l.map(lineaCoh).join('') : '<div class="coh-l"><span class="ic">✓</span><span class="grow">Resumen, calculadora, equivalencias y menús usan las mismas cifras y el mismo reparto.</span></div>'}
      ${l.length ? `<p class="note" style="margin-top:8px">${e ? `${e} punto${e > 1 ? 's' : ''} a corregir antes de publicar. ` : ''}La app no cambia nada sola: corrige en el apartado que toque.</p>` : ''}</div></section>`;
  }
  /* Línea legible del reparto de un contexto (resumen, tabla y PDF) */
  function txtReparto(c, nIng) {
    const P = comidasPlan(c, nIng); if (P.n < 2) return '';
    if (P.origen === 'iguales') return `Reparte el día entre tus ${P.n} comidas (≈ ${fmtObj(P.items[0])} en cada una)`;
    return P.items.map(x => `${x.n}: ${fmtObj(x)}`).join(' | ');
  }
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
    const act = mide(fase(d));
    return cab + (act ? '' : vFase(d)) + vIncAlumno(n, d) + (prev ? '' : tarjetaTemporal(d)) + vHoyCtx(n, d) + vAcuerdoAlumno(n, d) + (prev || !act ? '' : vBtnSemana()) + vDocs(docs) + (act ? vFase(d) : '') + (prev ? '' : vDiario(n, d));
  }
  const vBtnSemana = () => `<section class="section"><div class="card stack" style="gap:6px"><span class="eyebrow">Tu semana</span><p class="small muted" style="margin:0">Opcional: si te ayuda organizarte, marca cuándo entrenas y trabajas y qué vas a comer. Parte de tus menús o de tu semana anterior y cambia solo los días que haga falta; te calculo las cantidades y la lista de la compra. Comidas flexibles: ${esc(flexTxt(acuerdo(S.d)))}.</p><button class="btn full" data-act="nuSemana">🗓 Planifica tu semana y la compra</button></div></section>`;
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
    const P = comidasPlan(c, ing);
    const rep = P.n < 2 ? '' : `<div class="nu-rep">${P.items.map(x => `<div><b>${esc(x.n)}</b><span class="num">${esc(fmtObj(x))}</span></div>`).join('')}${P.origen === 'iguales' ? '<small class="muted">Reparto orientativo (el día entre tus comidas): Jesús aún no lo ha fijado por comida.</small>' : ''}</div>`;
    return `<div class="nu-macros"><div class="k"><b class="num">${c.kcal ? fmtNum(+c.kcal, 0) : '—'}</b><small>kcal al día</small></div><div><b class="num">${g(c.p)}</b><small>Proteína</small></div><div><b class="num">${g(c.c)}</b><small>Hidratos</small></div><div><b class="num">${g(c.g)}</b><small>Grasas</small></div></div>${rep}`;
  }
  /* Comida que toca ahora según la hora (el alumno puede cambiarla) */
  const VENT = [[/^desayuno/i, 0, 11], [/media ma/i, 11, 13], [/^(comida|almuerzo)/i, 13, 16.5], [/merienda/i, 16.5, 19.5], [/^cena/i, 19.5, 24], [/recena/i, 22.5, 24]];
  function comidaAhora(P) {
    const d = new Date(), h = d.getHours() + d.getMinutes() / 60, w = P.items.map(x => VENT.find(v => v[0].test(x.n)));
    if (!w.some(Boolean)) return Math.min(P.n - 1, Math.max(0, Math.floor((h - 7) / (15 / P.n))));
    const ya = w.findIndex(v => v && h >= v[1] && h < v[2]); if (ya >= 0) return ya;
    const sig = w.findIndex(v => v && v[1] > h); return sig >= 0 ? sig : P.n - 1;
  }
  /* «Arroz blanco cocido 145 g (≈ ¾ taza)»: cantidad legible con su medida casera si el alimento está en la base */
  function cantTxt(nombre, q) {
    const m = /(\d+(?:[.,]\d+)?)\s*(g|gr|gramos)\b/i.exec(q || ''), a = m && buscaAli(nombre);
    return `${esc(q || '')}${a ? ` <span class="muted">(${esc(equivVisual(a, numero(m[1])))})</span>` : ''}`;
  }
  /* Opciones del plan (menús estructurados) para un contexto y una comida */
  function opcionesPlan(n, c, nomIng) {
    const M = docDe(n, 'menus')?.datos?.menus || [], k = norm(nomIng);
    return (M.find(m => norm(m.ctx) === norm(c.n) && norm(m.ing) === k) || M.find(m => !m.ctx && norm(m.ing) === k) || { ops: [] }).ops;
  }
  function vHoyCtx(n, d) {
    const l = ctxDe(n); if (!l.length) return '';
    const i = Math.min(selCtx(n), l.length - 1), c = l[i], ing = +c.ing || comidasDia(d?.servicio), sems = semanasDe(n), auto = ctxPorSemana(n);
    const P = comidasPlan(c, ing), k = S.nIng != null && S.nIng < P.n ? S.nIng : comidaAhora(P), it = P.items[k], ops = opcionesPlan(n, c, it.n), mImg = (docDe(n, 'menus')?.imagenes || []).length;
    const ir = (kk, t) => tiene(docDe(n, kk)) ? `<button class="btn sm ghost" data-act="nuDoc" data-k="${kk}">${t}</button>` : '';
    const dev = (d?.devoluciones || []).find(x => x.prioridad || x.ajuste);
    return `<section class="section"><div class="card stack nu-hoy"><span class="eyebrow">1 · ¿Qué tipo de día tienes hoy?</span>
      <div class="chips" role="group" aria-label="Contexto de hoy">${l.map((x, kk) => `<button class="pill ${kk === i ? 'blue' : ''}" data-act="nuCtx" data-i="${kk}" aria-pressed="${kk === i}">${esc(x.n)}</button>`).join('')}</div>
      ${sems.length > 1 ? `<div class="row small" style="gap:6px;flex-wrap:wrap;align-items:center"><span class="muted">Esta semana:</span>${sems.map((p, kk) => `<button class="pill ${kk === semSel(n) ? 'gold' : ''}" data-act="nuSem" data-i="${kk}">${esc(p.nombre || 'Semana ' + (kk + 1))}</button>`).join('')}</div>` : ''}
      ${auto === i ? '<p class="small muted" style="margin:0">📅 Es el que te toca hoy según tu semana tipo. Si tu día ha cambiado, toca otro.</p>' : ''}
      ${c.d ? `<p class="small muted" style="margin:0">${esc(c.d)}</p>` : ''}
      <details class="small"><summary>Tu día completo: ${c.kcal ? fmtNum(+c.kcal, 0) + ' kcal' : ''} · P ${g(c.p)} · C ${g(c.c)} · G ${g(c.g)}</summary>${vMacros(c, ing)}</details>
      ${P.n > 1 ? `<span class="eyebrow" style="margin-top:4px">2 · ¿Qué comida quieres resolver?</span><div class="chips" role="group" aria-label="Comida">${P.items.map((x, kk) => `<button class="pill ${kk === k ? 'blue' : ''}" data-act="nuIng" data-i="${kk}" aria-pressed="${kk === k}">${esc(x.n)}</button>`).join('')}</div>` : ''}
      <div class="nu-comida stack" style="gap:8px"><div class="row" style="gap:8px;align-items:baseline"><b class="grow">${esc(it.n)}</b><span class="small num">${esc(fmtObj(it))}</span></div>
        ${P.origen === 'iguales' && P.n > 1 ? '<span class="small muted">Orientativo: tu día dividido entre tus comidas.</span>' : ''}
        ${ops.length ? `<span class="eyebrow">3 · Opciones de tu plan</span>${ops.slice(0, S.nOpsTodas ? 99 : 3).map(o => `<div class="nu-op"><b class="small">${esc(o.n || 'Opción')}</b>${(o.ingr || []).length ? `<ul class="small">${o.ingr.map(x => `<li>${esc(x.n)}${x.q ? ' · ' + cantTxt(x.n, x.q) : ''}</li>`).join('')}</ul>` : ''}${o.prep ? `<div class="small muted">${esc(o.prep)}</div>` : ''}</div>`).join('')}${ops.length > 3 && !S.nOpsTodas ? `<button class="linkbtn small" data-act="nuOpsTodas" style="align-self:flex-start">Ver las ${ops.length} opciones</button>` : ''}`
          : mImg ? `<p class="small" style="margin:0">Tus opciones para esta comida están en las láminas de tus menús.</p><button class="btn sm ghost" data-act="nuDoc" data-k="menus" style="align-self:flex-start">🍽️ Ver mis menús</button>` : '<p class="small muted" style="margin:0">Aún no tienes menús escritos para esta comida: monta tu plato con la calculadora o con tus equivalencias.</p>'}
        <span class="eyebrow">4 · ¿Quieres cambiar algo?</span>
        <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn sm" data-act="nuCalc" data-ctx="${i}" data-k="${k}">🧮 Monta otra comida con estas cantidades</button>${tiene(docDe(n, 'equivalencias')) ? `<button class="btn sm ghost" data-act="nuEqIng" data-k="${k}">✋ Equivalencias de ${esc(it.n.toLowerCase())}</button>` : ''}</div></div>
      ${dev ? `<div class="nu-dev small"><span class="eyebrow">5 · Tu prioridad ahora</span><div>${esc(dev.prioridad || dev.ajuste)}</div><span class="muted">Jesús · revisión de la semana del ${esc(fCorta(dev.semana_inicio))}</span></div>` : ''}
      <div class="row" style="gap:8px;flex-wrap:wrap">${ir('menus', '🍽️ Todos mis menús')}${ir('platos', '🥗 Montar un plato')}</div></div></section>`;
  }
  function vDocs(docs) {
    if (!docs.length) return S.d && fase(S.d) ? '' : `<section class="section"><div class="card stack"><b>Tu plan está en camino</b><p class="small muted" style="margin:0">Jesús está preparando tu plan. Aquí tendrás tu contexto, tus menús, las equivalencias visuales, cómo construir tus platos y tu suplementación.</p></div></section>`;
    return `<section class="section"><div class="section-head"><h2>Tu plan</h2></div><div class="nu-docs">${docs.map(o => `<button class="card nu-doc" data-act="nuDoc" data-k="${esc(o.k)}"><span class="nu-ic" aria-hidden="true">${o.ic}</span><span class="grow"><b>${esc(o.t)}</b>${o.s ? `<small>${esc(o.s)}</small>` : ''}</span><span class="nu-fl" aria-hidden="true">›</span></button>`).join('')}</div>
      <p class="note">Consejo de Jesús: imprime tu tabla de contextos y la de equivalencias y tenlas a mano en la cocina.</p></section>`;
  }
  function vTablaCtx(l, ing) {
    return `<section class="section"><div class="card stack"><div class="tbl" style="overflow-x:auto"><table class="nu-tab"><thead><tr><th>Tipo de día</th><th class="num">kcal</th><th class="num">Prot.</th><th class="num">Hidr.</th><th class="num">Grasas</th></tr></thead><tbody>${l.map(c => `<tr><td><b>${esc(c.n)}</b>${c.d ? `<div class="small muted">${esc(c.d)}</div>` : ''}</td><td class="num"><b>${c.kcal ? fmtNum(+c.kcal, 0) : '—'}</b></td><td class="num">${g(c.p)}</td><td class="num">${g(c.c)}</td><td class="num">${g(c.g)}</td></tr>${txtReparto(c, ing) ? `<tr class="nu-tab-rep"><td colspan="5" class="small muted">${esc(txtReparto(c, ing))}</td></tr>` : ''}`).join('')}</tbody></table></div>
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
    return PDF.contextos(nombre, l.map(c => ({ ...c, _rep: txtReparto(c, comidasDia(d.servicio)) })), comidasDia(d.servicio), btn);
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
      case 'nuCalc': if (b.dataset.ctx != null) S.calc = { ...(S.calc || st0()), ctx: +b.dataset.ctx, k: +b.dataset.k }; formPlato(); break;
      case 'nuSemana': MenuSemana.abrir(b.dataset.l); break;
      case 'nuInc': formInc(b.dataset.k); break;
      case 'nuSeg': formSeguimiento(); break;
      case 'nuCola': abrirCola(); break;
      case 'colaFicha': cerrarSheet(); S.fichaSub = 'alimentacion'; await abrirFicha(b.dataset.id); S.fichaSub = 'alimentacion'; render(); break;
      case 'nuIncIni': { const v = $('#inc-ini')?.value; if (!v) return toast('Elige la fecha'); try { await guardarResumen(S.ficha, d => { d.inicio = v; }); await cargarPlanificacion(S.ficha); render(); toast('Fecha guardada'); } catch (err) { fallo(err); } break; }
      case 'nuGuia': S.nGuia = +b.dataset.i; render(); break;
      case 'nuIngG': S.nIngG = +b.dataset.i; render(); break;
      case 'nuIng': S.nIng = +b.dataset.i; S.nOpsTodas = false; render(); break;
      case 'nuOpsTodas': S.nOpsTodas = true; render(); break;
      case 'nuEqIng': S.nIngG = +b.dataset.k; S.nDoc = 'equivalencias'; render(); window.scrollTo(0, 0); break;
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
  /* ---------- Seguimiento acordado: cuánto registra cada alumno (lo decide Jesús) ----------
     Se guarda como fila de planificación «seguimiento» (visible para el alumno, no es un apartado del plan).
     - ligero: solo la comprobación breve del check-in semanal (sin registro diario de comidas)
     - habitual: marcar cada día cuántas comidas del plan ha hecho + la comprobación semanal (lo que había hasta ahora)
     - temporal: un registro concreto pedido por Jesús, con qué, por qué, hasta cuándo y cuándo se revisa; al terminar se vuelve al habitual
     - menú semanal: herramienta opcional salvo que se acuerde; comidas flexibles: las que acuerde cada alumno */
  const NIVELES = { ligero: ['Ligero', 'Una comprobación breve en el check-in semanal'], habitual: ['Habitual', 'Marcar cada día cuántas comidas del plan has hecho, más la comprobación semanal'] };
  const QUE_TEMP = { fotos: 'Foto de cada comida', diario: 'Diario de comidas (qué y cuánto)', hambre: 'Hambre y saciedad en cada comida', otro: 'Otro registro' };
  function acuerdoDe(plan) {
    const x = (plan || []).find(z => z.clave === 'seguimiento'), d = x?.datos || {}, hoy = hoyISO();
    const t = d.temporal?.que && d.temporal.hasta && d.temporal.hasta >= hoy ? d.temporal : null;
    return { x, definido: !!x, reglasCena: d.reglasCena !== false, nivel: NIVELES[d.nivel] ? d.nivel : 'habitual', menu: !!d.menu, flexPct: d.flexN != null ? null : (d.flexPct ?? 15), flexN: d.flexN ?? null, temporal: t, temporalAcabado: d.temporal?.hasta && d.temporal.hasta < hoy ? d.temporal : null, minimo: d.minimo || '' };
  }
  const acuerdo = d => acuerdoDe(d?.nutri?.plan);
  const flexTxt = A => A.flexN != null ? `${A.flexN} comida${A.flexN === 1 ? '' : 's'} flexible${A.flexN === 1 ? '' : 's'} a la semana` : `un ${A.flexPct} % de tus comidas de la semana como comidas flexibles`;
  const queTemp = t => t.que === 'otro' ? (t.otro || 'Registro acordado') : QUE_TEMP[t.que] || t.que;
  /* Lo que el alumno ve: qué es necesario ahora, qué es opcional y qué está pendiente de revisar por Jesús */
  function vAcuerdoAlumno(n, d) {
    if (!mide(fase(d))) return '';
    const A = acuerdoDe(n.plan), pend = (n.comidas || []).filter(x => x.compartido && !x.coach_estado).length;
    const nec = [A.nivel === 'habitual' ? 'En «Hoy», marca cada día cuántas comidas de tu plan has hecho (un toque).' : null, 'En el check-in semanal, cuéntanos cómo has podido aplicar lo acordado.', A.menu ? 'El domingo, planifica tu menú de la semana (puedes repetir el de la semana anterior).' : null, A.temporal ? `${queTemp(A.temporal)} hasta el ${fLarga(A.temporal.hasta)}.` : null, A.minimo || null].filter(Boolean);
    const opc = ['Diario de comidas con foto o texto, si te ayuda.', A.menu ? null : 'Planificar el menú de la semana y sacar la lista de la compra.', 'Compartir platos tuyos para que Jesús los revise.'].filter(Boolean);
    return `<section class="section"><details class="card stack nu-acuerdo"><summary><span class="eyebrow">Lo que hemos acordado</span> <span class="small muted">· toca para verlo</span></summary>
      <p class="small" style="margin:8px 0 4px">Tu parte: aplicar las prioridades acordadas, participar en las revisiones, avisar de dificultades o cambios y completar el registro mínimo.</p>
      <b class="small">Necesario ahora</b><ul class="small" style="margin:2px 0 6px">${nec.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
      <b class="small">Opcional</b><ul class="small" style="margin:2px 0 6px">${opc.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
      ${pend ? `<b class="small">Pendiente de revisión de Jesús</b><p class="small" style="margin:2px 0">${pend} plato${pend > 1 ? 's' : ''} que has compartido. Los revisa en su próxima revisión; no hay respuesta inmediata.</p>` : ''}
      <p class="small muted" style="margin:6px 0 0">Comidas flexibles: ${esc(flexTxt(A))}. Si una semana necesitas más, coméntalo en el check-in.</p></details></section>`;
  }
  /* Registro temporal pedido por Jesús: tarjeta en Hoy y en Nutrición mientras dura */
  function tarjetaTemporal(d) {
    d = d || S.d; if (!d?.servicio?.modulo_nutricion) return '';
    const A = acuerdo(d), t = A.temporal; if (!t) return '';
    return `<section class="section"><div class="card stack" style="gap:6px;border-color:var(--blue)"><div class="row"><span class="eyebrow grow">Registro acordado con Jesús</span><span class="pill blue">Hasta el ${esc(fCorta(t.hasta))}</span></div>
      <b>${esc(queTemp(t))}</b>${t.porque ? `<p class="small" style="margin:0"><b>Para qué:</b> ${esc(t.porque)}</p>` : ''}
      <p class="small muted" style="margin:0">${t.revision ? `Lo revisamos el ${esc(fLarga(t.revision))}. ` : ''}Al terminar vuelves a tu seguimiento habitual.</p>
      <button class="btn sm" data-act="nuIrDiario" style="align-self:flex-start">Apuntar</button></div></section>`;
  }
  /* Coach: tarjeta y formulario del seguimiento acordado */
  function vSeguimientoCoach(f, a) {
    if (!f?.plan) return '';
    const A = acuerdoDe(f.plan), nom = (a?.nombre || '').split(' ')[0], L = lunesDe(hoyISO());
    let aviso = '';
    if (A.nivel === 'habitual' && mide(faseCoach(f.id)) && typeof ingestasSemana === 'function') {
      const sem = [sumaDias(L, -7), sumaDias(L, -14)].map(l => ingestasSemana(f.diarioLargo || [], l, f.srv));
      if (sem.every(x => x.dias < MIN_DIAS_NUTRI)) aviso = `<div class="aprox small">Las dos últimas semanas faltan registros acordados (${sem.map(x => x.dias).join(' y ')} días). Antes de insistir, revisa con ${esc(nom)} si hay dificultades de aplicación, de comprensión o demasiada carga; quizá le encaje mejor el seguimiento ligero.</div>`;
    }
    return `<section class="section"><div class="section-head"><h2>Seguimiento acordado</h2><button class="btn sm ghost" data-act="nuSeg">✎ Cambiar</button></div><div class="card stack" style="gap:6px">
      <div class="row small"><span class="grow">Nivel</span><b>${NIVELES[A.nivel][0]}${A.definido ? '' : ' (por defecto)'}</b></div><div class="small muted">${NIVELES[A.nivel][1]}.</div>
      <div class="row small"><span class="grow">Menú semanal</span><b>${A.menu ? 'Acordado' : 'Opcional'}</b></div>
      <div class="row small"><span class="grow">Comidas flexibles</span><b>${A.flexN != null ? A.flexN + ' a la semana' : A.flexPct + ' %'}</b></div>
      ${A.minimo ? `<div class="small">Mínimo acordado: ${esc(A.minimo)}</div>` : ''}
      ${A.temporal ? `<div class="small"><b>Registro temporal:</b> ${esc(queTemp(A.temporal))} hasta el ${esc(fCorta(A.temporal.hasta))}${A.temporal.revision ? ` · revisión el ${esc(fCorta(A.temporal.revision))}` : ''}${A.temporal.porque ? ` · ${esc(A.temporal.porque)}` : ''}</div>` : A.temporalAcabado ? `<div class="small muted">El registro temporal (${esc(queTemp(A.temporalAcabado))}) terminó el ${esc(fCorta(A.temporalAcabado.hasta))}.</div>` : ''}
      ${aviso}</div></section>`;
  }
  function formSeguimiento() {
    const f = S.ficha; if (!f) return; const A = acuerdoDe(f.plan || []), d0 = A.x?.datos || {}, t = d0.temporal || {};
    abrirSheet(`<form class="stack" id="f-seg"><h2>Seguimiento acordado</h2><p class="small muted" style="margin-top:-8px">Cuánto tiene que registrar. Empieza por lo mínimo útil: puedes pedir más durante un tiempo concreto.</p>
      <div class="stack" style="gap:6px">${Object.entries(NIVELES).map(([k, [t1, t2]]) => `<label class="row small" style="gap:8px;align-items:flex-start"><input type="radio" name="seg-n" value="${k}" ${A.nivel === k ? 'checked' : ''} style="width:20px;height:20px"><span><b>${t1}</b><br><span class="muted">${t2}</span></span></label>`).join('')}</div>
      <label class="row small" style="gap:8px"><input type="checkbox" id="seg-menu" ${A.menu ? 'checked' : ''} style="width:20px;height:20px"> <span>Menú semanal acordado <span class="muted">(si no, es una herramienta opcional y no sale como pendiente)</span></span></label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><label class="f">Comidas flexibles<select id="seg-ft"><option value="pct" ${A.flexN == null ? 'selected' : ''}>% de sus comidas</option><option value="n" ${A.flexN != null ? 'selected' : ''}>Nº a la semana</option></select></label><label class="f">Cantidad<input type="number" id="seg-fv" min="0" max="50" value="${A.flexN ?? A.flexPct}"></label></div>
      <label class="row small" style="gap:8px"><input type="checkbox" id="seg-cena" ${A.reglasCena ? 'checked' : ''} style="width:20px;height:20px"> <span>Aplicar la pauta de cena LOF en sus avisos <span class="muted">(sin cereales, lácteos ni grasas que no sean de cocinado; pescado blanco y carne blanca)</span></span></label>
      <label class="f">Mínimo acordado (opcional, lo ve tal cual)<input type="text" id="seg-min" value="${esc(A.minimo)}" placeholder="Ej. Foto de la cena los días de partido"></label>
      <details class="card" ${t.que ? 'open' : ''}><summary class="small"><b>Registro temporal</b> · pedir algo concreto durante unos días</summary><div class="stack" style="gap:8px;margin-top:8px">
        <label class="f">Qué le pides<select id="seg-tq"><option value="">— Nada —</option>${Object.entries(QUE_TEMP).map(([k, l]) => `<option value="${k}" ${t.que === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <input type="text" id="seg-to" value="${esc(t.otro || '')}" placeholder="Si es «Otro», qué registro">
        <label class="f">Para qué (lo verá)<input type="text" id="seg-tp" value="${esc(t.porque || '')}" placeholder="Ej. ver por qué tienes hambre por la tarde"></label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><label class="f">Hasta<input type="date" id="seg-th" value="${esc(t.hasta || sumaDias(hoyISO(), 6))}"></label><label class="f">Lo revisamos el<input type="date" id="seg-tr" value="${esc(t.revision || '')}"></label></div></div></details>
      <p class="err" id="seg-err"></p><button class="btn full">Guardar</button></form>`);
    $('#f-seg').addEventListener('submit', async e => {
      e.preventDefault(); const tq = $('#seg-tq').value, fv = numero($('#seg-fv').value);
      const datos = { nivel: document.querySelector('[name="seg-n"]:checked')?.value || 'habitual', menu: $('#seg-menu').checked, reglasCena: $('#seg-cena').checked, minimo: $('#seg-min').value.trim() || '', flexPct: $('#seg-ft').value === 'pct' ? (fv ?? 15) : null, flexN: $('#seg-ft').value === 'n' ? (fv ?? 0) : null,
        temporal: tq ? { que: tq, otro: $('#seg-to').value.trim() || '', porque: $('#seg-tp').value.trim() || '', desde: t.que === tq && t.desde ? t.desde : hoyISO(), hasta: $('#seg-th').value || sumaDias(hoyISO(), 6), revision: $('#seg-tr').value || null } : (d0.temporal?.hasta < hoyISO() ? d0.temporal : null) };
      if (datos.temporal && tq && datos.temporal.hasta < hoyISO()) { $('#seg-err').textContent = 'La fecha «hasta» ya ha pasado.'; return; }
      const fila = { alumno_id: f.id, seccion: 'alimentacion', clave: 'seguimiento', titulo: 'Seguimiento acordado', datos, imagenes: [], orden: 92, visible: true, actualizado_at: new Date().toISOString() };
      const q = A.x?.id ? await sb.from('planificacion').update({ datos, visible: true, actualizado_at: fila.actualizado_at }).eq('id', A.x.id) : await sb.from('planificacion').insert(fila);
      if (q.error) { $('#seg-err').textContent = 'No se ha podido guardar (' + (q.error.message || '').slice(0, 100) + ')'; return; }
      cerrarSheet(); toast('Seguimiento guardado: lo verá en su pestaña Nutrición'); await cargarPlanificacion(f); render();
    });
  }
  /* ---------- Cola de revisiones de nutrición (coach) ----------
     Una tarjeta por alumno con motivo, responsable, fecha y siguiente acción. Solo entra lo que pide una decisión:
     revisiones programadas (registro temporal, reunión y entrega de la incorporación, materiales de una versión anterior)
     y dudas relevantes (pide ayuda en el check-in, platos compartidos sin revisar). Las fotos, variaciones o un día sin
     registro no son incidencias. Las métricas salen de fechas que la app ya guarda: no se estima ningún ahorro. */
  function colaRevisiones() {
    const c = S.c || {}, hoy = hoyISO(), L = lunesDe(hoy), lAnt = sumaDias(L, -7), out = [];
    (c.perfiles || []).filter(p => p.activo !== false).forEach(a => {
      const srv = (c.servicios || []).find(x => x.alumno_id === a.id); if (!srv?.modulo_nutricion || srv.modulo_futbol && !srv.modulo_nutricion) return;
      const plan = c.planNutri?.[a.id] || [], items = [], add = (tipo, motivo, fecha, accion) => items.push({ tipo, motivo, fecha, accion, resp: 'Jesús' });
      const A = acuerdoDe(plan), inc = plan.find(x => x.clave === 'incorporacion')?.datos || {}, it = inc.items || {}, publicado = plan.some(x => ENTREGAS.some(([k]) => k === x.clave) && x.visible !== false && tiene(x));
      if (A.temporal?.revision && A.temporal.revision <= sumaDias(hoy, 2)) add('programada', `Revisar el registro temporal: ${queTemp(A.temporal)}`, A.temporal.revision, 'Ver su diario y decidir si termina o se alarga');
      if (inc.inicio && !publicado) {
        const dia = diaInc(inc);
        if (dia >= 8 && it.reunion?.estado !== 'validado') add('programada', `Reunión de la semana 2 (día ${dia} de 14)`, sumaDias(inc.inicio, 7), 'Programarla o marcarla como hecha');
        if (dia >= 11) add('programada', `Entregar el plan (día ${dia} de 14)`, sumaDias(inc.inicio, 13), 'Importar o revisar y publicar los apartados');
      }
      if (publicado) { const e = coherencia(plan, srv).filter(o => o.niv === 'error'); if (e.length) add('programada', `${e.length} punto${e.length > 1 ? 's' : ''} de coherencia por corregir`, hoy, 'Abrir «Coherencia del plan»'); }
      const chk = (c.checkins || []).find(k => k.alumno_id === a.id && k.semana_inicio === lAnt);
      if (chk?.aplicacion_plan === 'ayuda') add('duda', 'Pide ayuda para adaptar el plan' + (chk.dificultades ? `: «${chk.dificultades.slice(0, 90)}»` : ''), sumaDias(lAnt, 7), 'Responder en su devolución');
      const nc = (c.creacionesNuevas || []).filter(x => x.alumno_id === a.id).length;
      if (nc) add('duda', `${nc} plato${nc > 1 ? 's' : ''} compartido${nc > 1 ? 's' : ''} sin revisar`, hoy, 'Revisarlos en la próxima revisión');
      if (items.length) out.push({ a, items: items.sort((x, y) => String(x.fecha).localeCompare(String(y.fecha))) });
    });
    return out.sort((x, y) => String(x.items[0].fecha).localeCompare(String(y.items[0].fecha)));
  }
  function metricasNutri() {
    const c = S.c || {}, dias = [], vers = [];
    Object.values(c.planNutri || {}).forEach(plan => {
      const ini = plan.find(x => x.clave === 'incorporacion')?.datos?.inicio, pubs = plan.filter(x => ENTREGAS.some(([k]) => k === x.clave) && x.datos?.pub_at).map(x => x.datos.pub_at.slice(0, 10)).sort();
      if (ini && pubs[0]) dias.push(Math.max(0, Math.round((fecha(pubs[0]) - fecha(ini)) / 864e5)));
      const v = plan.find(x => x.clave === 'contextos')?.datos?.version?.n; if (v) vers.push(v);
    });
    const med = l => { if (!l.length) return null; const o = l.slice().sort((p, q) => p - q), m = Math.floor(o.length / 2); return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2; };
    return { n: dias.length, dias: med(dias), ajustes: vers.length ? vers.reduce((p, q) => p + q, 0) - vers.length : null, conVersion: vers.length, devoluciones: (c.devoluciones || []).length };
  }
  function abrirCola() {
    const l = colaRevisiones(), M = metricasNutri(), TIPO = { programada: ['Programada', 'blue'], duda: ['Duda relevante', 'warn'] };
    abrirSheet(`<div class="stack"><span class="eyebrow">Nutrición</span><h2>Revisiones pendientes</h2>
      <p class="small muted" style="margin-top:-6px">Solo lo que pide una decisión tuya. Las fotos, las variaciones y los días sin registro no aparecen como incidencias.</p>
      ${l.length ? l.map(({ a, items }) => `<div class="card stack" style="gap:6px"><div class="row"><b class="grow">${esc(a.nombre)}</b><button class="btn sm ghost" data-act="colaFicha" data-id="${a.id}">Abrir ›</button></div>
        ${items.map(x => `<div class="coh-l"><span class="pill ${TIPO[x.tipo][1]}" style="flex:none">${TIPO[x.tipo][0]}</span><span class="grow"><b>${esc(x.motivo)}</b><br><span class="muted">${esc(fCorta(x.fecha))} · ${esc(x.resp)} · ${esc(x.accion)}</span></span></div>`).join('')}</div>`).join('') : '<div class="card small muted">No hay revisiones pendientes de nutrición.</div>'}
      <details class="card small"><summary><b>Métricas (automáticas)</b></summary><div class="stack" style="gap:4px;margin-top:6px">
        <div>Días desde el inicio de la incorporación hasta publicar el plan: <b>${M.dias != null ? fmtNum(M.dias, 0) + ' (mediana de ' + M.n + ')' : 'sin datos aún'}</b></div>
        <div>Ajustes de contextos (versiones después de la primera): <b>${M.ajustes != null ? M.ajustes + ' en ' + M.conVersion + ' alumno' + (M.conVersion > 1 ? 's' : '') : 'sin datos aún'}</b></div>
        <div>Devoluciones enviadas en las últimas 5 semanas: <b>${M.devoluciones}</b></div>
        <p class="muted" style="margin:4px 0 0">Salen de fechas que la app guarda sola desde esta versión (publicación, versiones, devoluciones). No mide minutos de trabajo ni estima ahorros.</p></div></details>
      <button class="btn ghost full" data-act="cerrarSheet">Cerrar</button></div>`);
  }
  /* ---------- Incorporación · primeros 14 días ----------
     Semana 1: 5 entradas (composición, estilo de vida, registro de 7 días, analítica, preferencias).
     Semana 2: reunión, entrega del plan (apartados publicados) y suplementación.
     Cada entrada se guarda como fila privada de planificación (clave «inc-…», no visible: notas y archivos solo del coach)
     y un resumen sin contenido (clave «incorporacion», visible) para que el alumno vea en qué punto está. */
  const INC = [['composicion', 'Composición corporal', '📏', 'Peso, % de grasa, percentil y objetivos realistas'], ['estilo', 'Cuestionario de estilo de vida', '📝', 'Trabajo, descanso, entrenamiento, estrés, hábitos, digestión'], ['registro7', 'Registro de alimentación · 7 días', '📷', 'Todo lo que come y bebe, mejor con fotos'], ['analitica', 'Analítica de sangre y orina', '🩸', 'Y de heces si hiciera falta'], ['preferencias', 'Preferencias alimentarias', '🥦', 'Qué alimentos le gustan y cuáles no; alergias e intolerancias']];
  const INC_EST = { pendiente: ['Pendiente', ''], recibido: ['Recibido', 'blue'], revision: ['Revisar', 'warn'], validado: ['Validado', 'ok'], no_disponible: ['No disponible', ''], no_aplica: ['No aplica', ''] };
  const ENTREGAS = [['contexto', 'Informe de contexto y plan de acción'], ['contextos', 'Contextos y macros'], ['equivalencias', 'Guía visual de equivalencias'], ['menus', 'Menús por contexto'], ['platos', 'Cómo construir tus platos'], ['suplementacion', 'Plan de suplementación']];
  const esInc = x => /^inc-|^incorporacion$|^seguimiento$/.test(x?.clave || '');
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
    if (planListo && mide(f)) { const faltan = INC.filter(([k]) => !incHecho(it[k]?.estado)); return `<section class="section"><details class="card inc-alu"><summary class="small"><b>Tu incorporación</b> · plan entregado${faltan.length ? ` · queda: ${esc(faltan.map(x => x[1].toLowerCase()).join(', '))}` : ''}</summary><p class="small muted" style="margin:8px 0 0">Tus informes y materiales completos siguen en «Tu plan».${faltan.length ? ' Lo que queda no te impide empezar: Jesús te dirá si hace falta.' : ''}</p></details></section>`; }
    const dia = diaInc(r), TXT = { composicion: 'Mediremos tu porcentaje de grasa y fijaremos objetivos realistas.', estilo: 'Rellena el cuestionario: trabajo, descanso, estrés, digestión…', registro7: `Durante 7 días apunta lo que comes y bebes como te sea más fácil: una foto o una frase. Sin cambiar nada: sirve para conocer tu punto de partida.${r.inicio ? ` Termina el ${fLarga(sumaDias(r.inicio, 6))}.` : ''}`, analitica: 'Te indicaremos qué parámetros necesitamos analizar.', preferencias: 'Dinos qué alimentos te gustan y cuáles no.' };
    const fila = ([k, t, ic]) => { const e = it[k]?.estado || 'pendiente', ok = incHecho(e); return `<div class="inc-a ${ok ? 'ok' : ''}"><span class="inc-ic">${ok ? '✓' : ic}</span><div class="grow"><b>${esc(t)}</b><small>${ok ? (e === 'no_aplica' ? 'No hace falta en tu caso' : e === 'no_disponible' ? 'Seguimos sin este dato, no pasa nada' : 'Recibido') : esc(TXT[k])}</small></div>${!ok && k === 'registro7' ? '<button class="btn sm" data-act="nuIrDiario">Apuntar</button>' : ''}</div>`; };
    const sig = INC.find(([k]) => !incHecho(it[k]?.estado)), paso = sig ? `${sig[1]}: ${TXT[sig[0]]}` : it.reunion?.estado !== 'validado' ? 'La reunión con Jesús: revisaremos juntos lo que haces bien, lo que te limita y tus prioridades.' : !planListo ? 'Jesús está preparando tu plan: no tienes que hacer nada más por ahora.' : '';
    return `<section class="section"><div class="card inc-alu stack"><div class="row"><div class="grow"><span class="eyebrow">Tus primeros 14 días</span><h3 style="margin:2px 0 0">Primero te conocemos. Después construimos tu estrategia.</h3></div>${dia && dia <= 14 ? `<span class="pill gold">Día ${dia}/14</span>` : ''}</div>
      ${paso ? `<div class="aprox small"><b>Tu siguiente paso</b> · ${esc(paso)}</div>` : ''}
      <div class="inc-sem"><b>Semana 1 · Toma de datos</b>${INC.map(fila).join('')}</div>
      <div class="inc-sem"><b>Semana 2 · Análisis y estrategia</b>
        <div class="inc-a ${it.reunion?.estado === 'validado' ? 'ok' : ''}"><span class="inc-ic">${it.reunion?.estado === 'validado' ? '✓' : '🤝'}</span><div class="grow"><b>Reunión personalizada</b><small>${it.reunion?.estado === 'validado' ? 'Hecha' : it.reunion?.estado === 'recibido' ? 'Programada' + (it.reunion?.fecha ? ' · ' + esc(fCorta(it.reunion.fecha)) : '') : 'Revisaremos juntos lo que haces bien, lo que te limita y tus 3–4 prioridades.'}</small></div></div>
        <div class="inc-a ${planListo ? 'ok' : ''}"><span class="inc-ic">${planListo ? '✓' : '🍽️'}</span><div class="grow"><b>Entrega de tu plan personalizado</b><small>${planListo ? 'Ya lo tienes aquí abajo, en «Tu plan»' : 'Menú adaptado a tu contexto, guía visual de cantidades y estructura de platos.'}</small></div></div>
        <div class="inc-a ${pub('suplementacion') ? 'ok' : ''}"><span class="inc-ic">${pub('suplementacion') ? '✓' : '💊'}</span><div class="grow"><b>Plan de suplementación</b><small>${pub('suplementacion') ? 'Ya lo tienes en «Tu plan»' : 'Si ya tenemos tu analítica, te lo entregamos individualizado.'}</small></div></div></div>
      <p class="small muted" style="margin:0">No es una dieta estricta: es una estrategia personalizada, comiendo lo que te gusta y pensada para que puedas mantenerla.</p></div></section>`;
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
    ['Cordero en crudo', 200, 17, 0, 15, 'P', ['filete grande', 'filetes grandes', 180]],
    ['Cecina (lista para comer)', 200, 38, 0, 6, 'P', ['loncha fina', 'lonchas finas', 10]],
    ['Atún fresco en crudo', 120, 24, 0, 2, 'P', ['filete grande', 'filetes grandes', 200]],
    ['Caballa en crudo', 205, 19, 0, 14, 'P', ['filete mediano', 'filetes medianos', 90]],
    ['Otros pescados azules en crudo (sardina, boquerón…)', 170, 20, 0, 10, 'P', ['filete pequeño', 'filetes pequeños', 90]],
    ['Marisco pelado en crudo', 75, 13, 3, 1.5, 'P', ['taza', 'tazas', 150]],
    ['Calamar o sepia en crudo', 90, 16, 2, 1.2, 'P', ['taza en trozos', 'tazas en trozos', 165]],
    ['Otros moluscos en crudo (almejas, mejillones…, sin concha)', 85, 12, 3.5, 2, 'P', ['taza', 'tazas', 180]],
    ['Hígado de ternera en crudo', 135, 20, 4, 3.6, 'P', ['filete pequeño', 'filetes pequeños', 100]],
    ['Caballa en lata (escurrida)', 190, 22, 0, 11, 'P', ['lata', 'latas', 90]],
    ['Salmón en lata (escurrido)', 160, 22, 0, 8, 'P', ['lata', 'latas', 120]],
    ['Pavo en lonchas (listo para comer)', 105, 17, 2, 2.5, 'P', ['loncha', 'lonchas', 20]],
    ['Jamón york en lonchas (listo para comer)', 100, 18, 1.5, 2.5, 'P', ['loncha', 'lonchas', 20]],
    ['Soja en grano cocida', 170, 17, 10, 9, 'P', ['taza', 'tazas', 190]],
    ['Edamame cocido y desgranado', 121, 12, 9, 5, 'P', ['taza', 'tazas', 155]],
    // hidratos
    ['Arroz blanco cocido', 130, 2.7, 28, 0.3, 'C', ['taza', 'tazas', 190]],
    ['Arroz integral cocido', 112, 2.6, 23, 0.9, 'C', ['taza', 'tazas', 190]],
    ['Pasta cocida', 150, 5.5, 30, 0.9, 'C', ['taza', 'tazas', 145]],
    ['Patata cocida', 80, 2, 17, 0.1, 'C', ['patata mediana', 'patatas medianas', 180]],
    ['Boniato cocido', 86, 1.6, 20, 0.1, 'C', ['boniato mediano', 'boniatos medianos', 200]],
    ['Yuca cocida', 125, 1, 30, 0.3, 'C', ['taza en trozos', 'tazas en trozos', 185]],
    ['Quinoa cocida', 120, 4.4, 21, 1.9, 'C', ['taza', 'tazas', 185]],
    ['Cuscús cocido', 112, 3.8, 23, 0.2, 'C', ['taza', 'tazas', 160]],
    ['Ñoquis cocidos', 133, 3, 28, 0.5, 'C', ['taza', 'tazas', 180]],
    // hidratos en seco (sin cocer): cada formato se mide con su medida casera
    ['Arroz blanco crudo (sin cocer)', 360, 6.7, 79, 0.6, 'C', ['taza', 'tazas', 185]],
    ['Arroz integral crudo (sin cocer)', 355, 7.5, 76, 2.7, 'C', ['taza', 'tazas', 185]],
    ['Pasta corta cruda (macarrones, penne, fusilli…)', 355, 12.5, 72, 1.5, 'C', ['taza', 'tazas', 100]],
    ['Pasta larga cruda (espaguetis, tallarines…)', 355, 12.5, 72, 1.5, 'C', ['manojo (grosor de una moneda de 2 €)', 'manojos (grosor de una moneda de 2 €)', 60]],
    ['Cuscús crudo (sin cocer)', 360, 12.5, 73, 1.5, 'C', ['taza', 'tazas', 175]],
    ['Quinoa cruda (sin cocer)', 368, 14, 64, 6, 'C', ['taza', 'tazas', 170]],
    ['Pan integral', 240, 10, 41, 3.5, 'C', ['rebanada', 'rebanadas', 30]],
    ['Pan blanco', 265, 9, 49, 3.2, 'C', ['rebanada', 'rebanadas', 30]],
    ['Copos de avena', 370, 13, 60, 7, 'C', ['taza', 'tazas', 80]],
    ['Tortitas de arroz', 380, 8, 81, 3, 'C', ['tortita', 'tortitas', 8]],
    ['Maíz cocido', 96, 3.4, 19, 1.5, 'C', ['taza', 'tazas', 165]],
    ['Lentejas cocidas', 116, 9, 17, 0.4, 'C', ['taza', 'tazas', 200]],
    ['Garbanzos cocidos', 140, 8, 19, 2.6, 'C', ['taza', 'tazas', 200]],
    ['Alubias cocidas', 110, 7.5, 16, 0.5, 'C', ['taza', 'tazas', 200]],
    ['Lentejas secas (sin cocer)', 350, 25, 60, 1.5, 'C', ['taza', 'tazas', 190]],
    ['Garbanzos secos (sin cocer)', 360, 20, 61, 6, 'C', ['taza', 'tazas', 200]],
    ['Alubias secas (sin cocer)', 340, 22, 60, 1.5, 'C', ['taza', 'tazas', 200]],
    ['Guisantes cocidos', 80, 5.4, 14, 0.4, 'C', ['taza', 'tazas', 150]],
    ['Pasta integral cocida', 124, 5.3, 25, 1.1, 'C', ['taza', 'tazas', 140]],
    ['Tortilla de trigo (wrap)', 300, 8, 50, 7, 'C', ['wrap', 'wraps', 60]],
    ['Plátano', 89, 1.1, 21, 0.3, 'C', ['plátano mediano', 'plátanos medianos', 110]],
    ['Manzana', 52, 0.3, 12, 0.2, 'C', ['manzana mediana', 'manzanas medianas', 150]],
    ['Naranja', 47, 0.9, 10, 0.1, 'C', ['naranja mediana', 'naranjas medianas', 160]],
    ['Fresas', 32, 0.7, 6, 0.3, 'C', ['taza', 'tazas', 150]],
    ['Arándanos', 57, 0.7, 12, 0.3, 'C', ['taza', 'tazas', 145]],
    ['Uvas (sin tallo)', 69, 0.7, 18, 0.2, 'C', ['uva', 'uvas', 5.5]],
    ['Pera', 57, 0.4, 15, 0.1, 'C', ['pera mediana', 'peras medianas', 170]],
    ['Kiwi', 61, 1.1, 15, 0.5, 'C', ['kiwi', 'kiwis', 75]],
    ['Mandarina', 53, 0.8, 13, 0.3, 'C', ['mandarina', 'mandarinas', 80]],
    ['Melocotón', 39, 0.9, 10, 0.3, 'C', ['melocotón mediano', 'melocotones medianos', 150]],
    ['Piña', 50, 0.5, 13, 0.1, 'C', ['taza en trozos', 'tazas en trozos', 165]],
    ['Mango', 60, 0.8, 15, 0.4, 'C', ['taza en trozos', 'tazas en trozos', 165]],
    ['Sandía', 30, 0.6, 8, 0.2, 'C', ['taza en dados', 'tazas en dados', 150]],
    ['Melón', 34, 0.8, 8, 0.2, 'C', ['taza en dados', 'tazas en dados', 160]],
    ['Cerezas', 63, 1.1, 16, 0.2, 'C', ['taza', 'tazas', 140]],
    ['Frambuesas', 52, 1.2, 12, 0.7, 'C', ['taza', 'tazas', 125]],
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
    ['Aceite de coco', 884, 0, 0, 100, 'G', ['cucharadita', 'cucharaditas', 5]],
    ['Coco fresco (pulpa)', 354, 3.3, 15, 33, 'G', ['lámina pequeña', 'láminas pequeñas', 10]],
    ['Leche de coco (de lata)', 230, 2.3, 5.5, 24, 'G', ['cucharada', 'cucharadas', 15]],
    ['Guacamole preparado', 150, 1.5, 8, 13, 'G', ['cucharada rasa', 'cucharadas rasas', 17]],
    ['Bacon', 417, 12, 1, 40, 'G', ['loncha fina', 'lonchas finas', 10]],
    ['Mantequilla 100 %', 740, 0.7, 0.1, 82, 'G', ['porción individual', 'porciones individuales', 5]],
    ['Frutos secos variados (sin cáscara)', 600, 18, 15, 53, 'G', ['puñado pequeño', 'puñados pequeños', 20]],
    ['Cacahuetes (sin cáscara)', 590, 26, 16, 50, 'G', ['puñado pequeño', 'puñados pequeños', 20]],
    ['Pistachos (sin cáscara)', 560, 20, 28, 45, 'G', ['puñado pequeño', 'puñados pequeños', 20]],
    ['Anacardos', 553, 18, 30, 44, 'G', ['puñado pequeño', 'puñados pequeños', 20]],
    ['Avellanas', 630, 15, 17, 61, 'G', ['puñado pequeño', 'puñados pequeños', 20]],
    ['Semillas variadas (chía, lino, calabaza…)', 540, 22, 20, 45, 'G', ['cucharada rasa', 'cucharadas rasas', 10]],
    ['Crema de pistacho o almendra 100 %', 600, 22, 20, 50, 'G', ['cucharada rasa', 'cucharadas rasas', 15]],
    ['Cacao puro 100 % (polvo)', 228, 20, 58, 14, 'G', ['cucharada rasa', 'cucharadas rasas', 5]],
    ['Hígado de bacalao en conserva (escurrido)', 613, 4, 0, 67, 'G', ['cucharada en trozos', 'cucharadas en trozos', 15]],
    // lácteos y verdura
    ['Leche semidesnatada', 46, 3.3, 4.8, 1.6, 'L', ['vaso', 'vasos', 250]],
    ['Leche entera', 64, 3.2, 4.7, 3.6, 'L', ['vaso', 'vasos', 250]],
    ['Kéfir natural', 60, 3.3, 4, 3.5, 'L', ['vaso pequeño', 'vasos pequeños', 200]],
    ['Yogur griego natural', 120, 4, 4, 10, 'L', ['envase', 'envases', 125]],
    ['Queso semicurado', 380, 25, 0.5, 31, 'L', ['cuña pequeña', 'cuñas pequeñas', 30]],
    ['Gouda en lonchas', 355, 25, 2, 28, 'L', ['ración (2 lonchas)', 'raciones (2 lonchas)', 40]],
    ['Mozzarella fresca', 245, 18, 1, 19, 'L', ['ración (media bola)', 'raciones (media bola)', 60]],
    ['Mozzarella en lonchas', 280, 20, 1, 21, 'L', ['ración (2 lonchas)', 'raciones (2 lonchas)', 40]],
    ['Mozzarella rallada', 300, 22, 2, 22, 'L', ['ración (2-3 cucharadas rasas)', 'raciones (2-3 cucharadas rasas)', 20]],
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
  /* Objetivo de una comida del contexto (fuente única: comidasPlan). Un macro sin dato queda en 0 y se marca en «faltan» */
  function objetivoComida(c, k, nIng) {
    const P = comidasPlan(c, nIng), i = Math.max(0, Math.min(k, P.n - 1)), it = P.items[i];
    return { p: it.p || 0, c: it.c || 0, g: it.g || 0, kcal: it.kcal ?? (4 * (it.p || 0) + 4 * (it.c || 0) + 9 * (it.g || 0)), w: P.n > 1 ? null : 1, origen: P.origen, nombre: it.n, faltan: ['p', 'c', 'g'].filter(m => it[m] == null) };
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
    'Ñoquis cocidos': [80, 300], 'Pan integral': [1, 4, 1, 'ud'], 'Pan blanco': [1, 4, 1, 'ud'], 'Copos de avena': [20, 120, 5], 'Lentejas secas (sin cocer)': [20, 130, 5], 'Garbanzos secos (sin cocer)': [20, 130, 5], 'Alubias secas (sin cocer)': [20, 130, 5], 'Guisantes cocidos': [40, 250], 'Pasta integral cocida': [60, 350], 'Tortilla de trigo (wrap)': [1, 3, 1, 'ud'],
    'Cordero en crudo': [90, 250], 'Cecina (lista para comer)': [20, 80, 10], 'Atún fresco en crudo': [90, 260], 'Caballa en crudo': [100, 250], 'Otros pescados azules en crudo (sardina, boquerón…)': [100, 250], 'Marisco pelado en crudo': [100, 300], 'Calamar o sepia en crudo': [100, 350], 'Otros moluscos en crudo (almejas, mejillones…, sin concha)': [100, 300], 'Hígado de ternera en crudo': [50, 150, 10], 'Caballa en lata (escurrida)': [1, 3, 1, 'ud'], 'Salmón en lata (escurrido)': [1, 2, 1, 'ud'], 'Pavo en lonchas (listo para comer)': [1, 8, 1, 'ud'], 'Jamón york en lonchas (listo para comer)': [1, 8, 1, 'ud'], 'Soja en grano cocida': [60, 250], 'Edamame cocido y desgranado': [60, 250],
    'Uvas (sin tallo)': [10, 45, 5, 'ud'], 'Pera': [0.5, 2, 0.5, 'ud'], 'Kiwi': [1, 3, 1, 'ud'], 'Mandarina': [1, 4, 1, 'ud'], 'Melocotón': [0.5, 2, 0.5, 'ud'], 'Piña': [50, 300], 'Mango': [50, 300], 'Sandía': [50, 400], 'Melón': [50, 400], 'Cerezas': [50, 250], 'Frambuesas': [50, 250],
    'Aceite de coco': [0, 20, 5], 'Coco fresco (pulpa)': [0, 40, 10], 'Leche de coco (de lata)': [0, 45, 15], 'Guacamole preparado': [0, 100, 10], 'Bacon': [0, 2, 1, 'ud'], 'Mantequilla 100 %': [0, 20, 5], 'Frutos secos variados (sin cáscara)': [0, 30, 5], 'Cacahuetes (sin cáscara)': [0, 30, 5], 'Pistachos (sin cáscara)': [0, 30, 5], 'Anacardos': [0, 30, 5], 'Avellanas': [0, 30, 5], 'Semillas variadas (chía, lino, calabaza…)': [0, 30, 5], 'Crema de pistacho o almendra 100 %': [0, 30, 5], 'Cacao puro 100 % (polvo)': [0, 15, 5], 'Hígado de bacalao en conserva (escurrido)': [0, 30, 15], 'Arroz blanco crudo (sin cocer)': [20, 130, 5], 'Arroz integral crudo (sin cocer)': [20, 130, 5], 'Pasta corta cruda (macarrones, penne, fusilli…)': [20, 130, 5], 'Pasta larga cruda (espaguetis, tallarines…)': [20, 130, 5], 'Cuscús crudo (sin cocer)': [20, 130, 5], 'Quinoa cruda (sin cocer)': [20, 110, 5], 'Tortitas de arroz': [1, 6, 1, 'ud'],
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
    const faltan = ['p', 'c', 'g'].filter(m => obj[m] >= 5 && obj[m] - tot[m] > (m === 'g' ? Math.max(6, obj[m] * 0.25) : Math.max(8, obj[m] * 0.15)));
    return { gr, tot, avisos, faltan };
  }
  /* Explica que la cantidad de una fuente ya descuenta lo que ponen los alimentos mixtos (la grasa de la yema, la proteína del queso…) */
  function descuento(sel, gr, i) {
    const m = rolDe(sel[i].a); if (!m || lim(sel[i].a).comp && sel.some((s, j) => j !== i && rolDe(s.a) === m)) return '';
    const otros = sel.map((s, j) => [s.a.n.split(' (')[0].toLowerCase(), j === i || rolDe(s.a) === m && !lim(s.a).comp ? 0 : s.a[m] * gr[j] / 100]).filter(x => x[1] >= 2);
    if (!otros.length) return '';
    return `<small class="calc-desc">↳ Ya descuenta ${fmtNum(otros.reduce((t, x) => t + x[1], 0), 0)} g de ${NOM_M[m]} que ponen ${otros.map(x => x[0]).join(' y ')}</small>`;
  }
  /* Recomendaciones para la última comida del día (la cena): qué alimentos conviene evitar y por cuáles cambiarlos */
  function avisoCena(a) {
    const n = a.n, plan = S.modo === 'coach' ? S.ficha?.plan : S.d?.nutri?.plan; if (acuerdoDe(plan).reglasCena === false) return null;
    if (a.t === 'C' && /^(Arroz|Pasta|Pan |Copos|Tortitas|Maíz|Cuscús|Quinoa|Ñoquis)/i.test(n)) return { m: 'Tu pauta de cena va sin cereales (pan, pasta, arroz, avena, maíz…).', alt: ['Patata cocida', 'Boniato cocido', 'Calabaza o zanahoria cocida', 'Verdura variada'] };
    if (a.t === 'L' || /^(Queso|Yogur|Mozzarella|Gouda)/i.test(n)) return { m: 'Tu pauta de cena va sin lácteos.', alt: ['Huevo entero', 'Claras de huevo', 'Tofu firme'] };
    if (a.t === 'G' && !/^(Aceite|Mantequilla)/i.test(n)) return { m: 'En tu pauta de cena, la grasa es la del cocinado (aceite de oliva o mantequilla): sin aguacate, frutos secos, bacon, chocolate…', alt: ['Aceite de oliva virgen extra'] };
    if (/^(Salmón|Atún|Caballa|Otros pescados azules)/i.test(n)) return { m: 'Tu pauta de cena prefiere pescado blanco al azul.', alt: ['Pescado blanco', 'Gambas o langostinos', 'Huevo entero'] };
    if (/^(Ternera|Lomo de cerdo|Jamón serrano|Cordero|Cecina|Hígado de ternera)/i.test(n)) return { m: 'Tu pauta de cena prefiere carne blanca a la roja.', alt: ['Pollo (pechuga) cocinado', 'Pavo (pechuga)', 'Pescado blanco'] };
    return null;
  }
  /* Cuando la combinación no encaja: sustituciones compatibles, opciones del plan o una explicación (nunca una cadena de «falta…») */
  const SUG = { p: ['Pollo (pechuga) cocinado', 'Pavo en lonchas (listo para comer)', 'Claras de huevo', 'Atún al natural (escurrido)', 'Pescado blanco en crudo (merluza, bacalao…)', 'Queso fresco batido 0 %'], c: ['Patata cocida', 'Arroz blanco cocido', 'Pan integral', 'Boniato cocido', 'Plátano', 'Garbanzos cocidos'], g: ['Aceite de oliva virgen extra', 'Aguacate (pulpa)', 'Almendras', 'Mantequilla 100 %'] };
  function salidas(r, st, c, P, kk, esCena, n) {
    const ya = new Set(st.sel.map(s => s.a.n)), guia = (docDe(n, 'equivalencias')?.datos?.guias || []).flatMap(gu => gu.alimentos.map(x => buscaAli(x.n.split(/[ (]/)[0])?.n)).filter(Boolean);
    const sug = m => [...new Set([...guia.filter(x => rolDe(buscaAli(x) || {}) === m), ...SUG[m]])].map(buscaAli).filter(a => a && !ya.has(a.n) && !(esCena && avisoCena(a))).slice(0, 3);
    const ops = opcionesPlan(n, c, P.items[kk].n), fil = r.faltan.map(m => [m, sug(m)]).filter(x => x[1].length);
    if (!fil.length && !ops.length) return `<div class="aprox small">Con estos alimentos no se puede cuadrar bien sin cantidades exageradas. Quédate con estas cantidades orientativas o pregúntale a Jesús en tu check-in.</div>`;
    return `<div class="aprox small stack" style="gap:6px"><b>Para que encaje</b>${fil.map(([m, l]) => `<div>Añade algo de ${NOM_M[m]}: ${l.map(a => `<button type="button" class="pill" data-cadd="${esc(a.n)}">＋ ${esc(a.n.split(' (')[0])}</button>`).join(' ')}</div>`).join('')}
      ${ops.length ? `<div>O usa una opción de tu plan para ${esc(P.items[kk].n.toLowerCase())}: <b>${ops.slice(0, 3).map(o => esc(o.n)).join(' · ')}</b> <button type="button" class="linkbtn" data-cver="${kk}">Ver</button></div>` : ''}
      ${!fil.length ? '<div>Con estos alimentos no se puede cuadrar del todo sin exagerar cantidades.</div>' : ''}</div>`;
  }
  const buscaAli = nom => ALI.find(x => norm(x.n) === norm(nom)) || ALI.find(x => norm(x.n).startsWith(norm(nom)));
  const st0 = () => ({ ctx: null, k: 0, sel: [] });
  function formPlato() {
    const d = S.modo === 'coach' && S.ficha ? datosPrevia(S.ficha) : S.d, n = d?.nutri || vacio(), l = ctxDe(n);
    if (!l.length) return toast('Aún no tienes contextos con macros en tu plan');
    const st = S.calc ||= st0(); if (st.ctx == null || st.ctx >= l.length) st.ctx = Math.min(selCtx(n), l.length - 1);
    const pinta = () => {
      const c = l[st.ctx], P = comidasPlan(c, comidasDia(d?.servicio)), nI = P.n, kk = Math.min(st.k, nI - 1), obj = objetivoComida(c, kk, nI);
      const r = st.sel.length ? calcular(st.sel, obj) : null, esCena = esCenaIng(P, kk);
      $('#calc-cuerpo').innerHTML = `<div class="stack" style="gap:6px"><span class="small"><b>¿Qué tipo de día es?</b></span><div class="chips">${l.map((x, i) => `<button type="button" class="pill ${i === st.ctx ? 'blue' : ''}" data-cctx="${i}">${esc(x.n)}</button>`).join('')}</div></div>
        <div class="stack" style="gap:6px"><span class="small"><b>¿Qué comida?</b></span><div class="chips">${P.items.map((x, i) => `<button type="button" class="pill ${i === kk ? 'blue' : ''}" data-ck="${i}">${esc(x.n)}</button>`).join('')}</div>
          <div class="calc-obj small">Objetivo de ${esc(obj.nombre.toLowerCase())}: <b>${fmtNum(obj.kcal, 0)} kcal</b> · P ${fmtNum(obj.p, 0)} g · C ${fmtNum(obj.c, 0)} g · G ${fmtNum(obj.g, 0)} g <span class="muted">(${ORIGEN_TXT[obj.origen]})</span>${obj.faltan.length ? `<br><span style="color:var(--warn)">Tu plan no indica ${obj.faltan.map(m => NOM_M[m]).join(' ni ')} para esta comida: esa parte no se calcula.</span>` : ''}</div></div>
        <div class="stack" style="gap:6px"><span class="small"><b>¿Qué quieres comer?</b> <span class="muted">Elige una proteína, un hidrato y una grasa (y verdura si quieres)</span></span>
          <input type="search" id="calc-q" list="calc-ali" placeholder="Escribe un alimento: pollo, arroz, aguacate…" autocomplete="off"><datalist id="calc-ali">${ALI.map(a => `<option value="${esc(a.n)}">`).join('')}</datalist>
          <div class="chips">${['Pollo (pechuga) cocinado', 'Arroz blanco cocido', 'Patata cocida', 'Huevo entero', 'Aceite de oliva virgen extra', 'Verdura variada (ensalada, brócoli, judías…)'].filter(x => !st.sel.some(s => s.a.n === x)).map(x => `<button type="button" class="pill" data-cadd="${esc(x)}">＋ ${esc(x.split(' (')[0])}</button>`).join('')}</div></div>
        ${r ? `<div class="calc-res">${st.sel.map((s, i) => `<div class="calc-al"><div class="grow"><b>${esc(s.a.n)}</b><span>${r.gr[i] ? equivVisual(s.a, r.gr[i]) : 'No hace falta: ya lo cubren los demás alimentos'}</span>${(() => { const av = esCena ? avisoCena(s.a) : null; return av ? `<small class="calc-cena">⚠ ${esc(av.m)}</small><span class="calc-alt">Mejor: ${av.alt.map(x => { const o = buscaAli(x); return o ? `<button type="button" class="pill" data-calt="${i}|${esc(o.n)}">${esc(o.n.split(' (')[0])}</button>` : ''; }).join('')}</span>` : ''; })()}${r.gr[i] ? `<small class="calc-ap">Aporta P ${fmtNum(s.a.p * r.gr[i] / 100, 0)} · C ${fmtNum(s.a.c * r.gr[i] / 100, 0)} · G ${fmtNum(s.a.g * r.gr[i] / 100, 0)} g</small>` : ''}${descuento(st.sel, r.gr, i)}</div><div class="calc-g"><b class="num">${r.gr[i] ? fmtNum(r.gr[i], 0) + ' g' : '—'}</b>${s.fijo != null ? '<small>fijado</small>' : s.a.t === 'V' || s.a.t === 'L' ? '<small>1 ración</small>' : ''}</div><button type="button" class="btn sm ghost" data-cfix="${i}" aria-label="Fijar cantidad">✎</button><button type="button" class="btn sm ghost" data-cdel="${i}" aria-label="Quitar">✕</button></div>`).join('')}
          <div class="calc-tot small">Total: <b>${fmtNum(r.tot.kcal, 0)} kcal</b> · P ${fmtNum(r.tot.p, 0)} g · C ${fmtNum(r.tot.c, 0)} g · G ${fmtNum(r.tot.g, 0)} g ${Math.abs(r.tot.kcal - obj.kcal) <= Math.max(40, obj.kcal * 0.08) && !r.avisos.length ? '<span class="pill ok">✓ cantidades encajan (aprox.)</span>' : `<span class="pill warn">${r.tot.kcal > obj.kcal ? '+' : ''}${fmtNum(r.tot.kcal - obj.kcal, 0)} kcal</span>`}</div>
          ${r.avisos.filter(x => !(r.faltan.length && /^Faltan/.test(x))).map(x => `<p class="small" style="color:var(--warn);margin:0">${esc(x)}</p>`).join('')}
          ${r.avisos.length ? salidas(r, st, c, P, kk, esCena, n) : '<p class="small muted" style="margin:0">Esto solo comprueba cantidades. Sigue también las demás indicaciones de tu plan.</p>'}
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
      else if (t.dataset.calt) { const [i, nom] = t.dataset.calt.split('|'), a = buscaAli(nom); if (a && st.sel[+i]) { if (st.sel.some((x, j) => j !== +i && x.a.n === a.n)) st.sel.splice(+i, 1); else st.sel[+i] = { a }; pinta(); } }
      else if (t.dataset.cadd) add(t.dataset.cadd);
      else if (t.dataset.cver != null) { S.nCtx = st.ctx; S.nIng = +t.dataset.cver; S.nDoc = null; cerrarSheet(); S.tab = 'nutri'; render(); }
      else if (t.dataset.cdel != null) { st.sel.splice(+t.dataset.cdel, 1); pinta(); }
      else if (t.dataset.cfix != null) { const s = st.sel[+t.dataset.cfix], v = prompt(`¿Cuántos gramos de ${s.a.n}? (vacío = que lo calcule la app)`, s.fijo ?? ''); if (v === null) return; s.fijo = numero(v) ?? null; pinta(); }
      else if (t.id === 'calc-diario') {
        const c = l[st.ctx], P = comidasPlan(c, comidasDia(d?.servicio)), kk = Math.min(st.k, P.n - 1), r = calcular(st.sel, objetivoComida(c, kk, P.n));
        if (S.modo === 'coach') return toast('Vista previa: el alumno lo apunta desde su app');
        const { error } = await sb.from('comidas_registro').insert({ alumno_id: S.user.id, fecha: hoyISO(), momento: 'Otro', contexto: c.n, alimentos: st.sel.map((s, i) => ({ n: s.a.n, q: `${fmtNum(r.gr[i], 0)} g` })), encaja: mide(fase(d)) ? 2 : null, nota: `Calculado para ${P.items[kk].n.toLowerCase()} (${fmtNum(r.tot.kcal, 0)} kcal)` });
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

Reglas: "reparto" lleva una fila por ingesta con sus propias kcal, p, c y g (cada macronutriente puede repartirse distinto; no los repartas en la proporción de las calorías) y la suma de las filas debe dar el total del contexto. "macro" es "p", "c" o "g" (o "mixto" para legumbres, lácteos y huevos). "ref_g_por_ingesta" son los gramos de ese macronutriente que aporta cada fila en una ingesta del contexto de referencia. "complemento": true para las raciones de acompañamiento (las marcadas con *). Las semanas usan exactamente los nombres de los contextos. No incluyas datos clínicos ni notas privadas.`;
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
    const ctx = (o.contextos || []).map(c => ({ n: String(c.nombre || '').trim(), d: c.cuando || '', kcal: num(c.kcal), p: num(c.p), c: num(c.c), g: num(c.g), ing: num(c.ingestas) || num(o.ingestas), rep: repPct(c.reparto), r: (c.reparto || []).map(x => ({ n: String(x.ingesta || x.nombre || '').trim(), kcal: num(x.kcal), p: num(x.p), c: num(x.c), g: num(x.g) })).filter(x => x.n || x.kcal != null || x.p != null), nota: c.nota || '' })).filter(c => c.n);
    ctx.forEach(c => { if (c.r.length) c.rep = ''; else delete c.r; });
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
  /* Identificación inequívoca: cada alumno tiene su código en la instrucción, y cada bloque su huella para no importarlo dos veces */
  const refDe = id => 'LOF-' + String(id || '').replace(/-/g, '').slice(0, 8).toUpperCase();
  const huella = t => { let h = 5381; const x = String(t).replace(/\s+/g, ''); for (let i = 0; i < x.length; i++) h = (h * 33 + x.charCodeAt(i)) >>> 0; return h.toString(36); };
  const promptPara = (a, id) => PROMPT_GPT.replace('"alumno": "Nombre del alumno",', `"alumno": "${(a.nombre || 'Nombre del alumno').replace(/"/g, "'")}",\n  "ref": "${refDe(id)}",`).replace('Reglas: ', `Reglas: "ref" es el código del alumno: cópialo exactamente (${refDe(id)}). `);
  function formImportar() {
    const f = S.ficha, a = (S.c?.perfiles || []).find(p => p.id === f?.id) || {}; if (!f) return;
    const PROMPT = promptPara(a, f.id), metas = (f.plan || []).map(x => x.datos?.meta).filter(Boolean), cx = (f.plan || []).find(x => x.clave === 'contextos');
    abrirSheet(`<div class="stack"><h2>📥 Importar su plan desde ChatGPT</h2>
      <p class="small muted" style="margin-top:-8px">Pega el bloque de datos que te da ChatGPT junto al PDF. Se guarda como <b>borrador</b>: ${esc((a.nombre || '').split(' ')[0])} no ve nada hasta que publiques cada apartado.</p>
      <details class="card"><summary class="small"><b>¿Qué le pido a ChatGPT?</b> · copia esta instrucción una vez en tu conversación</summary><textarea id="imp-p" rows="8" readonly style="font-size:12px;margin-top:8px">${esc(PROMPT)}</textarea><p class="small muted" style="margin:4px 0 0">Lleva su código <b>${refDe(f.id)}</b>: si pegas un bloque de otro alumno, no se guarda.</p><button class="btn sm ghost" type="button" id="imp-cp" style="margin-top:6px">📋 Copiar instrucción</button></details>
      <textarea id="imp-t" rows="10" placeholder="Pega aquí el bloque { … } de ChatGPT" style="font-size:12px"></textarea>
      <div id="imp-r"></div><button class="btn full" id="imp-a">Revisar antes de guardar</button></div>`);
    $('#imp-cp').addEventListener('click', async () => { try { await navigator.clipboard.writeText(PROMPT); toast('Copiado'); } catch (e) { $('#imp-p').select(); toast('Selecciona y copia'); } });
    let res = null;
    $('#imp-t').addEventListener('input', () => { const btn = $('#imp-a'); res = null; btn.dataset.paso = ''; btn.disabled = false; btn.textContent = 'Revisar antes de guardar'; $('#imp-r').innerHTML = ''; });
    $('#imp-a').addEventListener('click', async () => {
      const box = $('#imp-r'), btn = $('#imp-a');
      if (res && btn.dataset.paso === 'guardar') { const sinMarcar = [...box.querySelectorAll('[data-conf]')].filter(x => !x.checked); if (res.bloquea) return; if (sinMarcar.length) { box.querySelector('.imp-conf-err').textContent = 'Marca las confirmaciones de arriba para guardarlo.'; return; } btn.disabled = true; btn.textContent = 'Guardando…'; try { await guardarImport(f, res); cerrarSheet(); toast('Guardado como borrador: revisa y publica cada apartado'); await cargarPlanificacion(f); render(); } catch (err) { btn.disabled = false; btn.textContent = 'Guardar como borrador'; box.insertAdjacentHTML('beforeend', `<p class="err">No se ha podido guardar (${esc(err.message || '')})</p>`); } return; }
      let crudo; try { crudo = leerJSON($('#imp-t').value); res = normalizar(crudo, a.nombre); } catch (err) { box.innerHTML = `<p class="err">${esc(err.message)}</p>`; return; }
      res.ref = crudo.ref ? String(crudo.ref).trim().toUpperCase() : ''; res.hash = huella(JSON.stringify(crudo));
      const conf = [], previo = metas.find(m => m.hash === res.hash), ultFecha = metas.map(m => m.fecha_doc).filter(Boolean).sort().pop();
      res.bloquea = res.ref && res.ref !== refDe(f.id) ? `Este bloque lleva el código ${res.ref} y ${(a.nombre || '').split(' ')[0]} tiene ${refDe(f.id)}: es de otro alumno. No se guarda.` : '';
      if (!res.ref && res.av.some(x => /Revisa que sea el alumno correcto/.test(x))) conf.push(`Confirmo que este plan es para ${esc(a.nombre || 'este alumno')}`);
      if (previo) conf.push(`Este mismo bloque ya se importó el ${esc(fCorta(previo.importado || hoyISO()))}: importarlo otra vez`);
      if (ultFecha && res.fecha && res.fecha < ultFecha) conf.push(`El documento es del ${esc(fCorta(res.fecha))} y su plan actual es del ${esc(fCorta(ultFecha))}: sustituirlo por el más antiguo`);
      res.conf = conf;
      if (res.ctx.length) res.ok.push(`se guardará como versión ${versionCtx(cx || null, { ctx: res.ctx, ingestas: res.ingestas }).n} de sus contextos`);
      { const sim = (f.plan || []).map(x => ({ ...x, datos: { ...(x.datos || {}) } })), pon = (k, d) => { const x = sim.find(z => z.clave === k); if (x) Object.assign(x.datos, d, { ver_ok: 1e9 }); else sim.push({ clave: k, datos: { ...d, ver_ok: 1e9 } }); };
        if (res.ctx.length) pon('contextos', { ctx: res.ctx, ingestas: res.ingestas, version: null }); if (res.guias.length) pon('equivalencias', { guias: res.guias }); if (res.menus.length) pon('menus', { menus: res.menus });
        coherencia(sim, f.srv).filter(o => o.niv !== 'info').forEach(o => res.av.push(`${ICO_COH[o.niv]} ${o.txt.replace(/<[^>]+>/g, '')}`)); }
      box.innerHTML = `<div class="card stack small"><b>Encontrado:</b> ${res.ok.join(' · ') || 'nada útil'}${res.av.length ? `<div class="stack" style="gap:4px;margin-top:6px">${res.av.map(x => `<div style="color:var(--warn)">${esc(x)}</div>`).join('')}</div>` : '<div style="color:var(--ok)">✓ Sin incoherencias detectadas</div>'}
        ${res.bloquea ? `<p class="err" style="margin:6px 0 0">⛔ ${esc(res.bloquea)}</p>` : ''}${(res.conf || []).map(t => `<label class="row" style="gap:8px;margin-top:6px"><input type="checkbox" data-conf style="width:20px;height:20px"> <span>${t}</span></label>`).join('')}<p class="err imp-conf-err" style="margin:0"></p>
        <div class="muted">Se guardará en: ${[res.resumen && 'Informe de contexto', (res.ctx.length || res.semana.length) && 'Contextos', res.guias.length && 'Equivalencias visuales', res.menus.length && 'Menús', (res.sup.length || res.hidratacion) && 'Suplementación'].filter(Boolean).join(', ')}. Los textos y PDF que ya tengas en esos apartados se conservan.</div></div>`;
      btn.dataset.paso = 'guardar'; btn.textContent = res.bloquea ? 'No se puede guardar' : 'Guardar como borrador'; btn.disabled = !!res.bloquea;
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
    const meta = { origen: 'chatgpt', importado: hoyISO(), fecha_doc: r.fecha, hash: r.hash || null, ref: r.ref || null };
    let ver = base('contextos')?.datos?.version || null;
    if (r.ctx.length || r.semana.length) { const d = { ctx: r.ctx, semana: r.semana, ingestas: r.ingestas || null, meta }; ver = versionCtx(base('contextos'), d); await up('contextos', tit('contextos'), ord('contextos'), { datos: { ...d, version: ver } }); }
    const vo = ver?.n ? { ver_ok: ver.n } : {};
    if (r.resumen) await up('contexto', tit('contexto'), ord('contexto'), { contenido: r.resumen, datos: { meta, ...vo } });
    if (r.guias.length) await up('equivalencias', tit('equivalencias'), ord('equivalencias'), { datos: { guias: r.guias, medidas: r.medidas, meta, ...vo } });
    if (r.menus.length) await up('menus', tit('menus'), ord('menus'), { datos: { menus: r.menus, meta, ...vo } });
    if (r.sup.length || r.hidratacion) await up('suplementacion', tit('suplementacion'), ord('suplementacion'), { datos: { sup: r.sup, hidratacion: r.hidratacion, meta } });
  }

  /* ---------- Vistas del alumno para los datos estructurados ---------- */
  const MACRO = { c: ['Hidratos', '🍚'], p: ['Proteínas', '🍗'], g: ['Grasas', '🥑'], mixto: ['Mixtos', '🥚'] };
  /* Objetivo de un macro en la comida elegida, con el mismo reparto que la calculadora */
  const objetivoIng = (c, macro, k = 0) => { if (!c || !['p', 'c', 'g'].includes(macro)) return null; const P = comidasPlan(c, comidasDia(S.modo === 'coach' ? S.ficha?.srv : S.d?.servicio)); return P.items[Math.min(k, P.n - 1)]?.[macro] ?? null; };
  function vGuias(x, n) {
    const gs = x.datos.guias, l = ctxDe(n), i = Math.min(selCtx(n), Math.max(0, l.length - 1)), c = l[i], tab = Math.min(S.nGuia || 0, gs.length - 1), gu = gs[tab];
    const P = c ? comidasPlan(c, comidasDia(S.modo === 'coach' ? S.ficha?.srv : S.d?.servicio)) : null, kk = P ? Math.min(S.nIngG || 0, P.n - 1) : 0;
    const obj = objetivoIng(c, gu.macro, kk), fac = obj && gu.ref ? obj / gu.ref : null, md = x.datos.medidas;
    const cant = a => { if (a.g == null) return '—'; const v = a.comp || !fac ? a.g : Math.round(a.g * fac / 5) * 5; return `${fmtNum(v, 0)} ${esc(a.u || 'g')}`; };
    return `<section class="section"><div class="card stack">
      ${l.length ? `<div class="stack" style="gap:6px"><span class="small muted">Cantidades para una ingesta de tu día:</span><div class="chips">${l.map((z, k) => `<button class="pill ${k === i ? 'blue' : ''}" data-act="nuCtx" data-i="${k}">${esc(z.n)}</button>`).join('')}</div></div>` : ''}
      ${P && P.n > 1 ? `<div class="chips">${P.items.map((z, k) => `<button class="pill ${k === kk ? 'blue' : ''}" data-act="nuIngG" data-i="${k}">${esc(z.n)}</button>`).join('')}</div>` : ''}
      <div class="chips nu-gtabs">${gs.map((z, k) => `<button class="pill ${k === tab ? 'gold' : ''}" data-act="nuGuia" data-i="${k}">${(MACRO[z.macro] || MACRO.mixto)[1]} ${esc(z.titulo || (MACRO[z.macro] || MACRO.mixto)[0])}</button>`).join('')}</div>
      ${obj ? `<div class="aprox small">${P && P.n > 1 ? esc(P.items[kk].n) : 'Objetivo'} en «${esc(c.n)}»${P?.origen === 'iguales' ? ' (orientativo)' : ''}: <b>≈ ${fmtNum(obj, 0)} g de ${(MACRO[gu.macro] || MACRO.mixto)[0].toLowerCase()}</b>${fac && Math.abs(fac - 1) > 0.05 ? ` · cantidades ajustadas ×${fmtNum(fac, 2)} respecto a tu guía` : ''}. Elige <b>una</b> fila (o combina medias raciones).</div>` : gu.macro === 'mixto' ? '<div class="aprox small">Cuentan en varios macronutrientes a la vez: úsalos como complemento y ajusta el resto del plato.</div>' : ''}
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
  return { colaRevisiones, metricasNutri, acuerdo, acuerdoDe, flexTxt, tarjetaTemporal, vSeguimientoCoach: aislar(vSeguimientoCoach), comidasPlan, txtReparto, nombresIng, coherencia, versionCtx, vCoherencia: aislar(vCoherencia), lineaCoh, fase, faseDe, faseCoach, mide, FASES, vSemana7: aislar(vSemana7), formImportar, formPlato, calcular, avisoCena, ALI, objetivoComida, equivVisual, vIncCoach: aislar(vIncCoach), formInc, esInc, guardarResumen, vista: aislar(vista), vCoach: aislar(vCoach), cargar, cargarFicha, cargarCoach, datosPrevia, nuevasDe, DOCS, esPdf, ctxDe };
})();
