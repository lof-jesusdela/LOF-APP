/* ---------- Planificador semanal de alimentación ----------
   El alumno marca qué días entrena y trabaja, cuántas comidas hace cada día, escribe qué va a comer y elige cuándo se permite
   sus comidas libres (el 15 % de las comidas de la semana). Con eso se calculan las cantidades de cada comida según su
   contexto (entreno / descanso, trabajo) y se genera la lista de la compra. Si la app no entiende un plato, pregunta qué lleva. */
const MenuSemana = (() => {
  const DL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const AVISO = 'Falta ejecutar el Bloque 80 en Supabase.';
  const KW = [
    [/pollo|pechuga/, 'Pollo (pechuga) en crudo'], [/pavo/, 'Pavo (pechuga) en crudo'],
    [/ternera|carne picada|hamburguesa|solomillo|vacuno|albondiga/, 'Ternera magra en crudo'], [/cerdo|lomo|secreto|presa/, 'Lomo de cerdo en crudo'],
    [/salmon/, 'Salmón en crudo'], [/merluza|bacalao|lubina|dorada|pescado|rape|lenguado|pescadilla|gallo|panga|tilapia/, 'Pescado blanco en crudo (merluza, bacalao…)'],
    [/atun|bonito|caballa|sardina/, 'Atún al natural (escurrido)'], [/gamba|langostino|marisco/, 'Gambas o langostinos pelados'],
    [/huevo|tortilla|revuelto|omelet/, 'Huevo entero'], [/clara/, 'Claras de huevo'], [/jamon/, 'Jamón serrano'], [/tofu|soja/, 'Tofu firme'],
    [/whey|proteina en polvo|batido de proteina/, 'Proteína en polvo (whey)'],
    [/queso fresco|requeson|cottage/, 'Queso fresco batido 0 %'], [/skyr|yogur proteico|yogur alto/, 'Yogur alto en proteína'], [/yogur griego/, 'Yogur griego natural'],
    [/kefir/, 'Kéfir natural'], [/leche/, 'Leche semidesnatada'], [/queso(?! fresco)/, 'Queso curado'],
    [/arroz integral/, 'Arroz integral cocido'], [/arroz|paella|risotto|sushi/, 'Arroz blanco cocido'],
    [/pasta|macarron|espagueti|fideo|tallarin|lasana|penne|raviol|canelon/, 'Pasta cocida'], [/patata|papas/, 'Patata cocida'], [/boniato|batata/, 'Boniato cocido'],
    [/yuca/, 'Yuca cocida'], [/quinoa/, 'Quinoa cocida'], [/cuscus/, 'Cuscús cocido'], [/noqui/, 'Ñoquis'],
    [/pan integral/, 'Pan integral'], [/\bpan\b|bocadillo|tostada|sandwich|bocata|wrap|tosta/, 'Pan blanco'],
    [/avena|porridge|copos/, 'Copos de avena'], [/tortita/, 'Tortitas de arroz'], [/maiz/, 'Maíz cocido'],
    [/lenteja/, 'Lentejas cocidas'], [/garbanzo|hummus|cocido/, 'Garbanzos cocidos'], [/alubia|judias blancas|fabada/, 'Alubias cocidas'],
    [/platano/, 'Plátano'], [/manzana/, 'Manzana'], [/naranja|mandarina/, 'Naranja'], [/fresa/, 'Fresas'], [/arandano/, 'Arándanos'], [/datil/, 'Dátiles'], [/miel/, 'Miel'],
    [/aceite|aove/, 'Aceite de oliva virgen extra'], [/aguacate|guacamole/, 'Aguacate (pulpa)'], [/nuez|nueces/, 'Nueces'], [/almendra|frutos secos/, 'Almendras'],
    [/cacahuete/, 'Crema de cacahuete 100 %'], [/aceituna/, 'Aceitunas'], [/chocolate/, 'Chocolate negro 85 %'],
    [/calabaza|zanahoria/, 'Calabaza o zanahoria cocida'],
    [/verdura|ensalada|brocoli|judias|espinaca|calabacin|pisto|gazpacho|crema de verdura|menestra|coliflor|berenjena|pimiento|champi|seta|esparrago|lechuga|tomate|pepino|cebolla|alcachofa|salteado/, 'Verdura variada (ensalada, brócoli, judías…)']
  ];
  const PLATOS = [[/tortilla de patata/, ['Huevo entero', 'Patata cocida', 'Aceite de oliva virgen extra']], [/paella/, ['Arroz blanco cocido', 'Pollo (pechuga) en crudo', 'Verdura variada (ensalada, brócoli, judías…)']]];
  /* Lo que se compra: los hidratos y legumbres van cocidos en la calculadora, pero se compran en seco */
  const COMPRA = { 'Arroz blanco cocido': ['Arroz blanco (en seco)', 0.4], 'Arroz integral cocido': ['Arroz integral (en seco)', 0.4], 'Pasta cocida': ['Pasta (en seco)', 0.45], 'Quinoa cocida': ['Quinoa (en seco)', 0.38],
    'Cuscús cocido': ['Cuscús (en seco)', 0.35], 'Lentejas cocidas': ['Lentejas (en seco)', 0.4], 'Garbanzos cocidos': ['Garbanzos (en seco)', 0.4], 'Alubias cocidas': ['Alubias (en seco)', 0.4], 'Maíz cocido': ['Maíz (en lata, escurrido)', 1] };
  const UD = new Set(['Huevo entero', 'Claras de huevo', 'Pan integral', 'Pan blanco', 'Tortitas de arroz', 'Plátano', 'Manzana', 'Naranja', 'Dátiles', 'Atún al natural (escurrido)', 'Yogur alto en proteína']);
  const buscaAli = nom => Nutricion.ALI.find(x => norm(x.n) === norm(nom)) || Nutricion.ALI.find(x => norm(x.n).startsWith(norm(nom)));
  /* Texto libre → alimentos de la tabla */
  function reconoce(txt) {
    const t = norm(txt), out = [], add = n => { const a = buscaAli(n); if (a && !out.includes(a)) out.push(a); };
    PLATOS.forEach(([re, l]) => { if (re.test(t)) l.forEach(add); });
    KW.forEach(([re, n]) => { if (re.test(t)) add(n); });
    return out;
  }
  /* Una comida: si el alumno desglosa ingredientes, manda eso; si no, se interpreta el nombre del plato */
  function comida(m) {
    const ing = (m.ing || '').trim();
    if (ing) {
      const items = [], otros = [];
      ing.split(/[,;+\n]|\sy\s/).map(x => x.trim()).filter(Boolean).forEach(tok => { const r = reconoce(tok); if (r.length) r.forEach(a => { if (!items.includes(a)) items.push(a); }); else otros.push(tok); });
      return { items, otros, conocido: items.length > 0 };
    }
    const items = reconoce(m.t || '');
    return { items, otros: [], conocido: items.length > 0 };
  }
  const hay = m => !!((m.t || '').trim() || (m.ing || '').trim());
  let st = null;
  const vacia = n => ({ t: '', ing: '', perm: false });
  function nuevo(n) { return [...Array(7)].map(() => [...Array(n)].map(vacia)); }
  async function cargar(lunes) {
    const uid = S.user.id, base = { lunes, entreno: [...(planDe(lunes)?.dias || [])], trabaja: [], menu: nuevo(comidasDia(S.d?.servicio)) };
    const a = await sb.from('plan_nutri_semana').select('*').eq('alumno_id', uid).eq('semana_inicio', lunes).maybeSingle();
    if (a.error) { st = { ...base, sinTabla: true }; return; }
    let d = a.data?.datos, copiado = false;
    if (!d) { const p = await sb.from('plan_nutri_semana').select('*').eq('alumno_id', uid).lt('semana_inicio', lunes).order('semana_inicio', { ascending: false }).limit(1); d = p.data?.[0]?.datos; copiado = !!d; }
    st = d ? { ...base, ...d, lunes, entreno: a.data ? d.entreno || [] : (planDe(lunes)?.dias || d.entreno || []), copiado, vista: 'plan' } : { ...base, vista: 'plan' };
    st.vista = 'plan';
  }
  /* Qué contexto del plan le toca a cada día: entreno / descanso y trabajo / libre */
  function ctxIdx(l, ent, trab) {
    if (!l.length) return -1;
    const sc = c => { const n = norm(c.n); let p = 0;
      if (/entren/.test(n) && !/no entren|sin entren/.test(n)) p += ent ? 3 : -3; if (/descans|no entren|sin entren/.test(n)) p += ent ? -3 : 3;
      if (/trabaj|laboral|oficina|turno/.test(n)) p += trab ? 2 : -2; if (/libre|festivo|fin de semana|finde/.test(n)) p += trab ? -2 : 2; return p; };
    return l.map((c, i) => [sc(c), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1])[0][1];
  }
  const ctxs = () => Nutricion.ctxDe(S.d?.nutri || { plan: [] });
  /* Cantidades de cada comida (y total de la semana) */
  function calculo() {
    const l = ctxs(), filas = [], tot = new Map(), libres = [], otros = [];
    st.menu.forEach((dia, i) => {
      const ent = st.entreno.includes(i), trab = st.trabaja.includes(i), ci = ctxIdx(l, ent, trab), c = ci >= 0 ? l[ci] : null, nd = dia.length;
      dia.forEach((m, k) => {
        if (!hay(m)) return;
        const r = comida(m); r.otros.forEach(o => otros.push(o));
        if (m.perm) { libres.push(`${DL[i]} · ${m.t || m.ing}`); return; }
        if (!r.conocido) { otros.push(m.t || m.ing); return; }
        const sel = r.items.map(a => ({ a }));
        let gr;
        if (c) gr = Nutricion.calcular(sel, Nutricion.objetivoComida({ ...c, ing: nd, rep: '' }, k, nd)).gr;
        else gr = sel.map(s => s.a.t === 'P' ? 150 : s.a.t === 'C' ? 150 : s.a.t === 'G' ? 10 : s.a.u[2]);
        r.items.forEach((a, j) => { if (gr[j] > 0) { const x = tot.get(a.n) || { a, g: 0 }; x.g += gr[j]; tot.set(a.n, x); } });
        filas.push({ i, k, m, r, gr, ctx: c?.n });
      });
    });
    return { filas, tot, libres, otros, sinCtx: !l.length };
  }
  function qty(a, g) {
    if (UD.has(a.n)) { const u = Math.max(1, Math.ceil(g / a.u[2] - 0.15)); return `${u} ${u > 1 ? a.u[1] : a.u[0]}`; }
    const f = COMPRA[a.n]; if (f) g *= f[1];
    if (/^(Leche|Kéfir)/.test(a.n)) return `${fmtNum(g / 1000, 1)} L`;
    const r = g >= 300 ? Math.ceil(g / 50) * 50 : Math.ceil(g / 10) * 10;
    return r >= 1000 ? `${fmtNum(r / 1000, 2)} kg` : `${r} g`;
  }
  const nombreCompra = a => COMPRA[a.n]?.[0] || a.n.replace(/ en crudo| cocid[oa]| \(escurrido\)/, '');
  const GRUPO = { P: ['🍗', 'Proteínas'], C: ['🍚', 'Hidratos y fruta'], G: ['🥑', 'Grasas'], V: ['🥦', 'Verdura'], L: ['🥛', 'Lácteos'] };
  function textoCompra(cl) {
    const l = ['🛒 Lista de la compra · semana del ' + fCorta(st.lunes)];
    ['P', 'C', 'G', 'V', 'L'].forEach(t => { const x = [...cl.tot.values()].filter(y => y.a.t === t); if (x.length) { l.push('', GRUPO[t][1]); x.forEach(y => l.push(`- ${nombreCompra(y.a)}: ${qty(y.a, y.g)}`)); } });
    if (cl.otros.length) { l.push('', 'Otros (sin cantidad)'); [...new Set(cl.otros)].forEach(o => l.push('- ' + o)); }
    if (cl.libres.length) { l.push('', 'Comidas libres'); cl.libres.forEach(o => l.push('- ' + o)); }
    return l.join('\n');
  }
  function vPlan() {
    const total = st.menu.reduce((t, d) => t + d.length, 0), max = Math.round(total * 0.15), usadas = st.menu.reduce((t, d) => t + d.filter(m => m.perm).length, 0), l = ctxs();
    const dias = st.menu.map((dia, i) => {
      const ent = st.entreno.includes(i), trab = st.trabaja.includes(i), ci = ctxIdx(l, ent, trab), f = sumaDias(st.lunes, i);
      const filas = dia.map((m, k) => {
        const r = comida(m), ultima = k === dia.length - 1 && dia.length > 1, cena = ultima && !m.perm && hay(m) ? r.items.map(a => [a, Nutricion.avisoCena(a)]).filter(x => x[1]) : [];
        const pregunta = hay(m) && !r.conocido && !m.perm, abre = m.abre || pregunta || (m.ing || '').trim();
        return `<div class="ms-com${m.perm ? ' libre' : ''}"><div class="row" style="gap:6px"><span class="small muted ms-k">${ultima ? 'Última' : 'Comida ' + (k + 1)}</span>
          <input type="text" data-ms-t data-d="${i}" data-k="${k}" value="${esc(m.t)}" placeholder="Ej.: pollo con arroz y brócoli" aria-label="${DL[i]}, comida ${k + 1}">
          <button type="button" class="pill ${m.perm ? 'gold' : ''}" data-ms="perm" data-d="${i}" data-k="${k}" aria-pressed="${!!m.perm}" title="Comida libre (de tu 15 %)">✨</button>
          <button type="button" class="pill ${abre ? 'blue' : ''}" data-ms="ing" data-d="${i}" data-k="${k}" title="Desglosar ingredientes">🧾</button></div>
          ${abre ? `<input type="text" data-ms-i data-d="${i}" data-k="${k}" value="${esc(m.ing)}" placeholder="Ingredientes: pollo, arroz, brócoli, aceite…" aria-label="Ingredientes">` : ''}
          ${pregunta ? `<p class="ms-rojo">No sé qué lleva «${esc(m.t || m.ing)}». ¿Qué ingredientes tiene? Escríbelos separados por comas para calcular cantidades y la compra.</p>` : ''}
          ${cena.slice(0, 2).map(([a, av]) => `<p class="ms-rojo">⚠ ${esc(a.n.split(' (')[0])}: ${esc(av.m)} Mejor: ${esc(av.alt.join(', '))}.</p>`).join('')}</div>`;
      }).join('');
      return `<div class="card stack ms-dia" style="gap:8px"><div class="row" style="flex-wrap:wrap;gap:6px"><b class="grow">${DL[i]} <span class="small muted">${fCorta(f)}</span></b>
        <button type="button" class="pill ${ent ? 'blue' : ''}" data-ms="ent" data-d="${i}" aria-pressed="${ent}">🏋️ Entreno</button><button type="button" class="pill ${trab ? 'blue' : ''}" data-ms="trab" data-d="${i}" aria-pressed="${trab}">💼 Trabajo</button></div>
        ${ci >= 0 ? `<div class="small muted">Macros de este día: <b>${esc(l[ci].n)}</b></div>` : ''}
        ${filas}
        <div class="row small" style="gap:8px"><button type="button" class="btn sm ghost" data-ms="menos" data-d="${i}">− comida</button><span class="muted">${dia.length} ${dia.length === 1 ? 'comida' : 'comidas'}</span><button type="button" class="btn sm ghost" data-ms="mas" data-d="${i}">＋ comida</button></div></div>`;
    }).join('');
    return `<p class="small muted" style="margin:0">Marca los días que <b>entrenas</b> y los que <b>trabajas</b>: según eso se ajustan tus macros. Escribe qué vas a comer; con ✨ marcas tus comidas libres y con 🧾 desglosas los ingredientes.</p>
      ${st.copiado ? '<p class="small" style="margin:0;color:var(--blue,#2563eb)">He copiado tu semana anterior como punto de partida: cámbiala como quieras.</p>' : ''}
      ${st.sinTabla ? `<p class="ms-rojo">${AVISO} Puedes usarlo, pero no se guardará.</p>` : ''}
      ${!l.length ? '<p class="ms-rojo">Aún no tienes contextos con macros en tu plan: la lista saldrá con cantidades orientativas.</p>' : ''}
      <div class="card ms-res ${usadas > max ? 'mal' : ''}"><b>✨ Comidas libres: ${usadas} de ${max}</b><span class="small muted"> · el 15 % de tus ${total} comidas de la semana</span>${usadas > max ? '<div class="ms-rojo" style="margin-top:4px">Te pasas de tu 15 %. Quita alguna comida libre o vuelve a tu plan.</div>' : ''}</div>
      ${dias}
      <div class="row" style="gap:8px"><button type="button" class="btn grow" data-ms="guardar">💾 Guardar mi semana</button><button type="button" class="btn grow gold" data-ms="compra">🛒 Lista de la compra</button></div>`;
  }
  function vCompra() {
    const cl = calculo(), grupos = ['P', 'C', 'G', 'V', 'L'].map(t => [t, [...cl.tot.values()].filter(y => y.a.t === t)]).filter(x => x[1].length);
    return `<button type="button" class="btn sm ghost" data-ms="volver" style="align-self:flex-start">← Volver a mi semana</button>
      <h3 style="margin:0">🛒 Lista de la compra · semana del ${fCorta(st.lunes)}</h3>
      ${cl.sinCtx ? '<p class="small muted" style="margin:0">Cantidades orientativas: aún no hay macros en tu plan.</p>' : '<p class="small muted" style="margin:0">Cantidades de toda la semana, calculadas con los macros de cada día (entreno, descanso, trabajo). Los hidratos y legumbres aparecen en seco.</p>'}
      ${grupos.map(([t, x]) => `<div class="card stack" style="gap:6px"><b>${GRUPO[t][0]} ${GRUPO[t][1]}</b>${x.map(y => `<div class="row small"><span class="grow">${esc(nombreCompra(y.a))}</span><b class="num">${qty(y.a, y.g)}</b></div>`).join('')}</div>`).join('') || '<div class="card empty">Escribe qué vas a comer cada día para generar la lista.</div>'}
      ${cl.otros.length ? `<div class="card stack" style="gap:4px"><b>Sin cantidad (no sé qué llevan)</b>${[...new Set(cl.otros)].map(o => `<span class="small">· ${esc(o)}</span>`).join('')}<span class="small muted">Vuelve a la semana y toca 🧾 para decirme sus ingredientes.</span></div>` : ''}
      ${cl.libres.length ? `<div class="card stack" style="gap:4px"><b>✨ Comidas libres</b>${cl.libres.map(o => `<span class="small">· ${esc(o)}</span>`).join('')}</div>` : ''}
      <button type="button" class="btn full" data-ms="copiar">📋 Copiar la lista</button>`;
  }
  const pinta = () => { const c = $('#ms-cuerpo'); if (c) c.innerHTML = st.vista === 'compra' ? vCompra() : vPlan(); };
  async function guardar(silencio) {
    const datos = { entreno: st.entreno, trabaja: st.trabaja, menu: st.menu };
    const { error } = await sb.from('plan_nutri_semana').upsert({ alumno_id: S.user.id, semana_inicio: st.lunes, datos }, { onConflict: 'alumno_id,semana_inicio' });
    if (error) { fallo(error, AVISO); return false; }
    if (typeof usaPlan === 'function' && usaPlan() && st.entreno.length) { try { await guardarPlanSemana(st.lunes, st.entreno); } catch (e) { /* el plan de entreno es opcional */ } }
    S.d.pnSemanas = [...new Set([...(S.d.pnSemanas || []), st.lunes])];
    if (!silencio) toast('Semana guardada ✓'); return true;
  }
  async function abrir(objetivo) {
    if (S.modo === 'coach') return toast('Esto lo usa el alumno desde su app');
    const l = lunesDe(hoyISO()), prox = objetivo || (hoyIdx() >= 4 ? sumaDias(l, 7) : l);
    abrirSheet(`<div class="stack"><h2>🗓 Planifica tu semana</h2><div class="chips" id="ms-sem"></div><div id="ms-cuerpo" class="stack" style="gap:12px"><div class="empty">Cargando…</div></div><button type="button" class="btn ghost full" data-act="cerrarSheet">Cerrar</button></div>`);
    const semanas = () => { $('#ms-sem').innerHTML = [l, sumaDias(l, 7)].map((x, i) => `<button type="button" class="pill ${st?.lunes === x ? 'blue' : ''}" data-ms="sem" data-l="${x}">${i ? 'La semana que viene' : 'Esta semana'}</button>`).join(''); };
    await cargar(prox); semanas(); pinta();
    const cont = $('#ms-cuerpo').parentElement, sac = (b, a) => ({ d: +b.dataset.d, k: +b.dataset.k });
    cont.addEventListener('input', ev => { const t = ev.target; if (t.dataset.msT != null) st.menu[+t.dataset.d][+t.dataset.k].t = t.value; else if (t.dataset.msI != null) st.menu[+t.dataset.d][+t.dataset.k].ing = t.value; });
    cont.addEventListener('change', ev => { const t = ev.target; if (t.dataset.msT != null || t.dataset.msI != null) pinta(); });
    cont.addEventListener('click', async ev => {
      const b = ev.target.closest('[data-ms]'); if (!b || !st) return; const a = b.dataset.ms, i = +b.dataset.d, k = +b.dataset.k;
      const alt = (arr, v) => { const j = arr.indexOf(v); if (j < 0) arr.push(v); else arr.splice(j, 1); arr.sort((x, y) => x - y); };
      if (a === 'ent') alt(st.entreno, i); else if (a === 'trab') alt(st.trabaja, i);
      else if (a === 'perm') st.menu[i][k].perm = !st.menu[i][k].perm;
      else if (a === 'ing') st.menu[i][k].abre = !st.menu[i][k].abre;
      else if (a === 'mas') { if (st.menu[i].length < 7) st.menu[i].push(vacia()); }
      else if (a === 'menos') { if (st.menu[i].length > 1) st.menu[i].pop(); }
      else if (a === 'sem') { await cargar(b.dataset.l); semanas(); }
      else if (a === 'guardar') { await guardar(); return; }
      else if (a === 'compra') { st.vista = 'compra'; await guardar(true); }
      else if (a === 'volver') st.vista = 'plan';
      else if (a === 'copiar') { try { await navigator.clipboard.writeText(textoCompra(calculo())); toast('Lista copiada ✓'); } catch (e) { toast('No se ha podido copiar'); } return; }
      pinta(); if (a === 'compra' || a === 'volver') $('#sheet-in')?.scrollTo?.(0, 0);
    });
  }
  /* Segundo check-in: domingo y lunes, escribir el menú de la semana que empieza (el domingo la siguiente; el lunes, la de hoy) */
  function tarjeta() {
    const s = S.d?.servicio || {}, dow = new Date().getDay();
    if (S.modo === 'coach' || S.vista || !s.modulo_nutricion || s.modulo_futbol || (dow !== 0 && dow !== 1) || Acomp.estado(s).k === 'pausado') return '';
    const l = lunesDe(hoyISO()), obj = dow === 0 ? sumaDias(l, 7) : l;
    if (!S.d.pnSemanas && !S._pnPedido) {
      S._pnPedido = true;
      Promise.resolve(sb.from('plan_nutri_semana').select('semana_inicio').eq('alumno_id', S.user.id).gte('semana_inicio', l)).then(r => { S.d.pnSemanas = (r.data || []).map(x => x.semana_inicio); render(); }, () => { S.d.pnSemanas = []; });
    }
    const hecho = (S.d.pnSemanas || []).includes(obj), cargando = !S.d.pnSemanas;
    return `<section class="section"><div class="card row" style="gap:10px;align-items:center"><div class="ico ${hecho ? '' : 'gold'}">🗓</div><div class="grow stack" style="gap:4px"><b class="small">Check-in de planificación · semana del ${esc(fCorta(obj))}</b>
      <div>${hecho ? '<span class="pill ok">✓ Menú escrito</span>' : '<span class="pill gold">Toca ahora</span>'}</div>
      <div class="small muted">Apunta los días que trabajas y entrenas, tus comidas libres y lo que tienes pensado comer. Te calculo las cantidades y la compra.</div></div>
      <button class="btn sm" data-act="nuSemana" data-l="${obj}" ${cargando ? 'disabled' : ''}>${hecho ? 'Ver o cambiar' : 'Escribir menú'}</button></div></section>`;
  }
  return { abrir, tarjeta, reconoce, comida, ctxIdx, qty, buscaAli };
})();
window.MenuSemana = MenuSemana;
