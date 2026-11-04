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
    // Bonos de entrenamientos personales (sin seguimiento, sin caducidad)
    { id: 'bono1', grupo: 'Bono de sesiones', nombre: 'Sesión suelta', srv: { modalidad: 'presencial', bono: true, ent: true, ali: false, sesiones: 1, seg: false }, estandar: 60, unico: 60, fracc: null },
    { id: 'bono5', grupo: 'Bono de sesiones', nombre: 'Bono 5 sesiones', srv: { modalidad: 'presencial', bono: true, ent: true, ali: false, sesiones: 5, seg: false }, estandar: 275, unico: 275, fracc: null },
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
  const de = id => T.find(t => t.id === id) || AMP.find(t => t.id === id) || null;
  const eur = v => (Math.round(v * 100) / 100).toLocaleString('es-ES', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 }) + ' €';
  const resumenFracc = f => { if (!f) return ''; const g = []; f.forEach(v => { const u = g[g.length - 1]; if (u && u.v === v) u.n++; else g.push({ v, n: 1 }); }); return g.map(x => x.n > 1 ? `${x.n} × ${eur(x.v)}` : eur(x.v)).join(' + '); };
  const opciones = (lista, sel) => [...new Set(lista.map(t => t.grupo))].map(g => `<optgroup label="${g}">${lista.filter(t => t.grupo === g).map(t => `<option value="${t.id}" ${t.id === sel ? 'selected' : ''}>${t.nombre} · ${eur(t.estandar)}</option>`).join('')}</optgroup>`).join('');

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
  return { T, AMP, de, eur, plan, resumenFracc, opciones, mesesSem, reparte };
})();
window.Tarifas = Tarifas;
