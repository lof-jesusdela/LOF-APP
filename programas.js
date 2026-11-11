/* =========================================================================
   Economía → Programas: indicadores por programa y por mes, ranking,
   lo que funciona y lo que hay que mejorar, y edición de tarifas y servicios.
   Datos: pagos (cobrado / pendiente / vencido), servicios (altas, activos,
   ampliaciones) y el catálogo de tarifas (tarifas.js + cambios del coach).
   ========================================================================= */
const Programas = (() => {
  const PAL = ['#2563eb', '#c9a227', '#16a34a', '#9333ea', '#0891b2', '#ea580c', '#db2777', '#65a30d', '#0d9488', '#b45309', '#64748b'];
  const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const e0 = v => Tarifas.eur(Math.round(+v || 0));
  const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
  const nrm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  /* ---------- A qué programa pertenece cada servicio y cada cobro ---------- */
  function lineaServicio(v) {
    if (!v) return 'Sin programa';
    const t = v.tarifa && Tarifas.de(v.tarifa); if (t) return t.linea;
    const p = nrm(v.producto);
    if (/ruta/.test(p)) return 'Ruta Integral';
    if (/opos|policia|camino/.test(p) || v.oposicion) return 'Camino Opositor';
    if (/elite|zero to fit|futbol/.test(p) || v.modulo_futbol) return 'Élite Player';
    if (/bono|sesion(es)? suelta|sesiones presenciales/.test(p) || esBono(v)) return 'Bonos de sesiones';
    const mod = modalidadSrv(v), ent = v.modulo_entreno ?? true, ali = !!v.modulo_nutricion;
    if (mod === 'presencial') return 'Programa presencial';
    if (mod === 'hibrido') return 'Ruta Integral';
    if (ent && ali) return 'Plan Integral online';
    return ali ? 'Alimentación online' : 'Entrenamiento online';
  }
  /* Programa que tenía en una fecha: el historial guarda los programas anteriores (p. ej. bono → Ruta Integral) */
  const historialDe = v => (Array.isArray(v?.historial) ? v.historial : []).filter(h => h?.desde).sort((a, b) => a.desde.localeCompare(b.desde));
  function lineaEn(v, f) {
    const hs = historialDe(v); let h = f && hs.find(x => x.desde <= f && (!x.hasta || f <= x.hasta));
    if (!h && f && hs.length && v.inicio && f < v.inicio) h = [...hs].reverse().find(x => x.desde <= f) || hs[0];  /* antes de lo conocido: el programa anterior más cercano */
    if (h) { const t = h.tarifa && Tarifas.de(h.tarifa); return t ? t.linea : h.linea || lineaServicio({ producto: h.producto }); }
    return lineaServicio(v);
  }
  const srvAlumno = (aid, f) => { const l = (S.c.srvTodos || S.c.servicios || []).filter(v => v.alumno_id === aid).sort((a, b) => String(b.inicio || '').localeCompare(String(a.inicio || ''))); return (f && l.find(v => !v.inicio || v.inicio <= f)) || l[l.length - 1] || null; };
  function lineaPago(p) {
    const t = p.tarifa && Tarifas.de(p.tarifa); if (t) return t.linea;
    const c = nrm(p.concepto);
    const porNombre = [...Tarifas.T, ...Tarifas.AMP].find(x => c.startsWith(nrm(x.nombre))); if (porNombre) return porNombre.linea;
    if (/ampliaci|renovaci/.test(c)) return /online/.test(c) ? 'Ampliación online' : /aliment/.test(c) ? 'Renovación alimentación' : 'Ampliación Ruta Integral';
    if (/bono|sesion suelta/.test(c)) return 'Bonos de sesiones';
    const v = srvAlumno(p.alumno_id, p.pagado_at || p.vence); return lineaEn(v, p.pagado_at || p.vence);
  }
  /* ¿Se sabe con certeza a qué programa va esta cuota? (tarifa guardada o concepto con el nombre de una tarifa) */
  const pagoSeguro = p => !!(p.tarifa && Tarifas.de(p.tarifa)) || [...Tarifas.T, ...Tarifas.AMP].some(x => nrm(p.concepto).startsWith(nrm(x.nombre)));

  /* ---------- Datos ---------- */
  async function cargar(forzar) {
    if (S.c.srvTodos && !forzar) return;
    const r = await sb.from('servicios').select('*').order('inicio');
    S.c.srvTodos = r.error ? (S.c.servicios || []).slice() : r.data || [];
  }
  function activo(v, hoy) {
    if (!v?.activo) return false;
    const per = S.c.perfiles.find(p => p.id === v.alumno_id); if (!per || per.activo === false) return false;
    if (esBono(v)) { const D = S.c.presenciales ? datosPres(v, S.c.presenciales.filter(p => p.alumno_id === v.alumno_id)) : null; return !D || !D.total || D.quedan > 0 || D.prox.length > 0; }
    const fin = typeof finTotal === 'function' ? finTotal(v) : finProceso(proceso(v)); return !fin || fin >= hoy;
  }
  /* Histórico importado (Economía → Importar histórico): cuenta como cobros, y en sus meses no se suman las cuotas de la app */
  const rangoHist = () => { const [a, b] = String(S.c.fiscal?.historico_rango || '').split('|'); return a && b ? [a, b] : null; };
  const enHist = f => { const r = rangoHist(); return !!(r && f && f.slice(0, 7) >= r[0] && f.slice(0, 7) <= r[1]); };
  function lineaHist(m) {
    const c = nrm(m.programa || m.concepto);
    if (/ruta/.test(c)) return 'Ruta Integral';
    if (/membres/.test(c)) return 'Membresía';
    if (/zero|futbol|elite/.test(c)) return 'Élite Player';
    if (/opos|policia|camino/.test(c)) return 'Camino Opositor';
    if (/presencial/.test(c)) return 'Programa presencial';
    if (/bono|suelto|sesion/.test(c)) return 'Bonos de sesiones';
    if (/online|aliment|nutric/.test(c)) return m.alimentacion && m.entreno !== false ? 'Plan Integral online' : m.alimentacion ? 'Alimentación online' : 'Entrenamiento online';
    if (/pti|basic|asesoria inicial/.test(c)) return 'PTIs y Basic Fit';
    return 'Otros ingresos';
  }
  function datos(anio) {
    const hoy = hoyISO(), ini = `${anio}-01-01`, fin = `${anio}-12-31`, hasta = hoy < fin ? hoy : fin;
    const L = {}, get = n => (L[n] ||= { n, cob: Array(12).fill(0), altas: Array(12).fill(0), pend: 0, venc: 0, alumnosPago: new Set(), activos: [], unico: 0, fracc: 0, conAmp: 0, terminados: 0, ultAlta: null, tarifas: new Set() });
    const mesDe = f => +f.slice(5, 7) - 1;
    let cobAnt = 0; const iniAnt = `${anio - 1}-01-01`, hastaAnt = `${anio - 1}${hasta.slice(4)}`;
    const fam = id => (S.c.servicios || []).some(v => v.alumno_id === id && v.activo !== false && v.tarifa === 'familia');
    for (const m of S.c.movs || []) {
      if (m.tipo !== 'ingreso' || !m.ref) continue;
      const imp = +m.importe || 0;
      if (m.pagado && m.fecha >= iniAnt && m.fecha <= hastaAnt) cobAnt += imp;
      if (m.fecha < ini || m.fecha > fin) continue;
      const x = get(lineaHist(m));
      if (m.pagado) { x.cob[mesDe(m.fecha)] += imp; x.alumnosPago.add('h:' + nrm(m.alumno_nombre || m.concepto)); } else x.pend += imp;
    }
    for (const p of S.c.pagos || []) {
      if (fam(p.alumno_id) && !p.tarifa) continue;
      if (p.pagado_at && enHist(p.pagado_at)) continue;
      const imp = +p.importe || 0;
      if (p.pagado_at && p.pagado_at >= iniAnt && p.pagado_at <= hastaAnt) cobAnt += imp;
      const enAnio = p.pagado_at ? p.pagado_at >= ini && p.pagado_at <= fin : p.vence >= ini && p.vence <= fin;
      if (!enAnio && !(!p.pagado_at && p.vence < ini)) continue;
      const x = get(lineaPago(p));
      if (p.pagado_at) { x.cob[mesDe(p.pagado_at)] += imp; x.alumnosPago.add(p.alumno_id); /* pago compartido: cuenta a partes iguales para cada persona que cubre */ (typeof cubreA === 'function' ? cubreA(p.alumno_id) : []).forEach(o => x.alumnosPago.add(o.id)); }
      else if (p.vence < hoy) x.venc += imp; else if (p.vence <= fin) x.pend += imp;
    }
    const conv = [];
    for (const v of S.c.srvTodos || S.c.servicios || []) {
      if (v.tarifa === 'familia') continue;
      const hs = historialDe(v);
      hs.forEach((h, i) => {
        const lh = lineaEn(v, h.desde), xh = get(lh);
        if (h.desde >= ini && h.desde <= fin && i === 0 && (!v.inicio || h.desde < v.inicio)) xh.altas[mesDe(h.desde)]++;
        const sig = hs[i + 1]?.desde || v.inicio, ls = hs[i + 1] ? lineaEn(v, hs[i + 1].desde) : lineaServicio(v);
        if (sig && sig >= ini && sig <= fin && ls !== lh) conv.push({ de: lh, a: ls, fecha: sig, aid: v.alumno_id });
      });
      const x = get(lineaServicio(v));
      if (v.tarifa) x.tarifas.add(v.tarifa);
      if (v.inicio && v.inicio >= ini && v.inicio <= fin && !hs.length) { x.altas[mesDe(v.inicio)]++; if (v.forma_pago === 'unico') x.unico++; else if (v.forma_pago === 'fracc') x.fracc++; }
      if (v.inicio && (!x.ultAlta || v.inicio > x.ultAlta)) x.ultAlta = v.inicio;
      if (v.inicio && v.inicio >= sumaDias(hoy, -365)) x.altas12 = (x.altas12 || 0) + 1;
      if (activo(v, hoy)) x.activos.push(v);
      const amp = extensionesDe(v).some(x => !['incluida', 'regalo', 'servicio'].includes(x.tipo)), f = !esBono(v) && finProceso(proceso(v));
      if (amp) x.conAmp++; else if (f && f < hoy) x.terminados++;
    }
    const lineas = Object.values(L).map(x => {
      const cob = x.cob.reduce((a, b) => a + b, 0), altas = x.altas.reduce((a, b) => a + b, 0);
      return { ...x, cobT: cob, altasT: altas, porAlumno: x.alumnosPago.size ? cob / x.alumnosPago.size : 0, impago: pct(x.venc, cob + x.venc), renov: x.conAmp + x.terminados >= 1 ? pct(x.conAmp, x.conAmp + x.terminados) : null, pUnico: x.unico + x.fracc ? pct(x.unico, x.unico + x.fracc) : null };
    }).filter(x => x.cobT || x.pend || x.venc || x.activos.length || x.altasT).sort((a, b) => b.cobT - a.cobT || b.activos.length - a.activos.length);
    lineas.forEach((x, i) => { x.color = PAL[i % PAL.length]; });
    const tot = { cob: lineas.reduce((t, x) => t + x.cobT, 0), pend: lineas.reduce((t, x) => t + x.pend, 0), venc: lineas.reduce((t, x) => t + x.venc, 0), activos: new Set(lineas.flatMap(x => x.activos.map(v => v.alumno_id))).size, altas: lineas.reduce((t, x) => t + x.altasT, 0), cobAnt };
    tot.mes = Array(12).fill(0).map((_, m) => lineas.reduce((t, x) => t + x.cob[m], 0));
    tot.altasMes = Array(12).fill(0).map((_, m) => lineas.reduce((t, x) => t + x.altas[m], 0));
    const mesesPasados = anio < +hoy.slice(0, 4) ? 12 : Math.max(1, +hoy.slice(5, 7));
    tot.medioMes = tot.cob / mesesPasados;
    const conCob = tot.mes.map((v, m) => [v, m]).filter(([v]) => v > 0);
    tot.mejorMes = conCob.length ? conCob.sort((a, b) => b[0] - a[0])[0] : null;
    /* Señales: lo que funciona y lo que pide mejora */
    lineas.forEach(x => {
      x.flags = [];
      /* Se vendía (2 o más altas en el último año) y lleva 90 días sin ninguna */
      if (x.altas12 >= 2 && x.ultAlta < sumaDias(hoy, -90) && !/ampliaci|renovaci/i.test(x.n)) x.flags.push(['warn', 'Sin altas en 90 días']);
      if (x.impago >= 10 && x.venc > 0) x.flags.push(['warn', `Impagos ${x.impago} % (cuotas vencidas sin cobrar sobre lo facturado en ${anio})`]);
      if (x.renov != null && x.conAmp + x.terminados >= 3 && x.renov < 30 && !/bono|ampliaci|renovaci/i.test(x.n)) x.flags.push(['warn', `Renuevan poco: ${x.conAmp} de ${x.conAmp + x.terminados} que terminaron (${x.renov} %)`]);
    });
    const sinPrograma = (S.c.pagos || []).filter(p => !pagoSeguro(p) && !fam(p.alumno_id) && !(p.pagado_at && enHist(p.pagado_at)) && (p.pagado_at || p.vence) >= `${anio - 1}-01-01`);
    return { anio, hoy, lineas, tot, conv, sinPrograma, sinTarifa: (S.c.servicios || []).filter(v => v.activo && !v.tarifa), incompletos: incompletos() };
  }

  /* ---------- Vista ---------- */
  function grafica(d) {
    const max = Math.max(1, ...d.tot.mes), top = d.lineas.slice(0, 7), mesAct = d.anio === +d.hoy.slice(0, 4) ? +d.hoy.slice(5, 7) - 1 : 12;
    return `<div class="pg-graf" role="img" aria-label="Ingresos cobrados por mes en ${d.anio}">${MESES.map((m, i) => {
      const segs = top.map(x => x.cob[i] ? `<i style="height:${x.cob[i] / max * 100}%;background:${x.color}" title="${esc(x.n)} · ${e0(x.cob[i])}"></i>` : '').join('');
      const otros = d.tot.mes[i] - top.reduce((t, x) => t + x.cob[i], 0);
      return `<div class="pg-col ${i > mesAct ? 'fut' : ''}" title="${m}: ${e0(d.tot.mes[i])}"><span class="pg-v">${d.tot.mes[i] ? Math.round(d.tot.mes[i] / 100) / 10 + 'k' : ''}</span><div class="pg-bar">${otros > 0 ? `<i style="height:${otros / max * 100}%;background:#94a3b8"></i>` : ''}${segs}</div><span class="pg-m">${m}</span><span class="pg-a">${d.tot.altasMes[i] || ''}</span></div>`;
    }).join('')}</div>
    <div class="row small" style="gap:6px 12px;flex-wrap:wrap">${top.map(x => `<span><i class="ley" style="background:${x.color}"></i>${esc(x.n)}</span>`).join('')}${d.lineas.length > 7 ? '<span><i class="ley" style="background:#94a3b8"></i>Otros</span>' : ''}</div>
    <p class="note" style="margin:0">Barras: cobrado cada mes. Número de abajo: altas de ese mes.${rangoHist() ? ` De ${rangoHist()[0]} a ${rangoHist()[1]} cuenta el histórico importado (facturas + efectivo) en lugar de las cuotas de la app.` : ''}</p>`;
  }
  function vista() {
    if (!S.c.movs && typeof Negocio !== 'undefined' && !S.c._movsPedidos) { S.c._movsPedidos = true; Negocio.cargar().then(render); }
    if (!S.c.srvTodos) { cargar().then(render); return `<section class="section"><div class="card small muted">Cargando programas…</div></section>`; }
    const anio = S.pgAnio || +hoyISO().slice(0, 4), d = datos(anio), t = d.tot, mejores = d.lineas.filter(x => x.cobT > 0).slice(0, 3);
    const varAnt = t.cobAnt ? Math.round((t.cob - t.cobAnt) / t.cobAnt * 100) : null, alertas = d.lineas.filter(x => x.flags.length);
    const kpi = (v, l, sub) => `<div class="kpi"><div class="v num" style="font-size:20px">${v}</div><div class="l">${l}</div>${sub ? `<div class="small muted">${sub}</div>` : ''}</div>`;
    return `<section class="stack"><div class="row" style="gap:8px;flex-wrap:wrap"><h2 class="grow" style="margin:0">Programas</h2>${[anio - 1, anio, anio + 1].filter(y => y <= +hoyISO().slice(0, 4)).map(y => `<button class="pill ${y === anio ? 'blue' : ''}" data-act="pgAnio" data-y="${y}">${y}</button>`).join('')}</div></section>
    <section class="section"><div class="kpis">${kpi(e0(t.cob), `cobrado en ${anio}`, varAnt != null ? `${varAnt >= 0 ? '▲' : '▼'} ${Math.abs(varAnt)} % vs ${anio - 1} a esta fecha` : '')}${kpi(e0(t.pend), 'previsto hasta diciembre', t.venc ? `<span style="color:var(--bad)">${e0(t.venc)} vencido</span>` : 'cuotas pendientes')}${kpi(t.activos, 'con servicio activo', `${t.altas} altas en ${anio}`)}${kpi(e0(t.medioMes), 'media al mes', t.mejorMes ? `mejor: ${MESES[t.mejorMes[1]]} (${e0(t.mejorMes[0])})` : '')}</div></section>
    ${d.incompletos.length ? `<section class="section"><div class="aprox small row" style="gap:8px;flex-wrap:wrap"><span class="grow"><b>${d.incompletos.length} alumno${d.incompletos.length === 1 ? '' : 's'} con el plan sin completar</b> (sin tarifa, sin tipo de programa o sin servicio activo). La app deduce su programa por el nombre del servicio; completarlo hace las métricas exactas.</span><button class="btn sm" data-act="pgSinTarifa">Completar planes</button></div></section>` : ''}
    ${d.sinPrograma.length ? `<section class="section"><div class="aprox small row" style="gap:8px;flex-wrap:wrap"><span class="grow"><b>${d.sinPrograma.length} cuota${d.sinPrograma.length === 1 ? '' : 's'} sin programa confirmado.</b> Se asignan por el programa que tenía el alumno en esa fecha; confírmalas para que los números no bailen.</span><button class="btn sm" data-act="pgCuotas">Revisar cuotas</button></div></section>` : ''}
    <section class="section"><div class="card stack"><b>Ingresos por mes · ${anio}</b>${grafica(d)}</div></section>
    ${d.conv.length ? `<section class="section"><div class="card stack" style="gap:6px"><b>🔁 Cambios de programa en ${anio}</b><span class="small muted">Alumnos que pasaron de un programa a otro (por ejemplo, de sesiones sueltas a Ruta Integral).</span>
      ${Object.entries(d.conv.reduce((acc, c) => { const k = c.de + ' → ' + c.a; (acc[k] ||= []).push(c); return acc; }, {})).sort((a, b) => b[1].length - a[1].length).map(([k, l]) => `<div class="row small" style="gap:8px"><span class="grow"><b>${esc(k)}</b><span class="muted"> · ${l.map(c => esc((S.c.perfiles.find(p => p.id === c.aid)?.nombre || '').split(' ')[0])).join(', ')}</span></span><b>${l.length}</b></div>`).join('')}</div></section>` : ''}
    <section class="section"><div class="card stack" style="gap:0"><div class="row" style="padding-bottom:8px"><b class="grow">Ranking de programas</b><span class="small muted">toca uno para ver el detalle</span></div>
      ${d.lineas.map(x => `<button class="pg-fila" data-act="pgLinea" data-l="${esc(x.n)}"><i class="ley" style="background:${x.color};flex:none"></i><span class="grow stack" style="gap:2px;min-width:0"><b class="small">${esc(x.n)}</b><span class="small muted">${x.activos.length} activo${x.activos.length === 1 ? '' : 's'} · ${x.altasT} alta${x.altasT === 1 ? '' : 's'}${x.porAlumno ? ` · ${e0(x.porAlumno)}/alumno` : ''}${x.renov != null ? ` · renuevan ${x.renov} %` : ''}${x.pUnico != null ? ` · ${x.pUnico} % pago único` : ''}</span>${x.flags.length ? `<span class="row" style="gap:4px;flex-wrap:wrap">${x.flags.map(([c, f]) => `<span class="pill ${c}">${esc(f)}</span>`).join('')}</span>` : ''}<span class="pg-pct"><i style="width:${pct(x.cobT, t.cob)}%;background:${x.color}"></i></span></span><span class="stack" style="align-items:flex-end;gap:2px;flex:none"><b class="num small">${e0(x.cobT)}</b><span class="small muted">${pct(x.cobT, t.cob)} %</span>${x.pend ? `<span class="small muted">+${e0(x.pend)} prev.</span>` : ''}</span></button>`).join('') || '<div class="empty">Aún no hay cobros ni servicios este año.</div>'}</div></section>
    <section class="section"><div class="card stack" style="gap:10px">
      ${d.sinTarifa.length || d.sinPrograma.length ? `<div class="small"><span class="pill gold">Provisional</span> Hay ${d.sinTarifa.length ? `${d.sinTarifa.length} alumno${d.sinTarifa.length === 1 ? '' : 's'} sin tarifa` : ''}${d.sinTarifa.length && d.sinPrograma.length ? ' y ' : ''}${d.sinPrograma.length ? `${d.sinPrograma.length} cuota${d.sinPrograma.length === 1 ? '' : 's'} sin programa confirmado` : ''}: estos análisis pueden cambiar al confirmarlos.</div>` : ''}
      <div class="stack" style="gap:4px"><b class="small">💶 Lo que más ingresa en ${anio}</b><span class="small muted">Solo ingresos cobrados: no mide rentabilidad (faltan costes y tiempo de entrega).</span>${mejores.length ? mejores.map((x, i) => `<span class="small">${i + 1}. <b>${esc(x.n)}</b>: ${e0(x.cobT)} (${pct(x.cobT, t.cob)} % de lo cobrado)${x.renov != null && x.renov >= 50 ? `, renuevan el ${x.renov} %` : ''}.</span>`).join('') : '<span class="small muted">Sin cobros todavía.</span>'}
        ${(() => { const b = d.lineas.filter(x => x.porAlumno).sort((a, b) => b.porAlumno - a.porAlumno)[0]; return b ? `<span class="small">Más ingreso por alumno: <b>${esc(b.n)}</b> (${e0(b.porAlumno)}).</span>` : ''; })()}</div>
      <div class="stack" style="gap:4px"><b class="small">⚠️ Para revisar</b>${alertas.length ? alertas.map(x => `<span class="small"><b>${esc(x.n)}</b>: ${x.flags.map(f => f[1].toLowerCase()).join(', ')}.</span>`).join('') : '<span class="small muted">Nada que destacar ahora mismo.</span>'}</div></div></section>
    <section class="section"><details class="card"><summary><b>Tabla mensual por programa</b></summary><div class="pg-tabla-w"><table class="pg-tabla"><thead><tr><th>Programa</th>${MESES.map(m => `<th>${m}</th>`).join('')}<th>Total</th></tr></thead><tbody>
      ${d.lineas.map(x => `<tr><td><i class="ley" style="background:${x.color}"></i>${esc(x.n)}</td>${x.cob.map(v => `<td>${v ? Math.round(v) : ''}</td>`).join('')}<td><b>${Math.round(x.cobT)}</b></td></tr>`).join('')}
      <tr class="tot"><td>Total cobrado</td>${t.mes.map(v => `<td>${v ? Math.round(v) : ''}</td>`).join('')}<td><b>${Math.round(t.cob)}</b></td></tr>
      <tr><td>Altas</td>${t.altasMes.map(v => `<td>${v || ''}</td>`).join('')}<td><b>${t.altas}</b></td></tr></tbody></table></div>
      <p class="note">Importes en euros cobrados (fecha de pago). Solo cuotas del plan de pagos; los ingresos sueltos de «Caja y gastos» no entran en ningún programa.</p></details></section>
    ${vTarifas()}`;
  }
  /* Detalle de un programa: mes a mes, tarifas y alumnos activos */
  function detalleLinea(n) {
    const anio = S.pgAnio || +hoyISO().slice(0, 4), d = datos(anio), x = d.lineas.find(l => l.n === n); if (!x) return;
    const tars = [...Tarifas.T, ...Tarifas.AMP].filter(t => t.linea === n), nom = id => S.c.perfiles.find(p => p.id === id)?.nombre || '—';
    const maxM = Math.max(1, ...x.cob);
    abrirSheet(`<div class="stack"><span class="eyebrow">Programa · ${anio}</span><h2>${esc(n)}</h2>
      <div class="kpis"><div class="kpi"><div class="v num" style="font-size:18px">${e0(x.cobT)}</div><div class="l">cobrado</div></div><div class="kpi"><div class="v num" style="font-size:18px">${e0(x.pend)}</div><div class="l">previsto</div></div><div class="kpi"><div class="v num" style="font-size:18px">${x.activos.length}</div><div class="l">activos</div></div><div class="kpi"><div class="v num" style="font-size:18px">${x.altasT}</div><div class="l">altas</div></div></div>
      <div class="card stack small" style="gap:4px">${MESES.map((m, i) => `<div class="row" style="gap:8px"><span style="width:32px">${m}</span><span class="pg-pct grow" style="height:10px"><i style="width:${x.cob[i] / maxM * 100}%;background:${x.color}"></i></span><b class="num" style="width:70px;text-align:right">${x.cob[i] ? e0(x.cob[i]) : ''}</b><span class="muted" style="width:44px;text-align:right">${x.altas[i] ? x.altas[i] + ' alta' + (x.altas[i] > 1 ? 's' : '') : ''}</span></div>`).join('')}</div>
      <div class="card stack small" style="gap:4px"><b>Indicadores</b>
        <div class="row"><span class="grow">Ingreso por alumno (${anio})</span><b>${x.porAlumno ? e0(x.porAlumno) : '—'}</b></div>
        <div class="row"><span class="grow">Pago único / fraccionado (altas ${anio})</span><b>${x.pUnico != null ? `${x.pUnico} % / ${100 - x.pUnico} %` : '—'}</b></div>
        <div class="row"><span class="grow">Renuevan (ampliación al terminar)</span><b>${x.renov != null ? `${x.renov} % <span class="muted">(${x.conAmp} de ${x.conAmp + x.terminados})</span>` : '—'}</b></div>
        <div class="row"><span class="grow">Vencido sin cobrar</span><b style="${x.venc ? 'color:var(--bad)' : ''}">${e0(x.venc)}</b></div>
        <div class="row"><span class="grow">Última alta</span><b>${x.ultAlta ? esc(fCorta(x.ultAlta)) : '—'}</b></div></div>
      ${(() => { let tm = {}; try { tm = JSON.parse(S.c.fiscal?.tiempo_lineas || '{}'); } catch (e) { } const m = +tm[n] || 0, h = m / 60;
        return `<div class="card stack small" style="gap:6px"><b>⏱ Tiempo de entrega · por muestra</b><span class="muted">Cronometra a 2 o 3 alumnos de este programa un mes (revisiones, devoluciones, ajustes, mensajes) y apunta la media. Es una estimación, no un control de horas.</span>
          <div class="row" style="gap:8px"><input type="number" id="pg-min" min="0" step="5" value="${m || ''}" placeholder="min al mes por alumno" style="max-width:170px"><button class="btn sm" data-act="pgTiempo" data-l="${esc(n)}">Guardar</button></div>
          ${m ? `<span>≈ <b>${fmtNum(h, 1)} h</b> al mes por alumno · <b>${fmtNum(h * x.activos.length, 1)} h</b> al mes con los ${x.activos.length} activos${x.porAlumno && x.activos.length ? '' : ''}.</span>` : ''}
          <span class="muted">Rentabilidad: faltan los costes de este programa. Con ingresos, costes y este tiempo se podrá estimar.</span></div>`; })()}
      ${tars.length ? `<div class="card stack small" style="gap:4px"><b>Tarifas · lo vendido en ${anio}</b>${tars.map(t => { const cob = (S.c.pagos || []).filter(p => p.tarifa === t.id && p.pagado_at && p.pagado_at.startsWith(String(anio))).reduce((a, p) => a + +p.importe, 0), al = new Set((S.c.pagos || []).filter(p => p.tarifa === t.id && (p.pagado_at || p.vence).startsWith(String(anio))).map(p => p.alumno_id)).size;
        return `<button class="line" data-act="pgTarifa" data-id="${t.id}" style="background:none;border:0;text-align:left;cursor:pointer;width:100%"><span class="grow">${esc(t.nombre)}${t.oferta ? ' <span class="pill gold">oferta</span>' : ''}${t.oculta ? ' <span class="pill">oculta</span>' : ''}<span class="muted" style="display:block">${al} alumno${al === 1 ? '' : 's'} · ${e0(cob)} cobrados · precio ${e0(t.estandar)}</span></span>✎</button>`; }).join('')}</div>` : ''}
      <div class="card stack small" style="gap:2px"><b>Alumnos activos (${x.activos.length})</b>${x.activos.map(v => `<button class="linkbtn small" data-act="ficha" data-id="${v.alumno_id}" style="text-align:left">${esc(nom(v.alumno_id))}${v.inicio ? ` <span class="muted">· desde ${esc(fCorta(v.inicio))}</span>` : ''}</button>`).join('') || '<span class="muted">Ninguno ahora mismo.</span>'}</div>
      <button class="btn ghost full" data-act="cerrarSheet">Cerrar</button></div>`);
  }
  /* ---------- Tarifas y servicios (editables) ---------- */
  function vTarifas() {
    const hoy = hoyISO(), nAl = id => (S.c.srvTodos || []).filter(v => v.tarifa === id && activo(v, hoy)).length;
    const fila = t => { const v = t.srv || {}, ent = [v.meses && `${v.meses} meses`, t.semanas && !v.meses && `${t.semanas} semanas`, (v.sesiones || t.sesiones) && `${v.sesiones || t.sesiones} personales`, v.vi && 'valoración inicial', v.vf && 'valoración final', v.seg === false ? 'sin seguimiento' : null].filter(Boolean).join(' · ');
      return `<button class="pg-tar ${t.oculta ? 'oculta' : ''}" data-act="pgTarifa" data-id="${t.id}"><span class="grow stack" style="gap:2px;min-width:0"><b class="small">${esc(t.nombre)}${t.oculta ? ' <span class="pill">oculta</span>' : ''}${t.nueva ? ' <span class="pill gold">tuya</span>' : ''}${t.oferta ? ` <span class="pill gold">oferta${t.ofHasta ? ' hasta ' + esc(fCorta(t.ofHasta)) : ''}</span>` : ''}</b><span class="small muted">${ent || '—'}</span><span class="small muted">${t.unico !== t.estandar ? `Único ${e0(t.unico)}` : 'Pago único'}${t.fracc ? ` · Fraccionado ${Tarifas.resumenFracc(t.fracc)}` : ''}${t.bonus24 ? ` · 24 h +${t.bonus24}` : ''}${t.bonusUnico ? ` · único +${t.bonusUnico}` : ''}</span></span><span class="stack" style="align-items:flex-end;gap:2px;flex:none"><b class="num">${e0(t.estandar)}</b><span class="small muted">${nAl(t.id)} activo${nAl(t.id) === 1 ? '' : 's'}</span></span></button>`; };
    const grupos = L => [...new Set(L.map(t => t.grupo))].map(g => { const n = matDe(g).length; return `<details class="pg-grupo" ${S.pgGrupoAb === g ? 'open' : ''}><summary><b class="small">${esc(g)}</b><span class="small muted">${n ? `📎 ${n} · ` : ''}${L.filter(t => t.grupo === g).length}</span></summary>${vMaterial(g)}${L.filter(t => t.grupo === g).map(fila).join('')}</details>`; }).join('');
    const todas = [...Tarifas.T, ...Tarifas.AMP];
    return `<section class="section"><div class="section-head"><h2>Tarifas y servicios</h2><div class="row" style="gap:6px"><button class="btn sm ghost" data-act="pgTarifa" data-id="" data-amp="1">＋ Ampliación</button><button class="btn sm" data-act="pgTarifa" data-id="">＋ Tarifa</button></div></div>
      <div class="card stack" style="gap:6px"><span class="small muted">Lo que cambies aquí se aplica a los alumnos que des de alta a partir de ahora. Los planes de pago ya creados no cambian. Dentro de cada programa puedes adjuntar su material (hoja de ruta, flyer, dossier…).</span>
      ${MODS_TAR.map(([k, l, ic]) => { const L = todas.filter(t => modTar(t) === k); return L.length ? `<div class="pg-mod"><b style="display:block;margin:10px 0 2px">${ic} ${l} <span class="small muted" style="font-weight:400">· ${L.filter(t => !t.oculta).length} tarifas</span></b>${grupos(L)}</div>` : ''; }).join('')}</div></section>`;
  }
  /* Modalidad de cada tarifa: la de su servicio; las ampliaciones presenciales de la Ruta son híbridas y el resto online */
  const MODS_TAR = [['online', 'Online', '🌐'], ['presencial', 'Presencial', '🏋️'], ['hibrido', 'Híbrido', '🔀'], ['otros', 'Otros', '•']];
  const modTar = t => t.id === 'familia' ? 'otros' : t.srv?.modalidad || (/^amp-/.test(t.id || '') ? 'hibrido' : /^amp/.test(t.id || '') ? 'online' : 'otros');
  /* ---------- Material de cada programa (imágenes y PDF en el bucket privado; la lista en ajustes_privados «material_programas») ---------- */
  const MAT_URL = {};
  const matTodo = () => { try { return JSON.parse(S.c.fiscal?.material_programas || '{}'); } catch (e) { return {}; } };
  const matDe = g => matTodo()[g] || [];
  async function matGuardar(todo) {
    const v = JSON.stringify(todo), { error } = await sb.from('ajustes_privados').upsert({ clave: 'material_programas', valor: v }, { onConflict: 'clave' });
    if (error) { fallo(error); return false; } (S.c.fiscal ||= {}).material_programas = v; return true;
  }
  function vMaterial(g) {
    const l = matDe(g), faltan = l.map(x => x.ruta).filter(r => !(r in MAT_URL));
    if (faltan.length) { faltan.forEach(r => MAT_URL[r] = null); sb.storage.from('planificacion').createSignedUrls(faltan, 6 * 3600).then(({ data }) => { (data || []).forEach(d => { if (d.signedUrl) MAT_URL[d.path] = d.signedUrl; }); render(); }); }
    return `<div class="stack" style="gap:6px;padding:8px 0 10px 4px"><div class="row" style="gap:8px;flex-wrap:wrap">${l.map((x, i) => { const u = MAT_URL[x.ruta];
      return `<div class="stack" style="gap:2px;width:92px"><a ${u ? `href="${esc(u)}" target="_blank" rel="noopener"` : ''} style="display:flex;align-items:center;justify-content:center;width:92px;height:92px;border-radius:10px;background:var(--surface-2);overflow:hidden;text-decoration:none">${x.pdf ? '<span style="font-size:28px">📄</span>' : u ? `<img src="${esc(u)}" alt="" style="width:100%;height:100%;object-fit:cover">` : '<span class="small muted">…</span>'}</a><span class="small" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(x.nombre)}">${esc(x.nombre)}</span><span class="row" style="gap:4px"><button type="button" class="linkbtn small" data-act="pgMatComp" data-g="${esc(g)}" data-i="${i}">Compartir</button><button type="button" class="linkbtn small" data-act="pgMatDel" data-g="${esc(g)}" data-i="${i}" style="color:var(--bad)">Quitar</button></span></div>`; }).join('')}</div>
      <label class="btn sm ghost" style="align-self:flex-start"><input type="file" accept="image/*,application/pdf" multiple hidden data-mat-up="${esc(g)}">📎 Adjuntar material${l.length ? '' : ' (hoja de ruta, flyer, dossier…)'}</label></div>`;
  }
  async function matSubir(g, files) {
    const todo = matTodo(), l = todo[g] = todo[g] || [], slug = nrm(g).replace(/[^a-z0-9]+/g, '-').slice(0, 30);
    toast('Subiendo…');
    try {
      for (const f of files) {
        const pdf = /pdf/i.test(f.type) || /\.pdf$/i.test(f.name), blob = pdf ? f : await reducirImagen(f, 1800), ruta = `${S.user.id}/material-${slug}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}.${pdf ? 'pdf' : 'jpg'}`;
        const up = await sb.storage.from('planificacion').upload(ruta, blob, { contentType: pdf ? 'application/pdf' : 'image/jpeg' }); if (up.error) throw up.error;
        l.push({ ruta, nombre: f.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 60) || 'Material', pdf, fecha: hoyISO() });
      }
      if (await matGuardar(todo)) { S.pgGrupoAb = g; toast(files.length > 1 ? `${files.length} archivos adjuntados` : 'Adjuntado'); render(); }
    } catch (err) { fallo(err, 'No se ha podido subir el archivo.'); }
  }
  document.addEventListener('change', e => { const g = e.target?.dataset?.matUp; if (g != null && e.target.files?.length) matSubir(g, [...e.target.files]); });
  async function guardarCfg(cfg) {
    const { error } = await sb.from('ajustes_privados').upsert({ clave: 'tarifas', valor: JSON.stringify(cfg) }, { onConflict: 'clave' });
    if (error) { fallo(error); return false; }
    (S.c.fiscal ||= {}).tarifas = JSON.stringify(cfg); Tarifas.cargar(cfg); return true;
  }
  function formTarifa(id, amp) {
    const t = id ? Tarifas.de(id) : null, esAmp = t ? Tarifas.AMP.includes(t) : !!amp, v = t?.srv || {}, cfg = Tarifas.config();
    const grupos = [...new Set([...(esAmp ? Tarifas.AMP : Tarifas.T).map(x => x.grupo)])], lineas = [...new Set([...Tarifas.T, ...Tarifas.AMP].map(x => x.linea))];
    const chk = (i, on, txt) => `<label class="row small" style="gap:8px"><input type="checkbox" id="${i}" ${on ? 'checked' : ''} style="width:20px;height:20px;flex:none"> <span>${txt}</span></label>`;
    const num = (i, l, val, ph = '') => `<label class="f">${l}<input type="text" inputmode="decimal" id="${i}" value="${val ?? ''}" placeholder="${ph}"></label>`;
    abrirSheet(`<form class="stack" id="f-tar"><span class="eyebrow">${esAmp ? 'Ampliación' : 'Tarifa'}</span><h2>${t ? esc(t.nombre) : esAmp ? 'Nueva ampliación' : 'Nueva tarifa'}</h2>
      <label class="f">Nombre (así sale en el servicio y en las cuotas)<input type="text" id="tf-n" value="${esc(t?.nombre || '')}" required></label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><label class="f">Grupo<input type="text" id="tf-g" list="tf-gl" value="${esc(t?.grupo || '')}" required><datalist id="tf-gl">${grupos.map(g => `<option value="${esc(g)}">`).join('')}</datalist></label>
        <label class="f">Programa (métricas)<input type="text" id="tf-l" list="tf-ll" value="${esc(t?.linea || '')}"><datalist id="tf-ll">${lineas.map(g => `<option value="${esc(g)}">`).join('')}</datalist></label></div>
      <div class="card stack" style="padding:12px;gap:8px"><b class="small">Precio</b>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${num('tf-pe', 'Precio estándar (€)', t?.estandar)}${num('tf-pu', 'Pago único (€)', t?.unico, 'igual que el estándar')}</div>
        <label class="f">Fraccionado <span class="muted small">(ej. «200 + 2 x 125» o «6 x 316»; vacío = sin fraccionar)</span><input type="text" id="tf-fr" value="${esc(t?.fracc ? Tarifas.resumenFracc(t.fracc).replace(/ €/g, '').replace(/×/g, 'x') : '')}"></label>
        <span class="small muted" id="tf-fr-t"></span>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${num('tf-b24', 'Bonus decidir en 24 h (+ entrenos)', t?.bonus24 || '')}${num('tf-bu', 'Bonus pago único (+ entrenos)', t?.bonusUnico || '')}</div>
        ${esAmp ? '' : `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${num('tf-xa', 'Extra con alimentación (€)', t?.extraAli || '')}<label class="f">Texto del extra<input type="text" id="tf-xat" value="${esc(t?.extraAliTxt || '')}" placeholder="+50 €/mes"></label></div>`}
        <label class="f">Otros bonus (texto)<input type="text" id="tf-bt" value="${esc(t?.bonusTxt || '')}"></label></div>
      <div class="card stack" style="padding:12px;gap:8px"><b class="small">Entrega del servicio</b>
        ${esAmp ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${num('tf-sem', 'Semanas que alarga', t?.semanas || 13)}${num('tf-ses', 'Entrenamientos personales', t?.sesiones || '')}</div>`
          : `<div class="chips" id="tf-mod">${Object.entries(TIPOS_PROG).map(([k, l]) => `<button type="button" class="pill ${v.modalidad === k ? 'blue' : ''}" data-v="${k}">${l}</button>`).join('')}</div>
        <div class="row" style="gap:14px;flex-wrap:wrap">${chk('tf-ent', v.ent ?? true, 'Entrenamiento')}${chk('tf-ali', v.ali, 'Alimentación')}${chk('tf-bono', v.bono, 'Es bono de sesiones')}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">${num('tf-me', 'Meses', v.meses || '')}${num('tf-ses', 'Personales', v.sesiones || '')}<label class="f">Frecuencia<select id="tf-fq"><option value="">—</option>${Object.entries(Tarifas.FREC).map(([k, l]) => `<option value="${k}" ${v.frec === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
        <div class="row" style="gap:14px;flex-wrap:wrap">${chk('tf-vi', v.vi, 'Valoración inicial')}${chk('tf-vf', v.vf, 'Valoración final')}${chk('tf-seg', v.seg ?? true, 'Seguimiento (revisión, check-in, avisos)')}${chk('tf-fut', v.futbol, 'Fútbol')}${chk('tf-opo', v.oposicion, 'Oposición')}</div>`}</div>
      <div class="card stack" style="padding:12px;gap:8px">${chk('tf-of', t?.oferta, '<b>Es una oferta</b> (verano, temporada baja…): solo se puede elegir entre estas fechas')}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><label class="f">Desde<input type="date" id="tf-od" value="${esc(t?.ofDesde || '')}"></label><label class="f">Hasta<input type="date" id="tf-oh" value="${esc(t?.ofHasta || '')}"></label></div></div>
      ${chk('tf-oc', t?.oculta && !t?.caducada, 'Ocultar (no sale al elegir tarifa; los alumnos que la tienen la conservan)')}
      <p class="err" id="tf-err"></p>
      <div class="row" style="gap:8px;flex-wrap:wrap">${t && !t.nueva && cfg.cambios[t.id] ? '<button type="button" class="btn ghost" id="tf-rst">Volver al original</button>' : ''}${t?.nueva ? '<button type="button" class="btn ghost" id="tf-del" style="color:var(--bad)">Eliminar</button>' : ''}<button class="btn grow" type="submit">Guardar</button></div></form>`);
    let mod = v.modalidad || 'online';
    $('#tf-mod')?.addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (!b) return; mod = b.dataset.v; document.querySelectorAll('#tf-mod .pill').forEach(x => x.classList.toggle('blue', x === b)); });
    const vfr = () => { const f = Tarifas.leeCuotas($('#tf-fr').value); $('#tf-fr-t').textContent = !$('#tf-fr').value.trim() ? '' : f ? `${f.length} cuota${f.length > 1 ? 's' : ''} · total ${Tarifas.eur(f.reduce((a, b) => a + b, 0))}` : 'No lo entiendo: escribe por ejemplo «200 + 2 x 125»'; };
    vfr(); $('#tf-fr').addEventListener('input', vfr);
    const n = q => { const x = numero($(q)?.value); return x == null || isNaN(x) ? null : x; };
    $('#f-tar').addEventListener('submit', async e => {
      e.preventDefault();
      const pe = n('#tf-pe'); if (!(pe > 0)) return $('#tf-err').textContent = 'Pon el precio estándar';
      const fr = $('#tf-fr').value.trim() ? Tarifas.leeCuotas($('#tf-fr').value) : null; if ($('#tf-fr').value.trim() && !fr) return $('#tf-err').textContent = 'Revisa el fraccionado';
      const datosT = { nombre: $('#tf-n').value.trim(), grupo: $('#tf-g').value.trim() || 'Otros', linea: $('#tf-l').value.trim() || undefined, estandar: pe, unico: n('#tf-pu') ?? pe, fracc: fr,
        bonus24: n('#tf-b24') || undefined, bonusUnico: n('#tf-bu') || undefined, bonusTxt: $('#tf-bt').value.trim() || undefined,
        oferta: $('#tf-of').checked || undefined, ofDesde: $('#tf-of').checked ? $('#tf-od').value || undefined : undefined, ofHasta: $('#tf-of').checked ? $('#tf-oh').value || undefined : undefined };
      if (esAmp) Object.assign(datosT, { semanas: n('#tf-sem') || 13, sesiones: n('#tf-ses') || undefined });
      else Object.assign(datosT, { extraAli: n('#tf-xa') || undefined, extraAliTxt: $('#tf-xat').value.trim() || undefined,
        srv: { modalidad: mod, ent: $('#tf-ent').checked, ali: $('#tf-ali').checked, bono: $('#tf-bono').checked || undefined, meses: n('#tf-me') || undefined, sesiones: n('#tf-ses') || undefined, frec: $('#tf-fq').value || undefined, vi: $('#tf-vi').checked, vf: $('#tf-vf').checked, seg: $('#tf-seg').checked, futbol: $('#tf-fut').checked || undefined, oposicion: $('#tf-opo').checked || undefined } });
      const limpio = o => JSON.parse(JSON.stringify(o));
      if (!t || t.nueva) {
        const idN = t?.id || 'tf' + Date.now().toString(36), nueva = limpio({ ...datosT, id: idN, amp: esAmp || undefined });
        cfg.nuevas = [...(cfg.nuevas || []).filter(x => x.id !== idN), nueva];
      } else {
        const b = t.base, dif = {};
        for (const [k, val] of Object.entries(limpio(datosT))) { if (k === 'srv') { const ds = {}; for (const [k2, v2] of Object.entries(val)) if (JSON.stringify(v2) !== JSON.stringify(b.srv?.[k2])) ds[k2] = v2; if (Object.keys(ds).length) dif.srv = ds; } else if (JSON.stringify(val) !== JSON.stringify(b[k])) dif[k] = val; }
        if (!('fracc' in datosT && datosT.fracc) && b.fracc) dif.fracc = null;
        if (Object.keys(dif).length) cfg.cambios[t.id] = dif; else delete cfg.cambios[t.id];
      }
      const idF = t?.id || cfg.nuevas[cfg.nuevas.length - 1].id;
      cfg.ocultas = (cfg.ocultas || []).filter(x => x !== idF); if ($('#tf-oc').checked) cfg.ocultas.push(idF);
      if (await guardarCfg(cfg)) { cerrarSheet(); toast('Tarifa guardada'); render(); }
    });
    $('#tf-rst')?.addEventListener('click', async () => { delete cfg.cambios[t.id]; if (await guardarCfg(cfg)) { cerrarSheet(); toast('Tarifa original recuperada'); render(); } });
    $('#tf-del')?.addEventListener('click', async () => { if (!confirm('¿Eliminar esta tarifa? Los alumnos que la tengan la conservan como texto.')) return; cfg.nuevas = cfg.nuevas.filter(x => x.id !== t.id); cfg.ocultas = (cfg.ocultas || []).filter(x => x !== t.id); if (await guardarCfg(cfg)) { cerrarSheet(); toast('Tarifa eliminada'); render(); } });
  }
  /* Cuotas sin programa confirmado: se propone el programa que tenía el alumno en esa fecha y se guarda la tarifa en la cuota */
  function formCuotas() {
    const anio = S.pgAnio || +hoyISO().slice(0, 4), l = datos(anio).sinPrograma.sort((a, b) => (a.alumno_id || '').localeCompare(b.alumno_id || '') || String(a.vence).localeCompare(String(b.vence)));
    const nom = id => S.c.perfiles.find(p => p.id === id)?.nombre || '—', todas = [...Tarifas.T, ...Tarifas.AMP];
    const sug = p => { const v = srvAlumno(p.alumno_id, p.pagado_at || p.vence), f = p.pagado_at || p.vence, hs = v ? historialDe(v) : [];
      const h = hs.find(x => x.desde <= f && (!x.hasta || f <= x.hasta)) || (hs.length && v.inicio && f < v.inicio ? [...hs].reverse().find(x => x.desde <= f) || hs[0] : null);
      if (h?.tarifa) return h.tarifa; if (!h && v?.tarifa) return v.tarifa; const ln = lineaPago(p), c = todas.filter(t => t.linea === ln); return (c.find(t => Math.abs(t.estandar - p.importe) < 1 || Math.abs((t.unico || 0) - p.importe) < 1 || (t.fracc || []).some(x => Math.abs(x - p.importe) < 1)) || c[0] || {}).id || ''; };
    const porAl = {}; l.forEach(p => (porAl[p.alumno_id] ||= []).push(p));
    abrirSheet(`<form class="stack" id="f-cq"><h2>Revisar cuotas</h2><p class="small muted">Elige a qué tarifa pertenece cada cuota. El importe que cuenta es siempre el que cobraste de verdad, aunque el precio de la tarifa haya cambiado o fuera una oferta. Si una tarifa antigua ya no existe, créala en «＋ Tarifa» (puedes ocultarla después).</p>
      ${Object.entries(porAl).map(([aid, ps]) => `<details class="pg-grupo" open><summary><b class="small">${esc(nom(aid))}</b><span class="small muted">${ps.length}</span></summary>${ps.map(p => `<div class="stack" style="gap:2px;padding:6px 0 6px 8px;border-top:1px dashed var(--line)"><span class="small"><b class="num">${e0(p.importe)}</b> · ${esc(fCorta(p.pagado_at || p.vence))}${p.pagado_at ? '' : ' <span class="muted">(pendiente)</span>'} · <span class="muted">${esc(p.concepto || '')}</span></span><select data-cq="${p.id}"><option value="">Sin confirmar</option>${Tarifas.opciones(todas, sug(p))}</select></div>`).join('')}</details>`).join('') || '<div class="empty">No hay cuotas por revisar.</div>'}
      <p class="err" id="cq-err"></p><button class="btn full" type="submit">Guardar</button></form>`);
    $('#f-cq').addEventListener('submit', async e => {
      e.preventDefault(); const bt = e.target.querySelector('[type=submit]'); bt.disabled = true; bt.textContent = 'Guardando…';
      const porT = {}; document.querySelectorAll('[data-cq]').forEach(s => { if (s.value) (porT[s.value] ||= []).push(+s.dataset.cq); });
      for (const [tid, ids] of Object.entries(porT)) { const { error } = await sb.from('pagos').update({ tarifa: tid }).in('id', ids); if (error) { bt.disabled = false; bt.textContent = 'Guardar'; return $('#cq-err').textContent = /tarifa/.test(error.message || '') ? 'Falta ejecutar el Bloque 89 en Supabase.' : error.message; } S.c.pagos.forEach(p => { if (ids.includes(p.id)) p.tarifa = tid; }); }
      cerrarSheet(); toast('Cuotas confirmadas'); render();
    });
  }
  /* Asignar tarifa a los alumnos activos que no la tienen (solo para las métricas: no crea pagos) */
  /* Alumnos con el plan a medias: servicio activo sin tarifa o sin tipo de programa, o cliente activo sin servicio */
  function incompletos() {
    const fam = id => typeof esFamilia === 'function' && esFamilia(id), r = [];
    (S.c.servicios || []).filter(v => v.activo && !fam(v.alumno_id) && (!v.tarifa || !v.modalidad)).forEach(v => r.push({ v, aid: v.alumno_id, faltan: [!v.modalidad && 'tipo de programa', !v.tarifa && 'tarifa'].filter(Boolean) }));
    (S.c.perfiles || []).filter(p => typeof esCliente === 'function' && esCliente(p) && !(S.c.servicios || []).some(v => v.alumno_id === p.id && v.activo)).forEach(p => r.push({ v: null, aid: p.id, faltan: ['servicio activo'] }));
    return r;
  }
  function formSinTarifa() {
    const inc = incompletos(), l = inc.filter(x => x.v).map(x => x.v), sinSrv = inc.filter(x => !x.v), nom = id => S.c.perfiles.find(p => p.id === id)?.nombre || '—', falta = v => inc.find(x => x.v === v)?.faltan || [];
    const sug = v => { const ln = lineaServicio(v), m = v.meses || (v.duracion_semanas ? [3, 6, 9, 10, 12].find(x => Math.abs(Tarifas.mesesSem[x] - v.duracion_semanas) <= 2) : null);
      const c = Tarifas.T.filter(t => t.linea === ln && !t.oculta); return (c.find(t => t.srv?.meses === m && (!t.srv?.frec || t.srv.frec === v.pt_frecuencia)) || c.find(t => t.srv?.meses === m) || (esBono(v) && c.find(t => t.srv?.sesiones === v.sesiones_incluidas)) || {}).id || ''; };
    abrirSheet(`<form class="stack" id="f-st"><h2>Completar planes</h2><p class="small muted">Elige el programa de cada alumno: se guarda su tarifa y, si le falta, el tipo (presencial, online o híbrido), los meses y si lleva entreno y alimentación. No crea ni cambia pagos. Te propongo uno según su servicio; cámbialo si no es.</p>
      ${l.map(v => `<div class="stack" style="gap:2px;border-top:1px solid var(--line);padding-top:8px"><div class="row small" style="gap:6px"><b class="grow">${esc(nom(v.alumno_id))}</b>${falta(v).map(f => `<span class="pill warn">sin ${esc(f)}</span>`).join('')}</div><span class="small muted">${esc(v.producto || '—')}${v.inicio ? ' · desde ' + esc(fCorta(v.inicio)) : ''}</span><select data-st="${v.id}"><option value="">${v.tarifa ? 'Dejar su tarifa' : 'Sin tarifa'}</option>${Tarifas.opciones([...Tarifas.T, ...Tarifas.AMP], v.tarifa || sug(v))}</select></div>`).join('')}
      ${sinSrv.length ? `<div class="stack" style="gap:4px;border-top:1px solid var(--line);padding-top:8px"><b class="small">Sin servicio activo (${sinSrv.length})</b><span class="small muted">Ábrelos para darles de alta su programa, o archívalos si ya no son alumnos.</span>${sinSrv.map(x => `<div class="row small" style="gap:8px"><span class="grow">${esc(nom(x.aid))}</span><button type="button" class="btn sm ghost" data-act="ficha" data-id="${esc(x.aid)}">Abrir ficha</button></div>`).join('')}</div>` : ''}
      <p class="err" id="st-err"></p><button class="btn full" type="submit">Guardar</button></form>`);
    $('#f-st').addEventListener('submit', async e => {
      e.preventDefault(); const bt = e.target.querySelector('[type=submit]'); bt.disabled = true;
      for (const s of document.querySelectorAll('[data-st]')) {
        const v = l.find(x => x.id === +s.dataset.st), t = s.value && Tarifas.de(s.value); if (!v || (!s.value && v.modalidad)) continue;
        const up = s.value ? { tarifa: s.value } : {}, ts = t?.srv || {};
        if (!v.modalidad && ts.modalidad) Object.assign(up, { modalidad: ts.modalidad, modulo_entreno: ts.ent !== false || (v.modulo_entreno ?? true), modulo_nutricion: !!ts.ali || !!v.modulo_nutricion, ...(ts.seg != null ? { seguimiento: !!ts.seg } : {}) });
        if (!v.meses && ts.meses) up.meses = ts.meses;
        if (!Object.keys(up).length) continue;
        let { error } = await sb.from('servicios').update(up).eq('id', v.id);
        if (error && /modalidad|meses|seguimiento/.test(error.message || '')) ({ error } = await sb.from('servicios').update({ tarifa: s.value }).eq('id', v.id));
        if (error) { bt.disabled = false; return $('#st-err').textContent = /tarifa/.test(error.message || '') ? 'Falta ejecutar el Bloque 88 en Supabase.' : error.message; }
      }
      cerrarSheet(); toast('Planes guardados'); await cargarCoach(); await cargar(true); render();
    });
  }
  document.addEventListener('click', async ev => {
    const b = ev.target.closest('[data-act]'); if (!b) return; const a = b.dataset.act; if (!a.startsWith('pg')) return;
    if (a === 'pgAnio') { S.pgAnio = +b.dataset.y; render(); }
    else if (a === 'pgLinea') detalleLinea(b.dataset.l);
    else if (a === 'pgTarifa') formTarifa(b.dataset.id || null, b.dataset.amp === '1');
    else if (a === 'pgSinTarifa') formSinTarifa();
    else if (a === 'pgMatDel') { const todo = matTodo(), l = todo[b.dataset.g] || [], x = l[+b.dataset.i]; if (!x || !confirm(`¿Quitar «${x.nombre}» del material de ${b.dataset.g}?`)) return; l.splice(+b.dataset.i, 1); if (await matGuardar(todo)) { sb.storage.from('planificacion').remove([x.ruta]); S.pgGrupoAb = b.dataset.g; render(); } }
    else if (a === 'pgMatComp') { const x = matDe(b.dataset.g)[+b.dataset.i]; if (!x) return; const { data, error } = await sb.storage.from('planificacion').createSignedUrl(x.ruta, 7 * 86400); if (error || !data?.signedUrl) return fallo(error || {}, 'No se ha podido crear el enlace.'); const u = data.signedUrl;
      if (navigator.share) { try { await navigator.share({ title: x.nombre, url: u }); return; } catch (er) { if (er?.name === 'AbortError') return; } }
      try { await navigator.clipboard.writeText(u); toast('Enlace copiado (vale 7 días)'); } catch (er) { prompt('Copia el enlace (vale 7 días):', u); } }
    else if (a === 'pgCuotas') formCuotas();
    else if (a === 'pgTiempo') { let tm = {}; try { tm = JSON.parse(S.c.fiscal?.tiempo_lineas || '{}'); } catch (e) { } tm[b.dataset.l] = Math.max(0, +$('#pg-min').value || 0); const v = JSON.stringify(tm);
      sb.from('ajustes_privados').upsert({ clave: 'tiempo_lineas', valor: v }, { onConflict: 'clave' }).then(({ error }) => { if (error) return fallo(error); S.c.fiscal.tiempo_lineas = v; toast('Tiempo guardado'); detalleLinea(b.dataset.l); }); }
  });
  return { vista, cargar, lineaServicio, lineaPago, lineaEn, historialDe, datos };
})();
window.Programas = Programas;
