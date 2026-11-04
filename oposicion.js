/* ======================= VÍA OPOSICIÓN · pruebas físicas (Policía Nacional) =======================
   Para opositores: no es recomposición corporal ni fútbol. Lo que manda son las marcas de las pruebas físicas
   y su nota oficial (0–10). Cada simulacro se guarda como un test (valoraciones + pruebas, tipo 'policia'),
   así sale también en la pestaña de tests. El servicio guarda la oposición, la fecha del examen y los objetivos. */
const Oposicion = (() => {
  /* Baremo oficial (bases de la convocatoria): umbral para cada nota de 10 a 1; peor que el de 1 = 0 */
  const BAREMO = {
    mujer: {
      m1000: { menor: true, u: [204, 213, 222, 231, 240, 249, 258, 267, 276, 285] },          // segundos
      agil: { menor: true, u: [9.3, 9.8, 10.3, 10.8, 11.2, 11.6, 12.0, 12.3, 12.5, 12.7] },   // segundos (a la décima)
      barra: { menor: false, u: [95, 86, 78, 70, 63, 57, 52, 46, 41, 36] }                     // segundos en suspensión
    },
    hombre: {
      m1000: { menor: true, u: [174, 180, 186, 192, 198, 204, 210, 216, 222, 228] },
      agil: { menor: true, u: [8.2, 8.8, 9.3, 9.7, 10.1, 10.5, 10.9, 11.2, 11.4, 11.6] },
      barra: { menor: false, u: [17, 16, 15, 14, 12, 10, 8, 7, 6, 5] }                         // dominadas
    }
  };
  const OPOS = { policia_nacional: 'Policía Nacional' };
  const PRUEBAS = sx => [['m1000', 'Carrera 1000 m', '🏃'], ['agil', 'Circuito de agilidad', '⚡'], ['barra', sx === 'hombre' ? 'Dominadas' : 'Suspensión en barra', '💪']];
  const NOMBRE_DATO = { m1000: 'Carrera 1000 m', agil: 'Circuito de agilidad', barra: 'Barra' };
  const claveDe = n => { const t = norm(n || ''); return /1000|carrera/.test(t) ? 'm1000' : /agil|circuito/.test(t) ? 'agil' : /barra|suspens|dominad/.test(t) ? 'barra' : null; };

  /* Lectura de marcas: «4:17», «4'17», «4.17» (1000 m); «11,24» (agilidad); «63"», «1:03» o «12» (barra) */
  function leer(k, v) {
    const s = String(v ?? '').trim().replace(/[´’']+/g, ':').replace(/["”]+/g, '').replace(/\s*(seg|s|min|reps?|dominadas?)\.?$/i, '').trim(); if (!s) return null;
    const mm = s.match(/^(\d+)\s*[:.]\s*(\d{1,2})(?:[.,](\d+))?$/);
    if (k === 'm1000') { if (mm) return +mm[1] * 60 + +mm[2]; const n = numero(s); return n == null ? null : n < 15 ? Math.round(n * 60) : n; }
    if (k === 'barra' && mm && s.includes(':')) return +mm[1] * 60 + +mm[2];
    const n = numero(s.replace(/[^\d.,-]/g, '')); return n == null ? null : n;
  }
  const mmss = x => `${Math.floor(x / 60)}:${String(Math.round(x % 60)).padStart(2, '0')}`;
  const fmt = (k, x, sx) => x == null ? '—' : k === 'm1000' ? mmss(x) : k === 'agil' ? `${fmtNum(x, 2)} s` : sx === 'hombre' ? `${fmtNum(x, 0)} dominadas` : `${fmtNum(x, 0)} s`;
  function nota(k, x, sx) {
    const b = BAREMO[sx === 'hombre' ? 'hombre' : 'mujer'][k]; if (!b || x == null) return null;
    const v = k === 'agil' ? Math.round(x * 10) / 10 : k === 'm1000' ? Math.round(x) : x;
    for (let i = 0; i < 10; i++) if (b.menor ? v <= b.u[i] + 1e-9 : v >= b.u[i]) return 10 - i;
    return 0;
  }
  /* Lo que hace falta para subir a la nota n (texto) */
  function paraNota(k, n, sx) {
    const b = BAREMO[sx === 'hombre' ? 'hombre' : 'mujer'][k]; if (!b || n < 1 || n > 10) return '';
    const u = b.u[10 - n];
    return k === 'm1000' ? `${mmss(u)} o menos` : k === 'agil' ? `${fmtNum(u, 1)} s o menos` : sx === 'hombre' ? `${u} dominadas` : `${u} s o más`;
  }
  const colorNota = n => n == null ? '' : n === 0 ? 'bad' : n < 5 ? 'warn' : 'ok';

  /* Contexto: alumno (su app) o coach (ficha) */
  function ctx(coach) {
    if (coach) { const f = S.ficha || {}; return { val: f.val || [], srv: f.srv || {}, perfil: (S.c?.perfiles || []).find(p => p.id === f.id) || {}, uid: f.id }; }
    return { val: S.d?.valoraciones || [], srv: S.d?.servicio || {}, perfil: S.perfil || {}, uid: S.user?.id };
  }
  /* Historial de simulacros: [{fecha, val, m:{m1000, agil, barra}}] del más antiguo al más reciente */
  function historial(val) {
    const h = [];
    (val || []).forEach(v => (v.pruebas || []).filter(p => p.tipo === 'policia').forEach(p => {
      const m = {}; (p.datos || []).forEach(d => { const k = claveDe(d.nombre); if (k) { const x = leer(k, d.valor); if (x != null) m[k] = x; } });
      if (Object.keys(m).length) h.push({ fecha: v.fecha, nombre: v.nombre, id: v.id, pid: p.id, m });
    }));
    return h.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  }
  const ultima = (h, k) => { for (let i = h.length - 1; i >= 0; i--) if (h[i].m[k] != null) return { x: h[i].m[k], fecha: h[i].fecha, i }; return null; };
  const anterior = (h, k, i) => { for (let j = i - 1; j >= 0; j--) if (h[j].m[k] != null) return h[j].m[k]; return null; };

  function tarjeta(coach) {
    const c = ctx(coach), s = c.srv; if (!s?.oposicion) return '';
    const sx = c.perfil.sexo === 'hombre' ? 'hombre' : 'mujer', h = historial(c.val), obj = s.oposicion_obj || {}, P = PRUEBAS(sx);
    const dias = s.oposicion_fecha ? Math.ceil((fecha(s.oposicion_fecha) - fecha(hoyISO())) / 864e5) : null;
    const filas = P.map(([k, t, ic]) => {
      const u = ultima(h, k), n = u ? nota(k, u.x, sx) : null, prev = u ? anterior(h, k, u.i) : null, o = leer(k, obj[k]), no = o != null ? nota(k, o, sx) : null;
      const mejora = u && prev != null ? (BAREMO[sx][k].menor ? prev - u.x : u.x - prev) : null;
      return `<div class="op-fila"><span class="op-ic">${ic}</span><div class="grow"><b>${esc(t)}</b>
        <div class="small">${u ? `<b class="num">${esc(fmt(k, u.x, sx))}</b> <span class="muted">· ${esc(fCorta(u.fecha))}</span>${mejora ? ` <span class="${mejora > 0 ? 'op-up' : 'op-down'}">${mejora > 0 ? '▲' : '▼'} ${esc(k === 'm1000' ? Math.abs(Math.round(mejora)) + ' s' : k === 'agil' ? fmtNum(Math.abs(mejora), 2) + ' s' : fmtNum(Math.abs(mejora), 0) + (sx === 'hombre' ? '' : ' s'))}</span>` : ''}` : '<span class="muted">Sin marca todavía</span>'}</div>
        <div class="small muted">${n != null && n < 10 ? `Para un ${n + 1}: ${esc(paraNota(k, n + 1, sx))}` : n === 10 ? 'Nota máxima' : `Para aprobar (5): ${esc(paraNota(k, 5, sx))}`}${o != null ? ` · 🎯 ${esc(fmt(k, o, sx))} (${no})` : ''}</div></div>
        <span class="op-nota ${colorNota(n)}">${n ?? '–'}</span></div>`;
    }).join('');
    const notas = P.map(([k]) => { const u = ultima(h, k); return u ? nota(k, u.x, sx) : null; }), completas = notas.every(n => n != null);
    const media = completas ? notas.reduce((a, b) => a + b, 0) / 3 : null, cero = notas.some(n => n === 0);
    const veredicto = !completas ? `<span class="small muted">La media sale cuando tengas marca en las 3 pruebas.</span>`
      : cero ? `<span class="pill bad">No apto</span><span class="small">Un 0 en ${esc(P[notas.indexOf(0)][1].toLowerCase())} elimina aunque la media llegue a 5.</span>`
      : media >= 5 ? `<span class="pill ok">Apto</span><span class="small">Media <b>${fmtNum(media, 2)}</b> con tus últimas marcas.</span>` : `<span class="pill warn">No apto</span><span class="small">Media <b>${fmtNum(media, 2)}</b>: hace falta un 5.</span>`;
    const evo = h.slice(-6).reverse();
    return `<section class="section"><div class="card stack op">
      <div class="row" style="gap:8px;align-items:flex-start"><div class="grow"><span class="eyebrow">Oposición · ${esc(OPOS[s.oposicion] || s.oposicion)}</span><h3 style="margin:2px 0 0">Tus pruebas físicas</h3></div>
        ${dias != null ? `<div class="op-cuenta"><b class="num">${dias > 0 ? dias : dias === 0 ? '¡Hoy!' : '✓'}</b><small>${dias > 0 ? (dias === 1 ? 'día para el examen' : 'días para el examen') : dias === 0 ? 'examen' : 'examen hecho'}</small><small class="muted">${esc(fCorta(s.oposicion_fecha))}</small></div>` : ''}</div>
      ${filas}
      <div class="row op-media" style="gap:8px;flex-wrap:wrap">${media != null ? `<span class="op-nota grande ${cero ? 'bad' : media >= 5 ? 'ok' : 'warn'}">${fmtNum(media, 1)}</span>` : ''}${veredicto}</div>
      ${evo.length ? `<details class="op-evo"><summary class="small"><b>Evolución</b> · ${h.length} simulacro${h.length > 1 ? 's' : ''}</summary><table class="op-tab"><thead><tr><th>Fecha</th>${P.map(([, t]) => `<th>${esc(t.split(' ')[0])}</th>`).join('')}</tr></thead><tbody>${evo.map(r => `<tr><td>${esc(fCorta(r.fecha))}</td>${P.map(([k]) => r.m[k] == null ? '<td class="muted">—</td>' : `<td>${esc(fmt(k, r.m[k], sx).replace(' dominadas', ''))} <span class="op-n ${colorNota(nota(k, r.m[k], sx))}">${nota(k, r.m[k], sx)}</span></td>`).join('')}</tr>`).join('')}</tbody></table></details>` : ''}
      <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn sm" data-act="opSim" data-c="${coach ? 1 : ''}">＋ Apuntar simulacro</button>${coach ? '<button class="btn sm ghost" data-act="opConf">⚙︎ Examen y objetivos</button>' : ''}<button class="btn sm ghost" data-act="opBaremo" data-c="${coach ? 1 : ''}">Ver baremo</button></div>
    </div></section>`;
  }

  /* Datos para el Inicio de la ficha del coach: días al examen, nota de cada prueba, media y la prueba más floja */
  function datos(coach) {
    const c = ctx(coach), s = c.srv, sx = c.perfil.sexo === 'hombre' ? 'hombre' : 'mujer', h = historial(c.val), obj = s.oposicion_obj || {};
    const pr = PRUEBAS(sx).map(([k, t, ic]) => { const u = ultima(h, k), n = u ? nota(k, u.x, sx) : null, o = leer(k, obj[k]);
      return { k, t, ic, marca: u ? fmt(k, u.x, sx) : null, fecha: u?.fecha || null, nota: n, color: colorNota(n), siguiente: n != null && n < 10 ? `Para un ${n + 1}: ${paraNota(k, n + 1, sx)}` : n === 10 ? 'Nota máxima' : `Para aprobar: ${paraNota(k, 5, sx)}`, objetivo: o != null ? fmt(k, o, sx) : null }; });
    const completas = pr.every(x => x.nota != null), media = completas ? pr.reduce((t, x) => t + x.nota, 0) / pr.length : null, cero = pr.some(x => x.nota === 0);
    const peor = pr.filter(x => x.nota != null).sort((a, b) => a.nota - b.nota)[0] || null;
    return { oposicion: OPOS[s.oposicion] || s.oposicion || 'Oposición', fecha: s.oposicion_fecha || null, dias: s.oposicion_fecha ? Math.ceil((fecha(s.oposicion_fecha) - fecha(hoyISO())) / 864e5) : null, pruebas: pr, media, apto: completas ? !cero && media >= 5 : null, cero, peor, simulacros: h.length, ultimo: h[h.length - 1]?.fecha || null };
  }
  /* Línea de resumen para el banner de la ficha */
  function resumen(coach) {
    const c = ctx(coach), s = c.srv, sx = c.perfil.sexo === 'hombre' ? 'hombre' : 'mujer', h = historial(c.val);
    const notas = PRUEBAS(sx).map(([k]) => { const u = ultima(h, k); return u ? nota(k, u.x, sx) : null; });
    const dias = s.oposicion_fecha ? Math.ceil((fecha(s.oposicion_fecha) - fecha(hoyISO())) / 864e5) : null;
    return [notas.some(n => n != null) && 'Notas ' + notas.map(n => n ?? '–').join(' · '), notas.every(n => n != null) && 'media ' + fmtNum(notas.reduce((a, b) => a + b, 0) / 3, 1), dias != null && dias >= 0 && `examen en ${dias} días`].filter(Boolean).join(' · ') || 'Sin simulacros';
  }
  function formSim(coach) {
    const c = ctx(coach), sx = c.perfil.sexo === 'hombre' ? 'hombre' : 'mujer', P = PRUEBAS(sx);
    const ph = { m1000: 'Ej. 4:17', agil: 'Ej. 11,2', barra: sx === 'hombre' ? 'Ej. 9' : 'Ej. 63' };
    abrirSheet(`<form class="stack" id="f-opsim"><h2>Apuntar simulacro</h2><p class="small muted" style="margin-top:-8px">Rellena las pruebas que hayas hecho; la nota oficial se calcula sola.</p>
      <label class="f">Fecha<input type="date" id="op-f" value="${hoyISO()}" required></label>
      ${P.map(([k, t, ic]) => `<label class="f">${ic} ${esc(t)} <span class="muted">(${k === 'm1000' ? 'min:seg' : k === 'agil' ? 'segundos' : sx === 'hombre' ? 'repeticiones' : 'segundos'})</span><input type="text" inputmode="decimal" data-op="${k}" placeholder="${ph[k]}"><small class="op-prev muted" data-opn="${k}"></small></label>`).join('')}
      <label class="f">Notas <span class="muted">(opcional)</span><textarea id="op-n" rows="2" placeholder="Pista, sensaciones, condiciones…"></textarea></label>
      <p class="err" id="op-err"></p><button class="btn full" id="op-b">Guardar</button></form>`);
    const F = $('#f-opsim');
    F.addEventListener('input', ev => { const k = ev.target.dataset.op; if (!k) return; const x = leer(k, ev.target.value), n = nota(k, x, sx); F.querySelector(`[data-opn="${k}"]`).textContent = x == null ? '' : `${fmt(k, x, sx)} → nota ${n}`; });
    F.addEventListener('submit', async e => {
      e.preventDefault(); const btn = $('#op-b');
      const datos = P.map(([k]) => ({ nombre: NOMBRE_DATO[k], valor: F.querySelector(`[data-op="${k}"]`).value.trim() })).filter(d => d.valor);
      if (!datos.length) { $('#op-err').textContent = 'Escribe al menos una marca.'; return; }
      btn.disabled = true; btn.textContent = 'Guardando…';
      try {
        const row = { alumno_id: c.uid, nombre: 'Simulacro · pruebas físicas', fecha: $('#op-f').value || hoyISO(), resumen: $('#op-n').value.trim() || null };
        if (!coach) row.origen = 'alumno';
        const { data: v, error } = await sb.from('valoraciones').insert(row).select().single(); if (error) throw error;
        const { error: e2 } = await sb.from('pruebas').insert({ valoracion_id: v.id, alumno_id: c.uid, orden: 0, tipo: 'policia', titulo: 'Pruebas físicas · ' + (OPOS[c.srv.oposicion] || 'oposición'), datos: datos.map(d => ({ ...d, nota: nota(claveDe(d.nombre), leer(claveDe(d.nombre), d.valor), sx) })) }); if (e2) throw e2;
        cerrarSheet(); toast('Simulacro guardado');
        if (coach) await cargarValoraciones();
        else { const r = await sb.from('valoraciones').select('*,pruebas(*)').eq('alumno_id', c.uid).order('fecha', { ascending: false }); if (!r.error) S.d.valoraciones = ordenarValoraciones(r.data || []); render(); }
      } catch (err) { btn.disabled = false; btn.textContent = 'Guardar'; $('#op-err').textContent = 'No se ha podido guardar (' + (err.message || err) + ')'; }
    });
  }

  function formConf() {
    const f = S.ficha, s = f?.srv; if (!s?.id) return toast('Primero crea su servicio');
    const sx = ((S.c?.perfiles || []).find(p => p.id === f.id) || {}).sexo === 'hombre' ? 'hombre' : 'mujer', P = PRUEBAS(sx), o = s.oposicion_obj || {};
    abrirSheet(`<form class="stack" id="f-opc"><h2>Examen y objetivos</h2>
      <label class="f">Oposición<select id="opc-t">${Object.entries(OPOS).map(([k, t]) => `<option value="${k}" ${s.oposicion === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="f">Fecha del examen<input type="date" id="opc-f" value="${esc(s.oposicion_fecha || '')}"></label>
      <span class="small"><b>Marca objetivo de cada prueba</b> <span class="muted">(la nota se calcula sola)</span></span>
      ${P.map(([k, t]) => `<label class="f">${esc(t)}<input type="text" inputmode="decimal" data-opo="${k}" value="${esc(o[k] || '')}" placeholder="${k === 'm1000' ? 'Ej. 4:00' : k === 'agil' ? 'Ej. 10,8' : sx === 'hombre' ? 'Ej. 12' : 'Ej. 70'}"><small class="muted" data-opon="${k}"></small></label>`).join('')}
      <p class="err" id="opc-err"></p><button class="btn full">Guardar</button></form>`);
    const F = $('#f-opc'), pinta = () => P.forEach(([k]) => { const x = leer(k, F.querySelector(`[data-opo="${k}"]`).value); F.querySelector(`[data-opon="${k}"]`).textContent = x == null ? '' : `→ nota ${nota(k, x, sx)}`; });
    pinta(); F.addEventListener('input', pinta);
    F.addEventListener('submit', async e => {
      e.preventDefault(); const obj = {}; P.forEach(([k]) => { const v = F.querySelector(`[data-opo="${k}"]`).value.trim(); if (v) obj[k] = v; });
      const row = { oposicion: $('#opc-t').value, oposicion_fecha: $('#opc-f').value || null, oposicion_obj: obj };
      const { error } = await sb.from('servicios').update(row).eq('id', s.id);
      if (error) { $('#opc-err').textContent = /oposicion/.test(error.message || '') ? 'Falta ejecutar el Bloque 78 en Supabase.' : error.message; return; }
      Object.assign(s, row); const sc = (S.c?.servicios || []).find(x => x.id === s.id); if (sc) Object.assign(sc, row);
      cerrarSheet(); toast('Guardado'); render();
    });
  }

  function verBaremo(coach) {
    const sx = ctx(coach).perfil.sexo === 'hombre' ? 'hombre' : 'mujer', P = PRUEBAS(sx);
    abrirSheet(`<div class="stack"><h2>Baremo · ${sx === 'hombre' ? 'hombres' : 'mujeres'}</h2>
      <table class="op-tab op-bar"><thead><tr><th>Nota</th>${P.map(([, t]) => `<th>${esc(t)}</th>`).join('')}</tr></thead><tbody>${[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map(n => `<tr class="${n === 5 ? 'op-cinco' : ''}"><td><span class="op-n ${colorNota(n)}">${n}</span></td>${P.map(([k]) => `<td>${esc(paraNota(k, n, sx))}</td>`).join('')}</tr>`).join('')}</tbody></table>
      <p class="small muted">La nota final es la media de las 3 pruebas: hace falta un 5 y un 0 en cualquiera elimina. Tablas de las bases de la convocatoria; revisa siempre las de la convocatoria vigente.</p>
      <button class="btn ghost full" data-act="cerrarSheet">Cerrar</button></div>`);
  }

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b || !b.dataset.act.startsWith('op')) return;
    const coach = !!b.dataset.c;
    if (b.dataset.act === 'opSim') formSim(coach);
    else if (b.dataset.act === 'opConf') formConf();
    else if (b.dataset.act === 'opBaremo') verBaremo(coach);
  });

  return { tarjeta, resumen, datos, nota, leer, historial, BAREMO, OPOS, claveDe };
})();
