/* =========================================================================
   Tarifas de La Obra Fitness (noviembre 2026)
   Al elegir una tarifa en el servicio del alumno, la app rellena el programa
   (tipo, meses, entrenamientos personales, valoraciones, seguimiento) y genera
   su plan de pagos: pago único (con su descuento o bonus) o fraccionado.
   PARA CAMBIAR UN PRECIO: cámbialo aquí y sube la versión.
   ========================================================================= */
const Tarifas = (() => {
  const rep = (n, v) => Array(n).fill(v);
  const mesesSem = { 3: 13, 6: 25, 9: 39, 10: 43, 12: 52 };
  /* Reparte un total en n cuotas con céntimos exactos (lo que sobra va a la primera) */
  function reparte(total, n) {
    const c = Math.round(total * 100), base = Math.floor(c / n), r = c - base * n;
    return [...Array(n)].map((_, i) => (base + (i === 0 ? r : 0)) / 100);
  }
  const D10 = x => Math.round(x * 0.9 * 100) / 100;
  /* Programas presenciales (acompañamiento): precio por meses y frecuencia de entrenamientos personales */
  const PRES = [[3, '1s', 850], [6, '2m', 1000], [6, '1s', 1550], [10, '1m', 1000], [10, '2m', 1500], [10, '1s', 2200]];
  const sesPres = (m, f) => f === '1s' ? mesesSem[m] : f === '2m' ? 2 * m : m;
  const FREC = { '1s': '1 día/semana', '2s': '2 días/semana', '2m': '2 días/mes', '1m': '1 día/mes' };

  /* Catálogo. srv = cómo queda el servicio; precio: estandar, unico (pago único en 24 h), fracc (cuotas), bonusUnico/bonus24 = entrenamientos regalo */
  const T = [
    // Online
    { id: 'ali3', grupo: 'Online', nombre: 'Plan de alimentación y suplementación · 3 meses', srv: { modalidad: 'online', ent: false, ali: true, meses: 3, seg: true }, estandar: 300, unico: 300, fracc: null },
    { id: 'int3', grupo: 'Online', nombre: 'Plan Integral online · 3 meses', srv: { modalidad: 'online', ent: true, ali: true, meses: 3, seg: true }, estandar: 450, unico: 405, fracc: [200, 125, 125] },
    { id: 'int6', grupo: 'Online', nombre: 'Plan Integral online · 6 meses', srv: { modalidad: 'online', ent: true, ali: true, meses: 6, seg: true }, estandar: 750, unico: 675, fracc: [200, ...rep(4, 137.5)] },
    { id: 'int9', grupo: 'Online', nombre: 'Plan Integral online · 9 meses', srv: { modalidad: 'online', ent: true, ali: true, meses: 9, seg: true }, estandar: 900, unico: 810, fracc: [200, ...rep(5, 122)] },
    { id: 'ent3', grupo: 'Online', nombre: 'Plan de Entrenamiento online · 3 meses', srv: { modalidad: 'online', ent: true, ali: false, meses: 3, seg: true }, estandar: 400, unico: D10(400), fracc: [200, 100, 100] },
    { id: 'ent6', grupo: 'Online', nombre: 'Plan de Entrenamiento online · 6 meses', srv: { modalidad: 'online', ent: true, ali: false, meses: 6, seg: true }, estandar: 650, unico: D10(650), fracc: [200, ...rep(5, 90)] },
    { id: 'ent9', grupo: 'Online', nombre: 'Plan de Entrenamiento online · 9 meses', srv: { modalidad: 'online', ent: true, ali: false, meses: 9, seg: true }, estandar: 800, unico: D10(800), fracc: [200, ...rep(8, 75)] },
    // Ruta Integral (híbrido: entrenamientos personales + entreno + alimentación y suplementación)
    { id: 'ruta3', grupo: 'Ruta Integral (híbrido)', nombre: 'Ruta Integral · 3 meses', srv: { modalidad: 'hibrido', ent: true, ali: true, meses: 3, sesiones: 10, vi: true, vf: false, seg: true }, estandar: 1248, unico: 1150, fracc: rep(3, 416), bonus24: 2 },
    { id: 'ruta6', grupo: 'Ruta Integral (híbrido)', nombre: 'Ruta Integral · 6 meses', srv: { modalidad: 'hibrido', ent: true, ali: true, meses: 6, sesiones: 15, vi: true, vf: false, seg: true }, estandar: 1896, unico: 1700, fracc: rep(6, 316), bonus24: 2 },
    { id: 'ruta10', grupo: 'Ruta Integral (híbrido)', nombre: 'Ruta Integral · 10 meses', srv: { modalidad: 'hibrido', ent: true, ali: true, meses: 10, sesiones: 20, vi: true, vf: true, seg: true }, estandar: 2500, unico: 2200, fracc: rep(10, 250), bonus24: 2 },
    // Programas presenciales de acompañamiento (solo entrenamiento; +300 € con alimentación y suplementación)
    ...PRES.map(([m, f, p]) => ({ id: `pres${m}-${f}`, grupo: 'Programa presencial', nombre: `Programa presencial · ${m} meses · ${FREC[f]}`, srv: { modalidad: 'presencial', ent: true, ali: false, meses: m, frec: f, sesiones: sesPres(m, f), vi: true, vf: m >= 6, seg: true }, estandar: p, unico: D10(p), fracc: reparte(p, m), extraAli: 300 })),
    // Camino Opositor (Policía Nacional): test y revisión presencial cada mes + entrenamientos personales según formato.
    // Bonus 24 h: valoración inicial incluida. Pago único: +1 entrenamiento. Alimentación +50 €/mes (solo 6 y 10 meses)
    ...PRES.map(([m, f, p]) => ({ id: `opo${m}-${f}`, grupo: 'Camino Opositor', nombre: `Camino Opositor · ${m} meses · ${FREC[f]}`, srv: { modalidad: 'presencial', ent: true, ali: false, meses: m, frec: f, sesiones: sesPres(m, f), vi: false, vf: false, seg: true, oposicion: true }, estandar: p, unico: p, fracc: reparte(p, m), bonusUnico: 1, bonus24Val: true, ...(m >= 6 ? { extraAli: 50 * m, extraAliTxt: '+50 €/mes' } : {}) })),
    // Élite Player (futbolistas): pago único + acción inmediata = 3 entrenamientos virtuales 1a1 y plan de hábitos de profesional
    { id: 'elite3', grupo: 'Élite Player', nombre: 'Élite Player · 3 meses', srv: { modalidad: 'online', ent: true, ali: true, meses: 3, seg: true, futbol: true }, estandar: 540, unico: 540, fracc: rep(3, 180), bonusTxt: 'Acción inmediata + pago único: 3 entrenamientos virtuales 1a1 y plan de hábitos de profesional' },
    { id: 'elite6', grupo: 'Élite Player', nombre: 'Élite Player · 6 meses', srv: { modalidad: 'online', ent: true, ali: true, meses: 6, seg: true, futbol: true }, estandar: 900, unico: 900, fracc: rep(6, 150), bonusTxt: 'Acción inmediata + pago único: 3 entrenamientos virtuales 1a1 y plan de hábitos de profesional' },
    { id: 'elite12', grupo: 'Élite Player', nombre: 'Élite Player · 1 temporada', srv: { modalidad: 'online', ent: true, ali: true, meses: 12, seg: true, futbol: true }, estandar: 1440, unico: 1440, fracc: rep(12, 120), bonusTxt: 'Acción inmediata + pago único: 3 entrenamientos virtuales 1a1 y plan de hábitos de profesional' },
    // Bonos de entrenamientos personales (sin seguimiento, sin caducidad)
    { id: 'bono1', grupo: 'Bono de sesiones', nombre: 'Sesión suelta', srv: { modalidad: 'presencial', bono: true, ent: true, ali: false, sesiones: 1, seg: false }, estandar: 60, unico: 60, fracc: null },
    { id: 'bono5', grupo: 'Bono de sesiones', nombre: 'Bono 5 sesiones', srv: { modalidad: 'presencial', bono: true, ent: true, ali: false, sesiones: 5, seg: false }, estandar: 275, unico: 275, fracc: null },
    { id: 'familia', grupo: 'Familia y pruebas', nombre: 'Familia / pruebas (no es cliente)', srv: { modalidad: 'hibrido', ent: true, ali: true, seg: false }, estandar: 0, unico: 0, fracc: null },
    { id: 'bonoverano10', grupo: 'Bono de sesiones', nombre: 'Bono verano 10 sesiones', oferta: true, ofDesde: '2026-06-01', ofHasta: '2026-09-30', srv: { modalidad: 'presencial', bono: true, ent: true, ali: false, sesiones: 10, seg: false }, estandar: 300, unico: 300, fracc: null },
    { id: 'bono8', grupo: 'Bono de sesiones', nombre: 'Bono 8 sesiones', srv: { modalidad: 'presencial', bono: true, ent: true, ali: false, sesiones: 8, seg: false }, estandar: 400, unico: 400, fracc: [200, 200] },
    { id: 'bono12', grupo: 'Bono de sesiones', nombre: 'Bono 12 sesiones', srv: { modalidad: 'presencial', bono: true, ent: true, ali: false, sesiones: 12, seg: false }, estandar: 550, unico: 550, fracc: reparte(550, 3) },
    { id: 'bono20', grupo: 'Bono de sesiones', nombre: 'Bono 20 sesiones (con valoración inicial)', srv: { modalidad: 'presencial', bono: true, ent: true, ali: false, sesiones: 20, vi: true, seg: false }, estandar: 900, unico: 900, fracc: [300, 300, 300] },
  ];
  /* Ampliaciones (al terminar un proceso). semanas = lo que alargan */
  const AMP = [
    { id: 'amp-1m', grupo: 'Ampliación Ruta Integral (trimestral)', nombre: 'Ampliación Ruta Integral · 1 día/mes', semanas: 13, frec: '1m', sesiones: 3, estandar: 360, unico: 360, fracc: reparte(360, 3), bonusUnico: 1 },
    { id: 'amp-2m', grupo: 'Ampliación Ruta Integral (trimestral)', nombre: 'Ampliación Ruta Integral · 2 días/mes', semanas: 13, frec: '2m', sesiones: 6, estandar: 450, unico: 450, fracc: reparte(450, 3), bonusUnico: 1 },
    { id: 'amp-1s', grupo: 'Ampliación Ruta Integral (trimestral)', nombre: 'Ampliación Ruta Integral · 1 día/semana', semanas: 13, frec: '1s', sesiones: 13, estandar: 700, unico: 700, fracc: reparte(700, 3), bonusUnico: 1 },
    { id: 'amp-2s', grupo: 'Ampliación Ruta Integral (trimestral)', nombre: 'Ampliación Ruta Integral · 2 días/semana', semanas: 13, frec: '2s', sesiones: 26, estandar: 1190, unico: 1190, fracc: reparte(1190, 3), bonusUnico: 2 },
    { id: 'ampon3', grupo: 'Ampliación Ruta Integral online', nombre: 'Ampliación online · 3 meses', semanas: 13, meses: 3, estandar: 330, unico: D10(330), fracc: rep(3, 110) },
    { id: 'ampon6', grupo: 'Ampliación Ruta Integral online', nombre: 'Ampliación online · 6 meses', semanas: 25, meses: 6, estandar: 540, unico: D10(540), fracc: rep(6, 90) },
    { id: 'ampon9', grupo: 'Ampliación Ruta Integral online', nombre: 'Ampliación online · 9 meses', semanas: 39, meses: 9, estandar: 670, unico: D10(670), fracc: [...rep(8, 75), 70] },
    { id: 'ampon12', grupo: 'Ampliación Ruta Integral online', nombre: 'Ampliación online · 1 año', semanas: 52, meses: 12, estandar: 720, unico: D10(720), fracc: rep(12, 60) },
    { id: 'ampali', grupo: 'Ampliación de alimentación', nombre: 'Renovación alimentación y suplementación · trimestre', semanas: 13, meses: 3, estandar: 100, unico: 100, fracc: null },
  ];
  /* Línea de producto (para las métricas): agrupa las tarifas de un mismo programa */
  const LINEAS = [[/^ali3/, 'Alimentación online'], [/^int/, 'Plan Integral online'], [/^ent\d/, 'Entrenamiento online'], [/^ruta/, 'Ruta Integral'], [/^pres/, 'Programa presencial'],
    [/^opo/, 'Camino Opositor'], [/^elite/, 'Élite Player'], [/^bono/, 'Bonos de sesiones'], [/^amp-/, 'Ampliación Ruta Integral'], [/^ampon/, 'Ampliación online'], [/^ampali/, 'Renovación alimentación']];
  const lineaDe = t => t?.linea || (LINEAS.find(([re]) => re.test(t?.id || '')) || [])[1] || t?.grupo || 'Otros';
  [...T, ...AMP].forEach(t => { t.linea = lineaDe(t); t.base = JSON.parse(JSON.stringify(t)); });
  /* Cambios del coach (Economía → Programas): se guardan en ajustes_privados («tarifas») y se aplican encima del catálogo:
     { cambios: { id: {campos} }, nuevas: [tarifa…], ocultas: [id…] } */
  let cfg = { cambios: {}, nuevas: [], ocultas: [] };
  function cargar(json) {
    try { cfg = Object.assign({ cambios: {}, nuevas: [], ocultas: [] }, typeof json === 'string' ? JSON.parse(json || '{}') : (json || {})); } catch (e) { cfg = { cambios: {}, nuevas: [], ocultas: [] }; }
    for (const L of [T, AMP]) { for (let i = L.length - 1; i >= 0; i--) if (L[i].nueva) L.splice(i, 1); L.forEach(t => { const id = t.id, b = JSON.parse(JSON.stringify(t.base)); Object.keys(t).forEach(k => { if (k !== 'base') delete t[k]; }); Object.assign(t, b, cfg.cambios[id] || {}); if (cfg.cambios[id]?.srv) t.srv = { ...b.srv, ...cfg.cambios[id].srv }; t.linea = lineaDe(t); }); }
    (cfg.nuevas || []).forEach(n => { const t = { ...n, nueva: true }; t.linea = lineaDe(t); (n.amp ? AMP : T).push(t); });
    const hoy = new Date().toISOString().slice(0, 10);
    [...T, ...AMP].forEach(t => { t.caducada = !!(t.oferta && ((t.ofHasta && t.ofHasta < hoy) || (t.ofDesde && t.ofDesde > hoy))); t.oculta = (cfg.ocultas || []).includes(t.id) || t.caducada; });
  }
  const config = () => JSON.parse(JSON.stringify(cfg));
  const de = id => T.find(t => t.id === id) || AMP.find(t => t.id === id) || null;
  const eur = v => (Math.round(v * 100) / 100).toLocaleString('es-ES', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 }) + ' €';
  const resumenFracc = f => { if (!f) return ''; const g = []; f.forEach(v => { const u = g[g.length - 1]; if (u && u.v === v) u.n++; else g.push({ v, n: 1 }); }); return g.map(x => x.n > 1 ? `${x.n} × ${eur(x.v)}` : eur(x.v)).join(' + '); };
  const opciones = (lista, sel) => { lista = lista.filter(t => !t.oculta || t.id === sel); return [...new Set(lista.map(t => t.grupo))].map(g => `<optgroup label="${g}">${lista.filter(t => t.grupo === g).map(t => `<option value="${t.id}" ${t.id === sel ? 'selected' : ''}>${t.nombre} · ${eur(t.estandar)}</option>`).join('')}</optgroup>`).join(''); };

  /* Plan de pagos: forma 'unico' | 'fracc'; extra = importe añadido (p. ej. +300 € de alimentación); desc = { tipo: '%'|'€', v } descuento adicional */
  function plan(t, { forma = 'unico', inicio, extra = 0, desc = null, concepto } = {}) {
    if (!t) return [];
    let cuotas;
    if (forma === 'fracc' && t.fracc) {
      cuotas = t.fracc.slice();
      if (extra) { const base = cuotas.reduce((a, b) => a + b, 0), k = (base + extra) / base; cuotas = cuotas.map(v => Math.round(v * k * 100) / 100); const dif = Math.round((base + extra - cuotas.reduce((a, b) => a + b, 0)) * 100) / 100; cuotas[0] = Math.round((cuotas[0] + dif) * 100) / 100; }
    } else cuotas = [Math.round(((t.unico ?? t.estandar) + extra) * 100) / 100];  // el +300 de alimentación va a precio completo
    const total = cuotas.reduce((a, b) => a + b, 0);
    if (desc?.v > 0) {
      const quita = desc.tipo === '%' ? total * desc.v / 100 : Math.min(desc.v, total), k = (total - quita) / total;
      cuotas = cuotas.map(v => Math.round(v * k * 100) / 100);
      const dif = Math.round((total - quita - cuotas.reduce((a, b) => a + b, 0)) * 100) / 100; cuotas[0] = Math.round((cuotas[0] + dif) * 100) / 100;
    }
    const n = cuotas.length, ini = inicio || hoyISO(), nom = concepto || t.nombre;
    return cuotas.map((v, i) => ({ concepto: n > 1 ? `${nom} · cuota ${i + 1}/${n}` : `${nom} · pago único`, importe: v, vence: sumaMeses(ini, i) }));
  }
  /* «200 + 2 × 125» o «3x416» → [200, 125, 125] */
  function leeCuotas(txt) {
    const out = []; for (const p of String(txt || '').split('+')) { const m = /^\s*(?:(\d+)\s*[x×]\s*)?([\d.,]+)\s*€?\s*$/i.exec(p); if (!m) { if (p.trim()) return null; continue; } const n = +(m[1] || 1), v = +m[2].replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'); if (!(v > 0)) return null; for (let i = 0; i < n; i++) out.push(v); }
    return out.length ? out : null;
  }
  return { T, AMP, de, eur, plan, resumenFracc, opciones, mesesSem, reparte, cargar, config, lineaDe, leeCuotas, FREC };
})();
window.Tarifas = Tarifas;
