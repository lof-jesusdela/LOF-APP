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
    if (typeof Compromisos !== 'undefined') Compromisos.invalidar();
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
      <label class="f">Margen para imprevistos (%)<input type="number" id="cap-mg" min="0" max="50" step="5" value="${margen()}"></label>
      <p class="small muted">Son horas de trabajo con alumnos y negocio (sin contar los entrenamientos presenciales, que se muestran aparte). El margen se reserva para imprevistos. Los minutos de cada tarea son orientativos.</p>
      <button class="btn full" type="submit">Guardar</button></form>`);
    $('#cap-sem').addEventListener('click', ev => { const b = ev.target.closest('[data-v]'); if (!b) return; document.querySelectorAll('#cap-sem [data-v]').forEach(x => x.setAttribute('aria-pressed', x === b)); });
    $('#f-cap').addEventListener('submit', async e => {
      e.preventDefault(); const v = document.querySelector('#cap-sem [aria-pressed="true"]').dataset.v;
      let ov = {}; try { ov = JSON.parse(cfg('override') || '{}'); } catch (er) { }
      const auto = (() => { const n = Math.round((fecha(l) - fecha(lunesDe(cfg('ref') || DEF.ref))) / 6048e5); return Math.abs(n) % 2 === 1 ? 'con' : 'sin'; })();
      if (v === auto) delete ov[l]; else ov[l] = v;
      await guardarAjuste('cap_con', $('#cap-con').value || DEF.con); await guardarAjuste('cap_sin', $('#cap-sin').value || DEF.sin); await guardarAjuste('cap_override', JSON.stringify(ov)); await guardarAjuste('cap_margen', Math.max(0, Math.min(50, +$('#cap-mg').value || 0)));
      cerrarSheet(); toast('Capacidad guardada'); render();
    });
  }

  /* En rojo por algo que no sea solo un cobro vencido (eso ya va en «Cobros vencidos», sin duplicar) */
  const soloNoPago = e => e.motivos.some(m => !/^Pago vencido/.test(m));
  /* Tareas tuyas del día (los compromisos con alumnos viven en Compromisos: una sola fuente) */
  function propuestas() { return []; }
  function delDia(f = hoyISO()) {
    const ag = S.c.agenda || [], propias = ag.filter(x => x.fecha === f && !x.origen);
    const items = propias.map(r => ({ k: 'propia:' + r.id, id: r.id, titulo: r.titulo, motivo: r.motivo || 'Tarea tuya', accion: r.accion, min: r.minutos, estado: r.estado, prioridad: r.prioridad, plazo: f, rank: r.prioridad ? 0 : 6, propia: true, nota: r.nota }));
    return { items, prio: items.filter(x => x.prioridad), otras: items.filter(x => !x.prioridad) };
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

  /* ---------- Vista: Hoy del coach ----------
     A. jornada y capacidad · B. atención prioritaria (máx. 3, sin ocultar críticos) · C. seguimiento elegido para hoy
     D. próximas sesiones y compromisos · E. economía compacta · F. cierre de jornada */
  const margen = () => Math.max(0, Math.min(50, +(cfg('margen') ?? 15)));
  function criticos() {
    /* Solo señales graves que no son ya un compromiso (un cobro vencido va en su bloque, no aquí) */
    return S.c.perfiles.filter(esCliente).map(a => ({ a, m: estadoAlumno(a).items.find(i => !i.ok && i.n === 'bad' && !i.comp)?.m })).filter(x => x.m);
  }
  function capacidad() {
    const hoy = hoyISO(), cap = semana(), C = Compromisos, ab = C.abiertos();
    const eleg = ab.filter(x => ['hoy', 'en_curso'].includes(x.estado)), minEleg = eleg.reduce((t, x) => t + (+x.min || 0), 0);
    const res = C.resueltosHoy(), minRes = res.reduce((t, r) => t + (+r.minutos || 0), 0);
    const d = delDia(), tPend = d.items.filter(x => x.estado === 'pendiente'), minT = tPend.reduce((t, x) => t + (+x.min || 0), 0), minTh = d.items.filter(x => x.estado === 'hecha').reduce((t, x) => t + (+x.min || 0), 0);
    const ses = (S.c.presenciales || []).filter(p => p.fecha === hoy && p.estado !== 'cancelada'), minSes = ses.length * durSesion();
    const disp = cap.min, mg = Math.round(disp * margen() / 100), util = Math.max(0, disp - mg), usado = minRes + minTh + minEleg + minT;
    return { cap, eleg, minEleg, res, minRes, minT, minTh, ses, minSes, disp, mg, util, usado, sobra: usado > util };
  }
  function vCapacidad(k) {
    const pc = v => k.disp ? Math.max(0, Math.min(100, v / k.disp * 100)) : 0;
    const seg = (v, c, t) => v > 0 ? `<i class="cap-${c}" style="width:${pc(v)}%" title="${t}: ~${hm(v)}"></i>` : '';
    const hecho = k.minRes + k.minTh, pend = k.minEleg + k.minT;
    return `<section class="section"><div class="card stack" style="gap:8px"><div class="row" style="gap:8px"><span class="small grow"><b>${k.cap.con ? '👨‍👧‍👦 Semana con hijos' : '🧭 Semana sin hijos'}</b> · ${k.cap.horas} h para seguimiento y negocio</span><button class="linkbtn small" data-act="agCapacidad">Ajustar</button></div>
      <div class="cap-bar" role="img" aria-label="Hecho ${hm(hecho)}, por hacer ${hm(pend)}, margen ${hm(k.mg)} de ${hm(k.disp)}">${seg(hecho, 'ok', 'Hecho hoy')}${seg(Math.min(pend, Math.max(0, k.util - hecho)), 'pl', 'Elegido por hacer')}${k.usado > k.util ? seg(k.usado - k.util, 'over', 'Por encima de lo disponible') : ''}<i class="cap-mg" style="width:${pc(k.mg)}%" title="Margen para imprevistos"></i></div>
      <div class="cap-ley small"><span><i class="cap-ok"></i>Hecho ~${hm(hecho)}</span><span><i class="cap-pl"></i>Por hacer ~${hm(pend)}</span><span><i class="cap-mg"></i>Margen ${margen()} %</span>${k.ses.length ? `<span>🏋️ ${k.ses.length} sesi${k.ses.length === 1 ? 'ón' : 'ones'} presencial${k.ses.length === 1 ? '' : 'es'} (~${hm(k.minSes)}, aparte)</span>` : ''}</div>
      <div class="small ${k.sobra ? '' : 'muted'}">${k.sobra ? `<b style="color:var(--warn)">⚠ Lo elegido (~${hm(k.usado)}) pasa de lo disponible (~${hm(k.util)} sin el margen).</b> Programa algo para otro día.` : !k.eleg.length && !k.minT && !hecho ? 'Aún no has elegido seguimiento para hoy. No hace falta llenar el día: elige solo lo que quieras hacer.' : `Libre ~${hm(Math.max(0, k.util - k.usado))}. Estimaciones orientativas: no es una meta.`}</div></div></section>`;
  }
  function vPrioridades() {
    const C = Compromisos, cr = criticos(), ab = C.abiertos().filter(x => x.atraso > 0 || x.vence === hoyISO() || x.estado === 'en_curso').sort(C.ordenar);
    const items = [...cr.map(x => ({ cr: true, a: x.a, m: x.m })), ...ab.filter(x => !cr.some(c => c.a.id === x.aid)).map(x => ({ x }))];
    const top = items.slice(0, 3), resto = items.length - top.length, crResto = cr.length - top.filter(y => y.cr).length;
    const f = y => y.cr ? `<div class="line" style="gap:10px;align-items:flex-start"><span class="cm-ico" aria-hidden="true">🔴</span><div class="grow stack" style="gap:2px"><button class="linkbtn cm-tit" data-act="alIr" data-id="${y.a.id}" data-m="${esc(y.m || '')}"><b>${esc(y.a.nombre)}</b> · ${esc(y.m || 'Revisar')}</button><span class="small" style="color:var(--bad)">Atención prioritaria</span></div></div>`
      : C.fila(y.x, true, true).replace('class="line cm-it', `class="line cm-it${y.x.atraso > 7 ? ' tarde' : ''}`);
    return `<section class="section"><div class="section-head"><h2>Requiere atención</h2>${items.length ? `<span class="small muted">${items.length} en total</span>` : ''}</div>
      <div class="card">${top.map(f).join('') || '<div class="empty">Nada vencido ni urgente. 👌</div>'}
      ${resto > 0 ? `<button class="linkbtn small" data-act="cmImportantes" style="margin-top:6px;${crResto > 0 ? 'color:var(--bad);font-weight:700' : ''}">${crResto > 0 ? `🔴 ${crResto} caso${crResto === 1 ? '' : 's'} prioritario${crResto === 1 ? '' : 's'} más` : `Ver ${resto} más`} ›</button>` : ''}</div></section>`;
  }
  function verImportantes() {
    const C = Compromisos, cr = criticos(), ab = C.abiertos().filter(x => x.atraso > 0 || x.vence === hoyISO() || x.estado === 'en_curso').sort(C.ordenar);
    abrirSheet(`<div class="stack"><h2>Requiere atención</h2>${cr.length ? `<span class="eyebrow">Atención prioritaria · ${cr.length}</span><div class="card">${cr.map(x => `<div class="line" style="gap:10px"><span>🔴</span><button class="linkbtn grow cm-tit" data-act="alIr" data-id="${x.a.id}" data-m="${esc(x.m || '')}"><b>${esc(x.a.nombre)}</b> · ${esc(x.m || '')}</button></div>`).join('')}</div>` : ''}
      ${ab.length ? `<span class="eyebrow">Vencidos o de hoy · ${ab.length}</span><div class="card">${ab.map(x => C.fila(x, true, false)).join('')}</div>` : ''}${!cr.length && !ab.length ? '<div class="empty">Nada pendiente.</div>' : ''}</div>`);
  }
  function vBloques() {
    const C = Compromisos, ab = C.abiertos(), d = delDia();
    const grupos = C.ORDEN.map(t => ({ t, l: ab.filter(x => x.tipo === t).sort(C.ordenar), p: C.progreso(t) })).filter(g => g.l.length || g.p.res);
    const g0 = g => `<div class="card row cm-bl" id="cm-b-${g.t}" style="gap:8px;padding:12px 14px"><span class="cm-ico" aria-hidden="true">${C.T[g.t].ico}</span><span class="grow"><b class="small">${C.T[g.t].n}</b> <span class="small muted">· ${g.l.length} pendiente${g.l.length === 1 ? '' : 's'}${g.l.some(x => x.atraso) ? ` (${g.l.filter(x => x.atraso).length} vencido${g.l.filter(x => x.atraso).length === 1 ? '' : 's'})` : ''}</span></span><button class="btn sm ghost" data-act="cmElegir" data-t="${g.t}">Elegir</button></div>`;
    const g1 = g => { if (!g.p.total) return g0(g); const eleg = g.l.filter(x => ['hoy', 'en_curso'].includes(x.estado)), T = C.T[g.t], pct = g.p.total ? Math.round(g.p.res / g.p.total * 100) : 0;
      return `<div class="card stack cm-bl" id="cm-b-${g.t}" style="gap:8px"><div class="row" style="gap:8px"><span class="cm-ico" aria-hidden="true">${T.ico}</span><b class="grow">${T.n}</b><span class="small muted">${g.p.total ? `<b>${g.p.res} de ${g.p.total}</b> hechas hoy · ` : ''}${g.l.length} pendiente${g.l.length === 1 ? '' : 's'}</span></div>
        ${g.p.total ? `<div class="cm-prog" role="progressbar" aria-valuenow="${g.p.res}" aria-valuemin="0" aria-valuemax="${g.p.total}" aria-label="${T.n}: ${g.p.res} de ${g.p.total} hechas hoy"><i style="width:${pct}%"></i></div>` : ''}
        ${eleg.length ? `<div>${eleg.map(x => C.fila(x, true, true)).join('')}</div>` : `<span class="small muted">${g.l.length ? 'Ninguna elegida para hoy.' : 'Todo lo elegido está hecho.'}</span>`}
        <div class="row" style="gap:8px;flex-wrap:wrap">${g.l.length ? `<button class="btn sm ghost" data-act="cmElegir" data-t="${g.t}">${eleg.length ? 'Cambiar selección' : 'Elegir para hoy'}</button>` : ''}${eleg.length ? `<button class="btn sm" data-act="cmSiguiente" data-t="${g.t}">Empezar siguiente ›</button>` : ''}</div></div>`; };
    const ant = pendientesAnteriores();
    return `<section class="section"><div class="section-head"><h2>Seguimiento de hoy</h2><button class="btn sm ghost" data-act="agTarea">＋ Tarea</button></div>
      <div class="stack" style="gap:10px">${grupos.map(g1).join('') || '<div class="card empty">Sin seguimiento pendiente.</div>'}
      ${d.items.length ? `<div class="card stack" style="gap:6px"><div class="row"><span class="cm-ico">✅</span><b class="grow">Tus tareas de hoy</b></div>${d.items.map(it => filaPropia(it)).join('')}</div>` : ''}
      ${ant.length ? `<div class="card stack" style="gap:6px"><b class="small">Tareas tuyas sin cerrar de días anteriores</b><p class="small muted" style="margin:0">No se pasan solas a hoy: decide qué hacer con cada una.</p>${ant.map(r => `<div class="line" style="flex-wrap:wrap;gap:8px"><span class="grow small">${esc(r.titulo)} <span class="muted">· ${esc(fCorta(r.fecha))}</span></span><button class="btn sm ghost" data-act="agAnterior" data-id="${r.id}" data-v="hoy">A hoy</button><button class="btn sm ghost" data-act="agAnterior" data-id="${r.id}" data-v="hecha">Hecha</button><button class="btn sm ghost" data-act="agAnterior" data-id="${r.id}" data-v="descartar">Descartar</button></div>`).join('')}</div>` : ''}</div></section>`;
  }
  const filaPropia = it => `<div class="line ag-it ${it.estado}" style="align-items:flex-start;gap:10px"><button class="ag-chk" data-act="agHecha" data-k="${esc(it.k)}" aria-label="${it.estado === 'hecha' ? 'Marcar como pendiente' : 'Marcar como hecha'}">${it.estado === 'hecha' ? '✓' : ''}</button>
      <div class="grow stack" style="gap:2px"><span class="small" style="${it.estado !== 'pendiente' ? 'text-decoration:line-through;color:var(--muted)' : ''}">${esc(it.titulo)}</span><span class="small muted">~${hm(it.min)}${it.nota ? ' · ' + esc(it.nota) : ''}</span></div><button class="btn sm ghost" data-act="agItem" data-k="${esc(it.k)}" aria-label="Cambiar o reprogramar">✎</button></div>`;
  function formElegir(tipo) {
    const C = Compromisos, l = C.abiertos().filter(x => x.tipo === tipo).sort(C.ordenar), k = capacidad(), T = C.T[tipo];
    const otros = k.usado - l.filter(x => ['hoy', 'en_curso'].includes(x.estado)).reduce((t, x) => t + (+x.min || 0), 0);
    const yaHay = l.some(x => ['hoy', 'en_curso'].includes(x.estado));
    let hueco = Math.max(0, k.util - otros); const sug = new Set();
    if (!yaHay) for (const x of l) { if (sug.size >= 3 || x.min > hueco) break; sug.add(x.id); hueco -= x.min; }
    abrirSheet(`<form class="stack" id="f-cme"><h2>${T.ico} ${T.n}</h2><p class="small muted" style="margin-top:-6px">Elige las que harás hoy. Las demás siguen pendientes con su fecha real; no se pasan solas a mañana.</p>
      <div class="card">${l.map(x => `<label class="line" style="gap:10px;align-items:flex-start;cursor:pointer"><input type="checkbox" data-cm="${esc(x.id)}" data-min="${x.min}" ${['hoy', 'en_curso'].includes(x.estado) || sug.has(x.id) ? 'checked' : ''} style="width:22px;height:22px;flex:none;margin-top:2px"><span class="grow stack" style="gap:2px"><span class="small">${x.aid ? `<b>${esc(C.nom(x.aid))}</b> · ` : ''}${esc(x.titulo)}</span><span class="small muted">${C.venceTxt(x)} · ~${hm(x.min)}${x.estado === 'esperando' ? ' · esperando respuesta' : ''}</span></span></label>`).join('')}</div>
      <div class="small" id="cme-t"></div>
      <button class="btn full" type="submit">Guardar selección</button></form>`);
    const tot = () => { const m = [...document.querySelectorAll('[data-cm]:checked')].reduce((t, i) => t + +i.dataset.min, 0), n = document.querySelectorAll('[data-cm]:checked').length, sob = otros + m > k.util;
      $('#cme-t').innerHTML = `${n} elegida${n === 1 ? '' : 's'} · ~${hm(m)}. Con lo demás de hoy: ~${hm(otros + m)} de ~${hm(k.util)} disponibles${sob ? ' · <b style="color:var(--warn)">no cabe todo</b>' : ''}. <span class="muted">(orientativo)</span>`; };
    tot(); $('#f-cme').addEventListener('change', tot);
    $('#f-cme').addEventListener('submit', async e => {
      e.preventDefault(); const bt = e.target.querySelector('[type=submit]'); bt.disabled = true;
      const on = [], off = []; document.querySelectorAll('[data-cm]').forEach(i => { const x = l.find(y => y.id === i.dataset.cm); if (i.checked && !['hoy', 'en_curso'].includes(x.estado)) on.push(x.id); if (!i.checked && x.estado === 'hoy') off.push(x.id); });
      if (on.length) await C.elegirHoy(on, true); if (off.length) await C.elegirHoy(off, false);
      cerrarSheet(); render();
    });
  }
  function siguiente(tipo) {
    const x = Compromisos.siguiente(tipo);
    if (!x) { S.bloque = null; render(); return toast('No quedan elegidas para hoy en este bloque'); }
    Compromisos.ir(x.id, true);
  }
  function vProximos() {
    const hoy = hoyISO(), man = sumaDias(hoy, 1), nom = id => S.c.perfiles.find(p => p.id === id)?.nombre || 'Alumno', ahora = new Date().toTimeString().slice(0, 5);
    const ses = (S.c.presenciales || []).filter(p => (p.fecha === hoy && (!p.hora || hhmm(p.hora) >= ahora) || p.fecha === man) && p.estado !== 'cancelada' && p.estado !== 'dada').sort(ordPres).slice(0, 6);
    const pr = Compromisos.proximos(7).slice(0, 6);
    if (!ses.length && !pr.length) return '';
    return `<section class="section"><div class="section-head"><h2>Próximo</h2><button class="linkbtn small" data-act="verAgenda">Agenda ›</button></div><div class="card">
      ${ses.map(p => `<div class="line" style="gap:10px"><b class="num small" style="width:68px;flex:none">${p.fecha === hoy ? 'Hoy' : 'Mañana'} ${esc(hhmm(p.hora) || '')}</b><button class="linkbtn grow cm-tit" data-act="agendaIr" data-id="${p.alumno_id}" data-p="${p.id || ''}">🏋️ <b>${esc(nom(p.alumno_id))}</b> · ${esc(p.tipo || 'Entrenamiento')}</button></div>`).join('')}
      ${pr.map(x => `<div class="line" style="gap:10px"><b class="num small" style="width:68px;flex:none">${esc(fCorta(x.para || x.vence))}</b><button class="linkbtn grow cm-tit" data-act="cmIr" data-id="${esc(x.id)}">${Compromisos.T[x.tipo].ico} ${x.aid ? `<b>${esc(Compromisos.nom(x.aid))}</b> · ` : ''}${esc(x.titulo)}</button>${Compromisos.chip(x)}</div>`).join('')}</div></section>`;
  }
  function vEcoMini() {
    const k = calc(), prov = (typeof Programas !== 'undefined' && S.c.srvTodos) ? '' : '';
    return `<section class="section"><button class="card row eco-mini" data-act="ctab" data-t="pagos" style="width:100%;text-align:left;gap:12px;cursor:pointer">
      <span class="grow stack" style="gap:2px"><span class="eyebrow">Economía · 30 días</span><span class="small">${k.caja != null ? `Caja estimada <b class="num">${eur(k.caja)}</b> <span class="muted">(saldo del ${esc(fCorta(k.saldo.fecha))})</span>` : '<span class="muted">Falta tu saldo real para estimar la caja</span>'}</span>
      <span class="small muted">Cobros previstos +${eur(k.cobros30)}${k.vencidos.length ? ` · <b style="color:var(--warn)">${k.vencidos.length} vencido${k.vencidos.length === 1 ? '' : 's'} ${eur(k.sum(k.vencidos))}</b>` : ''}</span></span><span aria-hidden="true">›</span></button></section>`;
  }
  function vInicio() {
    if (S.c.negErr) return `<section class="stack"><span class="eyebrow">${esc(fLarga(hoyISO()))}</span><h1>Tu día</h1></section><section class="section"><div class="card small muted">${AVISO}</div></section>`;
    const hoy = hoyISO(), ci = (S.c.cierres || []).find(x => x.fecha === hoy), k = capacidad();
    return `<section class="stack"><span class="eyebrow">${esc(fLarga(hoy))}</span><h1>Tu día</h1><div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn sm" data-act="programarSes">📅 Programar sesión</button><button class="btn sm ghost" data-act="verAgenda">Agenda</button></div></section>
      ${vCapacidad(k)}
      ${ci ? `<section class="section"><div class="card stack" style="border:2px solid var(--ok);gap:4px"><b>✓ Jornada cerrada a las ${esc(new Date(ci.cerrado_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }))}</b>${(ci.pendientes || []).length ? `<div class="small">Quedó abierto: ${ci.pendientes.map(esc).join(' · ')}</div>` : ''}${ci.proximo ? `<div class="small">Próximo bloque: <b>${esc(ci.proximo)}</b></div>` : ''}<button class="linkbtn small" data-act="agCierre" style="align-self:flex-start">Revisar el cierre</button></div></section>` : ''}
      ${vPrioridades()}
      ${vBloques()}
      ${vProximos()}
      ${vEcoMini()}
      <section class="section"><button class="btn full ${ci ? 'ghost' : 'dark'}" data-act="agCierre">${ci ? 'Revisar el cierre de hoy' : 'Cerrar la jornada'}</button></section>
      ${vRecordatorios(null)}
      ${vMejoras()}`;
  }

  /* ---------- Cierre de jornada: lo resuelto, lo que sigue abierto y lo programado. No hace falta vaciar nada ---------- */
  function formCierre() {
    const C = Compromisos, hoy = hoyISO(), d = delDia(), res = C.resueltosHoy(), propH = d.items.filter(x => x.estado === 'hecha');
    const abiertosHoy = C.abiertos().filter(x => ['hoy', 'en_curso'].includes(x.estado)), propP = d.items.filter(x => x.estado === 'pendiente');
    const prog = C.todos().filter(x => x.estado === 'programado'), esp = C.todos().filter(x => x.estado === 'esperando'), cr = criticos();
    const prox = prog.slice().sort((a, b) => a.para.localeCompare(b.para))[0], ci = (S.c.cierres || []).find(x => x.fecha === hoy);
    abrirSheet(`<form class="stack" id="f-ci"><h2>Cierre de la jornada</h2>
      <div class="stack" style="gap:4px"><b class="small">✅ Resuelto hoy · ${res.length + propH.length}</b>${[...res.map(r => r.titulo), ...propH.map(x => x.titulo)].map(t => `<div class="small muted">· ${esc(t)}</div>`).join('') || '<div class="small muted">Nada marcado como resuelto hoy.</div>'}</div>
      <div class="stack" style="gap:6px"><b class="small">🔵 Sigue abierto de hoy · ${abiertosHoy.length + propP.length}</b>${abiertosHoy.length + propP.length ? '<p class="small muted" style="margin:0">Decide con cada uno: programarlo para otro día, dejarlo esperando respuesta o dejarlo abierto (seguirá en pendientes con su fecha real, sin ocupar mañana).</p>' : '<div class="small muted">Nada.</div>'}
        ${abiertosHoy.map(x => `<div class="card stack" style="padding:10px;gap:6px"><span class="small">${C.T[x.tipo].ico} ${x.aid ? `<b>${esc(C.nom(x.aid))}</b> · ` : ''}${esc(x.titulo)} <span class="muted">· ${C.venceTxt(x)}</span></span>
          <div class="row" style="gap:6px;flex-wrap:wrap"><select data-ci="${esc(x.id)}" style="flex:1;min-width:150px"><option value="">Dejar abierto</option><option value="prog">Programar para…</option><option value="esp">Espero respuesta</option></select><input type="date" data-cif="${esc(x.id)}" min="${sumaDias(hoy, 1)}" value="${sumaDias(hoy, 1)}" hidden style="flex:1;min-width:140px"></div></div>`).join('')}
        ${propP.map(x => `<div class="row small" style="gap:8px"><span class="grow">✅ ${esc(x.titulo)}</span><button type="button" class="btn sm ghost" data-act="agItem" data-k="${esc(x.k)}">Reprogramar</button></div>`).join('')}</div>
      <div class="stack" style="gap:4px"><b class="small">📅 Programado o esperando · ${prog.length + esp.length}</b>${[...prog.map(x => `${esc(fCorta(x.para))} · ${x.aid ? esc(C.corto(x.aid)) + ': ' : ''}${esc(x.titulo)}`), ...esp.map(x => `⏳ ${x.aid ? esc(C.corto(x.aid)) + ': ' : ''}${esc(x.titulo)}`)].slice(0, 8).map(t => `<div class="small muted">· ${t}</div>`).join('') || '<div class="small muted">Nada.</div>'}</div>
      ${cr.length ? `<div class="aprox small"><span>🔴 ${cr.length} caso${cr.length === 1 ? '' : 's'} de atención prioritaria siguen en «Requiere atención»: ${cr.map(x => esc(x.a.nombre.split(' ')[0])).join(', ')}.</span></div>` : ''}
      <label class="f">Próximo bloque de trabajo (opcional)<input type="text" id="ci-p" value="${esc(ci?.proximo || (prox ? `${fCorta(prox.para)} · ${C.T[prox.tipo].n.toLowerCase()}` : ''))}" placeholder="Ej. mañana 9:00 · devoluciones"></label>
      <button class="btn full" type="submit">Cerrar la jornada</button></form>`);
    document.querySelectorAll('[data-ci]').forEach(s => s.addEventListener('change', () => { document.querySelector(`[data-cif="${CSS.escape(s.dataset.ci)}"]`).hidden = s.value !== 'prog'; }));
    $('#f-ci').addEventListener('submit', async e => {
      e.preventDefault(); const bt = e.target.querySelector('[type=submit]'); bt.disabled = true;
      const quedan = [];
      for (const s of document.querySelectorAll('[data-ci]')) {
        const x = C.buscar(s.dataset.ci); if (!x) continue;
        if (s.value === 'esp') await C.marcar(x.id, 'esperando');
        else if (s.value === 'prog') { const f = document.querySelector(`[data-cif="${CSS.escape(x.id)}"]`).value; if (f) { await sb.from('agenda').update({ estado: 'reprogramada', nota: `Al cierre: programado para el ${fCorta(f)}` }).eq('id', x.fila?.id || -1); const r = await sb.from('agenda').insert({ fecha: f, origen: x.id, titulo: x.fila?.titulo || x.titulo, motivo: x.m || null, minutos: x.min, estado: 'programada', alumno_id: x.aid || null, vence: x.vence || null }); if (r.error && /vence/.test(r.error.message || '')) await sb.from('agenda').insert({ fecha: f, origen: x.id, titulo: x.fila?.titulo || x.titulo, minutos: x.min, estado: 'programada', alumno_id: x.aid || null }); } }
        else quedan.push(`${x.aid ? C.corto(x.aid) + ': ' : ''}${x.titulo}`);
      }
      propP.forEach(x => quedan.push(x.titulo));
      const { error } = await sb.from('cierres').upsert({ fecha: hoy, cerrado_at: new Date().toISOString(), proximo: $('#ci-p').value.trim() || null, pendientes: quedan }, { onConflict: 'fecha' });
      if (error) { bt.disabled = false; return fallo(error, AVISO); }
      cerrarSheet(); await cargar(); C.invalidar(); render(); toast('Jornada cerrada');
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
    return `<section class="section"><details class="card"><summary><b>Mejoras del negocio</b> <span class="small muted">· ${ab.length} de 3 en marcha${ideas.length ? ` · ${ideas.length} ideas` : ''} · opcional</span></summary>${typeof IA !== 'undefined' && IA.vTarjetaCoach ? `<div class="mj-ia">${IA.vTarjetaCoach()}</div>` : ''}<div class="stack" style="gap:6px;margin-top:8px">
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
        <div class="row"><span class="grow">Gastos pagados</span><b class="num">${(S.c.movs || []).some(m => m.tipo === 'gasto' && m.fecha >= ini && m.fecha <= finMes) ? eur(gas) : '<i class="muted" style="font-weight:400">sin gastos registrados</i>'}</b><span class="muted" style="width:96px;text-align:right">ant. ${eur(gasA)}</span></div>
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

  return { verImportantes, formElegir, siguiente, capacidad, criticos, vRecordatorios, formRec, moverRec, hechoRec, cargar, vInicio, vEconomia, vEcoResumen, semana, propuestas, delDia, formCapacidad, formItem, formTarea, hecha, estrella, decidirAnterior, formCierre, nuevaMejora, estadoMejora, formSaldo, formMov, formReserva, revisionHecha, calc };
})();
