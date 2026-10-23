/* Panel de negocio del coach · agenda del día con hasta 3 prioridades, capacidad según semana con o sin hijos,
   cierre de jornada, mejoras del negocio (máx. 3 abiertas) y economía (saldo real, cobros, gastos, reservas).
   Datos: agenda, cierres, mejoras, saldos, movimientos, reservas (Bloque 60) y ajustes_privados (capacidad).
   Se carga antes que app.js y usa sus utilidades al ejecutarse. Ninguna cifra económica se inventa: lo que falta se dice. */
'use strict';
const Negocio = (() => {
  const AVISO = 'Falta ejecutar el Bloque 60 (panel de negocio) en Supabase.';
  const DEF = { ref: '2026-10-19', con: 3, sin: 6 };   // semana del 19/10 sin hijos; horas de partida (editables)
  const eur = n => fmtNum(Math.round((+n || 0) * 100) / 100, 2) + ' €';
  const hm = m => { m = Math.round(m); return m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ' ' + String(m % 60).padStart(2, '0') + ' min' : ''}` : `${m} min`; };
  const F = () => S.c?.fiscal || {};
  const cfg = k => F()['cap_' + k];

  /* ---------- Datos ---------- */
  async function cargar() {
    const desde = sumaDias(hoyISO(), -21);
    const r = await Promise.all([
      sb.from('agenda').select('*').gte('fecha', desde).order('fecha'),
      sb.from('cierres').select('*').gte('fecha', desde).order('fecha', { ascending: false }),
      sb.from('mejoras').select('*').order('created_at'),
      sb.from('saldos').select('*').order('fecha', { ascending: false }).limit(20),
      sb.from('movimientos').select('*').gte('fecha', sumaDias(hoyISO(), -400)).order('fecha', { ascending: false }),
      sb.from('reservas').select('*').order('concepto'),
      sb.from('recordatorios').select('*').order('orden').order('id')
    ]);
    const [ag, ci, me, sa, mo, re, rc] = r.map(x => x.data || []);
    Object.assign(S.c, { agenda: ag, cierres: ci, mejoras: me, saldos: sa, movs: mo, reservas: re, recordatorios: rc, recErr: !!r[6].error, negErr: r.slice(0, 6).some(x => x.error) });
  }
  async function guardarAjuste(clave, valor) {
    const { error } = await sb.from('ajustes_privados').upsert({ clave, valor: String(valor) }, { onConflict: 'clave' }); if (error) return fallo(error);
    S.c.fiscal = { ...F(), [clave]: String(valor) };
  }

  /* ---------- Capacidad ---------- */
  function semana(lunes = lunesDe(hoyISO())) {
    let ov = {}; try { ov = JSON.parse(cfg('override') || '{}'); } catch (e) { }
    const ref = cfg('ref') || DEF.ref, n = Math.round((fecha(lunes) - fecha(lunesDe(ref))) / 6048e5);
    const con = ov[lunes] ? ov[lunes] === 'con' : Math.abs(n) % 2 === 1;
    const horas = +(con ? cfg('con') || DEF.con : cfg('sin') || DEF.sin);
    return { con, horas, min: horas * 60, ov: !!ov[lunes] };
  }
  function formCapacidad() {
    const s = semana(), l = lunesDe(hoyISO());
    abrirSheet(`<form class="stack" id="f-cap"><h2>Tu capacidad</h2>
      <p class="small">Esta semana (desde el ${esc(fCorta(l))}): <b>${s.con ? 'con hijos' : 'sin hijos'}</b>. Las semanas se alternan; si una semana cambia, márcalo aquí.</p>
      <div class="chips" id="cap-sem">${[['con', 'Esta semana con hijos'], ['sin', 'Esta semana sin hijos']].map(([k, t]) => `<button type="button" data-v="${k}" aria-pressed="${(s.con ? 'con' : 'sin') === k}">${t}</button>`).join('')}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label class="f">Horas al día · con hijos<input type="number" id="cap-con" min="0" max="14" step="0.5" value="${cfg('con') || DEF.con}"></label><label class="f">Horas al día · sin hijos<input type="number" id="cap-sin" min="0" max="14" step="0.5" value="${cfg('sin') || DEF.sin}"></label></div>
      <p class="small muted">Son horas de trabajo con alumnos y negocio (sin contar los entrenamientos presenciales). Los minutos de cada tarea son orientativos y los puedes cambiar.</p>
      <button class="btn full" type="submit">Guardar</button></form>`);
    $('#cap-sem').addEventListener('click', ev => { const b = ev.target.closest('[data-v]'); if (!b) return; document.querySelectorAll('#cap-sem [data-v]').forEach(x => x.setAttribute('aria-pressed', x === b)); });
    $('#f-cap').addEventListener('submit', async e => {
      e.preventDefault(); const v = document.querySelector('#cap-sem [aria-pressed="true"]').dataset.v;
      let ov = {}; try { ov = JSON.parse(cfg('override') || '{}'); } catch (er) { }
      const auto = (() => { const n = Math.round((fecha(l) - fecha(lunesDe(cfg('ref') || DEF.ref))) / 6048e5); return Math.abs(n) % 2 === 1 ? 'con' : 'sin'; })();
      if (v === auto) delete ov[l]; else ov[l] = v;
      await guardarAjuste('cap_con', $('#cap-con').value || DEF.con); await guardarAjuste('cap_sin', $('#cap-sin').value || DEF.sin); await guardarAjuste('cap_override', JSON.stringify(ov));
      cerrarSheet(); toast('Capacidad guardada'); render();
    });
  }

  /* En rojo por algo que no sea solo un cobro vencido (eso ya va en «Cobros vencidos», sin duplicar) */
  const soloNoPago = e => e.motivos.some(m => !/^Pago vencido/.test(m));
  /* ---------- Propuestas del día (a partir de lo que ya existe; no cada dato es una tarea) ---------- */
  function propuestas() {
    const hoy = hoyISO(), c = S.c, als = c.perfiles.filter(p => p.activo !== false && p.rol !== 'coach'), out = [];
    const nom = a => (a.nombre || '').split(' ')[0];
    const est = als.map(a => ({ a, e: estadoAlumno(a) }));
    // 1) Próximas acciones con fecha (las fijaste tú)
    als.forEach(a => { const s = c.seguimiento?.[a.id]; if (s?.proxima_accion && s.proxima_fecha && s.proxima_fecha <= hoy) out.push({ k: 'accion:' + a.id, titulo: `${s.proxima_accion}`, motivo: `Próxima acción de ${a.nombre}${s.proxima_fecha < hoy ? ' · pasada desde el ' + fCorta(s.proxima_fecha) : ' · para hoy'}`, accion: 'Hacerla y marcarla como hecha en su ficha', min: 15, plazo: s.proxima_fecha, rank: s.proxima_fecha < hoy ? 1 : 2, ir: a.id }); });
    // 2) Revisiones mensuales (atrasadas o esta semana)
    const rev = est.filter(x => x.e.control); if (rev.length) out.push({ k: 'revisiones', titulo: rev.length === 1 ? `Revisión mensual de ${nom(rev[0].a)}` : `Revisiones mensuales: ${rev.length}`, motivo: rev.map(x => `${nom(x.a)}${x.e.control.atrasada ? ' (atrasada)' : ''}`).join(' · '), accion: 'Llamada o videollamada de 10-15 min y registrar la revisión', min: 15 * rev.length, plazo: hoy, rank: rev.some(x => x.e.control.atrasada) ? 2 : 4, lista: rev.map(x => x.a.id) });
    // 3) Devoluciones de check-in pendientes
    const dev = als.filter(a => Acomp.alertaDevolucion(a.id)); if (dev.length) out.push({ k: 'devoluciones', titulo: `Devoluciones semanales: ${dev.length}`, motivo: dev.map(nom).join(' · '), accion: 'Revisar el borrador de cada una y enviarla', min: 8 * dev.length, plazo: hoy, rank: 3, lista: dev.map(a => a.id) });
    // 4) Cobros vencidos
    const venc = c.pagos.filter(p => !p.pagado_at && p.vence < hoy); if (venc.length) out.push({ k: 'cobros', titulo: `Cobros vencidos: ${venc.length} · ${eur(venc.reduce((t, p) => t + +p.importe, 0))}`, motivo: venc.map(p => `${nom(c.perfiles.find(a => a.id === p.alumno_id) || {})} ${eur(p.importe)} (${fCorta(p.vence)})`).join(' · '), accion: 'Recordar el pago o marcarlo como cobrado', min: 5 * venc.length, plazo: venc.map(p => p.vence).sort()[0], rank: 2, eco: true });
    // 5) Alumnos en rojo sin atender (no repetidos con lo anterior)
    const rojos = est.filter(x => x.e.nivel === 'bad' && soloNoPago(x.e) && !out.some(o => o.ir === x.a.id || (o.lista || []).includes(x.a.id))); if (rojos.length) out.push({ k: 'rojos', titulo: rojos.length === 1 ? `Atender a ${nom(rojos[0].a)}` : `Alumnos en rojo: ${rojos.length}`, motivo: rojos.map(x => `${nom(x.a)}: ${x.e.motivos[0] || ''}`).join(' · '), accion: 'Ver sus alertas, actuar y marcarlas como solventadas con una nota', min: 10 * rojos.length, plazo: hoy, rank: 2, lista: rojos.map(x => x.a.id), importante: true });
    // 6) Canjes de puntos y gastos que vencen
    const cj = (c.canjes || []); if (cj.length) out.push({ k: 'canjes', titulo: `Canjes de puntos por aplicar: ${cj.length}`, motivo: 'Te los han pedido tus alumnos', accion: 'Aplicarlos o rechazarlos en su ficha', min: 5 * cj.length, plazo: hoy, rank: 5 });
    const gv = (c.movs || []).filter(m => m.tipo === 'gasto' && !m.pagado && m.fecha <= sumaDias(hoy, 3)); if (gv.length) out.push({ k: 'gastos', titulo: `Pagos a realizar: ${gv.length} · ${eur(gv.reduce((t, m) => t + +m.importe, 0))}`, motivo: gv.map(m => `${m.concepto} (${fCorta(m.fecha)})`).join(' · '), accion: 'Pagarlos y marcarlos como pagados en Economía', min: 5 * gv.length, plazo: gv.map(m => m.fecha).sort()[0], rank: gv.some(m => m.fecha < hoy) ? 1 : 3, eco: true });
    return out.sort((a, b) => a.rank - b.rank || (a.plazo || '').localeCompare(b.plazo || ''));
  }
  /* Tareas del día: propuestas (con su estado guardado) + tareas tuyas; las reprogramadas a otro día no salen hoy */
  function delDia(f = hoyISO()) {
    const ag = S.c.agenda || [], propias = ag.filter(x => x.fecha === f && !x.origen);
    const items = propuestas().map(p => { const r = ag.find(x => x.fecha === f && x.origen === p.k); return { ...p, id: r?.id, estado: r?.estado || 'pendiente', min: r?.minutos ?? p.min, prioridad: r?.prioridad || false, nota: r?.nota }; })
      .concat(ag.filter(x => x.fecha === f && x.origen && !propuestas().some(p => p.k === x.origen)).map(r => ({ k: r.origen, id: r.id, titulo: r.titulo, motivo: r.motivo, accion: r.accion, min: r.minutos, estado: r.estado, prioridad: r.prioridad, plazo: f, rank: 3, nota: r.nota, guardada: true })))
      .concat(propias.map(r => ({ k: 'propia:' + r.id, id: r.id, titulo: r.titulo, motivo: r.motivo || 'Tarea tuya', accion: r.accion, min: r.minutos, estado: r.estado, prioridad: r.prioridad, plazo: f, rank: r.prioridad ? 0 : 6, propia: true, nota: r.nota })));
    const marcadas = items.filter(x => x.prioridad);
    const prio = (marcadas.length ? marcadas : items.filter(x => x.estado === 'pendiente').slice(0, 3)).slice(0, 3);
    return { items, prio, otras: items.filter(x => !prio.includes(x)) };
  }
  const pendientesAnteriores = () => (S.c.agenda || []).filter(x => x.fecha < hoyISO() && x.estado === 'pendiente' && !x.origen);

  async function guardarItem(it, cambios) {
    const base = { estado: 'pendiente', fecha: hoyISO(), origen: it.propia ? null : it.k, titulo: it.titulo, motivo: it.motivo || null, accion: it.accion || null, minutos: it.min, prioridad: it.prioridad || false };
    const q = it.id ? sb.from('agenda').update(cambios).eq('id', it.id) : sb.from('agenda').insert({ ...base, ...cambios });
    const { error } = await q; if (error) return fallo(error, AVISO);
    await cargar(); render();
  }
  const buscar = k => delDia().items.find(x => x.k === k);
  async function hecha(k) { const it = buscar(k); if (it) await guardarItem(it, { estado: it.estado === 'hecha' ? 'pendiente' : 'hecha', hecho_at: it.estado === 'hecha' ? null : new Date().toISOString() }); }
  async function estrella(k) {
    const d = delDia(), it = d.items.find(x => x.k === k); if (!it) return;
    if (!it.prioridad && d.items.filter(x => x.prioridad).length >= 3) return toast('Máximo 3 prioridades: quita una antes');
    if (!d.items.some(x => x.prioridad)) for (const x of d.prio.filter(y => y.k !== k)) await guardarItem(x, { prioridad: true });
    await guardarItem(buscar(k), { prioridad: !it.prioridad });
  }
  function formItem(k) {
    const it = buscar(k); if (!it) return;
    abrirSheet(`<form class="stack" id="f-it"><h2>${esc(it.titulo)}</h2>${it.motivo ? `<p class="small muted">${esc(it.motivo)}</p>` : ''}
      <label class="f">Minutos (orientativos)<input type="number" id="it-m" min="0" step="5" value="${it.min}"></label>
      <label class="f">Reprogramar para<input type="date" id="it-f" min="${sumaDias(hoyISO(), 1)}"></label>
      <label class="f">Nota (opcional)<input type="text" id="it-n" value="${esc(it.nota || '')}" placeholder="Ej. le escribo el lunes"></label>
      <div class="row" style="gap:8px"><button type="button" class="btn ghost" id="it-d">Descartar</button><button class="btn grow" type="submit">Guardar</button></div></form>`);
    $('#it-d').addEventListener('click', async () => { cerrarSheet(); await guardarItem(it, { estado: 'descartada', nota: $('#it-n')?.value || it.nota || null }); });
    $('#f-it').addEventListener('submit', async e => {
      e.preventDefault(); const f = $('#it-f').value, m = +$('#it-m').value || 0, n = $('#it-n').value.trim() || null;
      cerrarSheet();
      if (f) { await guardarItem(it, { estado: 'reprogramada', minutos: m, nota: n || `A ${fCorta(f)}` }); await sb.from('agenda').insert({ fecha: f, origen: null, titulo: it.titulo, motivo: it.motivo || null, accion: it.accion || null, minutos: m, estado: 'pendiente', prioridad: false }); await cargar(); render(); toast('Reprogramada al ' + fCorta(f)); }
      else await guardarItem(it, { minutos: m, nota: n });
    });
  }
  function formTarea() {
    abrirSheet(`<form class="stack" id="f-ta"><h2>Nueva tarea</h2><label class="f">Qué<input type="text" id="ta-t" required placeholder="Ej. preparar plantilla de pretemporada"></label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label class="f">Día<input type="date" id="ta-f" value="${hoyISO()}"></label><label class="f">Minutos<input type="number" id="ta-m" min="5" step="5" value="30"></label></div>
      <label class="row small" style="gap:8px"><input type="checkbox" id="ta-p" style="width:20px;height:20px"> Es una de mis 3 prioridades</label>
      <button class="btn full" type="submit">Añadir</button></form>`);
    $('#f-ta').addEventListener('submit', async e => {
      e.preventDefault();
      const { error } = await sb.from('agenda').insert({ fecha: $('#ta-f').value || hoyISO(), titulo: $('#ta-t').value.trim(), minutos: +$('#ta-m').value || 30, prioridad: $('#ta-p').checked, estado: 'pendiente' });
      if (error) return fallo(error, AVISO); cerrarSheet(); await cargar(); render();
    });
  }
  async function decidirAnterior(id, que) {
    const r = (S.c.agenda || []).find(x => x.id === id); if (!r) return;
    if (que === 'hoy') await sb.from('agenda').update({ fecha: hoyISO() }).eq('id', id);
    else if (que === 'descartar') await sb.from('agenda').update({ estado: 'descartada' }).eq('id', id);
    else if (que === 'hecha') await sb.from('agenda').update({ estado: 'hecha', hecho_at: new Date().toISOString() }).eq('id', id);
    await cargar(); render();
  }

  /* ---------- Vista: Hoy del coach ---------- */
  function vInicio() {
    if (S.c.negErr) return `<section class="stack"><span class="eyebrow">${esc(fLarga(hoyISO()))}</span><h1>Tu día</h1></section><section class="section"><div class="card small muted">${AVISO}</div></section>`;
    const hoy = hoyISO(), d = delDia(), cap = semana(), pend = d.items.filter(x => x.estado === 'pendiente'), carga = pend.reduce((t, x) => t + (+x.min || 0), 0), hechas = d.items.filter(x => x.estado === 'hecha').length;
    const ci = (S.c.cierres || []).find(x => x.fecha === hoy), ant = pendientesAnteriores();
    const pct = cap.min ? Math.min(100, Math.round(carga / cap.min * 100)) : 100, sobra = carga > cap.min;
    const fila = (it, grande) => `<div class="line ag-it ${it.estado}" style="align-items:flex-start;gap:10px"><button class="ag-chk" data-act="agHecha" data-k="${esc(it.k)}" aria-label="${it.estado === 'hecha' ? 'Marcar como pendiente' : 'Marcar como hecha'}" aria-pressed="${it.estado === 'hecha'}">${it.estado === 'hecha' ? '✓' : ''}</button>
      <div class="grow stack" style="gap:3px"><b class="${grande ? '' : 'small'}" style="${it.estado !== 'pendiente' ? 'text-decoration:line-through;color:var(--muted)' : ''}">${esc(it.titulo)}</b>${it.motivo ? `<span class="small muted">${esc(it.motivo.slice(0, 160))}${it.motivo.length > 160 ? '…' : ''}</span>` : ''}${grande && it.accion ? `<span class="small">→ ${esc(it.accion)}</span>` : ''}
        <span class="small muted">⏱ ~${hm(it.min)} (orientativo)${it.plazo && it.plazo < hoy ? ` · <b style="color:var(--warn)">vence ${esc(fCorta(it.plazo))}</b>` : it.plazo ? ' · hoy' : ''}${it.estado === 'reprogramada' ? ' · reprogramada' : it.estado === 'descartada' ? ' · descartada' : ''}${it.nota ? ' · ' + esc(it.nota) : ''}</span></div>
      <div class="stack" style="gap:4px;align-items:flex-end"><button class="btn sm ghost" data-act="agEstrella" data-k="${esc(it.k)}" aria-label="${it.prioridad ? 'Quitar de prioridades' : 'Hacer prioridad'}" title="Prioridad">${it.prioridad ? '★' : '☆'}</button><button class="btn sm ghost" data-act="agItem" data-k="${esc(it.k)}" aria-label="Cambiar o reprogramar">✎</button>${it.ir ? `<button class="linkbtn small" data-act="ficha" data-id="${it.ir}">Ficha ›</button>` : it.lista?.length === 1 ? `<button class="linkbtn small" data-act="ficha" data-id="${it.lista[0]}">Ficha ›</button>` : it.eco ? `<button class="linkbtn small" data-act="ctab" data-t="pagos">Economía ›</button>` : ''}</div></div>`;
    return `<section class="stack"><span class="eyebrow">${esc(fLarga(hoy))}</span><h1>Tu día</h1></section>
      ${ci ? `<section class="section"><div class="card stack" style="border:2px solid var(--ok)"><b>✓ Jornada terminada a las ${esc(new Date(ci.cerrado_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }))}</b>${(ci.pendientes || []).length ? `<div class="small" style="color:var(--warn)">Queda sin resolver: ${ci.pendientes.map(esc).join(' · ')}</div>` : '<div class="small muted">Sin compromisos vencidos pendientes.</div>'}${ci.proximo ? `<div class="small">Próximo bloque: <b>${esc(ci.proximo)}</b></div>` : ''}<button class="linkbtn small" data-act="agCierre" style="align-self:flex-start">Revisar el cierre</button></div></section>` : ''}
      <section class="section"><div class="card stack"><div class="row"><span class="small grow"><b>${cap.con ? '👨‍👧‍👦 Semana con hijos' : '🧭 Semana sin hijos'}</b> · ${cap.horas} h hoy</span><button class="linkbtn small" data-act="agCapacidad">Ajustar</button></div>
        <div class="track gordo"><i style="width:${pct}%;background:${sobra ? 'var(--warn)' : 'var(--blue)'}"></i></div>
        <div class="small">${sobra ? `<b style="color:var(--warn)">No cabe:</b> lo pendiente suma ~${hm(carga)} para ${cap.horas} h. Reprograma o simplifica (✎) lo menos urgente.` : `Pendiente ~${hm(carga)} de ${cap.horas} h · ${hechas} ${hechas === 1 ? 'hecha' : 'hechas'}`}</div></div></section>
      ${ant.length ? `<section class="section"><h2>Sin cerrar de días anteriores</h2><p class="small muted">Decide qué hacer con cada una: no se pasan solas al día siguiente.</p><div class="card">${ant.map(r => `<div class="line" style="flex-wrap:wrap;gap:8px"><div class="grow"><b class="small">${esc(r.titulo)}</b><div class="small muted">${esc(fCorta(r.fecha))} · ~${hm(r.minutos)}</div></div><button class="btn sm" data-act="agAnt" data-id="${r.id}" data-q="hoy">Hoy</button><button class="btn sm ghost" data-act="agAnt" data-id="${r.id}" data-q="hecha">Hecha</button><button class="btn sm ghost" data-act="agAnt" data-id="${r.id}" data-q="descartar">Descartar</button></div>`).join('')}</div></section>` : ''}
      <section class="section"><div class="section-head"><h2>Lo importante de hoy</h2><button class="btn sm ghost" data-act="agTarea">＋ Tarea</button></div>
        <div class="card">${d.prio.map(x => fila(x, true)).join('') || '<div class="empty">Nada urgente hoy. Buen día para avanzar en una mejora del negocio.</div>'}</div>
        <p class="small muted">${d.items.some(x => x.prioridad) ? 'Prioridades elegidas por ti (★).' : 'Propuestas por fecha y urgencia: confírmalas o cambia con ★.'}</p></section>
      ${d.otras.length ? `<section class="section"><details class="card" ${d.otras.some(x => x.importante && x.estado === 'pendiente') ? 'open' : ''}><summary><b>Otras tareas e incidencias (${d.otras.filter(x => x.estado === 'pendiente').length} pendientes)</b>${d.otras.some(x => x.importante && x.estado === 'pendiente') ? ' <span class="pill bad">Incluye alumnos en rojo</span>' : ''}</summary>${d.otras.map(x => fila(x, false)).join('')}</details></section>` : ''}
      ${vRecordatorios(null)}
      ${vEcoResumen()}
      ${vMejoras()}
      <section class="section"><button class="btn full ${ci ? 'ghost' : 'dark'}" data-act="agCierre">${ci ? 'Revisar el cierre de hoy' : 'Cerrar la jornada'}</button></section>`;
  }

  /* ---------- Cierre de jornada: basado en compromisos reales, sin ocultar lo que queda ---------- */
  function formCierre() {
    const hoy = hoyISO(), d = delDia(), pend = d.items.filter(x => x.estado === 'pendiente');
    const rojos = S.c.perfiles.filter(p => p.activo !== false && p.rol !== 'coach').map(a => ({ a, e: estadoAlumno(a) })).filter(x => x.e.nivel === 'bad' && soloNoPago(x.e));
    const venc = S.c.pagos.filter(p => !p.pagado_at && p.vence < hoy), gastosV = (S.c.movs || []).filter(m => m.tipo === 'gasto' && !m.pagado && m.fecha < hoy);
    const prox = (S.c.agenda || []).filter(x => x.fecha > hoy && x.estado === 'pendiente').sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
    const ok = b => b ? '<span style="color:var(--ok);font-weight:700">✓</span>' : '<span style="color:var(--warn);font-weight:700">!</span>';
    abrirSheet(`<form class="stack" id="f-ci"><h2>Cierre de la jornada</h2>
      <div class="stack" style="gap:6px"><div class="small">${ok(!pend.length)} <b>Prioridades y tareas de hoy</b>: ${pend.length ? `quedan ${pend.length} sin decidir` : 'todas atendidas o reprogramadas'}</div>${pend.map(x => `<div class="row small" style="gap:6px;padding-left:18px"><span class="grow">${esc(x.titulo)}</span><button type="button" class="btn sm ghost" data-act="agHecha" data-k="${esc(x.k)}">Hecha</button><button type="button" class="btn sm ghost" data-act="agItem" data-k="${esc(x.k)}">Reprogramar</button></div>`).join('')}</div>
      <div class="stack" style="gap:6px"><div class="small">${ok(!rojos.length)} <b>Incidencias importantes</b>: ${rojos.length ? `${rojos.length} ${rojos.length === 1 ? 'alumno sigue' : 'alumnos siguen'} en rojo` : 'ninguna sin atender'}</div>${rojos.map(x => `<div class="small" style="padding-left:18px">${esc(x.a.nombre)}: ${esc(x.e.motivos[0] || '')} <button type="button" class="linkbtn small" data-act="ficha" data-id="${x.a.id}">Atender ›</button></div>`).join('')}</div>
      <div class="stack" style="gap:6px"><div class="small">${ok(!venc.length && !gastosV.length)} <b>Vencimientos económicos</b>: ${venc.length || gastosV.length ? `${venc.length} cobros y ${gastosV.length} pagos vencidos` : 'nada vencido'}</div>${venc.length || gastosV.length ? '<label class="row small" style="gap:8px;padding-left:18px"><input type="checkbox" id="ci-v" style="width:20px;height:20px"> Los he revisado hoy</label>' : ''}</div>
      <label class="f">Próximo bloque de trabajo<input type="text" id="ci-p" value="${esc(prox ? prox.titulo : '')}" placeholder="Ej. mañana 9:00 · devoluciones y revisión de Laura" required></label>
      <p class="small muted">Puedes terminar aunque queden tareas futuras. Lo que siga vencido quedará escrito en el cierre, sin esconderlo.</p>
      <button class="btn full" type="submit">Dar la jornada por terminada</button></form>`);
    $('#f-ci').addEventListener('submit', async e => {
      e.preventDefault();
      const quedan = [...pend.map(x => x.titulo), ...rojos.map(x => `${x.a.nombre} en rojo`), ...(venc.length && !$('#ci-v')?.checked ? [`${venc.length} cobros vencidos sin revisar`] : []), ...(gastosV.length && !$('#ci-v')?.checked ? [`${gastosV.length} pagos vencidos sin revisar`] : [])];
      const { error } = await sb.from('cierres').upsert({ fecha: hoy, cerrado_at: new Date().toISOString(), proximo: $('#ci-p').value.trim(), pendientes: quedan }, { onConflict: 'fecha' });
      if (error) return fallo(error, AVISO); cerrarSheet(); await cargar(); render(); toast(quedan.length ? 'Jornada cerrada con pendientes anotados' : 'Jornada terminada');
    });
  }

  /* ---------- Recordatorios de seguimiento: cambios que apuntas para sus entrenos, programa o app, en tu orden de prioridad ---------- */
  const TIPOS_REC = { entreno: '🏋️ Entreno', programa: '📋 Programa', nutricion: '🥗 Alimentación', app: '📱 App', otro: '📝 Otro' };
  const recPend = aid => (S.c.recordatorios || []).filter(x => !x.hecho_at && (!aid || x.alumno_id === aid)).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || a.id - b.id);
  function vRecordatorios(aid) {
    if (S.c.recErr) return aid ? '' : `<section class="section"><div class="card small muted">Para usar los recordatorios, ejecuta el Bloque 62 en Supabase.</div></section>`;
    const l = recPend(aid), hechos = (S.c.recordatorios || []).filter(x => x.hecho_at && (!aid || x.alumno_id === aid)).slice(-5).reverse();
    const nom = id => (S.c.perfiles.find(p => p.id === id)?.nombre || '').split(' ')[0];
    return `<section class="section"><div class="section-head"><h2>Recordatorios${aid ? '' : ' de seguimiento'}</h2><button class="btn sm ghost" data-act="recNuevo" data-al="${aid || ''}">＋ Recordatorio</button></div>
      <div class="card">${l.map((x, i) => `<div class="line" style="gap:8px;align-items:flex-start"><button class="ag-chk" data-act="recHecho" data-id="${x.id}" aria-label="Marcar como hecho"></button><span class="pill gold num" style="flex:none">${i + 1}</span>
        <div class="grow stack" style="gap:2px" data-act="recNuevo" data-id="${x.id}"><span class="small" style="cursor:pointer">${esc(x.texto)}</span><span class="small muted">${TIPOS_REC[x.tipo] || ''}${!aid && x.alumno_id ? ` · <button class="linkbtn small" data-act="ficha" data-id="${x.alumno_id}">${esc(nom(x.alumno_id))} ›</button>` : ''} · ${esc(fCorta((x.created_at || hoyISO()).slice(0, 10)))}</span></div>
        <span class="stack" style="gap:2px"><button class="btn sm ghost" data-act="recMover" data-id="${x.id}" data-dir="-1" aria-label="Subir prioridad" ${i === 0 ? 'disabled' : ''} style="padding:2px 10px">▲</button><button class="btn sm ghost" data-act="recMover" data-id="${x.id}" data-dir="1" aria-label="Bajar prioridad" ${i === l.length - 1 ? 'disabled' : ''} style="padding:2px 10px">▼</button></span></div>`).join('') || `<div class="empty">${aid ? 'Sin recordatorios para este alumno.' : 'Sin recordatorios pendientes. Apúntalos durante el seguimiento desde aquí o desde su ficha.'}</div>`}
      ${hechos.length ? `<details class="small" style="margin-top:6px"><summary class="muted">Hechos recientemente (${hechos.length})</summary>${hechos.map(x => `<div class="row small" style="gap:8px;padding:4px 0"><span class="grow muted" style="text-decoration:line-through">${esc(x.texto)}${!aid && x.alumno_id ? ' · ' + esc(nom(x.alumno_id)) : ''}</span><button class="linkbtn small" data-act="recDeshacer" data-id="${x.id}">Deshacer</button></div>`).join('')}</details>` : ''}</div>
      ${l.length > 1 ? '<p class="small muted">El orden es tu prioridad: ▲▼ para atacarlos antes o después.</p>' : ''}</section>`;
  }
  function formRec(id, aid) {
    const x = id ? (S.c.recordatorios || []).find(r => r.id === id) : null, als = S.c.perfiles.filter(p => p.activo !== false && p.rol !== 'coach');
    abrirSheet(`<form class="stack" id="f-rec"><h2>${x ? 'Editar recordatorio' : 'Nuevo recordatorio'}</h2>
      <label class="f">Qué tienes que cambiar<textarea id="rc-t" rows="3" required placeholder="Ej. subir peso en hip thrust a 30 kg y cambiar el día 2 por la variante en casa">${esc(x?.texto || '')}</textarea></label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label class="f">Alumno<select id="rc-a"><option value="">General (sin alumno)</option>${als.map(a => `<option value="${a.id}" ${(x?.alumno_id || aid) === a.id ? 'selected' : ''}>${esc(a.nombre)}</option>`).join('')}</select></label>
      <label class="f">Sobre<select id="rc-k">${Object.entries(TIPOS_REC).map(([k, t]) => `<option value="${k}" ${(x?.tipo || 'entreno') === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>
      ${x ? '' : '<label class="row small" style="gap:8px"><input type="checkbox" id="rc-top" style="width:20px;height:20px"> Ponerlo el primero de la lista</label>'}
      <button class="btn full" type="submit">Guardar</button>${x ? '<button type="button" class="btn ghost full" id="rc-del" style="color:var(--bad)">Eliminar</button>' : ''}</form>`);
    $('#f-rec').addEventListener('submit', async e => {
      e.preventDefault(); const t = $('#rc-t').value.trim(); if (!t) return;
      const l = recPend(null), orden = x ? x.orden : $('#rc-top')?.checked ? Math.min(0, ...l.map(r => r.orden ?? 0)) - 1 : Math.max(0, ...l.map(r => r.orden ?? 0)) + 1;
      const row = { texto: t, alumno_id: $('#rc-a').value || null, tipo: $('#rc-k').value, orden };
      const { error } = x ? await sb.from('recordatorios').update(row).eq('id', x.id) : await sb.from('recordatorios').insert(row);
      if (error) return fallo(error, 'Falta ejecutar el Bloque 62 en Supabase.'); cerrarSheet(); await cargar(); render(); toast('Recordatorio guardado');
    });
    $('#rc-del')?.addEventListener('click', async () => { if (!confirm('¿Eliminar este recordatorio?')) return; await sb.from('recordatorios').delete().eq('id', x.id); cerrarSheet(); await cargar(); render(); });
  }
  async function moverRec(id, dir) {
    const l = recPend(null), i = l.findIndex(x => x.id === id), j = i + dir; if (i < 0 || j < 0 || j >= l.length) return;
    [l[i], l[j]] = [l[j], l[i]];
    for (const [k, x] of l.entries()) if (x.orden !== k + 1) { const { error } = await sb.from('recordatorios').update({ orden: k + 1 }).eq('id', x.id); if (error) return fallo(error); }
    await cargar(); render();
  }
  async function hechoRec(id, on) { const { error } = await sb.from('recordatorios').update({ hecho_at: on ? new Date().toISOString() : null }).eq('id', id); if (error) return fallo(error); await cargar(); render(); if (on) toast('Hecho ✓'); }
  /* ---------- Mejoras del negocio: máximo 3 abiertas ---------- */
  function vMejoras() {
    const l = S.c.mejoras || [], ab = l.filter(x => x.estado === 'abierta'), ideas = l.filter(x => x.estado === 'idea');
    return `<section class="section"><details class="card"><summary><b>Mejoras del negocio</b> <span class="small muted">· ${ab.length} de 3 en marcha${ideas.length ? ` · ${ideas.length} ideas` : ''}</span></summary><div class="stack" style="gap:6px;margin-top:8px">
      ${ab.map(x => `<div class="row small" style="gap:8px"><span class="grow">🔧 ${esc(x.titulo)}</span><button class="btn sm ghost" data-act="mjEstado" data-id="${x.id}" data-v="hecha">Hecha</button><button class="btn sm ghost" data-act="mjEstado" data-id="${x.id}" data-v="idea">Aparcar</button></div>`).join('')}
      ${ideas.map(x => `<div class="row small" style="gap:8px"><span class="grow muted">💡 ${esc(x.titulo)}</span>${ab.length < 3 ? `<button class="btn sm ghost" data-act="mjEstado" data-id="${x.id}" data-v="abierta">Empezar</button>` : ''}</div>`).join('')}
      <div class="row" style="gap:8px"><input type="text" id="mj-t" placeholder="Nueva idea de mejora" class="grow"><button class="btn sm" data-act="mjNueva">Añadir</button></div>
      <p class="small muted" style="margin:0">Como mucho 3 en marcha a la vez: el resto espera como idea.</p></div></details></section>`;
  }
  async function nuevaMejora() { const t = $('#mj-t')?.value.trim(); if (!t) return; const { error } = await sb.from('mejoras').insert({ titulo: t, estado: 'idea' }); if (error) return fallo(error, AVISO); await cargar(); render(); }
  async function estadoMejora(id, v) { if (v === 'abierta' && (S.c.mejoras || []).filter(x => x.estado === 'abierta').length >= 3) return toast('Ya tienes 3 en marcha'); await sb.from('mejoras').update({ estado: v }).eq('id', id); await cargar(); render(); }

  /* ---------- Economía ---------- */
  const cobradoEn = (ini, fin) => S.c.pagos.filter(p => p.pagado_at && p.pagado_at >= ini && p.pagado_at <= fin).reduce((t, p) => t + +p.importe, 0) + (S.c.movs || []).filter(m => m.tipo === 'ingreso' && m.pagado && m.fecha >= ini && m.fecha <= fin).reduce((t, m) => t + +m.importe, 0);
  const gastadoEn = (ini, fin) => (S.c.movs || []).filter(m => m.tipo === 'gasto' && m.pagado && m.fecha >= ini && m.fecha <= fin).reduce((t, m) => t + +m.importe, 0);
  /* Reservas en un periodo: importes fijos según su periodicidad y próxima fecha; % sobre lo cobrado (estimación) */
  function reservasEn(ini, fin, cobros) {
    return (S.c.reservas || []).map(r => {
      if (r.modo === 'porcentaje') return { r, imp: cobros * (+r.valor) / 100, estim: true };
      const paso = { mensual: 1, trimestral: 3, anual: 12 }[r.periodicidad] || 1; let n = 0, f = r.proxima;
      while (f && f <= fin) { if (f >= ini) n++; f = sumaMeses(f, paso); }
      return { r, imp: n * +r.valor, estim: false };
    }).filter(x => x.imp);
  }
  function calc() {
    const hoy = hoyISO(), fin = sumaDias(hoy, 30), saldo = (S.c.saldos || [])[0] || null;
    const cobrosP = S.c.pagos.filter(p => !p.pagado_at && p.vence >= hoy && p.vence <= fin), vencidos = S.c.pagos.filter(p => !p.pagado_at && p.vence < hoy);
    const ingP = (S.c.movs || []).filter(m => m.tipo === 'ingreso' && !m.pagado && m.fecha <= fin);
    const gastosP = (S.c.movs || []).filter(m => m.tipo === 'gasto' && !m.pagado && m.fecha <= fin);
    const recur = (S.c.movs || []).filter(m => m.tipo === 'gasto' && m.recurrente && m.pagado).reduce((acc, m) => { const k = m.concepto; if (!acc[k] || acc[k].fecha < m.fecha) acc[k] = m; return acc; }, {});
    const recurProx = Object.values(recur).map(m => ({ ...m, fecha: sumaMeses(m.fecha, 1) })).filter(m => m.fecha > hoy && m.fecha <= fin && !gastosP.some(g => g.concepto === m.concepto));
    const sum = l => l.reduce((t, x) => t + +x.importe, 0);
    const cobros30 = sum(cobrosP) + sum(ingP), res = reservasEn(hoy, fin, cobros30), sumRes = res.reduce((t, x) => t + x.imp, 0);
    const pagos30 = sum(gastosP) + sum(recurProx);
    const caja = saldo ? +saldo.importe + cobros30 - pagos30 - sumRes : null;
    const viejo = saldo ? Math.round((fecha(hoy) - fecha(saldo.fecha)) / 864e5) : null;
    return { hoy, fin, saldo, viejo, cobrosP, vencidos, ingP, gastosP, recurProx, res, cobros30, pagos30, sumRes, caja, sum };
  }
  function vEcoResumen() {
    const k = calc();
    return `<section class="section"><div class="card stack"><div class="row"><span class="eyebrow grow">Caja · próximos 30 días</span><button class="linkbtn small" data-act="ctab" data-t="pagos">Economía ›</button></div>
      ${!k.saldo ? `<div class="aprox small">Falta tu <b>saldo real</b> del banco: sin él no se puede estimar la caja. <button class="linkbtn small" data-act="ecoSaldo">Añadirlo</button></div>` : `<div class="row" style="gap:10px;align-items:baseline"><b class="num" style="font-family:var(--display);font-size:26px;white-space:nowrap">${eur(k.saldo.importe)}</b><span class="small ${k.viejo > 7 ? '' : 'muted'}" style="${k.viejo > 7 ? 'color:var(--warn)' : ''}">saldo real · ${k.viejo === 0 ? 'hoy' : 'a ' + fCorta(k.saldo.fecha)}${k.viejo > 7 ? ` (sin actualizar desde hace ${k.viejo} días)` : ''}</span></div>`}
      <div class="small stack" style="gap:3px"><div class="row"><span class="grow">Cobros previstos (cuotas pendientes)</span><b class="num" style="color:var(--ok)">+${eur(k.cobros30)}</b></div>
        <div class="row"><span class="grow">Pagos comprometidos</span><b class="num">−${eur(k.pagos30)}</b></div>
        <div class="row"><span class="grow">Reservas (impuestos y cuotas)${!(S.c.reservas || []).length ? ' · <i>sin configurar</i>' : ''}</span><b class="num">−${eur(k.sumRes)}</b></div>
        ${k.vencidos.length ? `<div class="row"><span class="grow" style="color:var(--warn)">Cobros vencidos (no contados)</span><b class="num" style="color:var(--warn)">${eur(k.sum(k.vencidos))}</b></div>` : ''}</div>
      ${k.caja != null ? `<div class="row" style="border-top:1px solid var(--line);padding-top:8px"><span class="grow small"><b>Caja estimada a ${esc(fCorta(k.fin))}</b> <span class="pill">Estimación</span></span><b class="num" style="font-size:18px">${eur(k.caja)}</b></div>` : ''}
      <details class="small"><summary>Cómo se calcula</summary><p class="muted" style="margin:6px 0 0">Saldo real que apuntaste + cuotas pendientes que vencen en 30 días + otros ingresos pendientes − gastos pendientes y recurrentes de esos 30 días − reservas configuradas. Los cobros vencidos no se cuentan como seguros. No es beneficio: es una previsión de caja.</p></details></div></section>`;
  }
  function vEconomia() {
    const k = calc(), hoy = hoyISO(), mes = hoy.slice(0, 7), ini = mes + '-01', finMes = sumaDias(sumaMeses(ini, 1), -1), iniAnt = sumaMeses(ini, -1), finAnt = sumaDias(ini, -1);
    const cob = cobradoEn(ini, finMes), gas = gastadoEn(ini, finMes), cobA = cobradoEn(iniAnt, finAnt), gasA = gastadoEn(iniAnt, finAnt);
    const pers = (S.c.movs || []).filter(m => m.tipo === 'personal' && m.fecha >= ini).reduce((t, m) => t + +m.importe, 0);
    const resF = reservasEn(ini, finMes, cob).reduce((t, x) => t + x.imp, 0);
    const pendEntregar = pendienteEntregar(), rev = F().eco_revision;
    const cats = {}; (S.c.movs || []).filter(m => m.tipo === 'gasto' && m.fecha >= ini).forEach(m => { cats[m.categoria || 'Sin categoría'] = (cats[m.categoria || 'Sin categoría'] || 0) + +m.importe; });
    return `<section class="stack"><span class="eyebrow">Tu negocio</span><h1>Economía</h1><div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn sm" data-act="ecoSaldo">Actualizar saldo</button><button class="btn sm ghost" data-act="ecoMov" data-t="gasto">＋ Gasto</button><button class="btn sm ghost" data-act="ecoMov" data-t="ingreso">＋ Ingreso</button><button class="btn sm ghost" data-act="ecoMov" data-t="personal">＋ Transferencia personal</button></div></section>
      ${S.c.negErr ? `<section class="section"><div class="card small muted">${AVISO}</div></section>` : ''}
      <section class="section"><div class="card stack"><div class="row"><b class="grow">Revisión semanal</b><span class="small muted">${rev ? 'última: ' + esc(fCorta(rev)) : 'aún sin hacer'}</span></div><ol class="small" style="margin:0;padding-left:18px"><li>Apunta el saldo real del banco.</li><li>Añade los gastos de la semana y marca los pagados.</li><li>Revisa cobros vencidos.</li></ol><button class="btn sm" data-act="ecoRevision" style="align-self:flex-start">Revisión hecha</button><span class="small muted">Duración prevista: unos 5-10 minutos. Lo comprobaremos con el uso real.</span></div></section>
      ${vEcoResumen()}
      <section class="section"><h2>Este mes · ${esc(new Date(ini).toLocaleDateString('es-ES', { month: 'long' }))}</h2><div class="card stack small">
        <div class="row"><span class="grow">Dinero cobrado</span><b class="num" style="color:var(--ok)">${eur(cob)}</b><span class="muted" style="width:96px;text-align:right">ant. ${eur(cobA)}</span></div>
        <div class="row"><span class="grow">Gastos pagados</span><b class="num">${eur(gas)}</b><span class="muted" style="width:96px;text-align:right">ant. ${eur(gasA)}</span></div>
        <div class="row" style="border-top:1px solid var(--line);padding-top:6px"><span class="grow"><b>Resultado del mes</b> <span class="muted">(cobrado − gastos pagados, antes de impuestos)</span></span><b class="num">${eur(cob - gas)}</b><span class="muted" style="width:96px;text-align:right">ant. ${eur(cobA - gasA)}</span></div>
        <div class="row"><span class="grow">Reservas que corresponden a este mes</span><b class="num">${(S.c.reservas || []).length ? eur(resF) : '<i>sin configurar</i>'}</b></div>
        <div class="row"><span class="grow">Transferencias personales</span><b class="num">${eur(pers)}</b></div>
        <div class="row"><span class="grow">Servicio cobrado pendiente de entregar <span class="pill">Estimación</span></span><b class="num">${eur(pendEntregar)}</b></div>
        <p class="muted" style="margin:4px 0 0">El saldo del banco no es beneficio. Lo que podrías retirar depende de tus reservas y del servicio que aún debes entregar: confírmalo con tu gestor.</p></div></section>
      ${Object.keys(cats).length ? `<section class="section"><h2>Gastos por categoría</h2><div class="card">${Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([c, v]) => `<div class="line small"><span class="grow">${esc(c)}</span><b class="num">${eur(v)}</b></div>`).join('')}</div></section>` : ''}
      <section class="section"><div class="section-head"><h2>Reservas</h2><button class="btn sm ghost" data-act="ecoReserva">＋ Reserva</button></div><div class="card">${(S.c.reservas || []).map(r => `<div class="line small" data-act="ecoReserva" data-id="${r.id}" style="cursor:pointer"><span class="grow"><b>${esc(r.concepto)}</b> · ${r.modo === 'porcentaje' ? fmtNum(r.valor) + ' % de lo cobrado' : eur(r.valor) + ' ' + r.periodicidad}${r.proxima ? ' · próxima ' + esc(fCorta(r.proxima)) : ''}</span><span class="muted">›</span></div>`).join('') || '<div class="empty">Sin reservas. Añade las que te indique tu gestor (IVA, IRPF, cuota de autónomo…): la app no inventa porcentajes.</div>'}</div></section>
      <section class="section"><h2>Movimientos</h2><div class="card">${(S.c.movs || []).slice(0, 40).map(m => `<div class="line small" data-act="ecoMov" data-id="${m.id}" style="cursor:pointer"><span class="muted num" style="width:56px;flex:none">${esc(fCorta(m.fecha))}</span><span class="grow">${esc(m.concepto)}${m.categoria ? ` <span class="muted">· ${esc(m.categoria)}</span>` : ''}${m.recurrente ? ' <span class="pill">mensual</span>' : ''}${!m.pagado ? ` <span class="pill warn">${m.tipo === 'ingreso' ? 'por cobrar' : 'pendiente'}</span>` : ''}</span><b class="num" style="color:${m.tipo === 'ingreso' ? 'var(--ok)' : 'inherit'}">${m.tipo === 'ingreso' ? '+' : '−'}${eur(m.importe)}</b></div>`).join('') || '<div class="empty">Sin movimientos. Las cuotas de tus alumnos ya cuentan solas: aquí van otros ingresos, gastos y transferencias personales.</div>'}</div></section>
      <section class="section"><h2>Saldos apuntados</h2><div class="card">${(S.c.saldos || []).slice(0, 8).map(x => `<div class="line small"><span class="grow">${esc(fLarga(x.fecha))}${x.nota ? ' · ' + esc(x.nota) : ''}</span><b class="num">${eur(x.importe)}</b></div>`).join('') || '<div class="empty">Aún no has apuntado tu saldo.</div>'}</div></section>`;
  }
  /* Servicio cobrado por adelantado y aún no entregado (estimación por semanas restantes) */
  function pendienteEntregar() {
    const hoy = hoyISO();
    return S.c.servicios.reduce((t, s) => {
      if (!s.inicio || !s.duracion_semanas) return t;
      const fin = sumaDias(s.inicio, s.duracion_semanas * 7), cobrado = S.c.pagos.filter(p => p.alumno_id === s.alumno_id && p.pagado_at && p.pagado_at >= sumaDias(s.inicio, -30)).reduce((a, p) => a + +p.importe, 0);
      if (!cobrado || fin <= hoy) return t;
      const total = s.duracion_semanas * 7, pasado = Math.max(0, Math.round((fecha(hoy) - fecha(s.inicio)) / 864e5)), entregadoPct = Math.min(1, pasado / total);
      const pagosTot = S.c.pagos.filter(p => p.alumno_id === s.alumno_id && p.vence >= sumaDias(s.inicio, -30)).reduce((a, p) => a + +p.importe, 0) || cobrado;
      return t + Math.max(0, cobrado - pagosTot * entregadoPct);
    }, 0);
  }
  function formSaldo() {
    abrirSheet(`<form class="stack" id="f-sal"><h2>Saldo real</h2><p class="small muted">El que ves hoy en tu banco (cuenta del negocio).</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label class="f">Fecha<input type="date" id="sl-f" value="${hoyISO()}"></label><label class="f">Importe (€)<input type="text" inputmode="decimal" id="sl-i" required></label></div>
      <label class="f">Nota (opcional)<input type="text" id="sl-n"></label><button class="btn full" type="submit">Guardar</button></form>`);
    $('#f-sal').addEventListener('submit', async e => { e.preventDefault(); const v = numero($('#sl-i').value); if (v == null) return toast('Escribe el importe'); const { error } = await sb.from('saldos').insert({ fecha: $('#sl-f').value || hoyISO(), importe: v, nota: $('#sl-n').value.trim() || null }); if (error) return fallo(error, AVISO); cerrarSheet(); await cargar(); render(); toast('Saldo guardado'); });
  }
  const CATS = ['Software y apps', 'Material', 'Formación', 'Publicidad', 'Gestoría', 'Cuota de autónomo', 'Impuestos', 'Alquiler', 'Transporte', 'Otros'];
  function formMov(tipo, id) {
    const m = id ? (S.c.movs || []).find(x => x.id === id) : null; tipo = m?.tipo || tipo;
    const T = { gasto: 'Gasto', ingreso: 'Ingreso (fuera de las cuotas)', personal: 'Transferencia personal' }[tipo];
    abrirSheet(`<form class="stack" id="f-mv"><h2>${m ? 'Editar' : 'Nuevo'}: ${T}</h2>
      <label class="f">Concepto<input type="text" id="mv-c" value="${esc(m?.concepto || '')}" required></label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label class="f">Fecha<input type="date" id="mv-f" value="${m?.fecha || hoyISO()}"></label><label class="f">Importe (€)<input type="text" inputmode="decimal" id="mv-i" value="${m ? fmtNum(m.importe, 2) : ''}" required></label></div>
      ${tipo === 'gasto' ? `<label class="f">Categoría<select id="mv-k">${CATS.map(c => `<option ${m?.categoria === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label><label class="row small" style="gap:8px"><input type="checkbox" id="mv-r" ${m?.recurrente ? 'checked' : ''} style="width:20px;height:20px"> Se repite cada mes</label>` : ''}
      ${tipo !== 'personal' ? `<label class="row small" style="gap:8px"><input type="checkbox" id="mv-p" ${m ? (m.pagado ? 'checked' : '') : 'checked'} style="width:20px;height:20px"> ${tipo === 'gasto' ? 'Ya está pagado' : 'Ya está cobrado'}</label>` : ''}
      <p class="small muted">${tipo === 'ingreso' ? 'Las cuotas de tus alumnos no van aquí: ya cuentan desde Pagos.' : tipo === 'personal' ? 'Dinero que pasas a tu cuenta personal: no es un gasto del negocio.' : ''}</p>
      <button class="btn full" type="submit">Guardar</button>${m ? '<button type="button" class="btn ghost full" id="mv-del" style="color:var(--bad)">Eliminar</button>' : ''}</form>`);
    $('#f-mv').addEventListener('submit', async e => {
      e.preventDefault(); const imp = numero($('#mv-i').value); if (imp == null) return toast('Escribe el importe');
      const row = { tipo, concepto: $('#mv-c').value.trim(), fecha: $('#mv-f').value || hoyISO(), importe: Math.abs(imp), categoria: $('#mv-k')?.value || null, recurrente: !!$('#mv-r')?.checked, pagado: tipo === 'personal' ? true : !!$('#mv-p')?.checked };
      const { error } = m ? await sb.from('movimientos').update(row).eq('id', m.id) : await sb.from('movimientos').insert(row);
      if (error) return fallo(error, AVISO); cerrarSheet(); await cargar(); render();
    });
    $('#mv-del')?.addEventListener('click', async () => { if (!confirm('¿Eliminar este movimiento?')) return; await sb.from('movimientos').delete().eq('id', m.id); cerrarSheet(); await cargar(); render(); });
  }
  function formReserva(id) {
    const r = id ? (S.c.reservas || []).find(x => x.id === id) : null;
    abrirSheet(`<form class="stack" id="f-rs"><h2>${r ? 'Editar reserva' : 'Nueva reserva'}</h2><p class="small muted">Usa el importe o el porcentaje que te indique tu gestor. La app no calcula impuestos: aparta lo que tú configures.</p>
      <label class="f">Concepto<input type="text" id="rs-c" value="${esc(r?.concepto || '')}" placeholder="IVA, IRPF, cuota de autónomo…" required></label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label class="f">Tipo<select id="rs-m"><option value="importe" ${r?.modo !== 'porcentaje' ? 'selected' : ''}>Importe fijo (€)</option><option value="porcentaje" ${r?.modo === 'porcentaje' ? 'selected' : ''}>% de lo cobrado</option></select></label><label class="f">Valor<input type="text" inputmode="decimal" id="rs-v" value="${r ? fmtNum(r.valor, 2) : ''}" required></label></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label class="f">Cada<select id="rs-p">${['mensual', 'trimestral', 'anual'].map(x => `<option ${r?.periodicidad === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label><label class="f">Próximo pago<input type="date" id="rs-f" value="${r?.proxima || ''}"></label></div>
      <label class="f">Nota (criterio del gestor)<input type="text" id="rs-n" value="${esc(r?.nota || '')}"></label>
      <button class="btn full" type="submit">Guardar</button>${r ? '<button type="button" class="btn ghost full" id="rs-del" style="color:var(--bad)">Eliminar</button>' : ''}</form>`);
    $('#f-rs').addEventListener('submit', async e => {
      e.preventDefault(); const v = numero($('#rs-v').value); if (v == null) return toast('Escribe el valor');
      const row = { concepto: $('#rs-c').value.trim(), modo: $('#rs-m').value, valor: v, periodicidad: $('#rs-p').value, proxima: $('#rs-f').value || null, nota: $('#rs-n').value.trim() || null };
      const { error } = r ? await sb.from('reservas').update(row).eq('id', r.id) : await sb.from('reservas').insert(row);
      if (error) return fallo(error, AVISO); cerrarSheet(); await cargar(); render();
    });
    $('#rs-del')?.addEventListener('click', async () => { if (!confirm('¿Eliminar esta reserva?')) return; await sb.from('reservas').delete().eq('id', r.id); cerrarSheet(); await cargar(); render(); });
  }
  async function revisionHecha() { await guardarAjuste('eco_revision', hoyISO()); toast('Revisión semanal anotada'); render(); }

  return { vRecordatorios, formRec, moverRec, hechoRec, cargar, vInicio, vEconomia, vEcoResumen, semana, propuestas, delDia, formCapacidad, formItem, formTarea, hecha, estrella, decidirAnterior, formCierre, nuevaMejora, estadoMejora, formSaldo, formMov, formReserva, revisionHecha, calc };
})();
