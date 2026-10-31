/* Acompañamiento ordenado (Fase 2) · devolución semanal con borrador, estados del alumno (pausa y regreso),
   resumen del alumno en una pantalla con su próxima acción y la pantalla «Tu coach» del alumno.
   Datos: devoluciones, seguimiento, servicios.estado* y alertas_coach.notas (Bloque 55).
   Se carga antes que app.js y usa sus utilidades al ejecutarse. */
'use strict';
const Acomp = (() => {
  const AVISO = 'Falta ejecutar el Bloque 55 (acompañamiento) en Supabase.';
  const DIAS_REGRESO = 14;

  /* ---------- Estado del alumno ---------- */
  function estado(srv, hoy = hoyISO()) {
    const k = srv?.estado || 'activo';
    if (k === 'pausado') return srv.estado_hasta && srv.estado_hasta < hoy ? { k: 'pausaVencida', hasta: srv.estado_hasta, nota: srv.estado_nota } : { k: 'pausado', hasta: srv.estado_hasta, desde: srv.estado_desde, nota: srv.estado_nota };
    if (k === 'regreso') { const fin = sumaDias(srv.estado_desde || hoy, DIAS_REGRESO - 1); return fin < hoy ? { k: 'activo' } : { k: 'regreso', desde: srv.estado_desde, fin, nota: srv.estado_nota }; }
    return { k: 'activo' };
  }
  const ETQ = { activo: ['ok', 'Activo'], pausado: ['blue', 'En pausa'], pausaVencida: ['warn', 'Pausa terminada'], regreso: ['gold', 'Regreso'] };
  const pillEstado = srv => { const e = estado(srv); return e.k === 'activo' ? '' : `<span class="pill ${ETQ[e.k][0]}">${ETQ[e.k][1]}${e.hasta && e.k === 'pausado' ? ' hasta el ' + esc(fCorta(e.hasta)) : ''}</span>`; };
  function formEstado() {
    const f = S.ficha, s = f.srv; if (!s?.id) return toast('Primero crea su servicio (Plan → Editar)');
    const e = estado(s), cur = e.k === 'pausaVencida' ? 'pausado' : e.k;
    abrirSheet(`<form class="stack" id="f-est"><h2>Estado del alumno</h2>
      <div class="stack" style="gap:8px">${[['activo', 'Activo', 'Seguimiento normal con todas las alertas.'], ['pausado', 'En pausa', 'Vacaciones, lesión, enfermedad… No recibes alertas de incumplimiento y su app le dice que está en pausa.'], ['regreso', 'Regreso', `Plan de vuelta durante ${DIAS_REGRESO} días: semana suave y un solo objetivo. Alertas suaves.`]].map(([k, t, d]) => `<label class="card row" style="gap:10px;align-items:flex-start;padding:12px"><input type="radio" name="est" value="${k}" ${cur === k ? 'checked' : ''} style="width:20px;height:20px;flex:none"><div><b>${t}</b><div class="small muted">${d}</div></div></label>`).join('')}</div>
      <label class="f" id="es-hw">Vuelve el (fecha de fin de la pausa)<input type="date" id="es-h" value="${esc(s.estado_hasta || sumaDias(hoyISO(), 14))}"></label>
      <label class="f" id="es-nw"><span id="es-nl">Nota</span><input type="text" id="es-n" value="${esc(s.estado_nota || '')}"></label>
      <button class="btn full" type="submit">Guardar</button></form>`);
    const pinta = () => { const k = document.querySelector('[name=est]:checked')?.value; $('#es-hw').hidden = k !== 'pausado'; $('#es-nw').hidden = k === 'activo'; $('#es-nl').textContent = k === 'pausado' ? 'Motivo (lo ve el alumno, opcional)' : 'Su único objetivo de estas 2 semanas (lo ve el alumno)'; $('#es-n').placeholder = k === 'pausado' ? 'Ej. vacaciones en familia' : 'Ej. 2 entrenos suaves y 8.000 pasos'; };
    pinta(); $('#f-est').addEventListener('change', pinta);
    $('#f-est').addEventListener('submit', async ev => {
      ev.preventDefault(); const k = document.querySelector('[name=est]:checked').value;
      const row = { estado: k, estado_desde: k === 'activo' ? null : (k === cur ? s.estado_desde || hoyISO() : hoyISO()), estado_hasta: k === 'pausado' ? $('#es-h').value || null : null, estado_nota: k === 'activo' ? null : $('#es-n').value.trim() || null };
      const { error } = await sb.from('servicios').update(row).eq('id', s.id);
      if (error) return fallo(error, /estado/.test(error.message || '') ? AVISO : undefined);
      cerrarSheet(); toast(k === 'pausado' ? 'En pausa: no recibirás alertas de incumplimiento' : k === 'regreso' ? 'Regreso: 2 semanas suaves' : 'Activo'); await window.cargarCoach(); await abrirFicha(f.id);
    });
  }
  /* Tarjeta del alumno en Hoy según su estado */
  function tarjetaEstadoHoy() {
    const s = S.d?.servicio, e = estado(s);
    if (e.k === 'pausado') return `<section class="section"><div class="card stack" style="border:2px solid var(--blue)"><span class="eyebrow">Estás en pausa</span><h3 style="margin:0">${e.hasta ? `Pausa hasta el ${esc(fLarga(e.hasta))}` : 'Pausa'}${e.nota ? ' · ' + esc(e.nota) : ''}</h3><p class="small" style="margin:0">Nada es obligatorio estos días. Si te apetece, una sola cosa: <b>moverte un poco cada día</b> (un paseo de 20-30 minutos). Lo que registres suma, y lo que no, no cuenta en contra.</p></div></section>`;
    if (e.k === 'regreso') { const dia = Math.floor((fecha(hoyISO()) - fecha(e.desde)) / 864e5) + 1; return `<section class="section"><div class="card stack" style="border:2px solid var(--gold)"><span class="eyebrow">Plan de vuelta · día ${dia} de ${DIAS_REGRESO}</span><h3 style="margin:0">Volvemos poco a poco</h3><p class="small" style="margin:0">Estas dos semanas, suave: entrena con cargas cómodas (deja 3-4 repeticiones en reserva) y sin buscar marcas.</p><div class="aprox small"><b>Tu único objetivo:</b> ${esc(e.nota || 'hacer tus entrenos de la semana aunque sean más cortos')}</div></div></section>`; }
    return '';
  }

  /* ---------- Devolución semanal ---------- */
  async function cargarAlumno(uid, dst) {
    const r = await sb.from('devoluciones').select('*').eq('alumno_id', uid).order('semana_inicio', { ascending: false }).limit(30);
    dst.devoluciones = r.data || []; dst.devErr = !!r.error;
  }
  async function cargarCoach() {
    const [d, s] = await Promise.all([sb.from('devoluciones').select('id,alumno_id,semana_inicio,leida_at').gte('semana_inicio', sumaDias(hoyISO(), -35)), sb.from('seguimiento').select('*')]);
    S.c.devoluciones = d.data || []; S.c.devErr = !!d.error; S.c.seguimiento = Object.fromEntries((s.data || []).map(x => [x.alumno_id, x]));
  }
  /* Check-in de la semana pasada (o de esta, si ya lo envió en fin de semana) sin devolución */
  function alertaDevolucion(aid) {
    if (S.c?.devErr) return null;
    const l = lunesDe(hoyISO()), chk = (S.c.checkins || []).filter(k => k.alumno_id === aid && k.semana_inicio >= sumaDias(l, -7)).sort((a, b) => b.semana_inicio.localeCompare(a.semana_inicio))[0];
    if (!chk || (S.c.devoluciones || []).some(d => d.alumno_id === aid && d.semana_inicio === chk.semana_inicio)) return null;
    return `Check-in de la semana del ${fCorta(chk.semana_inicio)} sin devolución`;
  }
  /* Borrador con sus datos: avance observado, dificultad, ajuste y prioridad */
  function borrador(a, chk, f) {
    const lunes = chk.semana_inicio, srv = f.srv, nom = (a.nombre || '').split(' ')[0];
    const src = { sesiones: f.todas.map(x => ({ ...x, alumno_id: a.id })), diario: S.c.diario, checkins: S.c.checkins };
    const w = semanaDatos(a.id, lunes, src), dpw = dpwEn(a.id, lunes, f.prog?.dias_semana || 0), obj = objPasos(srv);
    const av = [], prio = [];
    if (dpw) { av.push(`${w.entrenos} de ${dpw} entrenos${w.entrenos >= dpw ? ' ✅' : ''}`); if (w.entrenos < dpw) prio.push(`llegar a los ${dpw} entrenos de la semana`); }
    if (conPasos(srv) && w.pasosMedia != null) { av.push(`${fmtNum(w.pasosMedia, 0)} pasos de media${w.pasosMedia >= obj ? ' ✅' : ` (objetivo ${fmtNum(obj, 0)})`}`); if (w.pasosMedia < obj) prio.push(`subir los pasos hacia ${fmtNum(obj, 0)} al día`); }
    if (srv?.modulo_nutricion && midoCoach(a.id) && w.ing?.dias) { av.push(`alimentación al ${w.ing.pctReg ?? w.nutri} % en los días registrados`); if ((w.ing.pctReg ?? 100) < 85) prio.push('cumplir las comidas del plan, sobre todo entre semana'); }
    if (chk.motivacion != null) av.push(`motivación ${chk.motivacion}/10`);
    const med = (f.med || []).slice().sort((x, y) => x.fecha.localeCompare(y.fecha)), dl = med.length > 1 ? med[med.length - 1].peso - med[med.length - 2].peso : null;
    if (dl != null && !isNaN(dl)) av.push(`peso ${dl > 0 ? '+' : ''}${fmtNum(dl)} kg desde la medición anterior`);
    const prox = [...(chk.proxima_semana_etiquetas || []), chk.proxima_semana].filter(Boolean).join(', ');
    return {
      avance: av.length ? `${nom}, esta semana: ${av.join(' · ')}.` : '',
      dificultad: chk.dificultades || '',
      ajuste: prox ? `Para la semana que viene (${prox}): ` : '',
      prioridad: prio.length ? `Esta semana, una sola cosa: ${prio[0]}.` : 'Mantener lo que está funcionando: misma rutina y mismos horarios.'
    };
  }
  function formDevolucion(semana) {
    const f = S.ficha, a = S.c.perfiles.find(p => p.id === f.id) || {}, chk = (S.c.checkins || []).find(k => k.alumno_id === f.id && k.semana_inicio === semana) || { semana_inicio: semana };
    const ya = (f.devoluciones || []).find(d => d.semana_inicio === semana), v = ya || borrador(a, chk, f);
    abrirSheet(`<form class="stack" id="f-dev"><h2>Devolución · semana del ${esc(fCorta(semana))}</h2>
      ${ya ? `<p class="small muted">${ya.leida_at ? '✓ Leída el ' + esc(fLarga(ya.leida_at.slice(0, 10))) : 'Enviada, aún sin leer'}.</p>` : '<p class="small muted">Borrador preparado con sus datos y su check-in. Edítalo y envíalo: lo leerá en su Hoy.</p>'}
      ${chk.dificultades || chk.motivacion != null ? `<div class="aprox small">Su check-in: motivación ${chk.motivacion ?? '—'}/10 · implicación ${chk.implicacion ?? '—'}/10${chk.dificultades ? `<br>«${esc(chk.dificultades)}»` : ''}</div>` : ''}
      ${[['avance', 'Avance observado'], ['dificultad', 'Dificultad'], ['ajuste', 'Ajuste acordado'], ['prioridad', 'Prioridad para la semana que viene']].map(([k, l]) => `<label class="f">${l}<textarea data-dv="${k}" rows="${k === 'avance' ? 3 : 2}">${esc(v[k] || '')}</textarea></label>`).join('')}
      <button class="btn full" type="submit">${ya ? 'Guardar cambios' : 'Enviar devolución'}</button></form>`);
    $('#f-dev').addEventListener('submit', async e => {
      e.preventDefault(); const bt = e.target.querySelector('[type=submit]'); if (bt.disabled) return; bt.disabled = true;
      const row = { alumno_id: f.id, semana_inicio: semana }; document.querySelectorAll('#f-dev [data-dv]').forEach(t => { row[t.dataset.dv] = t.value.trim() || null; });
      const q = ya ? await sb.from('devoluciones').update(row).eq('id', ya.id) : await sb.from('devoluciones').upsert(row, { onConflict: 'alumno_id,semana_inicio' });
      if (q.error) { bt.disabled = false; return fallo(q.error, AVISO); }
      cerrarSheet(); toast(ya ? 'Devolución actualizada' : 'Devolución enviada'); await window.cargarCoach(); await abrirFicha(f.id);
    });
  }
  async function cargarFicha(f) {
    const [d] = await Promise.all([sb.from('devoluciones').select('*').eq('alumno_id', f.id).order('semana_inicio', { ascending: false })]);
    f.devoluciones = d.data || []; f.devErr = !!d.error;
  }
  /* Sección de check-ins en la ficha con su devolución */
  function vCheckinsFicha(f, chks) {
    if (!f.devoluciones) { cargarFicha(f).then(() => { if (S.ficha === f) render(); }); }
    const dev = s => (f.devoluciones || []).find(d => d.semana_inicio === s);
    return `<section class="section"><h2>Check-ins y devoluciones</h2><div class="card">${chks.map(k => { const d = dev(k.semana_inicio); return `<div class="line" style="align-items:flex-start"><span class="small muted num" style="width:64px;flex:none">${esc(fCorta(k.semana_inicio))}</span><div class="grow stack" style="gap:4px"><div class="small">Motivación <b>${k.motivacion}/10</b> · implicación <b>${k.implicacion}/10</b></div>${k.dificultades ? `<div class="small"><span class="muted">Dificultades:</span> ${esc(k.dificultades)}</div>` : ''}${(k.proxima_semana_etiquetas || []).length || k.proxima_semana ? `<div class="small"><span class="muted">Semana que viene:</span> ${esc([...(k.proxima_semana_etiquetas || []), k.proxima_semana].filter(Boolean).join(' · '))}</div>` : ''}${d ? `<div class="small"><span class="pill ${d.leida_at ? 'ok' : 'blue'}">${d.leida_at ? '✓ Devolución leída' : 'Devolución enviada'}</span> ${esc((d.prioridad || '').slice(0, 80))}</div>` : ''}</div>${f.devErr ? '' : `<button class="btn sm ${d ? 'ghost' : 'gold'}" data-act="devolucion" data-s="${k.semana_inicio}">${d ? 'Ver' : '✍️ Devolución'}</button>`}</div>`; }).join('') || '<div class="empty">Sin check-ins todavía.</div>'}</div></section>`;
  }
  const bloqueDev = d => `<div class="stack" style="gap:8px">${[['📈', 'Lo que he visto', d.avance], ['🧗', 'La dificultad', d.dificultad], ['🔧', 'Lo que ajustamos', d.ajuste], ['🎯', 'Tu prioridad', d.prioridad]].filter(x => x[2]).map(([i, t, v]) => `<div><div class="small muted">${i} ${t}</div><div class="small pre">${esc(v)}</div></div>`).join('')}</div>`;
  function tarjetaDevolucionHoy() {
    const d = (S.d?.devoluciones || []).find(x => !x.leida_at); if (!d || S.vista || S.prueba) return '';
    return `<section class="section"><div class="card stack" style="border:2px solid var(--blue)"><span class="eyebrow">Jesús sobre tu semana · ${esc(fCorta(d.semana_inicio))}</span>${bloqueDev(d)}<button class="btn" data-act="devLeida" data-id="${d.id}" style="align-self:flex-start">Entendido ✓</button></div></section>`;
  }
  async function marcarLeida(id) {
    const d = (S.d.devoluciones || []).find(x => x.id === id); if (d) d.leida_at = new Date().toISOString(); render();
    await sb.rpc('devolucion_leida', { dev: id });
  }

  /* ---------- Resumen de una pantalla (ficha) ---------- */
  function vResumen(f, a) {
    const srv = f.srv, P = proceso(srv), e = estado(srv), seg = S.c.seguimiento?.[a.id] || {}, hoy = hoyISO();
    const chk = (S.c.checkins || []).filter(k => k.alumno_id === a.id)[0], dev = (f.devoluciones || [])[0], rev = (S.c.revisiones || []).filter(r => r.alumno_id === a.id)[0];
    const ctx = ctxDe(a.id), med = (f.med || []).slice().sort((x, y) => x.fecha.localeCompare(y.fecha)), m1 = med[0], m2 = med[med.length - 1];
    const cambios = [ctx && `semana adaptada: ${ctx.contexto_nombre || 'contexto'}`, f.prog && `programa «${f.prog.nombre}»`, m1 && m2 && m1 !== m2 && m2.peso != null && m1.peso != null && `${m2.peso - m1.peso > 0 ? '+' : ''}${fmtNum(m2.peso - m1.peso)} kg desde el inicio`, m1 && m2 && m1 !== m2 && m2.grasa_pct != null && m1.grasa_pct != null && `${m2.grasa_pct - m1.grasa_pct > 0 ? '+' : ''}${fmtNum(m2.grasa_pct - m1.grasa_pct)} % de grasa`].filter(Boolean);
    const acuerdo = dev?.ajuste ? [dev.ajuste, dev.semana_inicio] : rev?.resumen ? [rev.resumen, rev.fecha] : null;
    const fila = (t, v) => `<div class="row small" style="gap:10px;align-items:flex-start"><span class="muted" style="width:104px;flex:none">${t}</span><span class="grow">${v}</span></div>`;
    const vencida = seg.proxima_fecha && seg.proxima_fecha < hoy;
    return `<section class="section"><div class="card stack" style="gap:8px"><div class="row"><span class="eyebrow grow">Resumen</span><button class="btn sm ghost" data-act="estadoAl">${e.k === 'activo' ? 'Estado: activo ✎' : ETQ[e.k][1] + ' ✎'}</button></div>
      ${fila('Objetivo', esc(objetivoDe(f.ruta) || 'sin definir (Semanas de los bloques)'))}
      ${fila('Fase', P ? (P.antes ? 'Aún no ha empezado' : P.fuera ? 'Proceso terminado' : `${esc(nomCiclo(P.cc))} · semana ${P.semCiclo} de ${P.cc.sem} (semana ${P.semana}${P.sinFin ? '' : ' de ' + P.total})`) + (e.k !== 'activo' ? ' ' + pillEstado(srv) : '') : 'sin fecha de inicio')}
      ${fila('Cambios', esc(cambios.join(' · ') || '—'))}
      ${fila('Dificultad', chk?.dificultades ? `«${esc(chk.dificultades)}» <span class="muted">(${esc(fCorta(chk.semana_inicio))})</span>` : '—')}
      ${fila('Último acuerdo', acuerdo ? `${esc(acuerdo[0])} <span class="muted">(${esc(fCorta(acuerdo[1]))})</span>` : '—')}
      ${fila('Próxima acción', seg.proxima_accion ? `<b style="${vencida ? 'color:var(--warn)' : ''}">${esc(seg.proxima_accion)}</b>${seg.proxima_fecha ? ` <span class="muted">· ${esc(fCorta(seg.proxima_fecha))}${vencida ? ' (pasada)' : ''}</span>` : ''} <button class="linkbtn small" data-act="proxAccion">✎</button>` : '<button class="linkbtn small" data-act="proxAccion">＋ Añadir próxima acción</button>')}
    </div></section>`;
  }
  function formProxima() {
    const f = S.ficha, seg = S.c.seguimiento?.[f.id] || {};
    abrirSheet(`<form class="stack" id="f-px"><h2>Próxima acción</h2><p class="small muted">Solo la ves tú. Qué tienes que hacer con este alumno y cuándo.</p>
      <label class="f">Acción<input type="text" id="px-a" value="${esc(seg.proxima_accion || '')}" placeholder="Ej. llamar para ajustar la semana de viaje"></label>
      <label class="f">Fecha<input type="date" id="px-f" value="${esc(seg.proxima_fecha || sumaDias(hoyISO(), 7))}"></label>
      <div class="row" style="gap:8px">${seg.proxima_accion ? '<button type="button" class="btn ghost" id="px-hecha">✓ Hecha</button>' : ''}<button class="btn grow" type="submit">Guardar</button></div></form>`);
    const guardar = async (a, fe) => { const { error } = await sb.from('seguimiento').upsert({ alumno_id: f.id, proxima_accion: a, proxima_fecha: fe, actualizado_at: new Date().toISOString() }, { onConflict: 'alumno_id' }); if (error) return fallo(error, AVISO); cerrarSheet(); await window.cargarCoach(); render(); };
    $('#f-px').addEventListener('submit', e => { e.preventDefault(); guardar($('#px-a').value.trim() || null, $('#px-f').value || null); });
    $('#px-hecha')?.addEventListener('click', () => guardar(null, null));
  }
  /* Próxima acción vencida → alerta */
  function alertaProxima(aid) { const s = S.c?.seguimiento?.[aid]; return s?.proxima_accion && s.proxima_fecha && s.proxima_fecha <= hoyISO() ? `Próxima acción para hoy o pasada: ${s.proxima_accion}` : null; }

  /* ---------- Pantalla «Tu coach» del alumno: WhatsApp directo, próxima revisión y próximos entrenos con Jesús ---------- */
  function vTuCoach() {
    const D = S.d || {}, s = D.servicio, hoy = hoyISO(), prox = controlesMensuales(s, sumaDias(hoy, 45)).find(c => c.fecha >= hoy);
    const pres = (D.presenciales || []).filter(p => p.estado === 'programada' && (!p.fecha || p.fecha >= hoy)).sort(ordPres).slice(0, 4);
    const wa = S.whatsapp ? waJesus('Hola Jesús') : null;
    return `<section class="stack"><span class="eyebrow">Tu acompañamiento</span><h1>Tu coach</h1></section>${IA.vEntrada()}
      <section class="section"><div class="card stack"><div class="row" style="gap:12px;align-items:center"><img src="icons/coach.jpg" alt="" style="width:56px;height:56px;border-radius:50%;object-fit:cover" onerror="this.remove()"><div class="grow"><b>Jesús de la Obra</b>${S.respuesta ? `<div class="small muted">Te responde ${esc(S.respuesta)}</div>` : ''}</div></div>
        ${wa ? `<a class="btn full" href="${esc(wa)}" target="_blank" rel="noopener">💬 Habla con Jesús por WhatsApp</a>` : '<p class="small muted" style="margin:0">Jesús aún no ha puesto su WhatsApp en la app.</p>'}</div></section>
      <section class="section"><h2>Próximamente</h2><div class="card">
        ${prox ? `<div class="line"><div class="ico gold">${svg('progreso')}</div><div class="grow"><b class="small">Revisión mensual</b><div class="small muted">Control ${prox.n} · semana del ${esc(fCorta(prox.lunes))}. Llamada o videollamada de 10-15 minutos.</div></div></div>` : ''}
        ${pres.map(p => `<div class="line" data-act="verPres" data-id="${p.id}" style="cursor:pointer"><div class="ico">${svg('cal')}</div><div class="grow"><b class="small">Entrenamiento personal con Jesús</b><div class="small muted">${esc(fLargaP(p))}${p.hora ? ' · ' + hhmm(p.hora) : ''}</div></div><span class="small muted">›</span></div>`).join('')}
        ${!prox && !pres.length ? '<div class="empty">Sin citas próximas.</div>' : ''}</div></section>`;
  }
  /* Última indicación de Jesús en Hoy (cuando no hay una devolución nueva sin leer, que ya sale en Pendiente) */
  function ultimaIndicacion() {
    const D = S.d || {}; if (S.vista || S.prueba || (D.devoluciones || []).some(x => !x.leida_at)) return '';
    const d = (D.devoluciones || [])[0], r = (D.revisiones || [])[0];
    const usarRev = r?.resumen && (!d || r.fecha > d.semana_inicio);
    if (!d && !usarRev) return '';
    const fechaTxt = usarRev ? fLarga(r.fecha) : 'semana del ' + fCorta(d.semana_inicio), principal = usarRev ? r.resumen : (d.prioridad || d.ajuste || d.avance || '');
    return `<section class="section"><details class="card"><summary class="stack" style="gap:4px"><span class="eyebrow">Última indicación de Jesús · ${esc(fechaTxt)}</span><span class="small">${usarRev ? '🗓 Revisión mensual: ' : '🎯 '}${esc(principal.slice(0, 160))}${principal.length > 160 ? '…' : ''}</span><span class="small" style="color:var(--blue-text)">Ver completa ›</span></summary><div style="margin-top:10px">${usarRev ? `<div class="small pre">${esc(r.resumen)}</div>` : bloqueDev(d)}</div></details></section>`;
  }
  const sinLeer = () => (S.d?.devoluciones || []).filter(d => !d.leida_at).length;

  return { ultimaIndicacion, estado, pillEstado, formEstado, tarjetaEstadoHoy, cargarAlumno, cargarCoach, alertaDevolucion, formDevolucion, cargarFicha, vCheckinsFicha, tarjetaDevolucionHoy, marcarLeida, vResumen, formProxima, alertaProxima, vTuCoach, sinLeer };
})();
