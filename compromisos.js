/* Compromisos de seguimiento · una sola fuente para Hoy, la ficha, el cierre y el reporting.
   Cada compromiso nace de los datos (check-in sin devolución, revisión mensual, cuota vencida, próxima acción,
   pausa vencida, fin de proceso, tarea del alumno) y tiene una identidad estable (p. ej. «dev:<alumno>:<semana>»).
   Se resuelve solo cuando se hace de verdad (la devolución existe, la cuota se cobra…): abrir la ficha o generar
   un borrador no lo resuelve. Lo que decides sobre él (elegirlo para hoy, programarlo, esperar respuesta)
   se guarda en la tabla agenda con origen = su identidad, sin perder la fecha real de vencimiento. */
'use strict';
const Compromisos = (() => {
  const T = {
    dev: { n: 'Devoluciones semanales', uno: 'Devolución semanal', ico: '💬', min: 8, hacer: 'Revisar su check-in y enviar la devolución' },
    rev: { n: 'Revisiones mensuales', uno: 'Revisión mensual', ico: '🗓', min: 20, hacer: 'Revisión de 10-15 min y acuerdo para el mes' },
    cobro: { n: 'Cobros vencidos', uno: 'Cobro vencido', ico: '💳', min: 3, hacer: 'Recordarle el pago o apuntarlo si ya pagó' },
    acc: { n: 'Próximas acciones', uno: 'Próxima acción', ico: '➡️', min: 10, hacer: 'La acción que te apuntaste' },
    tarea: { n: 'Tareas con alumnos', uno: 'Tarea', ico: '📝', min: 15, hacer: 'Tarea que te apuntaste para este alumno' },
    pausa: { n: 'Regresos de pausa', uno: 'Regreso de pausa', ico: '⏸', min: 5, hacer: 'Pasarlo a Regreso o Activo' },
    fin: { n: 'Fin de proceso', uno: 'Fin de proceso', ico: '🏁', min: 10, hacer: 'Hablar de extensión o cierre' },
    gasto: { n: 'Pagos a realizar', uno: 'Pago a realizar', ico: '🧾', min: 5, hacer: 'Pagarlo y marcarlo como pagado' },
  };
  const ORDEN = ['rev', 'dev', 'acc', 'tarea', 'pausa', 'fin', 'cobro', 'gasto'];
  const VIVOS = ['pendiente', 'programada', 'en_curso', 'esperando'];
  const EST = { pendiente: ['', 'Pendiente'], hoy: ['blue', 'Para hoy'], programado: ['', 'Programado'], en_curso: ['blue', 'En curso'], esperando: ['gold', 'Esperando respuesta'], resuelto: ['ok', 'Resuelto'] };
  const tipoDe = id => String(id || '').split(':')[0];
  const esId = id => !!T[tipoDe(id)] && String(id).includes(':');
  const nom = aid => S.c.perfiles.find(p => p.id === aid)?.nombre || '';
  const corto = aid => nom(aid).split(' ')[0];
  const resp = aid => S.c.perfiles.find(p => p.id === aid)?.responsable || S.perfil?.id || null;

  /* ---------- Lo que está pendiente según los datos ---------- */
  function deAlumnoBruto(a) {
    const c = S.c, aid = a.id, srv = srvDe(aid), hoy = hoyISO(), out = [], cfgOff = Alertas.cfg(aid).off || [];
    const add = (tipo, ref, o) => { if (cfgOff.includes(o.t)) return; out.push({ id: `${tipo}:${aid}:${ref}`, tipo, aid, ...o }); };
    const seg = conSeguimiento(srv), est = Acomp.estado(srv), pausa = est.k === 'pausado';
    // Cuotas vencidas (siempre: tenga o no seguimiento)
    (c.pagos || []).filter(p => p.alumno_id === aid && !p.pagado_at && p.vence < hoy).forEach(p => add('cobro', p.id, { t: 'pago', vence: p.vence, titulo: `${eur0(p.importe)} · ${p.concepto || 'cuota'}`, m: `Pago vencido: ${p.importe} €`, pago: p.id }));
    // Tareas que te apuntaste con este alumno
    (c.tareas || []).filter(t => t.alumno_id === aid && !t.hecha_at).forEach(t => out.push({ id: `tarea:${aid}:${t.id}`, tipo: 'tarea', aid, t: 'otros', vence: t.vence || null, titulo: t.texto, m: '', tareaId: t.id }));
    if (!seg) return out;
    // Check-in de la semana pasada (o de esta) sin devolución
    if (!c.devErr && !pausa) {
      const l = lunesDe(hoy), chk = (c.checkins || []).filter(k => k.alumno_id === aid && k.semana_inicio >= sumaDias(l, -7)).sort((x, y) => y.semana_inicio.localeCompare(x.semana_inicio))[0];
      if (chk && !(c.devoluciones || []).some(d => d.alumno_id === aid && d.semana_inicio === chk.semana_inicio))
        add('dev', chk.semana_inicio, { t: 'devolucion', vence: sumaDias(chk.semana_inicio, 8), titulo: `Check-in de la semana del ${fCorta(chk.semana_inicio)}`, m: `Check-in de la semana del ${fCorta(chk.semana_inicio)} sin devolución` });
    }
    // Revisión mensual: la que toca ahora (hasta 3 días antes) o la próxima de los 7 días siguientes
    if (!pausa && !c.revisionesErr && !avisoFin(srv)?.terminado) {
      const revs = (c.revisiones || []).filter(r => r.alumno_id === aid), hecha = x => revs.some(r => r.estado !== 'borrador' && (r.control_n === x.n || (r.fecha >= sumaDias(x.fecha, -10) && r.fecha <= sumaDias(x.fecha, 25))));
      const cs = controlesMensuales(srv, sumaDias(hoy, 7)).filter(x => x.fecha >= sumaDias(hoy, -35) && !hecha(x));
      const x = cs[0]; if (x) add('rev', x.n, { cita: citaRev(aid)?.fecha || null, t: 'revision', vence: x.fecha, titulo: `Revisión mensual ${x.n}`, m: `Revisión mensual ${x.n} pendiente desde el ${fCorta(x.fecha)}`, n: x.n });
    }
    // Próxima acción que te apuntaste con fecha
    const s = c.seguimiento?.[aid]; if (s?.proxima_accion && s.proxima_fecha) add('acc', s.proxima_fecha, { t: 'proxima', vence: s.proxima_fecha, titulo: s.proxima_accion, m: `Próxima acción: ${s.proxima_accion}` });
    if (est.k === 'pausaVencida') add('pausa', est.hasta, { t: 'proceso', vence: est.hasta, titulo: `Su pausa terminó el ${fCorta(est.hasta)}`, m: `Su pausa terminó el ${fCorta(est.hasta)}: pásalo a Regreso o a Activo` });
    const af = avisoFin(srv); if (af) add('fin', af.fin, { t: 'proceso', vence: af.terminado ? af.fin : sumaDias(af.fin, -14), titulo: af.terminado ? `Su proceso terminó el ${fCorta(af.fin)}` : `Su proceso termina el ${fCorta(af.fin)}`, m: af.terminado ? `Su proceso terminó el ${fCorta(af.fin)}: añade una extensión` : `Le queda menos de un mes de proceso (termina el ${fCorta(af.fin)}): ¿extensión?` });
    return out;
  }
  const eur0 = n => fmtNum(+n || 0, 0) + ' €';
  function generales() {
    const hoy = hoyISO();
    return (S.c.movs || []).filter(m => m.tipo === 'gasto' && !m.pagado && m.fecha <= sumaDias(hoy, 3)).map(m => ({ id: `gasto:-:${m.id}`, tipo: 'gasto', aid: null, t: 'gasto', vence: m.fecha, titulo: `${m.concepto} · ${eur0(m.importe)}`, m: '', eco: true }));
  }

  /* ---------- Estado: lo que has decidido (agenda) sobre cada uno ---------- */
  const filas = id => (S.c.agenda || []).filter(r => r.origen === id).sort((a, b) => (b.id || 0) - (a.id || 0));
  function conEstado(x) {
    const hoy = hoyISO(), r = filas(x.id).find(f => f.estado !== 'reprogramada' && f.estado !== 'hecha');
    let estado = 'pendiente';
    if (r?.estado === 'esperando') estado = 'esperando';
    else if (r?.estado === 'en_curso') estado = 'en_curso';
    else if (r && r.fecha > hoy) estado = 'programado';
    else if (!r && x.cita) estado = 'programado';
    else if (r && r.fecha === hoy) estado = 'hoy';
    const futuro = estado === 'pendiente' && x.vence && x.vence > hoy;
    const dias = x.vence ? Math.round((fecha(hoy) - fecha(x.vence)) / 864e5) : 0;
    return { ...x, fila: r || null, estado, futuro, atraso: dias > 0 ? dias : 0, para: r?.fecha || x.cita || null, min: r?.minutos ?? T[x.tipo].min, resp: resp(x.aid), reprog: filas(x.id).filter(f => f.estado === 'reprogramada').length };
  }
  let cache = null, cacheT = 0;
  function todos() {
    if (cache && Date.now() - cacheT < 1500) return cache;
    const l = [];
    (S.c.perfiles || []).filter(esCliente).forEach(a => { try { deAlumnoBruto(a).forEach(x => l.push(x)); } catch (e) { console.warn('Compromisos de', a.nombre, e); } });
    generales().forEach(x => l.push(x));
    cache = l.map(conEstado).filter(x => !filas(x.id).some(f => f.estado === 'descartada' && f.fecha >= sumaDias(hoyISO(), -60)));
    cacheT = Date.now(); return cache;
  }
  const invalidar = () => { cache = null; };
  const deAlumno = aid => todos().filter(x => x.aid === aid);
  /* Para hoy: lo vencido o que vence hoy, lo elegido para hoy y lo que está en curso (no lo programado ni lo futuro) */
  const abiertos = () => todos().filter(x => !x.futuro && x.estado !== 'programado');
  const proximos = (dias = 7) => todos().filter(x => x.estado === 'programado' || (x.futuro && x.vence <= sumaDias(hoyISO(), dias))).sort((a, b) => (a.para || a.vence).localeCompare(b.para || b.vence));
  /* Resueltos hoy: los que elegiste o empezaste y ya no están pendientes en los datos */
  function resueltosHoy() {
    const hoy = hoyISO(), vivos = new Set(todos().map(x => x.id));
    return (S.c.agenda || []).filter(r => esId(r.origen) && ((r.estado === 'hecha' && String(r.hecho_at || '').slice(0, 10) === hoy) || (r.fecha === hoy && VIVOS.includes(r.estado) && !vivos.has(r.origen))));
  }
  /* Los que se resolvieron en los datos pasan a «hecha» en la agenda (queda el historial con su fecha) */
  async function sincronizar() {
    if (S.c.negErr) return; const vivos = new Set(todos().map(x => x.id));
    const ids = (S.c.agenda || []).filter(r => esId(r.origen) && VIVOS.includes(r.estado) && !vivos.has(r.origen) && !String(r.origen).startsWith('gasto:')).map(r => r.id);
    if (!ids.length) return;
    const ahora = new Date().toISOString(), { error } = await sb.from('agenda').update({ estado: 'hecha', hecho_at: ahora }).in('id', ids);
    if (!error) (S.c.agenda || []).forEach(r => { if (ids.includes(r.id)) { r.estado = 'hecha'; r.hecho_at = ahora; } });
  }

  /* ---------- Acciones ---------- */
  async function guardar(x, cambios, nueva = false) {
    const base = { fecha: hoyISO(), origen: x.id, titulo: `${T[x.tipo].uno}${x.aid ? ' · ' + nom(x.aid) : ''}: ${x.titulo}`.slice(0, 240), motivo: x.m || null, accion: T[x.tipo].hacer, minutos: x.min, estado: 'pendiente', prioridad: false, alumno_id: x.aid || null };
    const extra = { vence: x.vence || null, responsable: x.resp || null };
    const ins = row => sb.from('agenda').insert(row).select().single();
    let r;
    if (x.fila && !nueva) r = await sb.from('agenda').update(cambios).eq('id', x.fila.id).select().single();
    else { r = await ins({ ...base, ...extra, ...cambios }); if (r.error && /vence|responsable/.test(r.error.message || '')) r = await ins({ ...base, ...cambios }); }
    if (r.error) { fallo(r.error, /check|estado/.test(r.error.message || '') ? 'Falta ejecutar el Bloque 91 en Supabase.' : 'Falta ejecutar el Bloque 60 en Supabase.'); return false; }
    S.c.agenda = [...(S.c.agenda || []).filter(f => f.id !== r.data.id), r.data]; invalidar(); return true;
  }
  const buscar = id => todos().find(x => x.id === id);
  /* Solventado: lo das por atendido (sin preguntar cómo); sale de tus pendientes */
  async function solventar(id) {
    const x = buscar(id); if (!x) return toast('Ya está resuelto');
    if (!confirm('¿Seguro que ya está solventado?')) return;
    if (await guardar(x, { estado: 'descartada', nota: 'Solventado', fecha: hoyISO() }, !x.fila)) { toast('Marcado como solventado'); render(); }
  }
  async function elegirHoy(ids, on = true) {
    for (const id of ids) { const x = buscar(id); if (!x) continue;
      if (on && x.estado !== 'hoy' && x.estado !== 'en_curso') await guardar(x, { fecha: hoyISO(), estado: 'pendiente' }, !x.fila || x.fila.fecha !== hoyISO());
      if (!on && x.fila && x.estado === 'hoy') await guardar(x, { estado: 'reprogramada', nota: 'Quitada de hoy' }); }
    render();
  }
  async function marcar(id, estado) {
    const x = buscar(id); if (!x) return;
    if (estado === 'pendiente') { if (x.fila) await guardar(x, { estado: 'reprogramada', nota: 'Vuelve a pendiente' }); }
    else await guardar(x, { estado, fecha: x.fila?.fecha && x.fila.fecha > hoyISO() ? x.fila.fecha : hoyISO() }, !x.fila);
    render();
  }
  /* Reprogramar: la fila actual queda como «reprogramada» (historial) y se crea otra para la nueva fecha; el vencimiento real no cambia */
  function formReprogramar(id) {
    const x = buscar(id); if (!x) return;
    abrirSheet(`<form class="stack" id="f-rp"><h2>Programar</h2><p class="small muted" style="margin-top:-6px">${esc(T[x.tipo].uno)}${x.aid ? ' · ' + esc(nom(x.aid)) : ''}: ${esc(x.titulo)}</p>
      ${x.vence ? `<p class="small">Vencimiento real: <b>${esc(fCorta(x.vence))}</b>${x.atraso ? ` (hace ${x.atraso} día${x.atraso === 1 ? '' : 's'})` : ''}. Se conserva aunque lo programes para otro día.</p>` : ''}
      <label class="f">Lo haré el<input type="date" id="rp-f" min="${hoyISO()}" value="${esc(x.para && x.para > hoyISO() ? x.para : sumaDias(hoyISO(), 1))}" required></label>
      <label class="f">Nota (opcional)<input type="text" id="rp-n" placeholder="Ej. le escribo el lunes"></label>
      <div class="row" style="gap:8px">${x.fila ? '<button type="button" class="btn ghost" id="rp-q">Quitar fecha</button>' : ''}<button class="btn grow" type="submit">Guardar</button></div></form>`);
    $('#f-rp').addEventListener('submit', async e => {
      e.preventDefault(); const f = $('#rp-f').value, n = $('#rp-n').value.trim() || null; if (!f) return;
      if (x.fila) await guardar(x, { estado: 'reprogramada', nota: `Programado para el ${fCorta(f)}${n ? ' · ' + n : ''}` });
      await guardar({ ...x, fila: null }, { fecha: f, estado: f > hoyISO() ? 'programada' : 'pendiente', nota: n }, true);
      cerrarSheet(); toast(`Programado para el ${fCorta(f)}`); render();
    });
    $('#rp-q')?.addEventListener('click', async () => { await guardar(x, { estado: 'reprogramada', nota: 'Sin fecha' }); cerrarSheet(); render(); });
  }
  /* Ir a resolverlo: abre el sitio exacto (no lo da por hecho) */
  async function ir(id, conBloque) {
    const x = buscar(id); if (!x) return toast('Ya está resuelto');
    if (conBloque) S.bloque = { tipo: x.tipo, actual: id };
    if (x.estado === 'pendiente' || x.estado === 'hoy') guardar(x, { estado: 'en_curso', fecha: hoyISO() }, !x.fila).then(render);
    if (x.tipo === 'gasto') return ctab('pagos');
    if (x.tipo === 'tarea') return irA(x.aid, { tab: 'resumen' });
    if (x.tipo === 'rev') return irA(x.aid, { fn: () => formRevision(x.n, null) });
    if (x.tipo === 'dev') return irA(x.aid, { tab: 'checkins', ancla: 'ac-chk', fn: () => Acomp.formDevolucion && x.id.split(':')[2] ? Acomp.formDevolucion(x.id.split(':')[2]) : null });
    return alIr(x.aid, x.m);
  }
  const ctab = t => { S.ficha = null; S.ctab = t; render(); window.scrollTo(0, 0); };
  /* Bloque de trabajo: siguiente elegido para hoy sin resolver */
  function siguiente(tipo) {
    const l = abiertos().filter(x => x.tipo === tipo).sort(ordenar);
    return l.find(x => x.estado === 'en_curso' && x.id !== S.bloque?.actual) || l.find(x => x.estado === 'hoy') || null;
  }
  const ordenar = (a, b) => (b.atraso - a.atraso) || String(a.vence || '9').localeCompare(String(b.vence || '9'));
  function progreso(tipo) {
    const hoy = hoyISO(), res = resueltosHoy().filter(r => tipoDe(r.origen) === tipo).length;
    const eleg = abiertos().filter(x => x.tipo === tipo && ['hoy', 'en_curso'].includes(x.estado)).length;
    const pend = abiertos().filter(x => x.tipo === tipo).length;
    return { res, eleg, pend, total: res + eleg };
  }

  /* ---------- Vistas ---------- */
  const chip = x => { const [c, t] = x.estado === 'pendiente' && x.futuro ? ['', `Vence ${fCorta(x.vence)}`] : EST[x.estado] || ['', x.estado];
    return `<span class="pill ${c}">${esc(t)}${x.estado === 'programado' && x.para ? ' · ' + esc(fCorta(x.para)) : ''}</span>`; };
  const venceTxt = x => !x.vence ? 'Sin fecha' : x.atraso ? `<b style="color:var(--warn)">Venció el ${esc(fCorta(x.vence))} · hace ${x.atraso} d</b>` : x.vence === hoyISO() ? 'Vence hoy' : `Vence el ${esc(fCorta(x.vence))}`;
  function fila(x, conNombre = true, compacta = false) {
    return `<div class="line cm-it ${x.estado}" style="align-items:flex-start;gap:10px">
      <span class="cm-ico" aria-hidden="true">${T[x.tipo].ico}</span>
      <div class="grow stack" style="gap:2px;min-width:0"><button class="linkbtn cm-tit" data-act="cmIr" data-id="${esc(x.id)}">${conNombre && x.aid ? `<b>${esc(nom(x.aid))}</b> · ` : ''}${esc(x.titulo)}</button>
        <span class="small muted">${esc(T[x.tipo].uno)} · ${venceTxt(x)}${x.reprog ? ` · reprogramado ${x.reprog} ${x.reprog === 1 ? 'vez' : 'veces'}` : ''}${x.fila?.nota ? ' · ' + esc(x.fila.nota) : ''}</span>
        ${compacta ? '' : `<span class="row cm-acc" style="gap:6px;flex-wrap:wrap;margin-top:4px">${chip(x)}
          ${x.estado === 'hoy' || x.estado === 'en_curso' ? '' : `<button class="btn sm ghost" data-act="cmHoy" data-id="${esc(x.id)}">Para hoy</button>`}
          <button class="btn sm ghost" data-act="cmProg" data-id="${esc(x.id)}">📅 Programar</button>
          ${x.estado === 'esperando' ? `<button class="btn sm ghost" data-act="cmEstado" data-id="${esc(x.id)}" data-v="pendiente">Ya no espero</button>` : `<button class="btn sm ghost" data-act="cmEstado" data-id="${esc(x.id)}" data-v="esperando" title="Le has escrito y esperas su respuesta">⏳ Espero respuesta</button>`}
          ${x.tipo === 'rev' && x.aid ? `<button class="btn sm ghost" data-act="cmProponer" data-aid="${esc(x.aid)}">💬 Proponer hora</button>` : ''}
          ${x.tipo === 'tarea' ? `<button class="btn sm ghost" data-act="tareaHecha" data-id="${x.tareaId}">✓ Hecha</button>` : x.tipo === 'gasto' ? '' : `<button class="btn sm" data-act="cmSolv" data-id="${esc(x.id)}" title="Ya está atendido: sale de tus pendientes">✓ Solventado</button>`}</span>`}</div>
      ${compacta ? chip(x) : ''}</div>`;
  }
  /* Ficha: lo que el profesional debe hacer con este alumno (no se oculta con «todo al día» mientras quede algo) */
  function vFicha(aid, compacta) {
    const l = deAlumno(aid).sort(ordenar), hoy = hoyISO();
    const ya = l.filter(x => !x.futuro || x.estado !== 'pendiente'), fut = l.filter(x => x.futuro && x.estado === 'pendiente');
    if (!l.length) return `<div class="fx-vacio">✓ Nada pendiente de ti con este alumno</div>`;
    return `<div class="fx-lista">${ya.map(x => fila(x, false, compacta)).join('')}${fut.length ? `<div class="small muted" style="margin-top:6px">Más adelante: ${fut.map(x => `${esc(T[x.tipo].uno)} (${esc(fCorta(x.vence))})`).join(' · ')}</div>` : ''}</div>`;
  }
  return { T, ORDEN, EST, todos, deAlumno, abiertos, proximos, resueltosHoy, sincronizar, invalidar, elegirHoy, marcar, solventar, formReprogramar, ir, siguiente, progreso, ordenar, fila, vFicha, chip, venceTxt, buscar, tipoDe, esId, nom, corto };
})();
