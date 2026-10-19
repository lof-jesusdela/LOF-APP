/* Plan de hábitos · pestaña Hábitos del alumno, registro diario, seguimiento y vista del coach.
   Método (informe «Instalación progresiva de hábitos en procesos de 8 semanas», oct 2026):
   - Un hábito nuevo cada 2 semanas, como mucho 3 nuevos por bloque de 8 y nunca más de 3 con registro diario.
   - Solo entra el siguiente si el último está en verde: 80 % o más de los últimos 14 días, contando la versión mínima.
   - Registro de un toque (hecho / mínimo / no); objetivo semanal «7 días con 2 comodines»; sin rachas que vuelvan a cero.
   - Automaticidad (SRBAI: 4 preguntas de 1 a 7) a las 4 y a las 8 semanas; en mantenimiento se registra una vez por semana.
   - El primero lo elige el alumno entre 3 opciones; si el sueño falla, se recomienda empezar por la hora de acostarse.
   - El perfil de temperamento ordena y explica; mandan los datos (sueño, pasos, cafeína, alcohol, estrés…).
   Datos: tablas habitos y habitos_registro (Bloque 31). Se carga antes que app.js y usa sus utilidades al ejecutarse. */
'use strict';
const Habitos = (() => {
  const AVISO = 'Falta ejecutar el Bloque 31 (hábitos) en Supabase.';
  const MOTIVOS = ['Olvido', 'Sin tiempo', 'Evento social', 'Enfermedad', 'No me apetecía'];
  const SRBAI = ['Lo hago automáticamente', 'Lo hago sin tener que acordarme', 'Lo hago sin pensarlo', 'Empiezo a hacerlo antes de darme cuenta'];
  const ESTADO = { propuesto: ['', 'Más adelante'], instalacion: ['blue', 'Cada día'], mantenimiento: ['ok', 'Mantenimiento'], consolidado: ['ok', 'Consolidado'], pausado: ['warn', 'En pausa'], descartado: ['', 'Descartado'] };
  const SEM = { verde: ['ok', 'En verde'], ambar: ['warn', 'En ámbar'], rojo: ['bad', 'En rojo'], nuevo: ['blue', 'Arrancando'] };
  const aMin = h => { const [a, b] = String(h || '').split(':').map(Number); return isNaN(a) ? null : a * 60 + (b || 0); };
  const deMin = m => { m = ((Math.round(m) % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
  const hm = m => `${Math.floor(m / 60)} h${m % 60 ? ' ' + String(m % 60).padStart(2, '0') : ''}`;
  const diasEntre = (a, b) => Math.round((fecha(b) - fecha(a)) / 864e5);
  const cumple = v => v === 'hecho' || v === 'minimo';
  const es = (d, ...l) => l.includes(d);
  const PERFIL = { colerico: 'colérico', sanguineo: 'sanguíneo', melancolico: 'melancólico', flematico: 'flemático' };

  /* ---------- Contexto del alumno: su último cuestionario de temperamento ---------- */
  function contexto(t, sx, srv) {
    const b = t?.respuestas?.b || {}, a = t?.respuestas?.a || [], sen = t?.senales || [];
    const su = t ? Temperamento.sueno(b.horarios) : null, cr = t ? Temperamento.CRONO(t.rmeq) : null, pf = t ? Temperamento.perfilDe(t, sx) : {};
    const cortoSueno = !!(su && su.lab < 420), desfase = !!(su && su.desfase >= 60), insomnio = sen.includes('insomnio');
    return { t, b, a, su, cr: cr?.k || null, dom: pf.dom || null, delicado: sen.includes('animo'), cortoSueno, desfase, insomnio, suenoMal: cortoSueno || desfase || insomnio, estres: b.estres ?? null, futbol: !!srv?.modulo_futbol };
  }
  const conPerfil = (c, ...l) => es(c.dom, ...l) ? ` Encaja con tu perfil ${PERFIL[c.dom]}.` : '';

  /* ---------- Catálogo: cada hábito con su «si-entonces», su versión pequeña y cuándo conviene ---------- */
  const corteCafe = c => (aMin(c.b.horarios?.lab_le) ?? 420) > 540 ? 15 * 60 : 14 * 60;
  const CAT = [
    { k: 'sueno_hora', cat: 'Sueño', llave: true, base: .5,
      pts: c => (c.cortoSueno ? 5 : 0) + (c.desfase ? 4 : 0) + (c.insomnio ? 3 : 0) + (c.cr === 'vespertino' ? 1 : 0) + (c.dom === 'sanguineo' ? 2 : 0),
      hora: c => { const ac = aMin(c.b.horarios?.lab_ac); return ac == null ? '23:30' : deMin(c.cortoSueno ? ac - 20 : ac); },
      t: () => 'Hora de acostarte estable, también el fin de semana',
      si: (c, h) => `Cuando sean las ${deMin(aMin(h) - 30)} → empiezo a prepararme para dormir y a las ${h} me acuesto (±45 min), también el fin de semana`,
      siMin: (c, h) => `Me acuesto como mucho una hora después de las ${h}, también el fin de semana`,
      min: (c, h) => `Acostarme como mucho una hora después de las ${h}`,
      porque: c => [c.cortoSueno ? `Entre semana duermes ${hm(c.su.lab)}.` : '', c.desfase ? `El fin de semana tus horarios se mueven ${hm(c.su.desfase)}.` : '', c.insomnio ? 'Llevas semanas durmiendo mal.' : '', c.suenoMal ? 'Es el hábito «llave»: cuando el sueño va bien, el apetito, la energía y el estrés mejoran solos.' : 'Dormir con horario fijo es la base de la energía y la recuperación.'].filter(Boolean).join(' ') + conPerfil(c, 'sanguineo') },
    { k: 'pantallas', cat: 'Sueño',
      pts: c => (c.suenoMal ? 2 : 0) + (c.estres >= 6 ? 2 : 0) + (es(c.dom, 'colerico', 'melancolico') ? 2 : 0),
      t: () => 'Rato sin pantallas antes de dormir',
      si: () => 'Después de lavarme los dientes → dejo el móvil cargando fuera del dormitorio y 30 minutos sin pantallas',
      siMin: () => 'Después de lavarme los dientes → 15 minutos sin pantallas', min: () => '15 minutos sin pantallas',
      porque: c => `${c.estres >= 6 ? `Tu estrés de las últimas semanas está en ${c.estres}/10. ` : ''}Bajar revoluciones antes de dormir mejora la calidad del sueño.${conPerfil(c, 'colerico', 'melancolico')}` },
    { k: 'cafeina', cat: 'Sueño', quitar: true,
      ok: c => es(c.b.cafe, '2', '3 o más') || (c.b.cafe === '1' && c.suenoMal),
      pts: c => (c.b.cafe === '3 o más' ? 3 : c.b.cafe === '2' ? 2 : 0) + (c.suenoMal ? 2 : 0) + (c.dom === 'colerico' ? 2 : 0),
      t: c => `Cafeína solo antes de las ${deMin(corteCafe(c))}`,
      si: c => `Si me apetece un café después de las ${deMin(corteCafe(c))} → tomo descafeinado o una infusión`,
      siMin: c => `Si me apetece un café después de las ${deMin(corteCafe(c) + 120)} → descafeinado`, min: c => `El último café antes de las ${deMin(corteCafe(c) + 120)}`,
      porque: c => `Tomas ${c.b.cafe === '1' ? 'un café' : c.b.cafe + ' cafés'} al día. La cafeína de la tarde quita sueño profundo aunque te duermas igual.${conPerfil(c, 'colerico')}` },
    { k: 'paseo', cat: 'Movimiento', base: 1,
      pts: c => ({ 'Menos de 5.000': 4, '5.000 a 8.000': 3, 'No lo sé': 2, '8.000 a 10.000': 1 }[c.b.pasos] || 0) + (c.dom === 'flematico' ? 3 : 0) + (c.a[11] === 'A' ? 1 : 0) + (es(c.b.entrenos, 'Ninguno', '1 o 2') ? 1 : 0),
      t: () => 'Paseo de 10 minutos después de la comida principal',
      si: () => 'Cuando acabe de comer → salgo a caminar 10 minutos',
      siMin: () => 'Cuando acabe de comer → 5 minutos andando, aunque sea por casa', min: () => '5 minutos andando',
      porque: c => `${c.b.pasos && c.b.pasos !== 'No lo sé' ? `Ahora das ${c.b.pasos.toLowerCase()} pasos al día. ` : ''}Moverte después de comer suma pasos y ayuda a gestionar el azúcar de la comida.${conPerfil(c, 'flematico')}` },
    { k: 'comidas_hora', cat: 'Alimentación', ok: c => !c.delicado,
      pts: c => (c.dom === 'melancolico' ? 3 : 0) + (c.dom === 'colerico' ? 2 : 0) + (c.b.comidas === '1 o 2' ? 2 : 0) + (es(c.a[3], 'A', 'C') ? 1 : 0),
      t: () => 'Comidas a horas fijas',
      si: () => 'Fijo mis comidas en franjas (±1 h) y, cuando llega la hora → como, aunque no tenga mucha hambre',
      siMin: () => 'La comida principal siempre en su franja', min: () => 'La comida principal a su hora',
      porque: c => `${c.b.comidas === '1 o 2' ? 'Ahora haces 1 o 2 comidas al día. ' : ''}${c.a[3] === 'A' ? 'Si no comes a tiempo te cambia el humor y llegas con hambre a la siguiente. ' : c.a[3] === 'C' ? 'Tienes poco apetito y te es fácil saltarte comidas. ' : ''}Un horario fijo ordena el hambre y la digestión.${conPerfil(c, 'melancolico', 'colerico')}` },
    { k: 'verdura', cat: 'Alimentación', base: 1, ok: c => !c.delicado,
      pts: c => (c.dom === 'flematico' ? 2 : 0) + (es(c.dom, 'sanguineo', 'colerico') ? 1 : 0),
      t: () => 'Verdura o fruta en cada comida principal',
      si: () => 'Cuando prepare la comida o la cena → lo primero que pongo en el plato es la verdura',
      siMin: () => 'Verdura o fruta en una de las dos comidas principales', min: () => 'En una de las dos comidas',
      porque: c => `Añadir es más fácil que quitar: la verdura llena, aporta fibra y arrastra a comer mejor el resto del plato.${conPerfil(c, 'flematico')}` },
    { k: 'alcohol', cat: 'Alimentación', quitar: true, ok: c => !c.delicado && es(c.b.alcohol, '4 a 7', 'Más de 7'),
      pts: c => (c.b.alcohol === 'Más de 7' ? 5 : 4) + (c.dom === 'sanguineo' ? 2 : 0),
      t: () => 'Alcohol dentro de lo pactado',
      si: () => 'Si tengo un plan con alcohol → decido antes cuántas tomo y alterno cada una con un vaso de agua',
      siMin: () => 'Si tengo un plan con alcohol → una bebida menos de lo habitual', min: () => 'Una bebida menos de lo habitual',
      porque: c => `Ahora tomas ${c.b.alcohol.toLowerCase()} bebidas con alcohol a la semana: es de lo que más pesa en la cintura y en el sueño.${conPerfil(c, 'sanguineo')}` },
    { k: 'agua', cat: 'Otros', base: 1,
      pts: c => (c.dom === 'colerico' ? 2 : 0) + ((c.b.ambiente || []).includes('Caluroso') ? 1 : 0) + (c.a[5] === 'A' ? 1 : 0),
      t: () => 'Botella de agua siempre a mano',
      si: () => 'Por la noche → dejo la botella llena junto a las llaves o en la bolsa',
      siMin: () => 'Un vaso de agua con cada comida', min: () => 'Un vaso de agua con cada comida',
      porque: c => `${c.a[5] === 'A' ? 'Sudas con facilidad. ' : ''}Ir bien hidratado sostiene la energía y el rendimiento.${conPerfil(c, 'colerico')}` },
    { k: 'pausa', cat: 'Estrés',
      pts: c => (c.estres >= 7 ? 4 : c.estres >= 5 ? 2 : 0) + (es(c.dom, 'colerico', 'melancolico') ? 2 : 0),
      t: () => '5 minutos para bajar revoluciones al acabar el trabajo',
      si: () => 'Cuando cierre el ordenador o salga del trabajo → 5 minutos de respiración lenta o de paseo sin móvil',
      siMin: () => 'Cuando cierre el ordenador → 1 minuto de respiración lenta', min: () => '1 minuto de respiración lenta',
      porque: c => `${c.estres != null ? `Tu estrés de las dos últimas semanas está en ${c.estres}/10. ` : ''}Cortar el día con una pausa ayuda a dormir y a no comer por ansiedad.${conPerfil(c, 'colerico', 'melancolico')}` },
    { k: 'luz', cat: 'Sueño',
      pts: c => (c.cr === 'vespertino' ? 3 : 0) + (c.dom === 'flematico' ? 2 : 0) + (c.desfase ? 1 : 0) + (c.b.lugar === 'En interior' ? 1 : 0),
      t: () => '10 minutos de luz natural por la mañana',
      si: () => 'Después de desayunar → salgo 10 minutos a la calle o a la terraza',
      siMin: () => 'Al levantarme → abro la persiana y desayuno junto a la ventana', min: () => 'Desayunar junto a la ventana',
      porque: c => `${c.cr === 'vespertino' ? 'Eres más de noche: la luz de la mañana adelanta tu reloj y te ayuda a dormirte antes. ' : ''}${c.b.lugar === 'En interior' ? 'Pasas casi todo el día en interior. ' : ''}${c.dom === 'flematico' ? 'Empezar el día con luz y movimiento te da más energía que dormir más.' : 'La luz de la mañana te despierta y ordena tu reloj.'}` },
    { k: 'recuperacion', cat: 'Fútbol', ok: c => c.futbol,
      pts: () => 5,
      t: () => 'Comida o batido de recuperación después de entrenar',
      si: () => 'Cuando salga del vestuario → como lo que llevo preparado en la bolsa (proteína y algo de hidrato)',
      siMin: () => 'Un lácteo o una fruta en la primera hora después de entrenar', min: () => 'Un lácteo o una fruta',
      porque: () => 'Recuperar bien después de entrenar es lo que antes notas en las piernas al día siguiente. Los días sin entreno, márcalo como hecho.' }
  ];
  const cat = k => CAT.find(x => x.k === k);

  /* Propuesta: opciones para empezar (nunca una restricción; la hora de acostarse delante si el sueño falla) y orden del resto */
  function proponer(c) {
    const l = CAT.filter(x => !x.ok || x.ok(c)).map(x => ({ k: x.k, p: (x.base || 0) + x.pts(c), quitar: !!x.quitar })).filter(o => o.p > 0).sort((a, b) => b.p - a.p);
    let prim = l.filter(o => !o.quitar);
    if (c.suenoMal) { const s = prim.find(o => o.k === 'sueno_hora'); if (s) prim = [s, ...prim.filter(o => o !== s)]; }
    return { opciones: prim.slice(0, 3).map(o => o.k), todos: l.map(o => o.k), recomendado: prim[0]?.k || null };
  }
  function ordenar(primero, todos) {
    const resto = todos.filter(k => k !== primero);
    if (primero === 'sueno_hora' && resto.includes('pantallas')) { resto.splice(resto.indexOf('pantallas'), 1); resto.unshift('pantallas'); }   // misma franja: aprovecha la señal
    return [primero, ...resto];
  }
  /* Filas del plan: el primero empieza hoy y los demás esperan su turno (3 para este bloque y 2 de reserva) */
  function filasPlan(c, alumnoId, primero, cfg = {}) {
    const hoy = hoyISO();
    return ordenar(primero, proponer(c).todos.concat(primero)).filter((k, i, l) => l.indexOf(k) === i).slice(0, 5).map((k, i) => {
      const x = cat(k), h = x.hora ? (i === 0 && cfg.hora) || x.hora(c) : null, p0 = i === 0;
      return { alumno_id: alumnoId, clave: k, titulo: x.t(c, h), si_entonces: p0 && cfg.si ? cfg.si : x.si(c, h), minimo: x.min(c, h), porque: x.porque(c), orden: i + 1, estado: p0 ? 'instalacion' : 'propuesto', inicio: p0 ? hoy : null, confianza: p0 ? cfg.conf ?? null : null };
    });
  }

  /* ---------- Cuentas de un hábito: semáforo de 14 días, semana con 2 comodines, semanas cumplidas, alertas ---------- */
  function stats(h, regs, hoy = hoyISO()) {
    if (!h?.inicio) return null;
    const r = new Map(regs.filter(x => x.habito_id === h.id && x.valor !== 'semana').map(x => [x.fecha, x]));
    const dias = diasEntre(h.inicio, hoy) + 1;
    const fin = r.get(hoy) ? hoy : sumaDias(hoy, -1);   // hoy cuenta cuando ya está marcado
    const pctEntre = (a, b) => { let n = 0, ok = 0; for (let d = a < h.inicio ? h.inicio : a; d <= b; d = sumaDias(d, 1)) { n++; if (cumple(r.get(d)?.valor)) ok++; } return { n, ok, pct: n ? Math.round(ok / n * 100) : null }; };
    const v14 = pctEntre(sumaDias(fin, -13), fin), prev = pctEntre(sumaDias(fin, -27), sumaDias(fin, -14));
    const sem = v14.n < 5 ? 'nuevo' : v14.pct >= 80 ? 'verde' : v14.pct >= 50 ? 'ambar' : 'rojo';
    const lun = lunesDe(hoy); let wOk = 0, wNo = 0;
    for (let d = lun < h.inicio ? h.inicio : lun; d <= hoy; d = sumaDias(d, 1)) { const v = r.get(d)?.valor; if (cumple(v)) wOk++; else if (d < hoy || v === 'no') wNo++; }
    let semOk = 0, semTot = 0;
    for (let l = lunesDe(h.inicio); l < lun; l = sumaDias(l, 7)) { let f = 0, n = 0; for (let i = 0; i < 7; i++) { const d = sumaDias(l, i); if (d < h.inicio) continue; n++; if (!cumple(r.get(d)?.valor)) f++; } if (n >= 4) { semTot++; if (f <= 2) semOk++; } }
    const falla = d => d >= h.inicio && !cumple(r.get(d)?.valor);
    const dosSeguidos = dias >= 3 && falla(sumaDias(hoy, -1)) && falla(sumaDias(hoy, -2));
    const caida = prev.n >= 7 && v14.n >= 7 && prev.pct - v14.pct > 20;
    return { dias, pct: v14.pct, n14: v14.n, sem, wOk, wNo, comodines: Math.max(0, 2 - wNo), semOk, semTot, dosSeguidos, caida, r };
  }
  /* Bloque de 8 semanas contado desde el primer hábito */
  function bloque(habs, hoy = hoyISO()) {
    const ini = habs.map(h => h.inicio).filter(Boolean).sort()[0]; if (!ini) return null;
    const d = Math.max(0, diasEntre(ini, hoy)), n = Math.floor(d / 56) + 1, bIni = sumaDias(ini, (n - 1) * 56);
    return { n, sem: Math.floor((d % 56) / 7) + 1, ini: bIni, fin: sumaDias(bIni, 55), nuevos: habs.filter(h => h.inicio && h.inicio >= bIni && h.inicio <= sumaDias(bIni, 55)).length };
  }
  /* ¿Puede entrar el siguiente? Solo si el último lleva 14 días y está en verde, hay hueco y el bloque lo permite */
  function siguiente(habs, regs, hoy = hoyISO()) {
    const sig = habs.filter(h => h.estado === 'propuesto').sort((a, b) => a.orden - b.orden)[0] || null;
    const act = habs.filter(h => h.estado === 'instalacion' && h.inicio);
    if (!sig) return { ok: false, motivo: 'sin' };
    if (!act.length) return { ok: true, sig };
    const ult = act.slice().sort((a, b) => b.inicio.localeCompare(a.inicio))[0], s = stats(ult, regs, hoy), b = bloque(habs, hoy);
    if (act.length >= 3) return { ok: false, motivo: 'lleno', sig };
    if (s.dias < 14) return { ok: false, motivo: 'pronto', sig, faltan: 14 - s.dias, ult };
    if (b && b.nuevos >= 3) return { ok: false, motivo: 'bloque', sig, b };
    if (b && b.sem >= 7) return { ok: false, motivo: 'consolidar', sig, b };
    if (s.sem !== 'verde') return { ok: false, motivo: s.sem, sig, ult, s };
    return { ok: true, sig, ult };
  }
  const srbaiToca = (h, s) => !s || !es(h.estado, 'instalacion', 'mantenimiento') ? null : s.dias >= 56 && h.srbai?.['8'] == null ? '8' : s.dias >= 28 && h.srbai?.['4'] == null && s.dias < 56 ? '4' : null;
  const aMantenimiento = (h, s) => h.estado === 'instalacion' && s && s.dias >= 28 && s.pct >= 85 && (h.srbai?.['8'] ?? h.srbai?.['4'] ?? 0) >= 5;
  const semanales = (h, regs) => regs.filter(x => x.habito_id === h.id && x.valor === 'semana').sort((a, b) => b.fecha.localeCompare(a.fecha));

  /* ---------- Datos ---------- */
  async function cargar(uid, d) {
    const [h, r] = await Promise.all([sb.from('habitos').select('*').eq('alumno_id', uid).order('orden'), sb.from('habitos_registro').select('*').eq('alumno_id', uid).gte('fecha', sumaDias(hoyISO(), -120))]);
    d.habitos = h.data || []; d.habReg = r.data || []; d.habErr = !!(h.error || r.error);
  }
  async function cargarCoach(c) {
    const [h, r] = await Promise.all([sb.from('habitos').select('*').order('orden'), sb.from('habitos_registro').select('*').gte('fecha', sumaDias(hoyISO(), -3))]);
    c.habitos = h.data || []; c.habReg = r.data || []; c.habErr = !!(h.error || r.error);
  }
  async function cargarFicha(f) {
    const [h, r] = await Promise.all([sb.from('habitos').select('*').eq('alumno_id', f.id).order('orden'), sb.from('habitos_registro').select('*').eq('alumno_id', f.id).gte('fecha', sumaDias(hoyISO(), -120))]);
    f.habitos = h.data || []; f.habReg = r.data || []; f.habErr = !!(h.error || r.error);
  }
  const mios = () => (S.d?.habitos || []).filter(h => h.estado !== 'descartado');
  const misReg = () => S.d?.habReg || [];
  const miTemp = () => (S.d?.temperamentos || [])[0] || null;
  const ctxMio = () => contexto(miTemp(), S.perfil?.sexo, S.d?.servicio);

  /* ---------- Piezas de interfaz ---------- */
  function filaMarca(h, regs, dia) {
    const v = regs.find(x => x.habito_id === h.id && x.fecha === dia);
    return `<div class="hb-hoy"><div class="stack" style="gap:3px"><b>${esc(h.titulo)}</b>${h.si_entonces ? `<span class="small muted">${esc(h.si_entonces)}</span>` : ''}</div>
      <div class="hb-3" role="group" aria-label="¿Lo has hecho?">${[['hecho', 'Hecho'], ['minimo', 'Mínimo'], ['no', 'No']].map(([k, l]) => `<button type="button" class="${k}" data-act="hbMarca" data-id="${h.id}" data-v="${k}" data-f="${dia}" aria-pressed="${v?.valor === k}">${l}</button>`).join('')}</div>
      ${h.minimo ? `<span class="small muted">Mínimo: ${esc(h.minimo)}. También cuenta.</span>` : ''}
      ${v?.valor === 'no' ? `<div class="stack" style="gap:6px"><span class="small">¿Qué ha pasado? <span class="muted">(opcional)</span></span><div class="chips hb-mot">${MOTIVOS.map(m => `<button type="button" data-act="hbMotivo" data-id="${h.id}" data-f="${dia}" data-v="${esc(m)}" aria-pressed="${v.motivo === m}">${m}</button>`).join('')}</div></div>` : ''}</div>`;
  }
  function calendario(h, s, hoy = hoyISO()) {
    const ini0 = sumaDias(lunesDe(hoy), -21), ini = h.inicio && h.inicio > ini0 ? lunesDe(h.inicio) : ini0, n = diasEntre(ini, sumaDias(lunesDe(hoy), 6)) + 1, celdas = [];   // como mucho 4 semanas; menos si acaba de empezar
    for (let i = 0; i < n; i++) {
      const d = sumaDias(ini, i), v = s?.r.get(d)?.valor;
      const k = d > hoy ? 'f' : d < h.inicio ? 'a' : v === 'hecho' ? 'h' : v === 'minimo' ? 'm' : v === 'no' ? 'n' : d < hoy ? 'x' : 'p';
      celdas.push(`<span class="${k}${d === hoy ? ' hoy' : ''}" title="${esc(fCorta(d))}"></span>`);
    }
    return `<div class="hb-calw"><div class="hb-cal-l">${'LMXJVSD'.split('').map(x => `<span>${x}</span>`).join('')}</div><div class="hb-cal" role="img" aria-label="Tus últimas semanas">${celdas.join('')}</div></div>`;
  }
  const leyenda = '<div class="hb-ley"><span><i style="background:var(--ok)"></i>Hecho</span><span><i style="background:var(--gold)"></i>Mínimo</span><span><i style="background:var(--bad);opacity:.75"></i>No</span><span><i style="box-shadow:inset 0 0 0 1.5px var(--line)"></i>Sin marcar</span></div>';
  const pillSem = s => s ? `<span class="pill ${SEM[s.sem][0]}">${SEM[s.sem][1]}${s.pct != null && s.sem !== 'nuevo' ? ` · ${s.pct} %` : ''}</span>` : '';

  /* ---------- ALUMNO: tarjeta en Hoy ---------- */
  function diaRegistro(act, regs) {
    const hoy = hoyISO(), ayer = sumaDias(hoy, -1);
    const ayerPend = new Date().getHours() < 12 && act.some(h => h.inicio <= ayer && !regs.some(x => x.habito_id === h.id && x.fecha === ayer));
    if (!ayerPend && S.hDia === ayer) S.hDia = hoy;
    return { dia: S.hDia === ayer && ayerPend ? ayer : hoy, ayerPend, hoy, ayer };
  }
  function bloqueHoy(titulo, conEnlace) {
    const act = mios().filter(h => h.estado === 'instalacion' && h.inicio), regs = misReg();
    if (!act.length) return '';
    const { dia, ayerPend, hoy, ayer } = diaRegistro(act, regs);
    const sel = ayerPend ? `<div class="choice" role="group" style="grid-template-columns:1fr 1fr;margin-bottom:6px"><button type="button" data-act="hbDia" data-f="${ayer}" aria-pressed="${dia === ayer}">Ayer</button><button type="button" data-act="hbDia" data-f="${hoy}" aria-pressed="${dia === hoy}">Hoy</button></div>` : '';
    const alerta = act.map(h => [h, stats(h, regs)]).find(([, s]) => s?.dosSeguidos);
    return `<section class="section"><div class="section-head"><h2>${titulo}</h2>${conEnlace ? '<button class="btn sm ghost" data-act="tab" data-t="habitos">Ver tu plan ›</button>' : ''}</div><div class="card stack" style="gap:0">${sel}${act.map(h => filaMarca(h, regs, dia)).join('')}</div>
      ${alerta ? `<p class="small hb-animo">Un día suelto no estropea nada. Hoy, aunque sea, la versión mínima: <b>${esc(alerta[0].minimo || alerta[0].titulo)}</b>.</p>` : ''}</section>`;
  }
  function tarjetaHoy() {
    if (S.d?.habErr) return '';
    if (mios().length) return bloqueHoy('Tus hábitos de hoy', true);
    if (!miTemp()) return '';
    return `<section class="section"><div class="card hb-sig stack"><div class="row"><div class="ico gold">${svg('habitos')}</div><div class="grow"><b>Genera tu plan de hábitos</b><div class="small muted">Con tu perfil te propongo por dónde empezar: un hábito pequeño cada dos semanas.</div></div></div><button class="btn full" data-act="hbGenerar">Generar mi plan</button></div></section>`;
  }
  /* Ventana al final del informe de temperamento */
  function ctaInforme() {
    if (S.d?.habErr) return '';
    const hay = mios().length;
    return `<section class="section"><div class="card hb-sig stack"><span class="eyebrow">Siguiente paso</span><h2 style="margin:0">Tu plan de hábitos</h2><p class="small">${hay ? 'Ya tienes tu plan en marcha. Márcalo cada día en la pestaña Hábitos: un toque por hábito.' : 'Con tu perfil y tus respuestas te propongo por dónde empezar. Un hábito nuevo cada dos semanas, solo cuando el anterior esté en verde, para que cada cambio se quede.'}</p><button class="btn full" data-act="${hay ? 'hbIr' : 'hbGenerar'}">${hay ? 'Ver mi plan de hábitos' : 'Genera mi plan de hábitos'}</button></div></section>`;
  }

  /* ---------- ALUMNO: pestaña Hábitos ---------- */
  function vista() {
    if (S.hp) return vPlan();
    const cab = `<section class="stack"><span class="eyebrow">Tu día a día</span><h1>Hábitos</h1></section>`;
    if (S.d?.habErr) return cab + Temperamento.seccionTests() + (S.perfil?.rol === 'coach' ? `<div class="section card small muted">${AVISO}</div>` : '');
    const habs = mios(), regs = misReg();
    if (!habs.length) {
      const t = miTemp();
      return cab + (t ? `<section class="section"><div class="card hb-sig stack"><span class="eyebrow">Tu plan de hábitos</span><p class="small">Pequeños cambios que se quedan: empiezas por uno, lo marcas cada día con un toque y, cuando esté en verde, entra el siguiente. Te propongo por dónde empezar según tu perfil.</p><button class="btn full" data-act="hbGenerar">Genera mi plan de hábitos</button></div></section>`
        : `<section class="section"><div class="card stack"><p class="small">Aquí irá tu plan de hábitos: pequeños cambios, uno cada dos semanas, para que entrenar y comer bien te cueste cada vez menos.</p><p class="small muted">Empieza por tu perfil de temperamento: con él te propongo por dónde empezar.</p></div></section>`) + Temperamento.seccionTests();
    }
    const act = habs.filter(h => h.estado === 'instalacion' && h.inicio), man = habs.filter(h => h.estado === 'mantenimiento'), b = bloque(habs);
    const sig = siguiente(habs, regs), prop = habs.filter(h => h.estado === 'propuesto').sort((x, y) => x.orden - y.orden);
    return cab + `
      ${b ? `<section class="section"><div class="card stack"><div class="row"><span class="eyebrow grow">Bloque ${b.n} · semana ${b.sem} de 8</span><span class="small muted">${act.length} cada día${man.length ? ` · ${man.length} en mantenimiento` : ''}</span></div><div class="hb-bl">${[1, 2, 3, 4, 5, 6, 7, 8].map(n => `<i class="${n < b.sem ? 'ok' : n === b.sem ? 'now' : ''}"></i>`).join('')}</div><p class="small muted">${b.sem >= 7 ? 'Semanas 7 y 8: toca consolidar. El siguiente hábito entra en tu próximo bloque.' : 'Un hábito nuevo cada dos semanas, solo si el anterior está en verde.'}</p></div></section>` : ''}
      ${bloqueHoy('Hoy', false)}
      ${sig.ok ? vSiguiente(sig.sig) : ''}
      ${act.map(h => tarjetaHabito(h, regs)).join('')}
      ${man.length ? `<section class="section"><h2>En mantenimiento</h2>${man.map(h => tarjetaMantenimiento(h, regs)).join('')}</section>` : ''}
      ${prop.length ? `<section class="section"><h2>Lo que viene</h2><div class="card">${prop.map((h, i) => `<div class="line"><span class="hb-n">${i + 1}</span><div class="grow"><b class="small">${esc(h.titulo)}</b><div class="small muted">${i === 0 && !sig.ok ? esc(motivoEspera(sig)) : 'Después del anterior'}</div></div></div>`).join('')}</div></section>` : ''}
      ${Temperamento.seccionTests()}
      <section class="section"><p class="note">Un día suelto no estropea nada: lo que forma el hábito es repetirlo en el mismo momento del día. Si un día no puedes, haz la versión mínima.</p></section>`;
  }
  function motivoEspera(sig, coach) {
    const t = { pronto: `Entra dentro de ${sig.faltan} ${sig.faltan === 1 ? 'día' : 'días'} si tu último hábito sigue en verde`, ambar: 'Primero, que tu último hábito vuelva a verde', rojo: 'Primero, que tu último hábito vuelva a verde', nuevo: 'En cuanto tu último hábito coja ritmo', lleno: 'Cuando uno de tus hábitos pase a mantenimiento', bloque: 'En tu próximo bloque de 8 semanas', consolidar: 'En tu próximo bloque: ahora toca consolidar' }[sig.motivo] || 'Más adelante';
    return coach ? t.replace(/\btu\b/g, 'su') : t;
  }
  function vSiguiente(h) {
    return `<section class="section"><div class="card hb-sig stack"><span class="eyebrow">¡En verde! Ya puedes añadir el siguiente</span><h3 style="margin:0">${esc(h.titulo)}</h3>${h.si_entonces ? `<p class="small">${esc(h.si_entonces)}</p>` : ''}${h.porque ? `<p class="small muted">${esc(h.porque)}</p>` : ''}<button class="btn full" data-act="hbActivar" data-id="${h.id}">Empezar este hábito</button></div></section>`;
  }
  function tarjetaHabito(h, regs) {
    const s = stats(h, regs), toca = srbaiToca(h, s);
    const guia = s.sem === 'ambar' ? 'Esta quincena va a medias. No añadimos nada nuevo todavía: prueba a cambiar el momento del día o empieza por la versión mínima.' : s.sem === 'rojo' ? 'Está costando. Vamos a hacerlo más pequeño: quédate con la versión mínima hasta que vuelva a salir solo. Jesús lo verá en tu revisión.' : '';
    return `<section class="section"><div class="card stack">
      <div class="row" style="align-items:flex-start"><div class="grow stack" style="gap:3px"><span class="eyebrow">${esc(cat(h.clave)?.cat || 'Hábito')} · día ${s.dias}</span><h3 style="margin:0">${esc(h.titulo)}</h3></div>${pillSem(s)}</div>
      <div class="kpis hb-k"><div class="kpi"><div class="v num">${s.wOk}<span class="small muted"> / 7</span></div><div class="l">esta semana</div></div><div class="kpi"><div class="v num" style="color:${s.comodines ? 'inherit' : 'var(--warn)'}">${s.comodines}</div><div class="l">${s.comodines === 1 ? 'comodín libre' : 'comodines libres'}</div></div><div class="kpi"><div class="v num">${s.semTot ? `${s.semOk}<span class="small muted"> / ${s.semTot}</span>` : '—'}</div><div class="l">semanas cumplidas</div></div></div>
      ${calendario(h, s)}${leyenda}
      ${guia ? `<p class="small">${guia}</p>` : ''}
      ${toca ? `<div class="aprox stack"><b class="small">Semana ${toca}: ¿te sale ya solo?</b><span class="small muted">Cuatro preguntas rápidas para ver si el hábito ya es automático.</span><button class="btn sm" data-act="hbSrbai" data-id="${h.id}" data-k="${toca}" style="align-self:flex-start">Responder</button></div>` : ''}
      ${aMantenimiento(h, s) ? `<div class="aprox stack"><b class="small">Este ya te sale solo</b><span class="small muted">Puedes pasarlo a mantenimiento: lo marcarás una vez por semana en lugar de cada día.</span><button class="btn sm" data-act="hbEstado" data-id="${h.id}" data-v="mantenimiento" style="align-self:flex-start">Pasar a mantenimiento</button></div>` : ''}
      <p class="small muted">Objetivo: 7 días con 2 comodines por semana.${h.srbai?.['4'] != null ? ` Automaticidad: ${fmtNum(h.srbai['4'])}/7 en la semana 4${h.srbai['8'] != null ? ` y ${fmtNum(h.srbai['8'])}/7 en la 8` : ''}.` : ''}</p>
      <button class="btn sm ghost" data-act="hbAjustar" data-id="${h.id}" style="align-self:flex-start">Ajustar mi hábito</button></div></section>`;
  }
  function tarjetaMantenimiento(h, regs) {
    const lunAnt = sumaDias(lunesDe(hoyISO()), -7), sem = semanales(h, regs), ya = sem.find(x => x.fecha === lunAnt);
    const diarios = regs.filter(x => x.habito_id === h.id && x.valor !== 'semana' && x.fecha >= lunAnt && x.fecha <= sumaDias(lunAnt, 6)), deDiario = !ya && diarios.length >= 5;   // la semana pasada aún lo marcaba cada día
    const bajos = sem.slice(0, 2).length === 2 && sem.slice(0, 2).every(x => (x.dias ?? 0) < 5);
    return `<div class="card stack" style="margin-bottom:10px"><div class="row"><b class="grow small">${esc(h.titulo)}</b><span class="pill ok">Mantenimiento</span></div>
      ${deDiario ? `<span class="small">La semana pasada: <b>${diarios.filter(x => cumple(x.valor)).length} de 7</b>, según tu registro diario. Desde ahora, una pregunta cada lunes.</span>` : ''}
      ${!deDiario && h.inicio && h.inicio < lunAnt ? `<span class="small">La semana pasada, ¿cuántos días lo hiciste?</span><div class="chips" style="gap:6px">${[0, 1, 2, 3, 4, 5, 6, 7].map(n => `<button type="button" data-act="hbSemana" data-id="${h.id}" data-v="${n}" aria-pressed="${ya?.dias === n}">${n}</button>`).join('')}</div>` : ''}
      ${sem.length ? `<span class="small muted">Últimas semanas: ${sem.slice(0, 4).map(x => `${x.dias}/7`).join(' · ')}</span>` : ''}
      ${bajos ? `<div class="aprox stack"><span class="small">Dos semanas por debajo de 5 días: mejor volver a marcarlo cada día un tiempo.</span><button class="btn sm" data-act="hbEstado" data-id="${h.id}" data-v="instalacion" style="align-self:flex-start">Volver a marcarlo cada día</button></div>` : ''}</div>`;
  }

  /* ---------- ALUMNO: generar el plan (3 pasos) ---------- */
  function nuevoPlan() {
    const c = ctxMio(), p = proponer(c), k = p.recomendado || p.opciones[0];
    return { paso: 1, opciones: p.opciones, recomendado: p.recomendado, elegido: k, hora: cat(k)?.hora ? cat(k).hora(c) : null, peq: false, conf: null };
  }
  function textoSi(z, c) { const x = cat(z.elegido), h = z.hora || (x.hora ? x.hora(c) : null); return z.peq ? x.siMin(c, h) : x.si(c, h); }
  function vPlan() {
    const z = S.hp, c = ctxMio(), x = cat(z.elegido);
    const cab = (n, t) => `<div class="tp-cab"><div class="row"><button class="btn sm ghost" data-act="${n === 1 ? 'hbCancelar' : 'hbPaso'}" data-p="${n - 1}">← ${n === 1 ? 'Salir' : 'Atrás'}</button><span class="grow small muted" style="text-align:center">Tu plan de hábitos · <span class="num">${n} de 3</span></span><span style="width:64px"></span></div><div class="track"><i style="width:${Math.round(n / 3 * 100)}%"></i></div></div><section class="section tp-paso"><p class="tp-q">${t}</p>`;
    if (!z.opciones.length) return `<section class="section"><div class="card stack"><p class="small">No he encontrado hábitos que proponerte con tus respuestas. Jesús te preparará el plan en tu revisión.</p><button class="btn ghost" data-act="hbCancelar">Volver</button></div></section>`;
    if (z.paso === 1) return cab(1, '¿Por dónde empezamos?') + `<p class="small muted">Empezarás por uno solo. Elige el que más te apetezca: los hábitos que eliges tú se quedan mejor.</p>
      <div class="tp-ops" role="radiogroup">${z.opciones.map(k => { const y = cat(k), h = y.hora ? y.hora(c) : null; return `<button class="tp-op hb-op" role="radio" aria-checked="${z.elegido === k}" data-act="hbElegir" data-k="${k}"><span class="stack" style="gap:4px"><span>${esc(y.t(c, h))}${k === z.recomendado ? ' <span class="pill gold">Recomendado</span>' : ''}</span><span class="small muted" style="font-weight:400">${esc(y.porque(c))}</span></span></button>`; }).join('')}</div>
      ${c.delicado ? '<p class="small muted">Lo relacionado con la comida lo vemos juntos con calma, por eso no aparece aquí.</p>' : ''}
      <button class="btn full" data-act="hbPaso" data-p="2">Siguiente</button></section>`;
    if (z.paso === 2) {
      const baja = z.conf != null && z.conf < 9;
      return cab(2, 'Ajústalo a tu día') + `<div class="card stack"><b>${esc(x.t(c, z.hora))}</b>
        ${x.hora ? `<label class="f">¿A qué hora te vas a acostar?<input type="time" id="hb-hora" value="${esc(z.hora || '')}"></label><p class="small muted" style="margin-top:-4px">${c.cortoSueno ? 'Te propongo 20 minutos antes de lo que te acuestas ahora: poco a poco.' : 'La misma hora todos los días, con 45 minutos de margen.'}</p>` : ''}
        <span class="small"><b>Tu «si-entonces»</b>: el momento del día que lo dispara y lo que harás.</span><div class="hb-si">${esc(textoSi(z, c))}</div>
        <label class="row small"><input type="checkbox" id="hb-peq" ${z.peq ? 'checked' : ''} style="width:20px;height:20px"> Empezar por la versión pequeña</label></div>
        <div class="stack" style="gap:8px;margin-top:14px"><b class="small">Del 0 al 10, ¿cuánta confianza tienes en hacerlo cada día durante dos semanas?</b><div class="tp-escala" role="group">${[...Array(11)].map((_, n) => `<button type="button" data-act="hbConf" data-v="${n}" aria-pressed="${z.conf === n}">${n}</button>`).join('')}</div>
        ${baja && !z.peq ? '<p class="small hb-animo">Con menos de 9, mejor empezar más pequeño: marca «Empezar por la versión pequeña» y, cuando salga solo, lo subimos.</p>' : ''}</div>
        <p class="err" id="hb-err"></p><button class="btn full" data-act="hbPaso" data-p="3">Siguiente</button></section>`;
    }
    const orden = ordenar(z.elegido, proponer(c).todos.concat(z.elegido)).filter((k, i, l) => l.indexOf(k) === i).slice(0, 3);
    return cab(3, 'Tu bloque de 8 semanas') + `<div class="card hb-tl">${orden.map((k, i) => { const y = cat(k), h = i === 0 ? z.hora : y.hora ? y.hora(c) : null; return `<div class="line"><span class="hb-n">${i + 1}</span><div class="grow"><span class="eyebrow">${['Semanas 1 y 2', 'Semanas 3 y 4', 'Semanas 5 y 6'][i]}</span><div><b class="small">${esc(y.t(c, h))}</b></div>${i ? '<div class="small muted">Si el anterior está en verde</div>' : `<div class="small muted">${esc(textoSi(z, c))}</div>`}</div></div>`; }).join('')}<div class="line"><span class="hb-n">✓</span><div class="grow"><span class="eyebrow">Semanas 7 y 8</span><div class="small">Consolidar y medir: ¿te sale ya solo?</div></div></div></div>
      <p class="small muted">Cada día, un toque por hábito: hecho, mínimo o no. La versión mínima también cuenta. Jesús lo ve y lo revisáis cada dos semanas.</p>
      <button class="btn full" data-act="hbCrear">Empezar hoy</button></section>`;
  }
  async function crear(btn) {
    const z = S.hp, c = ctxMio();
    if (btn) btn.disabled = true;
    const rows = filasPlan(c, S.user.id, z.elegido, { hora: z.hora, si: textoSi(z, c), conf: z.conf });
    const { data, error } = await sb.from('habitos').insert(rows).select();
    if (btn) btn.disabled = false;
    if (error) return fallo(error, /habitos|relation|schema/.test(error.message || '') ? (S.perfil?.rol === 'coach' ? AVISO : 'Aún no se puede guardar: avisa a Jesús.') : undefined);
    S.d.habitos = (data || rows).slice().sort((a, b) => a.orden - b.orden); S.hp = null; S.tab = 'habitos';
    render(); window.scrollTo(0, 0); toast('¡Plan en marcha! Hoy empieza tu primer hábito');
  }

  /* ---------- Acciones comunes ---------- */
  function lista() { return S.modo === 'coach' && S.ficha ? S.ficha : S.d; }   // dónde viven los hábitos que se están tocando
  async function marcar(id, f, v) {
    const d = lista(), regs = d.habReg || (d.habReg = []), h = (d.habitos || []).find(x => x.id === id); if (!h) return;
    const ya = regs.find(x => x.habito_id === id && x.fecha === f);
    if (ya && ya.valor === v) {   // segundo toque en la misma opción: se quita
      const { error } = await sb.from('habitos_registro').delete().eq('habito_id', id).eq('fecha', f); if (error) return fallo(error);
      d.habReg = regs.filter(x => x !== ya); render(); return;
    }
    const row = { habito_id: id, alumno_id: h.alumno_id, fecha: f, valor: v, motivo: null };
    const { data, error } = await sb.from('habitos_registro').upsert(row, { onConflict: 'habito_id,fecha' }).select().single();
    if (error) return fallo(error);
    d.habReg = regs.filter(x => !(x.habito_id === id && x.fecha === f)).concat(data || row);
    render(); if (v !== 'no') toast(v === 'hecho' ? '¡Hecho!' : 'Mínimo hecho: también cuenta');
  }
  async function motivo(id, f, m) {
    const d = lista(), r = (d.habReg || []).find(x => x.habito_id === id && x.fecha === f); if (!r) return;
    const nuevo = r.motivo === m ? null : m;
    const { error } = await sb.from('habitos_registro').update({ motivo: nuevo }).eq('habito_id', id).eq('fecha', f); if (error) return fallo(error);
    r.motivo = nuevo; render();
  }
  async function actualizar(h, cambios, msg) {
    const { data, error } = await sb.from('habitos').update(cambios).eq('id', h.id).select().single();
    if (error) { fallo(error, /habitos/.test(error.message || '') ? AVISO : undefined); return false; }
    Object.assign(h, data || cambios); if (msg) toast(msg); render(); return true;
  }
  const buscar = id => (lista()?.habitos || []).find(x => x.id === id);
  function formActivar(id) {
    const h = buscar(id); if (!h) return;
    abrirSheet(`<form class="stack" id="hb-act"><span class="eyebrow">Tu siguiente hábito</span><h2>${esc(h.titulo)}</h2>
      <label class="f">Tu «si-entonces»<textarea id="hb-si" rows="3">${esc(h.si_entonces || '')}</textarea></label>${h.minimo ? `<p class="small muted">Versión mínima: ${esc(h.minimo)}.</p>` : ''}
      <b class="small">Del 0 al 10, ¿cuánta confianza tienes en hacerlo cada día durante dos semanas?</b><div class="tp-escala" role="group" id="hb-cf">${[...Array(11)].map((_, n) => `<button type="button" data-act="hbConfSheet" data-v="${n}" aria-pressed="false">${n}</button>`).join('')}</div>
      <p class="small muted" id="hb-cf-t">Si te sale menos de 9, cambia el texto para hacerlo más pequeño.</p>
      <button class="btn full" type="submit">Empezar hoy</button></form>`);
    $('#hb-act').addEventListener('submit', async e => {
      e.preventDefault();
      const cf = document.querySelector('#hb-cf [aria-pressed="true"]');
      if (await actualizar(h, { estado: 'instalacion', inicio: hoyISO(), si_entonces: $('#hb-si').value.trim() || h.si_entonces, confianza: cf ? +cf.dataset.v : null }, 'Nuevo hábito en marcha')) cerrarSheet();
    });
  }
  function formAjustar(id, coach) {
    const h = buscar(id); if (!h) return;
    abrirSheet(`<form class="stack" id="hb-aj"><h2>${coach ? 'Editar hábito' : 'Ajustar mi hábito'}</h2>${coach ? '' : '<p class="small muted">Cambia el momento del día o hazlo más pequeño. Lo que funciona es lo que repites.</p>'}
      ${coach ? `<label class="f">Hábito<input type="text" id="hb-t" value="${esc(h.titulo)}" required></label>` : `<b>${esc(h.titulo)}</b>`}
      <label class="f">«Si-entonces»<textarea id="hb-si" rows="3">${esc(h.si_entonces || '')}</textarea></label>
      <label class="f">Versión mínima (también cuenta)<input type="text" id="hb-min" value="${esc(h.minimo || '')}"></label>
      ${coach ? `<label class="f">Por qué (lo ve el alumno)<textarea id="hb-pq" rows="2">${esc(h.porque || '')}</textarea></label>` : ''}
      <button class="btn full" type="submit">Guardar</button></form>`);
    $('#hb-aj').addEventListener('submit', async e => {
      e.preventDefault();
      const c = { si_entonces: $('#hb-si').value.trim() || null, minimo: $('#hb-min').value.trim() || null };
      if (coach) { c.titulo = $('#hb-t').value.trim() || h.titulo; c.porque = $('#hb-pq').value.trim() || null; }
      if (await actualizar(h, c, 'Hábito guardado')) cerrarSheet();
    });
  }
  function formSrbai(id, k) {
    const h = buscar(id); if (!h) return;
    abrirSheet(`<form class="stack" id="hb-sr"><span class="eyebrow">Semana ${k} · ${esc(h.titulo)}</span><h2>¿Te sale ya solo?</h2><p class="small muted">Del 1 (nada de acuerdo) al 7 (totalmente de acuerdo).</p>
      ${SRBAI.map((q, i) => `<div class="stack" style="gap:6px"><b class="small">${q}</b><div class="tp-escala hb7" role="group" id="hb-s${i}">${[1, 2, 3, 4, 5, 6, 7].map(n => `<button type="button" data-act="hbConfSheet" data-v="${n}" aria-pressed="false">${n}</button>`).join('')}</div></div>`).join('')}
      <p class="err" id="hb-sr-e"></p><button class="btn full" type="submit">Guardar</button></form>`);
    $('#hb-sr').addEventListener('submit', async e => {
      e.preventDefault();
      const v = SRBAI.map((_, i) => document.querySelector(`#hb-s${i} [aria-pressed="true"]`)?.dataset.v).map(Number);
      if (v.some(x => !x)) { $('#hb-sr-e').textContent = 'Responde las cuatro.'; return; }
      const media = Math.round(v.reduce((a, b) => a + b, 0) / 4 * 10) / 10;
      if (await actualizar(h, { srbai: { ...(h.srbai || {}), [k]: media } }, media >= 5 ? 'Ya te sale casi solo' : 'Guardado: seguimos sumando días')) cerrarSheet();
    });
  }
  async function semana(id, n) {
    const d = lista(), h = buscar(id); if (!h) return;
    const f = sumaDias(lunesDe(hoyISO()), -7), row = { habito_id: id, alumno_id: h.alumno_id, fecha: f, valor: 'semana', dias: n };
    const { data, error } = await sb.from('habitos_registro').upsert(row, { onConflict: 'habito_id,fecha' }).select().single(); if (error) return fallo(error);
    d.habReg = (d.habReg || []).filter(x => !(x.habito_id === id && x.fecha === f)).concat(data || row); toast('Semana guardada'); render();
  }

  /* =====================================================================
     COACH: ficha (sub-pantalla Hábitos) y resumen en Alumnos
     ===================================================================== */
  function vCoach(f, a) {
    if (f.habErr) return `<section class="section"><h2>Plan de hábitos</h2><div class="card small muted">${AVISO}</div></section>`;
    const habs = (f.habitos || []).filter(h => h.estado !== 'descartado'), regs = f.habReg || [], b = bloque(habs), nom = (a.nombre || '').split(' ')[0];
    const t = ((S.c?.temperamentos || []).filter(x => x.alumno_id === a.id).sort((x, y) => y.fecha.localeCompare(x.fecha) || y.id - x.id))[0];
    const cab = `<section class="section"><div class="section-head"><h2>Plan de hábitos</h2><button class="btn sm" data-act="hbPropio">＋ Añadir hábito</button></div>`;
    if (!habs.length) return cab + `<div class="card stack"><p class="small">${esc(nom)} aún no tiene plan. ${t ? 'Se le ofrece al terminar su cuestionario y en su pestaña Hábitos; también puedes generárselo tú con el orden recomendado.' : 'Para proponérselo hace falta su cuestionario de temperamento; mientras, puedes añadirle hábitos propios.'}</p>${t ? '<button class="btn sm" data-act="hbGenerarCoach" style="align-self:flex-start">Generarle el plan</button>' : ''}</div></section>`;
    const sig = siguiente(habs, regs), lista = habs.slice().sort((x, y) => x.orden - y.orden || x.id - y.id);
    const fila = h => {
      const s = stats(h, regs), mot = s ? Object.entries([...s.r.values()].filter(x => x.fecha >= sumaDias(hoyISO(), -13) && x.motivo).reduce((o, x) => (o[x.motivo] = (o[x.motivo] || 0) + 1, o), {})) : [];
      const acc = [es(h.estado, 'propuesto', 'pausado') && `<button class="btn sm" data-act="hbEstado" data-id="${h.id}" data-v="instalacion" data-ini="1">Activar</button>`, h.estado === 'instalacion' && `<button class="btn sm ghost" data-act="hbEstado" data-id="${h.id}" data-v="mantenimiento">A mantenimiento</button>`, h.estado === 'mantenimiento' && `<button class="btn sm ghost" data-act="hbEstado" data-id="${h.id}" data-v="instalacion">Volver a diario</button>`, h.estado === 'mantenimiento' && `<button class="btn sm ghost" data-act="hbEstado" data-id="${h.id}" data-v="consolidado">Consolidado</button>`, es(h.estado, 'instalacion', 'mantenimiento') && `<button class="btn sm ghost" data-act="hbEstado" data-id="${h.id}" data-v="pausado">Pausar</button>`, `<button class="btn sm ghost" data-act="hbEditar" data-id="${h.id}">Editar</button>`, `<button class="btn sm ghost" data-act="hbEstado" data-id="${h.id}" data-v="descartado" style="color:var(--bad)">Quitar</button>`].filter(Boolean).join('');
      const pos = lista.indexOf(h), mover = `<span class="row" style="gap:4px;flex:none">${pos > 0 ? `<button class="btn sm ghost" data-act="hbMover" data-id="${h.id}" data-dir="-1" aria-label="Subir">↑</button>` : ''}${pos < lista.length - 1 ? `<button class="btn sm ghost" data-act="hbMover" data-id="${h.id}" data-dir="1" aria-label="Bajar">↓</button>` : ''}</span>`;
      return `<div class="card stack" style="margin-bottom:10px"><div class="row" style="align-items:flex-start"><span class="hb-n">${pos + 1}</span><div class="grow stack" style="gap:3px"><b>${esc(h.titulo)}</b><span class="small muted">${esc(h.si_entonces || '')}</span></div><span class="pill ${ESTADO[h.estado][0]}">${ESTADO[h.estado][1]}</span>${mover}</div>
        ${s ? `<div class="row" style="gap:8px;flex-wrap:wrap">${h.estado === 'instalacion' ? pillSem(s) : ''}<span class="small muted">Desde el ${esc(fCorta(h.inicio))} · día ${s.dias} · semana ${s.wOk}/7 · ${s.semOk}/${s.semTot} semanas cumplidas${h.confianza != null ? ` · confianza ${h.confianza}/10` : ''}${h.srbai?.['4'] != null ? ` · automaticidad ${fmtNum(h.srbai['4'])}${h.srbai['8'] != null ? ' → ' + fmtNum(h.srbai['8']) : ''}/7` : ''}</span></div>
        ${h.estado === 'instalacion' ? calendario(h, s) : ''}
        ${s.dosSeguidos && h.estado === 'instalacion' ? '<span class="small" style="color:var(--bad);font-weight:700">Dos días seguidos sin cumplir: escríbele hoy (un día suelto no estropea nada; hoy, la versión mínima).</span>' : ''}${s.caida && h.estado === 'instalacion' ? '<span class="small" style="color:var(--warn);font-weight:700">Ha caído más de 20 puntos respecto a la quincena anterior.</span>' : ''}
        ${mot.length ? `<span class="small muted">Por qué no lo hizo (14 días): ${mot.map(([m, n]) => `${esc(m.toLowerCase())} ${n}`).join(' · ')}</span>` : ''}` : h.porque ? `<span class="small muted">${esc(h.porque)}</span>` : ''}
        <div class="row" style="gap:6px;flex-wrap:wrap">${acc}</div></div>`;
    };
    return cab + `${b ? `<p class="small muted" style="margin:-4px 0 10px">Bloque ${b.n} · semana ${b.sem} de 8 · ${b.nuevos} ${b.nuevos === 1 ? 'hábito nuevo' : 'hábitos nuevos'} en este bloque (máximo 3). ${sig.ok ? `<b style="color:var(--ok)">Puede entrar el siguiente: ${esc(sig.sig.titulo)}.</b>` : sig.motivo !== 'sin' ? `Siguiente: ${esc(motivoEspera(sig, true).toLowerCase())}.` : ''}</p>` : ''}
      ${lista.map(fila).join('')}${leyenda}
      <p class="small muted">Usa las flechas para cambiar el orden: el siguiente en entrar es el primero de la lista que esté en «Más adelante».</p>
      <p class="note" style="margin-top:10px">Verde: 80 % o más de los últimos 14 días (la versión mínima cuenta). Ámbar: no se añade nada y se ajusta una sola cosa (momento, ancla o tamaño). Rojo: versión mínima o cambiarlo por otro de la misma hipótesis.</p></section>`;
  }
  function resumenCoach() {
    if (!S.c || S.c.habErr || !(S.c.habitos || []).length) return '';
    const als = S.c.perfiles.filter(p => p.activo !== false), regs = S.c.habReg || [], hoy = hoyISO(), ay = sumaDias(hoy, -1), an = sumaDias(hoy, -2);
    const conPlan = als.filter(a => S.c.habitos.some(h => h.alumno_id === a.id && h.estado !== 'descartado'));
    const falla = (h, d) => h.inicio && d >= h.inicio && !regs.some(x => x.habito_id === h.id && x.fecha === d && cumple(x.valor));
    const alertas = conPlan.map(a => ({ a, hs: S.c.habitos.filter(h => h.alumno_id === a.id && h.estado === 'instalacion' && h.inicio && h.inicio <= an && falla(h, ay) && falla(h, an)) })).filter(x => x.hs.length);
    const activos = S.c.habitos.filter(h => h.estado === 'instalacion').length;
    return `<section class="section"><h2>Hábitos</h2><div class="kpis"><div class="kpi"><div class="v num">${conPlan.length}</div><div class="l">con plan</div></div><div class="kpi"><div class="v num">${activos}</div><div class="l">hábitos diarios</div></div><div class="kpi"><div class="v num" style="color:${alertas.length ? 'var(--bad)' : 'var(--ok)'}">${alertas.length}</div><div class="l">2 días sin cumplir</div></div></div>
      ${alertas.length ? `<div class="card">${alertas.map(({ a, hs }) => `<div class="line" data-act="hbFicha" data-id="${a.id}" style="cursor:pointer"><div class="grow"><h3 style="font-size:16px">${esc(a.nombre)}</h3><div class="small muted">${hs.map(h => esc(h.titulo)).join(' · ')}</div></div><span class="small" style="color:var(--blue-text)">›</span></div>`).join('')}</div><p class="small muted">Un mensaje hoy marca la diferencia: un fallo suelto no frena el hábito, dos seguidos empiezan a pesar.</p>` : ''}</section>`;
  }
  async function generarCoach() {
    const f = S.ficha, a = S.c.perfiles.find(p => p.id === f.id) || {};
    const t = (S.c.temperamentos || []).filter(x => x.alumno_id === f.id).sort((x, y) => y.fecha.localeCompare(x.fecha) || y.id - x.id)[0];
    const c = contexto(t, a.sexo, (S.c.servicios || []).find(s => s.alumno_id === f.id)), p = proponer(c);
    if (!p.recomendado) return toast('Con sus respuestas no salen hábitos que proponer: añádele uno propio.');
    const { data, error } = await sb.from('habitos').insert(filasPlan(c, f.id, p.recomendado)).select();
    if (error) return fallo(error, /habitos/.test(error.message || '') ? AVISO : undefined);
    f.habitos = (f.habitos || []).concat(data || []).sort((x, y) => x.orden - y.orden); S.c.habitos = (S.c.habitos || []).concat(data || []);
    toast('Plan creado: empieza hoy con el primero'); render();
  }
  /* Hábitos que el coach puede añadir a mano (también uno totalmente libre) */
  const SUGERIDOS = [
    { t: 'Dejar de fumar', si: 'Cuando me apetezca un cigarro → bebo un vaso de agua y espero 5 minutos antes de decidir', min: 'Retrasar el primer cigarro del día 30 minutos', pq: 'Cada cigarro que retrasas o evitas mejora tu capacidad cardiorrespiratoria, tu descanso y tu recuperación.' },
    { t: 'Beber 2 litros de agua al día', si: 'Cuando me siente a comer o a cenar → me lleno el vaso y la botella para la tarde', min: 'Un vaso de agua al levantarme', pq: 'Bien hidratado rindes más, tienes menos hambre «falsa» y recuperas mejor.' },
    { t: 'Verdura en comida y cena', si: 'Cuando prepare el plato → la mitad es verdura antes de servir lo demás', min: 'Verdura en una de las dos comidas', pq: 'Más saciedad con menos calorías y mejor digestión.' },
    { t: 'Leer 10 minutos antes de dormir', si: 'Cuando me meta en la cama → dejo el móvil fuera y leo 10 minutos', min: 'Leer una página', pq: 'Desconectar de la pantalla ayuda a dormirte antes y a descansar mejor.' },
    { t: 'Caminar 10 minutos después de comer', si: 'Cuando termine de comer → salgo a caminar 10 minutos', min: 'Caminar 3 minutos', pq: 'Mejora la digestión, el azúcar en sangre y suma pasos sin esfuerzo.' }
  ];
  /* Reordena la lista y guarda solo las filas cuyo orden cambia */
  async function renumerar(f, lista) {
    const cambios = lista.map((h, i) => ({ h, o: i + 1 })).filter(x => x.h.orden !== x.o);
    const res = await Promise.all(cambios.map(x => sb.from('habitos').update({ orden: x.o }).eq('id', x.h.id)));
    const err = res.find(r => r.error)?.error; if (err) { fallo(err); return false; }
    cambios.forEach(x => { x.h.orden = x.o; const g = (S.c?.habitos || []).find(y => y.id === x.h.id); if (g) g.orden = x.o; });
    f.habitos.sort((x, y) => x.orden - y.orden); return true;
  }
  const ordenados = f => (f.habitos || []).filter(h => h.estado !== 'descartado').sort((x, y) => x.orden - y.orden || x.id - y.id);
  async function mover(id, dir) {
    const f = S.ficha, l = ordenados(f), i = l.findIndex(h => h.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= l.length) return;
    [l[i], l[j]] = [l[j], l[i]];
    if (await renumerar(f, l)) render();
  }
  function formPropio() {
    const f = S.ficha;
    abrirSheet(`<form class="stack" id="hb-pr"><h2>Añadir hábito</h2>
      <div class="stack" style="gap:6px"><span class="small muted">Sugerencias (toca una para rellenarla) o escribe el tuyo:</span><div class="chips" style="gap:6px;flex-wrap:wrap">${SUGERIDOS.map((x, i) => `<button type="button" class="pill blue" data-sug="${i}">${esc(x.t)}</button>`).join('')}</div></div>
      <label class="f">Hábito<input type="text" id="hb-t" placeholder="Ej. Dejar de fumar" required></label>
      <label class="f">«Si-entonces»<textarea id="hb-si" rows="2" placeholder="Cuando… → …"></textarea></label>
      <label class="f">Versión mínima (también cuenta)<input type="text" id="hb-min"></label>
      <label class="f">Por qué (lo ve el alumno)<textarea id="hb-pq" rows="2"></textarea></label>
      <label class="f">Cuándo entra<select id="hb-cu"><option value="siguiente">El siguiente en entrar (antes que los que esperan)</option><option value="final">Al final de la lista</option><option value="hoy">Empieza hoy</option></select></label>
      <button class="btn full" type="submit">Guardar</button></form>`);
    const F = $('#hb-pr');
    F.addEventListener('click', ev => { const c = ev.target.closest('[data-sug]'); if (!c) return; const x = SUGERIDOS[+c.dataset.sug]; $('#hb-t').value = x.t; $('#hb-si').value = x.si; $('#hb-min').value = x.min; $('#hb-pq').value = x.pq; });
    F.addEventListener('submit', async e => {
      e.preventDefault();
      const bt = F.querySelector('[type=submit]'); if (bt.disabled) return; bt.disabled = true;
      const cu = $('#hb-cu').value, est = cu === 'hoy' ? 'instalacion' : 'propuesto';
      const row = { alumno_id: f.id, clave: 'propio', titulo: $('#hb-t').value.trim(), si_entonces: $('#hb-si').value.trim() || null, minimo: $('#hb-min').value.trim() || null, porque: $('#hb-pq').value.trim() || null, orden: Math.max(0, ...(f.habitos || []).map(h => h.orden)) + 1, estado: est, inicio: est === 'instalacion' ? hoyISO() : null };
      const { data, error } = await sb.from('habitos').insert(row).select().single();
      if (error) { bt.disabled = false; return fallo(error, /habitos/.test(error.message || '') ? AVISO : undefined); }
      const nuevo = data || row; f.habitos = (f.habitos || []).concat(nuevo); S.c.habitos = (S.c.habitos || []).concat(nuevo);
      if (cu === 'siguiente') {   // se coloca justo antes del primero que espera su turno
        const l = ordenados(f).filter(h => h !== nuevo), k = l.findIndex(h => h.estado === 'propuesto');
        l.splice(k < 0 ? l.length : k, 0, nuevo); await renumerar(f, l);
      }
      cerrarSheet(); toast('Hábito añadido'); render();
    });
  }

  /* ---------- Eventos (solo atienden acciones hb…) ---------- */
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const a = b.dataset.act;
    if (a === 'tab' || a === 'ctab' || a === 'modo') { S.hp = null; S.hDia = null; return; }
    if (!a.startsWith('hb')) return;
    const id = +b.dataset.id;
    switch (a) {
      case 'hbGenerar': S.tinf = null; S.tq = null; S.tab = 'habitos'; S.hp = nuevoPlan(); render(); window.scrollTo(0, 0); break;
      case 'hbIr': S.tinf = null; S.tab = 'habitos'; render(); window.scrollTo(0, 0); break;
      case 'hbCancelar': S.hp = null; render(); window.scrollTo(0, 0); break;
      case 'hbElegir': { const c = ctxMio(), k = b.dataset.k; Object.assign(S.hp, { elegido: k, hora: cat(k)?.hora ? cat(k).hora(c) : null, peq: false }); b.closest('.tp-ops').querySelectorAll('.tp-op').forEach(x => x.setAttribute('aria-checked', x === b)); break; }
      case 'hbPaso': {
        const z = S.hp, p = +b.dataset.p; if (!z) break;
        if (z.paso === 2 && p === 3 && z.conf == null) { $('#hb-err').textContent = 'Marca tu confianza del 0 al 10.'; break; }
        z.paso = p; render(); window.scrollTo(0, 0); break;
      }
      case 'hbConf': { const z = S.hp; if (!z) break; z.conf = +b.dataset.v; render(); break; }
      case 'hbConfSheet': { const g = b.closest('[role="group"]'); g.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); if (g.id === 'hb-cf') $('#hb-cf-t').textContent = +b.dataset.v < 9 ? 'Con menos de 9, hazlo más pequeño: cambia el texto antes de empezar.' : '¡Adelante!'; break; }
      case 'hbCrear': await crear(b); break;
      case 'hbDia': S.hDia = b.dataset.f; render(); break;
      case 'hbMarca': await marcar(id, b.dataset.f, b.dataset.v); break;
      case 'hbMotivo': await motivo(id, b.dataset.f, b.dataset.v); break;
      case 'hbActivar': formActivar(id); break;
      case 'hbAjustar': formAjustar(id, false); break;
      case 'hbEditar': formAjustar(id, true); break;
      case 'hbSrbai': formSrbai(id, b.dataset.k); break;
      case 'hbSemana': await semana(id, +b.dataset.v); break;
      case 'hbEstado': {
        const h = buscar(id); if (!h) break; const v = b.dataset.v, c = { estado: v };
        if (v === 'instalacion' && (b.dataset.ini || !h.inicio)) c.inicio = hoyISO();
        await actualizar(h, c, { instalacion: 'Hábito activo cada día', mantenimiento: 'Pasa a mantenimiento: una vez por semana', consolidado: 'Hábito consolidado', pausado: 'Hábito en pausa', descartado: 'Hábito quitado' }[v]);
        if (S.c?.habitos) { const x = S.c.habitos.find(y => y.id === id); if (x) Object.assign(x, c); }
        break;
      }
      case 'hbGenerarCoach': await generarCoach(); break;
      case 'hbPropio': formPropio(); break;
      case 'hbMover': await mover(id, +b.dataset.dir); break;
      case 'hbFicha': await abrirFicha(b.dataset.id); await abrirSub('habitos'); break;
    }
  });
  document.addEventListener('change', e => {
    if (!S.hp) return;
    if (e.target.id === 'hb-hora') { S.hp.hora = e.target.value || S.hp.hora; render(); }
    if (e.target.id === 'hb-peq') { S.hp.peq = e.target.checked; render(); }
  });

  const aislar = fn => (...args) => { try { return fn(...args); } catch (err) { console.error(err); return `<section class="section"><div class="card small muted">No se han podido mostrar los hábitos. Mándale a Jesús este mensaje: ${esc(String(err && err.message || err).slice(0, 160))}</div></section>`; } };
  return { vista: aislar(vista), tarjetaHoy: aislar(tarjetaHoy), ctaInforme: aislar(ctaInforme), vCoach: aislar(vCoach), resumenCoach: aislar(resumenCoach), cargar, cargarCoach, cargarFicha, contexto, proponer, ordenar, filasPlan, stats, bloque, siguiente, CAT };
})();
