/* ---------- Series con tandas internas, para todos los métodos ----------
   Cada serie es una tarjeta con sus tandas; una tanda puede tener varias partes (lado derecho / izquierdo,
   pesado / explosivo / isométrico). El alumno solo escribe peso y repeticiones (o segundos en los isométricos).
   Lo pautado sale en gris en cada casilla: si el alumno no escribe nada y pulsa el botón, se guarda lo pautado (como en las series normales).
   Una serie cuenta como hecha solo cuando todas sus partes están confirmadas (o, en myo reps, cuando el alumno da la serie por terminada).
   Registro: una fila de registros_series por parte (serie = nº de serie, tramo = nº de parte dentro de la serie). */
const Tandas = {
  /* Cómo se trabaja cada método */
  MET: {
    'Rest-pause': { tipo: 'pausa', pausa: 20, info: 'Rest-pause: tandas cerca del fallo con 20 segundos de pausa entre ellas.' },
    'Cluster': { tipo: 'pausa', pausa: 30, info: 'Cluster: pocas repeticiones con mucho peso y 30 segundos de pausa entre tandas.' },
    'Myo reps': { tipo: 'pausa', pausa: 30, myo: true, info: 'Myo reps: haz las que puedas hasta quedarte a 1 del fallo, descansa 30 segundos y repite. Cuando ya no llegues a 4 repeticiones, termina la serie.' },
    'Dropset': { tipo: 'drop', info: 'Dropset: al terminar cada tanda, baja el peso y sigue sin descansar.' },
    'Unilateral': { tipo: 'uni', info: 'Unilateral: primero el lado derecho y, sin descansar, el izquierdo.' },
    'Unilateral lento': { tipo: 'uni', tempo: true, info: 'Unilateral lento: primero el lado derecho y luego el izquierdo, a ritmo 6-3-6.' },
    'Unilateral superlento': { tipo: 'simple', tempo: true, info: 'Superlento: con los dos lados a la vez, a ritmo 6-3-6.' },
    'Unilateral doble': { tipo: 'doble', info: 'Unilateral doble: derecho e izquierdo y, sin parar, otra vuelta. La 1ª vuelta te acerca al fallo (RIR 1); la 2ª suma repeticiones efectivas hasta el fallo (RIR 0).' },
    'Contrastes': { tipo: 'contraste', info: 'Contraste: dos tandas seguidas, sin descanso entre ellas (superlento, isométrico, pesado o explosivo, en el orden que elijas).' },
    'Unilateral contraste': { tipo: 'ucontraste', info: 'Contraste unilateral: con un lado, la 1ª parte y sin parar la 2ª; después, el otro lado (mismo peso salvo que se indique otro).' },
    'Forzadas': { tipo: 'simple', forz: true, info: 'Forzadas: llega a las repeticiones objetivo aunque no te salgan seguidas. Cuando no puedas más, para 5 segundos y sigue sumando hasta llegar.' },
    'Topset': { tipo: 'top', info: 'Top set: la 1ª serie es la más pesada. Las siguientes van con un 15 % menos de peso.' },
    'Isométrico': { tipo: 'simple', iso: true, info: 'Isométrico: sostén la carga, sin moverte, en la posición indicada durante el tiempo marcado. Aquí no cuentas repeticiones, sino segundos.' }
  },
  /* Métodos que crea el coach desde la biblioteca: se comportan como uno de estos 4 modelos */
  BASES: { tandas: 'Tandas con pausa entre ellas (como rest-pause o cluster)', lados: 'Un lado y luego el otro (como unilateral)', drop: 'Bajando el peso sin descanso (como dropset)', iso: 'Sostener en una posición, por tiempo (como isométrico)' },
  dinamicos(filas) {
    this._fijos ||= new Set(Object.keys(this.MET)); (this._propios || []).forEach(n => delete this.MET[n]); this._propios = [];
    (filas || []).forEach(f => {
      if (!f.base || this._fijos.has(f.nombre) || !this.BASES[f.base]) return;
      const info = (f.explicacion || '').trim() || `${f.nombre}: sigue las indicaciones de tu entrenador.`, p = +f.pausa > 0 ? +f.pausa : 20;
      this.MET[f.nombre] = f.base === 'tandas' ? { tipo: 'pausa', pausa: p, info } : f.base === 'lados' ? { tipo: 'uni', info } : f.base === 'drop' ? { tipo: 'drop', info } : { tipo: 'simple', iso: true, info };
      this._propios.push(f.nombre);
    });
  },
  TEMPO: 'Ritmo 6-3-6: 6 segundos para subir (contracción), 3 segundos aguantando arriba y 6 segundos para bajar.',
  LADO: { D: 'Derecho', I: 'Izquierdo' },
  TIPO: { pesado: 'Pesado', iso: 'Isométrico', explosivo: 'Explosivo', superlento: 'Superlento' },
  met(e) { return this.MET[e?.metodos?.nombre] || null; },
  usa(e) { return !!this.met(e); },
  ejercicio(es) { return S.dia?.bloques_sesion.flatMap(b => b.ejercicios_sesion).find(x => x.id === +es); },
  limpiaR: r => String(r ?? '').replace(/\s*\(2 veces\)/i, '').replace(/\s*(x|por|cada)\s*(lado|brazo|pierna|mano)\b/gi, '').replace(/^por lado:?\s*/i, '').trim(),
  red: v => Math.round(v * 2) / 2,
  kgN: t => { const v = numero(kgDe(t)); return v != null && v > 0 ? v : null; },
  esIso: t => t?.tp === 'iso' || (!t?.tp && /''|´´|"|\bseg|isom/i.test(String(t?.r || ''))),
  segDe: t => { const m = String(t?.r || '').match(/(\d+)\s*(?:''|´´|"|seg|s\b)/i); return m ? +m[1] : null; },

  /* ---------- Estructura de la serie según el método: series → tandas → partes ---------- */
  estructura(e) {
    const M = this.met(e) || { tipo: 'pausa' }, G = gruposDe(e.pauta), kg0 = e.peso_ref;
    const exp = gs => gs.flatMap(g => [...Array(g.s || 1)].map(() => g.tramos));
    const P = (t, x = {}) => ({ r: t.r, kg: t.kg, rir: t.rir, ...x });
    const rirS = (tr, t) => t.rir ?? tr[0].rir ?? e.rir;
    let out;
    if (M.tipo === 'pausa' || M.tipo === 'drop') {
      out = exp(gruposDe(pautaEfectiva(e))).map(tr => ({ tandas: tr.map((t, k) => ({ partes: [P(t, { rir: rirS(tr, t), kg: t.kg ?? (M.tipo === 'drop' && k ? undefined : tr[0].kg ?? kg0) })], d: t.d ?? (k < tr.length - 1 ? M.pausa || 0 : e.descanso_seg ?? 60) })) }));
      if (M.myo) out.forEach(s => s.tandas.forEach((t, k) => { t.partes[0].myo = k === 0 ? 'Hasta quedarte a 1 del fallo' : 'Las que puedas'; }));
      if (M.tipo === 'drop') out.forEach(s => s.tandas.forEach((t, k) => {   // bajada del 20 % si no se indicó el peso
        if (k && !this.kgN(t.partes[0])) { const prev = this.kgN(s.tandas[k - 1].partes[0]); t.partes[0].kg = prev ? `${fmtNum(this.red(prev * 0.8), 2)} kg` : ''; t.partes[0].auto = !!prev; }
      }));
    } else if (M.tipo === 'uni') {
      out = exp(G).map(tr => ({ tandas: tr.flatMap((t, k) => ['D', 'I'].map(l => ({ partes: [P(t, { r: this.limpiaR(t.r), rir: rirS(tr, t), lado: l })], d: l === 'D' ? 0 : t.d ?? e.descanso_seg ?? 60, lado: l }))) }));
    } else if (M.tipo === 'doble') {
      out = exp(G).map(tr => {
        const v = tr.length > 1 ? tr : [{ ...tr[0], rir: tr[0].rir ?? 1, d: 0 }, { ...tr[0], rir: 0 }];
        return { tandas: [{ doble: true, partes: v.flatMap((t, k) => ['D', 'I'].map(l => P(t, { r: this.limpiaR(t.r), rir: t.rir ?? (k ? 0 : 1), lado: l, vuelta: k + 1 }))), d: v[v.length - 1].d ?? e.descanso_seg ?? 60 }] };
      });
    } else if (M.tipo === 'contraste' || M.tipo === 'ucontraste') {
      const uni = M.tipo === 'ucontraste';
      out = exp(G).map(tr => {
        let f = tr; if (f.length === 1 && /\+/.test(f[0].r || '')) { const [a, b] = String(f[0].r).split('+').map(x => x.trim()); f = [{ ...f[0], r: a, d: 0 }, { ...f[0], r: b }]; }
        const fases = f.map((t, k) => P(t, { r: uni ? this.limpiaR(t.r) : t.r, rir: rirS(tr, t), tipo: t.tp || (this.esIso(t) ? 'iso' : k === 0 ? 'pesado' : 'explosivo') }));
        const d = f[f.length - 1].d ?? e.descanso_seg ?? 60;
        if (!uni) return { tandas: fases.map((p, k) => ({ partes: [p], d: k < fases.length - 1 ? 0 : d, tipo: p.tipo })) };
        const orden = tr[0].op?.orden || 'lado';
        return orden === 'fase'
          ? { tandas: fases.map((p, k) => ({ partes: ['D', 'I'].map(l => ({ ...p, lado: l })), d: k < fases.length - 1 ? 0 : d, tipo: p.tipo })) }
          : { tandas: ['D', 'I'].map(l => ({ partes: fases.map(p => ({ ...p, lado: l })), d: l === 'D' ? 0 : d, lado: l })) };
      });
    } else if (M.tipo === 'top') {
      const viejo = G.length === 1 && G[0].tramos.length > 1 && G[0].s === G[0].tramos.length;
      const series = viejo ? G[0].tramos.map((t, i) => i === 0 ? [t] : trocear({ ...t, s: 1 }, /''|´´|seg/.test(t.r || '') ? 'Rest-pause' : /\+/.test(t.r || '') ? 'Dropset' : '', false)) : exp(gruposDe(pautaEfectiva(e)));
      const v = G[0]?.tramos[0]?.op?.var;
      const lados = G[0]?.tramos[0]?.op?.lados || '2';
      out = series.map((tr, i) => ({ etq: i === 0 ? 'Top set' : ({ drop: 'Back-off en dropset', rp: 'Back-off en rest-pause', backup: 'Back-off set' }[v] || (tr.length > 1 ? (tr.some(t => t.d > 0 && t !== tr[tr.length - 1]) ? 'Back-off en rest-pause' : 'Back-off en dropset') : 'Back-off set')),
        tandas: tr.map((t, k) => ({ partes: [P(t, { rir: rirS(tr, t) })], d: t.d ?? (k < tr.length - 1 ? 0 : e.descanso_seg ?? 60) })) }));
      if (lados === 'uni') out.forEach(s => {   // un lado y luego el otro: cada lado hace su top set / back-off completo
        const b = s.tandas, fin = b[b.length - 1].d;
        s.tandas = ['D', 'I'].flatMap(l => b.map((t, k) => ({ partes: t.partes.map(x => ({ ...x, r: this.limpiaR(x.r), lado: l })), lado: l, d: k < b.length - 1 ? t.d : (l === 'D' ? 0 : fin) })));
      });
      else if (lados === 'doble') out.forEach(s => {   // derecho e izquierdo y, sin parar, otra vuelta (la 2ª hasta el fallo)
        const b = s.tandas, fin = b[b.length - 1].d, v = b.length > 1 ? b.map(t => t.partes[0]) : [b[0].partes[0], { ...b[0].partes[0], rir: 0 }];
        s.tandas = [{ doble: true, partes: v.flatMap((x, k) => ['D', 'I'].map(l => ({ ...x, r: this.limpiaR(x.r), lado: l, vuelta: k + 1 }))), d: fin }];
      });
    } else {
      const X = M.iso ? { tipo: 'iso' } : {};
      out = exp(G).map(tr => ({ tandas: tr.map((t, k) => ({ partes: [P(t, { rir: rirS(tr, t), ...X, ...(M.iso && t.op?.pos ? { pos: t.op.pos } : {}) })], d: t.d ?? (k < tr.length - 1 ? 0 : e.descanso_seg ?? 60) })) }));
    }
    // Índice de cada parte dentro de su serie (es el «tramo» del registro)
    out.forEach(s => { let p = 0; s.tandas.forEach(t => { t.p0 = p; t.partes.forEach(x => { x.p = p++; }); }); s.T = p; });
    return out;
  },

  /* ---------- Textos ---------- */
  dur(s, largo) {
    s = +s || 0; const m = Math.floor(s / 60), r = s % 60;
    if (!m) return largo ? `${r} segundos` : `${r} s`;
    if (!r) return largo ? `${m} ${m === 1 ? 'minuto' : 'minutos'}` : `${m} min`;
    return `${m} min ${r} s`;
  },
  rango(vals, largo) {
    const v = [...new Set(vals.filter(x => x != null))].sort((a, b) => a - b);
    if (!v.length) return null; if (v.length === 1) return v[0] ? this.dur(v[0], largo) : 'Sin descanso';
    return v[0] === 0 ? `Sin descanso – ${this.dur(v[v.length - 1])}` : `${this.dur(v[0])} – ${this.dur(v[v.length - 1])}`;
  },
  rirTxt(r) {
    const t = String(r ?? '').trim(); if (t === '') return '';
    if (/^0$/.test(t)) return 'Sin repeticiones en reserva: hasta que no puedas hacer otra con buena técnica.';
    if (/^1$/.test(t)) return 'Termina cuando te quede 1 repetición en reserva.';
    if (/^\d+\s*[-–]\s*\d+$/.test(t) || /^\d+$/.test(t)) return `Termina cuando te queden ${t.replace(/\s*[-–]\s*/, '–')} repeticiones en reserva.`;
    return 'Repeticiones que deberían quedarte en reserva al terminar.';
  },
  objetivo(x) {
    if (x.tipo === 'iso') { const s = this.segDe(x); return { txt: s ? `${s} segundos` : String(x.r || '—'), num: s, iso: true }; }
    if (x.myo) return { txt: x.myo.toLowerCase(), num: null };
    const r = String(x?.r ?? '').trim(), ph = repsPh(r);
    return { txt: ph === 'Máx' ? 'al máximo' : ph ? `${ph} reps` : r || '—', num: /^\d+$/.test(ph) ? +ph : null, ph: /^\d/.test(ph) ? ph : '' };
  },
  nomParte(x) { return [x.vuelta ? `${x.vuelta}ª vuelta` : '', x.lado ? this.LADO[x.lado] : '', x.tipo ? this.TIPO[x.tipo] : ''].filter(Boolean).join(' · '); },
  chipLado: l => `<span class="rp-lado ${l === 'D' ? 'd' : 'i'}">${l === 'D' ? 'Derecho' : 'Izquierdo'}</span>`,
  tituloTanda(t, k, nT) {
    if (t.doble) return 'Doble vuelta sin parar';
    if (t.lado) return `Lado ${t.lado === 'D' ? 'derecho' : 'izquierdo'}`;
    if (t.tipo) return `${k + 1} · ${this.TIPO[t.tipo]}`;
    return nT === 1 ? 'Tu serie' : `Tanda ${k + 1}`;
  },
  hechoTxt(t) { return t.lado ? `${this.LADO[t.lado]} hecho` : t.tipo ? `${this.TIPO[t.tipo]} hecho` : t.doble ? 'Vueltas hechas' : 'Tanda hecha'; },
  sigTxt(M, t, sig) {
    if (sig?.lado && t.lado) return 'cambia de lado';
    if (M.tipo === 'drop' || M.tipo === 'top') return 'baja el peso y sigue';
    if (sig?.tipo) return `al ${this.TIPO[sig.tipo].toLowerCase()} sin parar`;
    return 'sin descanso';
  },

  /* ---------- Estado ---------- */
  hecha(z, fila, p) { return !!z.valores[`${fila}-${p}`]; },
  claveCorte(fila) { return `${S.dia?.id}|${S.sesion?.fecha}|${fila}`; },
  corte(fila) { try { return JSON.parse(localStorage.getItem('lof-cortes') || '{}')[this.claveCorte(fila)] ?? null; } catch (e) { return null; } },
  ponCorte(fila, v) { try { const o = JSON.parse(localStorage.getItem('lof-cortes') || '{}'); if (v == null) delete o[this.claveCorte(fila)]; else o[this.claveCorte(fila)] = v; localStorage.setItem('lof-cortes', JSON.stringify(o)); } catch (e) { } },
  /* Partes que hacen falta para dar la serie por hecha (en myo reps puede terminarse antes) */
  requeridas(s, fila) { const c = this.corte(fila); return (c == null ? s.tandas : s.tandas.slice(0, c)).flatMap(t => t.partes.map(x => x.p)); },
  estadoSerie(z, s, fila) { const req = this.requeridas(s, fila), h = req.filter(p => this.hecha(z, fila, p)).length; return { req, h, est: h === req.length && req.length ? 'on' : h ? 'parcial' : 'pend' }; },
  tandaHecha(z, fila, t) { return t.partes.every(x => this.hecha(z, fila, x.p)); },

  /* ---------- Pintado ---------- */
  vista(e, ej, sp) {
    const z = S.sesion, M = this.met(e), SER = this.estructura(e), N = SER.length, abiertas = (z.abiertas ||= {});
    const partes = SER.flatMap(s => s.tandas.flatMap(t => t.partes)), rirs = partes.map(x => x.rir == null || x.rir === '' ? null : String(x.rir));
    const rirUnico = rirs.every(x => x === rirs[0]) ? rirs[0] : undefined;
    const entreT = SER.flatMap(s => s.tandas.slice(0, -1).map(t => t.d ?? 0)), entreS = SER.slice(0, -1).map(s => s.tandas[s.tandas.length - 1].d ?? 60);
    const primera = SER.findIndex((s, i) => this.estadoSerie(z, s, `${e.id}-${i + 1}`).est !== 'on');
    if (!(e.id in abiertas)) abiertas[e.id] = primera < 0 ? -1 : primera + 1;
    const html = SER.map((s, si) => {
      const n = si + 1, fila = `${e.id}-${n}`, ultS = n === N, nT = s.tandas.length;
      const tandas = s.tandas.map((t, k) => {
        const ult = k === nT - 1, sig = s.tandas[k + 1], d = ult && ultS ? 0 : t.d;
        const lbl = !ult ? (d > 0 ? `${this.hechoTxt(t)} · descansar ${this.dur(d)}` : `${this.hechoTxt(t)} · ${this.sigTxt(M, t, sig)}`) : ultS ? 'Terminar ejercicio' : (d > 0 ? `Terminar serie · descansar ${this.dur(d)}` : 'Terminar serie · sin descanso');
        const una = t.partes.length === 1, x0 = t.partes[0];
        const cab = una ? this.cabParte(x0, rirUnico, sp, k, s) : (t.doble ? '<span class="muted"> · sin descanso entre lados ni vueltas</span>' : '');
        return `<div class="rp-tanda" id="rpt-${fila}-${k}" data-p0="${t.p0}" data-np="${t.partes.length}">
          <div class="rp-tt">${t.lado ? this.chipLado(t.lado) + ' ' : ''}<b>${esc(this.tituloTanda(t, k, nT))}</b>${cab}</div>
          ${t.partes.map(x => this.campos(e, fila, n, x, sp, una, rirUnico, t)).join('')}
          <button class="btn rp-btn" data-act="tanda" data-es="${e.id}" data-n="${n}" data-k="${k}" data-d="${d}" data-tipo="${!ult ? 'tandas' : ultS ? 'fin' : 'series'}" data-lbl="${esc(lbl)}">${esc(lbl)}</button>
          ${M.myo && k > 0 ? `<button class="linkbtn small rp-corte" data-act="tandaCortar" data-es="${e.id}" data-n="${n}" data-k="${k}">No llego a 4 repeticiones · termino aquí la serie</button>` : ''}
          <div class="rp-ok small" hidden><span class="rp-ok-t">✓ Guardada</span><span class="muted"> · para corregir, cambia el número</span> <button class="linkbtn small" data-act="tandaQuitar" data-es="${e.id}" data-n="${n}" data-k="${k}">Quitar</button></div>
          <div class="rp-cortada small muted" hidden>No hecha: terminaste la serie antes <button class="linkbtn small" data-act="tandaCortar" data-es="${e.id}" data-n="${n}" data-k="-1">Deshacer</button></div>
        </div>`;
      }).join('');
      return `<div class="rp-serie" id="rps-${fila}" data-es="${e.id}" data-n="${n}" data-t="${s.T}"${s.etq ? ` data-etq="${esc(s.etq)}"` : ''}>
        <button class="rp-cab" data-act="rpAbrir" data-es="${e.id}" data-n="${n}" aria-expanded="false"><span class="grow"><span class="rp-tit"></span><span class="rp-sub small"></span></span><span class="rp-chev" aria-hidden="true"></span></button>
        <div class="rp-cuerpo">${tandas}</div></div>`;
    }).join('');
    const eT = this.rango(entreT, true), eS = this.rango(entreS, true);
    const info = [M.info, M.tempo ? this.TEMPO : ''].filter(Boolean), pos = partes.find(x => x.pos)?.pos;
    return `<div class="rp-met small">${info.map(x => `<span>${esc(x)}</span>`).join('')}</div>
      ${pos ? `<div class="rp-rir">${this.ICO.rir}<div><b>Posición a mantener</b><span class="small">${esc(pos)}</span></div></div>` : ''}
      ${eT || (eS && N > 1) ? `<div class="rp-desc">${this.ICO.reloj}${eT ? `<div><span class="small">Entre ${M.tipo === 'uni' || M.tipo === 'ucontraste' ? 'lados' : 'tandas'}:</span><b>${esc(eT)}</b></div>` : ''}${eT && eS && N > 1 ? '<div class="rp-sep"></div>' : ''}${eS && N > 1 ? `<div><span class="small">Entre series:</span><b>${esc(eS)}</b></div>` : ''}</div>` : ''}
      ${rirUnico ? `<div class="rp-rir">${this.ICO.rir}<div><b>Esfuerzo indicado · RIR ${esc(rirUnico)}</b><span class="small">${esc(this.rirTxt(rirUnico))}</span></div></div>` : rirs.some(x => x != null) ? `<div class="rp-rir">${this.ICO.rir}<div><b>Esfuerzo indicado</b><span class="small">El RIR cambia según la ${M.tipo === 'doble' ? 'vuelta' : 'tanda'}: lo verás junto a cada una. RIR = repeticiones que deberían quedarte en reserva.</span></div></div>` : ''}
      <div class="rp-wrap" id="rpw-${e.id}">${html}</div>`;
  },
  ICO: {
    reloj: '<svg class="rp-reloj" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 6.5V12l3.5 2.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    rir: '<svg class="rp-rir-ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="13" width="5" height="8" rx="1"/><rect x="10" y="8" width="5" height="13" rx="1"/><rect x="17" y="3" width="5" height="18" rx="1"/></svg>'
  },
  kgPlan(x, sp) { return sp ? '' : x.kg === '' ? '' : kgDe(x); },
  cabParte(x, rirUnico, sp, k) {
    const o = this.objetivo(x), kgP = this.kgPlan(x, sp);
    return `<span class="muted"> · Objetivo: ${esc(o.txt)}${x.auto ? ' · baja un 20 %' : (!sp && x.kg === '' && k > 0) ? ' · baja el peso' : ''}</span>${rirUnico === undefined && x.rir != null && x.rir !== '' ? ` <span class="rp-rir-chip">RIR ${esc(String(x.rir))}</span>` : ''}`;
  },
  campos(e, fila, n, x, sp, una, rirUnico, t = {}) {
    const z = S.sesion, id = `${fila}-${x.p}`, u = z.ultimos[id], v = z.valores[id], bor = z.borr || {}, o = this.objetivo(x), kgP = this.kgPlan(x, sp), bajada = !sp && x.kg === '' && x.p > 0;
    const val = (c, f) => v && v[f] != null ? fmtNum(v[f], 2) : (bor[`${c}-${id}`] ?? '');
    // En gris: lo pautado y, si no hay pauta, lo de la última vez
    const phKg = kgP ? fmtNum(numero(kgP), 2) : (u?.kg != null ? fmtNum(u.kg, 2) : '—'), phRp = o.iso ? (o.num ?? (u?.repeticiones ?? '—')) : (o.ph || (x.myo ? '—' : (u?.repeticiones ?? '—')));
    const nom = this.nomParte(x), lblR = o.iso ? 'Segundos' : 'Reps realizadas';
    return `<div class="rp-parte${una ? ' una' : ''}">
      ${una ? '' : `<div class="rp-pt">${x.lado && !t.lado ? this.chipLado(x.lado) : ''}${x.vuelta ? `<b>${x.vuelta}ª vuelta</b>` : ''}${x.tipo ? `<b>${esc(this.TIPO[x.tipo])}</b>` : ''}<span class="muted">Objetivo: ${esc(o.txt)}</span>${rirUnico === undefined && x.rir != null && x.rir !== '' ? `<span class="rp-rir-chip">RIR ${esc(String(x.rir))}</span>` : ''}</div>`}
      <div class="rp-campos${sp ? ' uno' : ''}">
        ${sp ? '' : `<label>Peso (kg)<input id="kg-${id}" data-tanda="1" data-row="${fila}" data-plan="${esc(kgP)}"${bajada ? ' data-bajada="1"' : ''} type="text" inputmode="decimal" placeholder="${esc(phKg)}" value="${esc(val('kg', 'kg'))}" aria-label="Peso en kilos, serie ${n}${nom ? ', ' + esc(nom) : ''}"></label>`}
        <label>${lblR}<input id="rp-${id}" data-tanda="1" data-row="${fila}" data-obj="${o.num ?? ''}"${o.iso ? ' data-iso="1"' : ''} type="text" inputmode="numeric" placeholder="${esc(String(phRp))}" value="${esc(val('rp', 'repeticiones'))}" aria-label="${lblR}, serie ${n}${nom ? ', ' + esc(nom) : ''}"></label>
      </div></div>`;
  },
  /* Estados visibles (sin rehacer los campos, para no perder lo escrito) */
  pintar(es) {
    const z = S.sesion; if (!z) return;
    const cajas = es ? [document.getElementById('rpw-' + es)] : [...document.querySelectorAll('.rp-wrap')];
    const pend = new Set(Cola.leer().filter(x => x.k != null && S.dia && x.ses.dia_id === S.dia.id && x.ses.fecha === z.fecha).map(x => `${x.fila}-${x.k}`));
    cajas.filter(Boolean).forEach(w => {
      const eid = +w.id.slice(4), e = this.ejercicio(eid); if (!e) return;
      const SER = this.estructura(e), N = SER.length, ab = z.abiertas?.[eid];
      SER.forEach((s, si) => {
        const n = si + 1, fila = `${eid}-${n}`, el = document.getElementById('rps-' + fila); if (!el) return;
        const { req, h, est } = this.estadoSerie(z, s, fila), abierta = ab === n, c = this.corte(fila), etq = s.etq ? ` · ${s.etq}` : '';
        el.classList.toggle('on', est === 'on'); el.classList.toggle('parcial', est === 'parcial'); el.classList.toggle('abierta', abierta);
        el.querySelector('.rp-cab').setAttribute('aria-expanded', abierta ? 'true' : 'false');
        const res = s.tandas.flatMap(t => t.partes).map(x => { const v = z.valores[`${fila}-${x.p}`]; return v ? `${x.lado || ''}${x.lado ? ' ' : ''}${v.kg != null ? fmtNum(v.kg, 2) + '×' : ''}${v.repeticiones ?? '—'}${x.tipo === 'iso' ? 's' : ''}` : null; }).filter(Boolean).join(' · ');
        const uds = s.tandas.length === 1 && s.tandas[0].partes.length > 1 ? 'partes' : (s.tandas.some(t => t.lado) ? 'lados' : 'tandas');
        const tot = uds === 'partes' ? req.length : s.tandas.filter((t, k) => c == null || k < c).length;
        const hT = uds === 'partes' ? h : s.tandas.filter((t, k) => (c == null || k < c) && this.tandaHecha(z, fila, t)).length;
        el.querySelector('.rp-tit').textContent = abierta ? `Serie ${n} de ${N}${etq}` : `Serie ${n}${etq} · ${est === 'on' ? 'Completada ✓' : est === 'parcial' ? `Parcial · ${hT} de ${tot} ${uds}` : 'Pendiente'}`;
        el.querySelector('.rp-sub').textContent = abierta ? (est === 'on' ? `Completada ✓ · ${res}` : est === 'parcial' ? `${hT} de ${tot} ${uds} hechas · completa ${uds === 'lados' ? 'el que falta' : 'las que faltan'}` : (tot === 1 ? 'Completa la serie' : `Completa ${uds === 'lados' ? 'los dos lados' : `las ${tot} ${uds}`}`)) : (est !== 'pend' ? res : '');
        s.tandas.forEach((t, k) => {
          const te = document.getElementById(`rpt-${fila}-${k}`); if (!te) return;
          const ok = this.tandaHecha(z, fila, t), cort = c != null && k >= c && !ok, b = te.querySelector('.rp-btn');
          te.classList.toggle('on', ok); te.classList.toggle('cortada', cort); b.hidden = ok || cort; te.querySelector('.rp-ok').hidden = !ok; te.querySelector('.rp-cortada').hidden = !cort || k !== c;
          te.querySelectorAll('.rp-campos').forEach(x => { x.hidden = cort; }); te.querySelectorAll('.rp-corte').forEach(x => { x.hidden = ok || cort; });
          te.querySelector('.rp-ok-t').textContent = t.partes.some(x => pend.has(`${fila}-${x.p}`)) ? '⏳ Guardada en el móvil · se enviará al volver la conexión' : '✓ Guardada';
          te.querySelectorAll('input').forEach(i => i.classList.toggle('on', ok));
          const id = `${fila}-${k}`; if (!ok && !z.guard?.[id] && b.dataset.conf !== '1') { b.disabled = false; b.textContent = b.dataset.lbl; }
        });
      });
    });
  },
  abrir(es, n) { const z = S.sesion; z.abiertas ||= {}; z.abiertas[es] = z.abiertas[es] === +n ? -1 : +n; this.pintar(es); },

  /* ---------- Confirmar una tanda: guarda lo realizado (todas sus partes) y arranca el descanso que toca ---------- */
  async confirmar(b) {
    const z = S.sesion, es = +b.dataset.es, n = +b.dataset.n, k = +b.dataset.k, fila = `${es}-${n}`, id = `${fila}-${k}`;
    const e = this.ejercicio(es), s = this.estructura(e)[n - 1], t = s?.tandas[k]; if (!t) return;
    z.guard ||= {};
    if (z.guard[id] || this.tandaHecha(z, fila, t)) return;   // evita duplicados por pulsaciones repetidas
    const L = t.partes.map(x => {
      const pid = `${fila}-${x.p}`, kgI = document.getElementById('kg-' + pid), rpI = document.getElementById('rp-' + pid);
      // Lo que no se escribe se guarda como lo que sale en gris (pauta o última vez)
      return { x, pid, kgI, rpI, kg: kgI ? (numero(kgI.value) ?? valPh(kgI)) : null, rp: numero(rpI.value) ?? valPh(rpI) };
    }).filter(q => !this.hecha(z, fila, q.x.p));
    const sinDato = L.find(q => q.rp == null);
    if (sinDato) { toast(`Escribe ${sinDato.rpI.dataset.iso ? 'los segundos' : 'las repeticiones'}${L.length > 1 ? ' de ' + this.nomParte(sinDato.x).toLowerCase() : ''} que has hecho`); sinDato.rpI.focus(); return; }
    L.forEach(q => { if (!q.rpI.value.trim()) q.rpI.value = q.rp; if (q.kgI && !q.kgI.value.trim() && q.kg != null) q.kgI.value = fmtNum(q.kg, 2); });
    clearTimeout(b._t); b.dataset.conf = ''; b.classList.remove('conf');
    z.guard[id] = true; b.disabled = true; b.textContent = 'Guardando…';
    if (!z.inicio && !z.editar) empezarCrono();
    const rows = L.map(q => ({ alumno_id: uidSes(), ejercicio_sesion_id: es, serie: n, tramo: q.x.p + 1, kg: q.kg, repeticiones: q.rp, rir: null }));
    let sid = null, guardada = false;
    try {
      sid = await asegurarSesion(); rows.forEach(r => r.sesion_id = sid);
      const { data, error } = await conRespaldo(() => sb.from('registros_series').insert(rows).select('id'),
        () => sb.from('registros_series').insert(rows.map(({ tramo, ...x }) => x)).select('id'));
      if (error) throw error;
      rows.forEach((r, i) => { r.id = data?.[i]?.id; z.valores[L[i].pid] = r; }); guardada = true;
    } catch (err) {
      if (!sinRed(err)) { z.guard[id] = false; b.disabled = false; b.textContent = b.dataset.lbl; return fallo(err, 'No se ha guardado la tanda. Revisa la conexión e inténtalo de nuevo.'); }
      rows.forEach((row, i) => { const { sesion_id, ...r } = row; Cola.anadir({ uid: Date.now() + '-' + L[i].pid, fila, k: L[i].x.p, sid: z.id || null, ses: { alumno_id: uidSes(), dia_id: S.dia.id, fecha: z.fecha || hoyISO(), estado: 'parcial' }, rows: [r] }); z.valores[L[i].pid] = r; });
      guardada = true; toast('Sin conexión: la tanda queda guardada en el móvil y se enviará sola');
    }
    z.guard[id] = false;
    if (!guardada) return;
    this.descanso(b, e);
    this.trasGuardar(e, n, k, sid, L);
  },
  descanso(b, e) {
    const z = S.sesion, d = +b.dataset.d, tipo = b.dataset.tipo, nom = ejDe(e || {}).nombre || '';
    if (z.editar) return;
    if (tipo === 'fin') toast('Ejercicio terminado ✓');
    else if (d > 0) startTimer(d, `Descanso · ${nom} · entre ${tipo === 'tandas' ? 'tandas' : 'series'}`);
    else toast(tipo === 'tandas' ? `Sin descanso: ${b.dataset.lbl.split('·').pop().trim()}` : 'Sin descanso: sigue con la siguiente serie');
  },
  trasGuardar(e, n, k, sid, L) {
    const z = S.sesion, es = e.id, SER = this.estructura(e), s = SER[n - 1], fila = `${es}-${n}`;
    // El peso realizado pasa a la misma parte de la siguiente tanda o serie (si la pauta es la misma), como valor editable; las reps nunca se copian
    L.forEach(q => {
      const dest = [];
      const t2 = s.tandas[k + 1]; if (t2) { const m = t2.partes.find(x => x.tipo === q.x.tipo && (x.lado === q.x.lado || !!t2.lado)); if (m) dest.push(`${fila}-${m.p}`); }
      const s2 = SER[n]; if (s2 && k === s.tandas.length - 1) s.tandas.flatMap(t => t.partes).forEach(x => { const m = s2.tandas.flatMap(t => t.partes).find(y => y.p === x.p); if (m) dest.push(`${es}-${n + 1}-${m.p}`); });
      dest.forEach(did => {
        const sk = document.getElementById('kg-' + did); if (!sk || sk.value || sk.dataset.bajada) return;
        const src = did.startsWith(`${es}-${n + 1}-`) ? z.valores[`${fila}-${did.split('-').pop()}`] : z.valores[q.pid]; if (src?.kg == null) return;
        const planS = numero(document.getElementById('kg-' + (did.startsWith(`${es}-${n + 1}-`) ? `${fila}-${did.split('-').pop()}` : q.pid))?.dataset.plan), planD = numero(sk.dataset.plan);
        if (src.kg !== planS && (planD == null || planD === planS)) { sk.value = fmtNum(src.kg, 2); (z.borr ||= {})['kg-' + did] = sk.value; }
      });
    });
    if (this.estadoSerie(z, s, fila).est === 'on') this.serieHecha(e, n, sid);
    else if (sid && !z.editar) actualizarConteo(sid);
    this.pintar(es); setTimeout(() => Guia.pintar(), 0);
    const foco = document.getElementById(`rpt-${fila}-${k + 1}`) || document.getElementById(`rpt-${es}-${n + 1}-0`);
    if (foco && z.abiertas[es] !== -1) foco.scrollIntoView({ behavior: 'smooth', block: 'center' });
  },
  serieHecha(e, n, sid) {
    const z = S.sesion, es = e.id, SER = this.estructura(e), s = SER[n - 1], fila = `${es}-${n}`;
    z.regs[fila] = this.requeridas(s, fila).map(p => z.valores[`${fila}-${p}`]?.id).filter(Boolean);
    const sig = SER.findIndex((x, i) => this.estadoSerie(z, x, `${es}-${i + 1}`).est !== 'on');
    (z.abiertas ||= {})[es] = sig < 0 ? -1 : sig + 1;
    sid ||= z.id;
    if (sid && !z.editar) { actualizarConteo(sid); Peso.revisar(es, fila, s.T, sid); }
  },
  /* Myo reps: el alumno da la serie por terminada antes de hacer todas las tandas (k = -1 deshace) */
  cortar(b) {
    const z = S.sesion, es = +b.dataset.es, n = +b.dataset.n, k = +b.dataset.k, fila = `${es}-${n}`, e = this.ejercicio(es), s = this.estructura(e)[n - 1];
    if (k < 0) { this.ponCorte(fila, null); delete z.regs[fila]; (z.abiertas ||= {})[es] = n; if (z.id && !z.editar) actualizarConteo(z.id); this.pintar(es); Guia.pintar(); return; }
    const antes = s.tandas.slice(0, k);
    if (!antes.every(t => this.tandaHecha(z, fila, t))) return toast('Primero confirma las tandas que has hecho');
    this.ponCorte(fila, k); this.serieHecha(e, n, null);
    const ultS = n === this.estructura(e).length, d = s.tandas[s.tandas.length - 1].d;
    if (!z.editar) { if (ultS) toast('Ejercicio terminado ✓'); else if (d > 0) startTimer(d, `Descanso · ${ejDe(e).nombre || ''} · entre series`); }
    this.pintar(es); Guia.pintar();
  },
  async quitar(b) {
    const z = S.sesion, es = +b.dataset.es, n = +b.dataset.n, k = +b.dataset.k, fila = `${es}-${n}`, t = this.estructura(this.ejercicio(es))[n - 1]?.tandas[k]; if (!t) return;
    const ids = [];
    for (const x of t.partes) {
      const pid = `${fila}-${x.p}`, v = z.valores[pid]; if (!v) continue;
      const enCola = Cola.leer().find(q => q.k === x.p && q.fila === fila && q.ses.dia_id === S.dia.id && q.ses.fecha === z.fecha);
      if (enCola) Cola.escribir(Cola.leer().filter(q => q.uid !== enCola.uid)); else if (v.id) ids.push(v.id);
    }
    if (ids.length) { const { error } = await sb.from('registros_series').delete().in('id', ids); if (error) return fallo(error, 'No se ha podido quitar la tanda.'); }
    t.partes.forEach(x => delete z.valores[`${fila}-${x.p}`]); delete z.regs[fila]; Cola.pintar();
    if (this.corte(fila) != null && k < this.corte(fila)) this.ponCorte(fila, null);
    if (z.id && !z.editar) actualizarConteo(z.id);
    (z.abiertas ||= {})[es] = n; this.pintar(es); Guia.pintar(); toast('Tanda quitada: vuelve a confirmarla cuando la hagas');
  },
  /* Corrección de una parte ya confirmada (al cambiar el número) */
  async corregir(input) {
    const m = input.id.match(/^(kg|rp)-(\d+)-(\d+)-(\d+)$/); if (!m) return;
    const z = S.sesion, id = `${m[2]}-${m[3]}-${m[4]}`, reg = z.valores[id], campo = m[1] === 'kg' ? 'kg' : 'repeticiones';
    if (!reg) { (z.borr ||= {})[`${m[1]}-${id}`] = input.value; return; }   // aún sin confirmar: solo borrador
    const val = numero(input.value);
    if (val == null) { input.value = reg[campo] != null ? fmtNum(reg[campo], 2) : ''; return toast('Escribe un número para corregir'); }
    if (val === reg[campo]) return;
    if (!reg.id) { reg[campo] = val; const l = Cola.leer(), it = l.find(x => x.k === +m[4] && x.fila === `${m[2]}-${m[3]}`); if (it) { it.rows[0][campo] = val; Cola.escribir(l); } return toast('Corrección guardada en el móvil'); }
    const { error } = await sb.from('registros_series').update({ [campo]: val }).eq('id', reg.id);
    if (error) { input.value = reg[campo] != null ? fmtNum(reg[campo], 2) : ''; return fallo(error, 'No se ha guardado la corrección. Inténtalo de nuevo.'); }
    reg[campo] = val; this.pintar(+m[2]); toast('Corrección guardada ✓');
  },
  /* Al cargar la sesión: una serie solo cuenta como hecha si tiene todas sus partes */
  depurar() {
    const z = S.sesion; if (!z || !S.dia) return;
    S.dia.bloques_sesion.flatMap(b => b.ejercicios_sesion).filter(e => this.usa(e)).forEach(e => this.estructura(e).forEach((s, i) => {
      const fila = `${e.id}-${i + 1}`;
      if (this.estadoSerie(z, s, fila).est !== 'on') delete z.regs[fila];
      else z.regs[fila] = this.requeridas(s, fila).map(p => z.valores[`${fila}-${p}`]?.id).filter(Boolean);
    }));
  },
  /* Sesión cerrada (consulta) o plan: lista por serie con lo hecho o lo pautado */
  vistaRO(e, ro) {
    const SER = this.estructura(e), sp = esSinPeso(e), plan = ro.plan;
    return `<div class="rp-ro">${SER.map((s, si) => {
      const r = `${e.id}-${si + 1}`;
      const items = s.tandas.flatMap(t => t.partes).map(x => {
        const v = ro.valores?.[`${r}-${x.p}`], nom = this.nomParte(x), o = this.objetivo(x), u = o.iso ? ' s' : '';
        const txt = plan ? `${o.txt}${this.kgPlan(x, sp) ? ' · ' + fmtNum(numero(this.kgPlan(x, sp)), 2) + ' kg' : ''}${x.rir != null && x.rir !== '' ? ' · RIR ' + x.rir : ''}` : v ? `${v.kg != null && !sp ? fmtNum(v.kg, 2) + ' kg × ' : ''}${v.repeticiones ?? '—'}${u}` : '—';
        return `<span class="${!plan && !v ? 'muted' : ''}">${nom ? `<i>${esc(nom)}</i> ` : ''}${esc(txt)}</span>`;
      });
      return `<div class="rp-ro-s"><b>Serie ${si + 1}${s.etq ? ' · ' + esc(s.etq) : ''}</b>${items.join('')}</div>`;
    }).join('')}</div>`;
  }
};
window.Tandas = Tandas;

/* ---------- Asistente del editor: el coach rellena lo básico del método y la pauta fila a fila se genera sola ---------- */
Tandas.ed = {
  red: v => Math.round(v * 2) / 2,
  kg: v => v == null || v === '' ? '' : `${fmtNum(Tandas.ed.red(+v), 2)} kg`,
  /* Lee la pauta actual para rellenar el asistente */
  desde(tipo, met, pauta, cambio) {
    const p = pauta?.length ? (cambio ? pauta.slice(0, 1).map(t => ({ s: t.s, kg: t.kg, d: pauta[pauta.length - 1].d })) : pauta) : [], g = gruposDe(p), t0 = p[0] || {}, ult = p[p.length - 1] || {}, M = Tandas.MET[met] || {};
    const v = { pos: t0.op?.pos || '', s: t0.s || 3, r: Tandas.limpiaR(t0.r || '') || (M.myo ? '' : '10'), kg: numero(kgDe(t0)) ?? '', rir: t0.rir ?? (tipo === 'doble' ? 1 : 1), d: ult.d ?? 120,
      n: Math.max(g[0]?.tramos.length || 0, tipo === 'drop' ? 3 : 3), pausa: M.pausa ?? 20, reps: (g[0]?.tramos || []).map(t => repsPh(t.r) || t.r || ''), baja: 20 };
    if (tipo === 'pausa' && g[0]?.tramos.length > 1) v.pausa = g[0].tramos[0].d ?? v.pausa;
    if (M.iso) v.r = Tandas.segDe(t0) || 30;
    if (tipo === 'doble') { v.rir2 = g[0]?.tramos[1]?.rir ?? 0; }
    if (tipo === 'contraste' || tipo === 'ucontraste') {
      const t1 = g[0]?.tramos[1] || {};
      v.t1 = t0.tp || (Tandas.esIso(t0) ? 'iso' : 'pesado'); v.t2 = t1.tp || (Tandas.esIso(t1) ? 'iso' : 'explosivo');
      v.r1 = v.t1 === 'iso' ? (Tandas.segDe(t0) || 30) : Tandas.limpiaR(t0.r || '') || '7'; v.r2 = v.t2 === 'iso' ? (Tandas.segDe(t1) || 30) : Tandas.limpiaR(t1.r || '') || '10';
      v.kg2 = numero(kgDe(t1)) ?? ''; v.rir2 = t1.rir ?? 0; v.orden = t0.op?.orden || 'lado';
    }
    if (tipo === 'top') {
      const nuevo = g.length > 1 && g[0].s === 1, b = nuevo ? g[1] : null;
      v.var = t0.op?.var || (b ? (b.tramos.length > 1 ? (b.tramos[0].d > 0 ? 'rp' : 'drop') : 'backup') : 'backup');
      v.lados = t0.op?.lados || '2'; v.rm = t0.op?.rm ?? ''; v.r = Tandas.limpiaR(t0.r || '') || '4-5'; v.rir = t0.rir ?? 0;
      v.bs = b?.s || 2; v.br = b ? Tandas.limpiaR(b.tramos[0].r || '') : '8'; v.brir = b?.tramos[0].rir ?? 1; v.bn = b?.tramos.length > 1 ? b.tramos.length : (v.var === 'rp' ? 3 : 2);
    }
    return v;
  },
  num: (id, lbl, val, extra = '') => `<label>${lbl}<input type="text" inputmode="decimal" data-a="${id}" value="${esc(val ?? '')}" ${extra}></label>`,
  txt: (id, lbl, val, ph = '') => `<label>${lbl}<input type="text" data-a="${id}" value="${esc(val ?? '')}" placeholder="${esc(ph)}"></label>`,
  sel: (id, lbl, val, ops) => `<label>${lbl}<select data-a="${id}">${ops.map(([k, l]) => `<option value="${k}" ${String(val) === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`,
  contador: (id, lbl, val, min, max) => `<div class="as-cont"><span class="small">${lbl}</span><div class="row" style="gap:6px;align-items:center"><button type="button" class="mini" data-menos="${id}" aria-label="Quitar">−</button><b data-a-v="${id}">${val}</b><button type="button" class="mini" data-mas="${id}" data-max="${max}" data-min="${min}" aria-label="Añadir">＋</button></div></div>`,
  /* Panel del método */
  html(met, pauta, cambio) {
    const M = Tandas.MET[met]; if (!M) return '';
    const v = this.desde(M.tipo, met, pauta, cambio), comun = [this.num('s', 'Series', v.s), this.num('kg', 'Peso (kg)', v.kg), this.txt('rir', 'RIR', v.rir), this.num('d', 'Descanso entre series (s)', v.d)];
    let campos = '', extra = '';
    if (M.tipo === 'pausa') {
      campos = [this.num('s', 'Series', v.s), this.num('kg', 'Peso (kg)', v.kg), this.txt('rir', 'RIR', v.rir), this.num('pausa', 'Pausa entre tandas (s)', v.pausa), this.num('d', 'Descanso entre series (s)', v.d)].join('');
      extra = this.contador('n', 'Tandas', Math.min(Math.max(v.n, 2), 6), 2, 6) + (M.myo ? '<p class="small muted" style="margin:0">El alumno hace las que puede hasta 1 del fallo, descansa 30 s y repite; puede terminar la serie cuando ya no llegue a 4 repeticiones. No hace falta pautar repeticiones.</p>'
        : `<div class="as-reps" data-reps>${[...Array(Math.min(Math.max(v.n, 2), 6))].map((_, k) => this.txt('r' + k, `Reps tanda ${k + 1}`, v.reps[k] || v.reps[0] || (met === 'Cluster' ? '3' : '8'))).join('')}</div>`);
    } else if (M.tipo === 'drop') {
      campos = [this.num('s', 'Series', v.s), this.num('kg', 'Peso de la 1ª tanda (kg)', v.kg), this.txt('r', 'Reps por tanda', v.r), this.num('baja', 'Bajada por tanda (%)', v.baja), this.txt('rir', 'RIR', v.rir), this.num('d', 'Descanso entre series (s)', v.d)].join('');
      extra = this.contador('n', 'Tandas (con sus bajadas)', Math.min(Math.max(v.n, 2), 5), 2, 5) + '<p class="small as-prev" data-prev></p>';
    } else if (M.tipo === 'top') {
      campos = [this.num('rm', '1RM estimado (kg, opcional)', v.rm), this.num('kg', 'Peso top set (kg)', v.kg), this.txt('r', 'Reps top set', v.r), this.txt('rir', 'RIR top set', v.rir),
        this.sel('var', 'Series siguientes', v.var, [['backup', 'Back-off set'], ['drop', 'Dropset'], ['rp', 'Rest-pause']]), this.sel('lados', 'Se hace con', v.lados, [['2', 'Los 2 lados a la vez (2 manos / 2 piernas)'], ['uni', 'Unilateral: 1 mano / pierna y luego la otra'], ['doble', 'Unilateral doble: dos vueltas por lado']]), this.num('bs', 'Nº series back-off', v.bs), this.txt('br', 'Reps back-off', v.br), this.txt('brir', 'RIR back-off', v.brir), this.num('d', 'Descanso entre series (s)', v.d)].join('');
      extra = this.contador('bn', 'Tandas en cada back-off (dropset o rest-pause)', Math.min(Math.max(v.bn, 2), 4), 2, 4) + '<p class="small as-prev" data-prev></p>';
    } else if (M.tipo === 'contraste' || M.tipo === 'ucontraste') {
      campos = [this.num('s', 'Series', v.s),
        this.sel('t1', '1ª parte', v.t1, [['pesado', 'Pesado (kilos)'], ['superlento', 'Superlento (6-3-6)'], ['iso', 'Isométrico (tiempo y peso)'], ['explosivo', 'Explosivo']]), this.txt('r1', v.t1 === 'iso' ? 'Segundos' : 'Reps', v.r1), this.num('kg', 'Peso (kg)', v.kg),
        this.sel('t2', '2ª parte', v.t2, [['explosivo', 'Explosivo'], ['pesado', 'Pesado (kilos)'], ['superlento', 'Superlento (6-3-6)'], ['iso', 'Isométrico (tiempo)']]), this.txt('r2', v.t2 === 'iso' ? 'Segundos' : 'Reps', v.r2), this.num('kg2', 'Peso 2ª parte (kg)', v.kg2, 'data-auto="1"'),
        this.txt('rir', 'RIR', v.rir), this.num('d', 'Descanso entre series (s)', v.d),
        M.tipo === 'ucontraste' ? this.sel('orden', 'Orden', v.orden, [['lado', 'Por lado: derecho (1ª y 2ª parte) y luego izquierdo'], ['fase', 'Por partes: 1ª parte con los dos lados y luego la 2ª']]) : ''].join('');
    } else if (M.tipo === 'doble') {
      campos = [this.num('s', 'Series', v.s), this.txt('r', 'Reps por lado', v.r), this.num('kg', 'Peso (kg)', v.kg), this.txt('rir', 'RIR 1ª vuelta', v.rir), this.txt('rir2', 'RIR 2ª vuelta', v.rir2), this.num('d', 'Descanso entre series (s)', v.d)].join('');
    } else if (M.iso) {
      campos = [this.num('s', 'Series', v.s), this.num('r', 'Segundos que debe aguantar', v.r), this.num('kg', 'Peso (kg, si lleva carga)', v.kg), this.txt('pos', 'Posición a mantener', v.pos, 'Ej.: rodillas a 90º, codo flexionado a 90º, a mitad de recorrido'), this.num('d', 'Descanso entre series (s)', v.d)].join('');
    } else {
      campos = [this.num('s', 'Series', v.s), this.txt('r', M.forz ? 'Reps objetivo' : M.tipo === 'uni' ? 'Reps por lado' : 'Reps', v.r), ...comun.slice(1)].join('');
    }
    return `<div class="as-panel stack" data-met="${esc(met)}" data-tipo="${M.tipo}"><b class="small">Asistente · ${esc(met)}</b><span class="small muted">${esc(M.info)}${M.tempo ? ' ' + esc(Tandas.TEMPO) : ''}</span>
      <div class="as-grid">${campos}</div>${extra}<span class="small muted">La pauta de abajo se rellena sola con estos datos; si quieres, retócala fila a fila.</span></div>`;
  },
  /* Valores del panel → pauta (filas con s, r, rir, kg, d, tp, op) */
  pauta(panel) {
    const met = panel.dataset.met, M = Tandas.MET[met], a = k => panel.querySelector(`[data-a="${k}"]`)?.value.trim() ?? '', n = k => numero(a(k)), cnt = k => +(panel.querySelector(`[data-a-v="${k}"]`)?.textContent || 0);
    const s = Math.max(1, n('s') || 1), kg = n('kg'), rir = a('rir') === '' ? undefined : (/^\d+$/.test(a('rir')) ? +a('rir') : a('rir')), d = n('d') ?? 120;
    const T = (x) => { const o = {}; Object.entries(x).forEach(([k, v]) => { if (v !== undefined && v !== '' && v !== null) o[k] = v; }); return o; };
    const R = v => v === '' ? undefined : (/^\d+$/.test(v) ? +v : v);
    if (M.iso) return [T({ s, r: `${n('r') || 30}´´ isométrico`, kg: this.kg(kg), d, tp: 'iso', op: a('pos') ? { pos: a('pos') } : undefined })];
    switch (M.tipo) {
      case 'pausa': { const N = cnt('n'), p = n('pausa') ?? M.pausa;
        return [...Array(N)].map((_, k) => T({ s: k ? undefined : s, r: M.myo ? (k ? 'Las que puedas' : 'Hasta 1 del fallo') : a('r' + k) || a('r0') || '8', rir: k ? undefined : rir, kg: this.kg(kg), d: k < N - 1 ? p : d })); }
      case 'drop': { const N = cnt('n'), b = (n('baja') ?? 20) / 100;
        return [...Array(N)].map((_, k) => T({ s: k ? undefined : s, r: a('r') || '10', rir: k ? undefined : rir, kg: kg ? this.kg(kg * Math.pow(1 - b, k)) : undefined, d: k < N - 1 ? 0 : d })); }
      case 'top': { const rm = n('rm'), top = kg || (rm ? rm * 0.9 : null), bk = top ? top * 0.85 : null, v = a('var'), bn = cnt('bn'), bs = Math.max(1, n('bs') || 2), brir = R(a('brir'));
        const L = a('lados') || '2', xl = L === '2' ? '' : ' x lado';
        const out = [T({ s: 1, r: (a('r') || '4-5') + xl, rir, kg: this.kg(top), d, op: { var: v, ...(L !== '2' ? { lados: L } : {}), ...(rm ? { rm } : {}) } })];
        if (v === 'backup') out.push(T({ s: bs, r: (a('br') || '8') + xl, rir: brir, kg: this.kg(bk), d }));
        else if (v === 'drop') [...Array(bn)].forEach((_, k) => out.push(T({ s: k ? undefined : bs, r: (a('br') || '8') + xl, rir: k ? undefined : brir, kg: bk ? this.kg(bk * Math.pow(0.8, k)) : undefined, d: k < bn - 1 ? 0 : d })));
        else [...Array(bn)].forEach((_, k) => out.push(T({ s: k ? undefined : bs, r: (a('br') || '8') + xl, rir: k ? undefined : brir, kg: this.kg(bk), d: k < bn - 1 ? 20 : d })));
        return out; }
      case 'contraste': case 'ucontraste': { const t1 = a('t1'), t2 = a('t2'), x = M.tipo === 'ucontraste' ? ' x lado' : '';
        const eti = { superlento: ' (superlento)', explosivo: ' (explosivo)' };
        const r1 = t1 === 'iso' ? `${a('r1') || 30}´´ isométrico` : (a('r1') || '7') + x + (eti[t1] || ''), r2 = t2 === 'iso' ? `${a('r2') || 30}´´ isométrico` : (a('r2') || '10') + x + (eti[t2] || '');
        const kg2 = n('kg2') ?? (t1 === 'pesado' && t2 === 'explosivo' && kg ? kg * 0.5 : kg);   // pesado→explosivo: 50 %; el resto (p. ej. superlento→explosivo) con el mismo peso
        return [T({ s, r: r1, rir, kg: this.kg(kg), d: 0, tp: t1, op: M.tipo === 'ucontraste' ? { orden: a('orden') || 'lado' } : undefined }), T({ r: r2, rir: R(a('rir2') || '0') ?? 0, kg: this.kg(kg2), d, tp: t2 })]; }
      case 'doble': return [T({ s, r: (a('r') || '8') + ' x lado', rir: rir ?? 1, kg: this.kg(kg), d: 0 }), T({ r: (a('r') || '8') + ' x lado', rir: R(a('rir2')) ?? 0, kg: this.kg(kg), d })];
      case 'uni': return [T({ s, r: (a('r') || '10') + ' x lado', rir, kg: this.kg(kg), d })];
      default: return [T({ s, r: a('r') || '10', rir, kg: this.kg(kg), d })];
    }
  },
  /* Resumen de pesos calculados */
  previa(panel) {
    const M = Tandas.MET[panel.dataset.met], k2 = panel.querySelector('[data-a="kg2"]');
    if (k2) { const p = this.pauta(panel); k2.placeholder = p[1]?.kg ? `Auto: ${p[1].kg}` : ''; }
    const el = panel.querySelector('[data-prev]'); if (!el) return;
    const p = this.pauta(panel);
    if (M.tipo === 'drop') el.textContent = p.some(t => t.kg) ? `Pesos: ${p.map(t => t.kg || '—').join(' → ')}` : 'Escribe el peso de la 1ª tanda y las bajadas salen solas.';
    if (M.tipo === 'top') el.textContent = p[0].kg ? `Top set ${p[0].kg}${numero(panel.querySelector('[data-a="rm"]').value) ? ' (90 % del 1RM)' : ''} · back-off ${p[1]?.kg || '—'} (−15 %)${p.length > 2 ? ' · ' + p.slice(1).map(t => t.kg).join(' → ') : ''}` : 'Escribe el peso del top set (o el 1RM) y el resto sale solo.';
  },
  /* Conecta el panel con las filas de la pauta del formulario */
  montar(cont, filas, metSel, nombreDe) {
    const pintar = cambio => {
      const met = nombreDe(metSel.value), pauta = [...filas.querySelectorAll('[data-tramo]')].map((f, i) => leerFilaTramo(f, i));
      cont.innerHTML = this.html(met, pauta, cambio); const panel = cont.querySelector('.as-panel'); if (!panel) return; this.previa(panel);
    };
    const volcar = () => { const panel = cont.querySelector('.as-panel'); if (!panel) return; const p = this.pauta(panel); filas.innerHTML = p.map((t, i) => filaTramo(t, i === 0)).join(''); this.previa(panel); };
    metSel.addEventListener('change', () => { pintar(true); volcar(); });
    cont.addEventListener('input', ev => {
      const panel = cont.querySelector('.as-panel'); if (!panel) return;
      if (ev.target.dataset.a === 'kg2') ev.target.dataset.auto = ev.target.value.trim() ? '' : '1';
      if (ev.target.dataset.a === 'kg' || ev.target.dataset.a === 't1' || ev.target.dataset.a === 't2') { const k2 = panel.querySelector('[data-a="kg2"]'); if (k2 && k2.dataset.auto === '1') k2.value = ''; }
      if (ev.target.dataset.a === 'rm') { const k = panel.querySelector('[data-a="kg"]'); const rm = numero(ev.target.value); if (k && rm) k.value = fmtNum(this.red(rm * 0.9), 2); }
      volcar();
    });
    cont.addEventListener('change', ev => { if (/^t[12]$/.test(ev.target.dataset.a || '')) { const l = ev.target.closest('.as-grid').querySelector(`[data-a="r${ev.target.dataset.a[1]}"]`)?.closest('label'); if (l) l.firstChild.textContent = ev.target.value === 'iso' ? 'Segundos' : 'Reps'; volcar(); } if (ev.target.dataset.a === 'var') { const c = cont.querySelector('[data-a-v="bn"]'); if (c) c.textContent = ev.target.value === 'rp' ? 3 : 2; volcar(); } });
    cont.addEventListener('click', ev => {
      const b = ev.target.closest('[data-mas],[data-menos]'); if (!b) return; ev.preventDefault();
      const id = b.dataset.mas || b.dataset.menos, el = cont.querySelector(`[data-a-v="${id}"]`), mx = cont.querySelector(`[data-mas="${id}"]`), v = +el.textContent + (b.dataset.mas ? 1 : -1);
      if (v < +mx.dataset.min || v > +mx.dataset.max) return; el.textContent = v;
      const reps = cont.querySelector('[data-reps]');
      if (reps && id === 'n') { const ls = [...reps.querySelectorAll('input')].map(i => i.value); reps.innerHTML = [...Array(v)].map((_, k) => this.txt('r' + k, `Reps tanda ${k + 1}`, ls[k] ?? ls[ls.length - 1] ?? '8')).join(''); }
      volcar();
    });
    pintar();
  }
};
