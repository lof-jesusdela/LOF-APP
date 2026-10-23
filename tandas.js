/* ---------- Series con tandas internas (empezando por rest-pause) ----------
   Cada serie es una tarjeta con sus tandas: el alumno solo escribe peso y repeticiones.
   Lo pautado (objetivo, peso, RIR) se muestra como información y nunca se guarda como realizado
   sin que el alumno lo confirme. Una serie cuenta como hecha solo cuando todas sus tandas están confirmadas.
   Registro: una fila de registros_series por tanda (serie = nº de serie, tramo = nº de tanda). */
const Tandas = {
  METODOS: ['Rest-pause'],
  /* Series del ejercicio, cada una con sus tandas (según la planificación) */
  series(e) {
    const out = [];
    gruposDe(pautaEfectiva(e)).forEach(g => { for (let i = 0; i < (g.s || 1); i++) out.push(g.tramos); });
    return out;
  },
  usa(e) { return this.METODOS.includes(e?.metodos?.nombre) && this.series(e).some(t => t.length > 1); },
  ejercicio(es) { return S.dia?.bloques_sesion.flatMap(b => b.ejercicios_sesion).find(x => x.id === +es); },
  /* Duraciones: "20 s", "1 min", "1 min 30 s" (corto) y "20 segundos", "1 minuto" (largo) */
  dur(s, largo) {
    s = +s || 0; const m = Math.floor(s / 60), r = s % 60;
    if (!m) return largo ? `${r} segundos` : `${r} s`;
    if (!r) return largo ? `${m} ${m === 1 ? 'minuto' : 'minutos'}` : `${m} min`;
    return `${m} min ${r} s`;
  },
  rango(vals, largo) {
    const v = [...new Set(vals.filter(x => x != null))].sort((a, b) => a - b);
    if (!v.length) return '—'; if (v.length === 1) return v[0] ? this.dur(v[0], largo) : 'Sin descanso';
    return `${this.dur(v[0])} – ${this.dur(v[v.length - 1])}`;
  },
  rirTxt(r) {
    const t = String(r ?? '').trim(); if (t === '') return '';
    if (/^0$/.test(t)) return 'Sin repeticiones en reserva: hasta que no puedas hacer otra con buena técnica.';
    if (/^1$/.test(t)) return 'Termina cuando te quede 1 repetición en reserva.';
    if (/^\d+\s*[-–]\s*\d+$/.test(t) || /^\d+$/.test(t)) return `Termina cuando te queden ${t.replace(/\s*[-–]\s*/, '–')} repeticiones en reserva.`;
    return 'Repeticiones que deberían quedarte en reserva al terminar.';
  },
  objetivo(t) { const r = String(t?.r ?? '').trim(); const ph = repsPh(r); return { txt: ph === 'Máx' ? 'al máximo' : ph ? `${ph} reps` : r || '—', num: /^\d+$/.test(ph) ? +ph : null }; },
  hecha(z, fila, k) { return !!z.valores[`${fila}-${k}`]; },
  nHechas(z, fila, T) { let c = 0; for (let k = 0; k < T; k++) if (this.hecha(z, fila, k)) c++; return c; },

  /* ---------- Pintado ---------- */
  vista(e, ej, sp) {
    const z = S.sesion, SER = this.series(e), N = SER.length, abiertas = (z.abiertas ||= {});
    const rirDe = (tr, t) => t.rir ?? tr[0].rir ?? e.rir, rirs = SER.flatMap(tr => tr.map(t => rirDe(tr, t))).map(x => x == null || x === '' ? null : String(x));
    const rirUnico = rirs.every(x => x === rirs[0]) ? rirs[0] : undefined;
    const entreT = SER.flatMap(tr => tr.slice(0, -1).map(t => t.d ?? 0)), entreS = SER.slice(0, -1).map(tr => tr[tr.length - 1].d ?? e.descanso_seg ?? 60);
    // Serie abierta por defecto: la primera sin terminar
    const primera = SER.findIndex((tr, i) => this.nHechas(z, `${e.id}-${i + 1}`, tr.length) < tr.length);
    if (!(e.id in abiertas)) abiertas[e.id] = primera < 0 ? -1 : primera + 1;
    const kg0 = kgDe({ kg: e.peso_ref });
    const series = SER.map((tr, si) => {
      const n = si + 1, fila = `${e.id}-${n}`, T = tr.length, ultS = n === N;
      const tandas = tr.map((t, k) => {
        const id = `${fila}-${k}`, ult = k === T - 1, o = this.objetivo(t.r ? t : tr[0]);
        const kgP = sp ? '' : (t.kg === '' ? '' : kgDe(t) || (k === 0 ? kgDe(tr[0]) || kg0 : '')), bajada = !sp && t.kg === '' && k > 0;
        const rirT = rirDe(tr, t), u = z.ultimos[id], v = z.valores[id], bor = z.borr || {};
        const d = t.d ?? (ult ? e.descanso_seg ?? 60 : 0);
        const lbl = !ult ? (d > 0 ? `Tanda hecha · descansar ${this.dur(d)}` : 'Tanda hecha · sin descanso') : ultS ? 'Terminar ejercicio' : (d > 0 ? `Terminar serie · descansar ${this.dur(d)}` : 'Terminar serie · sin descanso');
        const val = (c, x) => v && v[x] != null ? fmtNum(v[x], 2) : (bor[`${c}-${id}`] ?? '');
        return `<div class="rp-tanda" id="rpt-${id}">
          <div class="rp-tt"><b>Tanda ${k + 1}</b><span class="muted"> · Objetivo: ${esc(o.txt)}${kgP ? ` · ${esc(fmtNum(numero(kgP), 2))} kg pautados` : bajada ? ' · baja el peso' : ''}</span>${rirUnico === undefined && rirT != null && rirT !== '' ? ` <span class="rp-rir-chip">RIR ${esc(String(rirT))}</span>` : ''}</div>
          ${u && (u.kg != null || u.repeticiones != null) ? `<div class="rp-ult small">Última vez: ${u.kg != null && !sp ? fmtNum(u.kg, 2) + ' kg × ' : ''}${u.repeticiones ?? '—'} reps</div>` : ''}
          <div class="rp-campos${sp ? ' uno' : ''}">
            ${sp ? '' : `<label>Peso (kg)<input id="kg-${id}" data-tanda="1" data-row="${fila}" data-plan="${esc(kgP)}"${bajada ? ' data-bajada="1"' : ''} type="text" inputmode="decimal" placeholder="—" value="${esc(val('kg', 'kg'))}" aria-label="Peso en kilos, serie ${n} tanda ${k + 1}"></label>`}
            <label>Reps realizadas<input id="rp-${id}" data-tanda="1" data-row="${fila}" data-obj="${o.num ?? ''}" type="text" inputmode="numeric" placeholder="—" value="${esc(val('rp', 'repeticiones'))}" aria-label="Repeticiones realizadas, serie ${n} tanda ${k + 1}"></label>
          </div>
          <button class="btn rp-btn" data-act="tanda" data-es="${e.id}" data-n="${n}" data-k="${k}" data-t="${T}" data-d="${ult && ultS ? 0 : d}" data-tipo="${!ult ? 'tandas' : ultS ? 'fin' : 'series'}" data-lbl="${esc(lbl)}">${esc(lbl)}</button>
          <div class="rp-ok small" hidden><span class="rp-ok-t">✓ Guardada</span><span class="muted"> · para corregir, cambia el número</span> <button class="linkbtn small" data-act="tandaQuitar" data-es="${e.id}" data-n="${n}" data-k="${k}">Quitar</button></div>
        </div>`;
      }).join('');
      return `<div class="rp-serie" id="rps-${fila}" data-es="${e.id}" data-n="${n}" data-t="${T}">
        <button class="rp-cab" data-act="rpAbrir" data-es="${e.id}" data-n="${n}" aria-expanded="false"><span class="grow"><span class="rp-tit"></span><span class="rp-sub small"></span></span><span class="rp-chev" aria-hidden="true"></span></button>
        <div class="rp-cuerpo">${tandas}</div></div>`;
    }).join('');
    return `<div class="rp-desc"><svg class="rp-reloj" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 6.5V12l3.5 2.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><div><span class="small">Entre tandas:</span><b>${esc(this.rango(entreT, true))}</b></div>${N > 1 ? `<div class="rp-sep"></div><div><span class="small">Entre series:</span><b>${esc(this.rango(entreS, true))}</b></div>` : ''}</div>
      ${rirUnico ? `<div class="rp-rir"><svg class="rp-rir-ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="13" width="5" height="8" rx="1"/><rect x="10" y="8" width="5" height="13" rx="1"/><rect x="17" y="3" width="5" height="18" rx="1"/></svg><div><b>Esfuerzo indicado · RIR ${esc(rirUnico)}</b><span class="small">${esc(this.rirTxt(rirUnico))}</span></div></div>` : rirs.some(x => x != null) ? `<div class="rp-rir"><svg class="rp-rir-ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="13" width="5" height="8" rx="1"/><rect x="10" y="8" width="5" height="13" rx="1"/><rect x="17" y="3" width="5" height="18" rx="1"/></svg><div><b>Esfuerzo indicado</b><span class="small">El RIR cambia según la tanda: lo verás junto a cada una. RIR = repeticiones que deberían quedarte en reserva.</span></div></div>` : ''}
      <div class="rp-wrap" id="rpw-${e.id}">${series}</div>`;
  },
  /* Estados visibles (sin rehacer los campos, para no perder lo escrito) */
  pintar(es) {
    const z = S.sesion; if (!z) return;
    const cajas = es ? [document.getElementById('rpw-' + es)] : [...document.querySelectorAll('.rp-wrap')];
    const pend = new Set(Cola.leer().filter(x => x.k != null && S.dia && x.ses.dia_id === S.dia.id && x.ses.fecha === z.fecha).map(x => `${x.fila}-${x.k}`));
    cajas.filter(Boolean).forEach(w => {
      const eid = +w.id.slice(4), S_ = [...w.querySelectorAll('.rp-serie')], N = S_.length, ab = z.abiertas?.[eid];
      S_.forEach(el => {
        const n = +el.dataset.n, T = +el.dataset.t, fila = `${eid}-${n}`, h = this.nHechas(z, fila, T), abierta = ab === n;
        const est = h === T ? 'on' : h ? 'parcial' : 'pend';
        el.classList.toggle('on', est === 'on'); el.classList.toggle('parcial', est === 'parcial'); el.classList.toggle('abierta', abierta);
        el.querySelector('.rp-cab').setAttribute('aria-expanded', abierta ? 'true' : 'false');
        const res = [...Array(T)].map((_, k) => { const v = z.valores[`${fila}-${k}`]; return v ? `${v.kg != null ? fmtNum(v.kg, 2) + '×' : ''}${v.repeticiones ?? '—'}` : null; }).filter(Boolean).join(' · ');
        el.querySelector('.rp-tit').textContent = abierta ? `Serie ${n} de ${N}` : `Serie ${n} · ${est === 'on' ? 'Completada ✓' : est === 'parcial' ? `Parcial · ${h} de ${T} tandas` : 'Pendiente'}`;
        el.querySelector('.rp-sub').textContent = abierta ? (est === 'on' ? `Completada ✓ · ${res}` : est === 'parcial' ? `${h} de ${T} tandas hechas · completa las que faltan` : `Completa las ${T} tandas`) : (est !== 'pend' ? res : '');
        for (let k = 0; k < T; k++) {
          const id = `${fila}-${k}`, t = document.getElementById('rpt-' + id); if (!t) continue;
          const ok = this.hecha(z, fila, k), b = t.querySelector('.rp-btn');
          t.classList.toggle('on', ok); b.hidden = ok; t.querySelector('.rp-ok').hidden = !ok;
          t.querySelector('.rp-ok-t').textContent = pend.has(id) ? '⏳ Guardada en el móvil · se enviará al volver la conexión' : '✓ Guardada';
          t.querySelectorAll('input').forEach(i => i.classList.toggle('on', ok));
          if (!ok && !z.guard?.[id] && b.dataset.conf !== '1') { b.disabled = false; b.textContent = b.dataset.lbl; }
        }
      });
    });
  },
  abrir(es, n) { const z = S.sesion; z.abiertas ||= {}; z.abiertas[es] = z.abiertas[es] === +n ? -1 : +n; this.pintar(es); },

  /* ---------- Confirmar una tanda: guarda lo realizado y arranca el descanso que toca ---------- */
  async confirmar(b) {
    const z = S.sesion, es = +b.dataset.es, n = +b.dataset.n, k = +b.dataset.k, T = +b.dataset.t, fila = `${es}-${n}`, id = `${fila}-${k}`;
    z.guard ||= {};
    if (z.guard[id] || this.hecha(z, fila, k)) return;   // evita duplicados por pulsaciones repetidas
    const kgI = document.getElementById('kg-' + id), rpI = document.getElementById('rp-' + id);
    let kg = kgI ? numero(kgI.value) : null, rp = numero(rpI.value);
    const kgPlan = kgI ? numero(kgI.dataset.plan) : null, rpPlan = numero(rpI.dataset.obj);
    if (rp == null && rpPlan == null) { toast('Escribe las repeticiones que has hecho'); rpI.focus(); return; }
    const faltan = rp == null || (kgI && kg == null && kgPlan != null);
    if (faltan) {
      // Sin escribir nada: no se guarda lo pautado salvo que el alumno lo confirme expresamente
      if (b.dataset.conf !== '1') {
        const r = rp ?? rpPlan, p = kg ?? kgPlan;
        b.dataset.conf = '1'; b.classList.add('conf');
        b.textContent = `¿Has hecho ${r} reps${p != null ? ` con ${fmtNum(p, 2)} kg` : ''}? Toca para confirmar`;
        clearTimeout(b._t); b._t = setTimeout(() => { if (b.dataset.conf === '1') { b.dataset.conf = ''; b.classList.remove('conf'); b.textContent = b.dataset.lbl; } }, 6000);
        return;
      }
      if (rp == null) { rp = rpPlan; rpI.value = rp; }
      if (kgI && kg == null && kgPlan != null) { kg = kgPlan; kgI.value = fmtNum(kg, 2); }
    }
    clearTimeout(b._t); b.dataset.conf = ''; b.classList.remove('conf');
    z.guard[id] = true; b.disabled = true; b.textContent = 'Guardando…';
    if (!z.inicio && !z.editar) empezarCrono();
    const row = { alumno_id: uidSes(), ejercicio_sesion_id: es, serie: n, tramo: k + 1, kg, repeticiones: rp, rir: null };
    let sid = null, guardada = false;
    try {
      sid = await asegurarSesion(); row.sesion_id = sid;
      const { data, error } = await conRespaldo(() => sb.from('registros_series').insert(row).select('id').single(),
        () => { const { tramo, ...x } = row; return sb.from('registros_series').insert(x).select('id').single(); });
      if (error) throw error;
      row.id = data.id; z.valores[id] = row; guardada = true;
    } catch (err) {
      if (!sinRed(err)) { z.guard[id] = false; b.disabled = false; b.textContent = b.dataset.lbl; return fallo(err, 'No se ha guardado la tanda. Revisa la conexión e inténtalo de nuevo.'); }
      const { sesion_id, ...r } = row;
      Cola.anadir({ uid: Date.now() + '-' + id, fila, k, sid: z.id || null, ses: { alumno_id: uidSes(), dia_id: S.dia.id, fecha: z.fecha || hoyISO(), estado: 'parcial' }, rows: [r] });
      z.valores[id] = r; guardada = true; toast('Sin conexión: la tanda queda guardada en el móvil y se enviará sola');
    }
    z.guard[id] = false;
    if (!guardada) return;
    // Descanso: entre tandas, entre series o ninguno al terminar el ejercicio (el final del descanso no marca nada)
    const d = +b.dataset.d, tipo = b.dataset.tipo, nom = ejDe(this.ejercicio(es) || {}).nombre || '';
    if (!z.editar) {
      if (tipo === 'fin') toast('Ejercicio terminado ✓');
      else if (d > 0) startTimer(d, `Descanso · ${nom} · entre ${tipo === 'tandas' ? 'tandas' : 'series'}`);
      else toast(tipo === 'tandas' ? 'Sin descanso: sigue con la siguiente tanda' : 'Sin descanso: sigue con la siguiente serie');
    }
    this.trasGuardar(es, n, k, T, sid, kg);
  },
  trasGuardar(es, n, k, T, sid, kg) {
    const z = S.sesion, fila = `${es}-${n}`, e = this.ejercicio(es);
    // El peso realizado pasa a la siguiente tanda (o a la 1ª tanda de la siguiente serie) como valor editable; las reps nunca se copian
    const sigId = k < T - 1 ? `${fila}-${k + 1}` : `${es}-${n + 1}-0`, sk = document.getElementById('kg-' + sigId);
    const ref = k < T - 1 ? { kg, plan: numero(document.getElementById(`kg-${fila}-${k}`)?.dataset.plan) } : { kg: z.valores[`${fila}-0`]?.kg ?? kg, plan: numero(document.getElementById(`kg-${fila}-0`)?.dataset.plan) };
    const planSig = sk ? numero(sk.dataset.plan) : null;
    if (sk && !sk.value && !sk.dataset.bajada && ref.kg != null && (planSig == null || planSig === ref.plan)) { sk.value = fmtNum(ref.kg, 2); (z.borr ||= {})['kg-' + sigId] = sk.value; }
    if (this.nHechas(z, fila, T) === T) {
      z.regs[fila] = [...Array(T)].map((_, j) => z.valores[`${fila}-${j}`]?.id).filter(Boolean);
      const SER = e ? this.series(e) : [], sig = SER.findIndex((tr, i) => this.nHechas(z, `${es}-${i + 1}`, tr.length) < tr.length);
      (z.abiertas ||= {})[es] = sig < 0 ? -1 : sig + 1;
      if (sid && !z.editar) { actualizarConteo(sid); Peso.revisar(es, fila, T, sid); }
    } else if (sid && !z.editar) actualizarConteo(sid);
    this.pintar(es); setTimeout(() => Guia.pintar(), 0);
    const foco = document.getElementById('rpt-' + (k < T - 1 ? `${fila}-${k + 1}` : `${es}-${n + 1}-0`));
    if (foco && z.abiertas[es] !== -1) foco.scrollIntoView({ behavior: 'smooth', block: 'center' });
  },
  async quitar(b) {
    const z = S.sesion, es = +b.dataset.es, n = +b.dataset.n, k = +b.dataset.k, fila = `${es}-${n}`, id = `${fila}-${k}`, v = z.valores[id]; if (!v) return;
    const enCola = Cola.leer().find(x => x.k === k && x.fila === fila && x.ses.dia_id === S.dia.id && x.ses.fecha === z.fecha);
    if (enCola) Cola.escribir(Cola.leer().filter(x => x.uid !== enCola.uid));
    else if (v.id) { const { error } = await sb.from('registros_series').delete().eq('id', v.id); if (error) return fallo(error, 'No se ha podido quitar la tanda.'); }
    delete z.valores[id]; delete z.regs[fila]; Cola.pintar();
    if (z.id && !z.editar) actualizarConteo(z.id);
    (z.abiertas ||= {})[es] = n; this.pintar(es); Guia.pintar(); toast('Tanda quitada: vuelve a confirmarla cuando la hagas');
  },
  /* Corrección de una tanda ya confirmada (al cambiar el número) */
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
  /* Al cargar la sesión: una serie solo cuenta como hecha si tiene todas sus tandas */
  depurar() {
    const z = S.sesion; if (!z || !S.dia) return;
    S.dia.bloques_sesion.flatMap(b => b.ejercicios_sesion).filter(e => this.usa(e)).forEach(e => this.series(e).forEach((tr, i) => {
      const fila = `${e.id}-${i + 1}`;
      if (this.nHechas(z, fila, tr.length) < tr.length) delete z.regs[fila];
      else z.regs[fila] = [...Array(tr.length)].map((_, j) => z.valores[`${fila}-${j}`]?.id).filter(Boolean);
    }));
  }
};
window.Tandas = Tandas;
