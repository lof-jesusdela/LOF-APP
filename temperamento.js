/* Perfil de temperamento · autodiagnóstico del alumno, informe con la marca y seguimiento del piloto de 8 semanas.
   Método: doc «Cuestionario de perfil de temperamento». 20 preguntas que puntúan (A +1, B 0, C −1; 1-10 eje calor,
   11-20 eje humedad), hábitos de los seis factores, cronotipo con la escala reducida de matutinidad (Adan y Almirall)
   y señales para derivar. Se carga antes que app.js y solo usa sus utilidades (S, sb, esc, render…) al ejecutarse.
   Datos: tabla temperamentos y columna perfiles.temperamento_pedido (Bloque 30 en Supabase). */
'use strict';
const Temperamento = (() => {
  const VERSION = 1, AVISO = 'Falta ejecutar el Bloque 30 (perfil de temperamento) en Supabase.';
  const G = (m, f, sx) => sx === 'mujer' ? f : sx === 'hombre' ? m : `${m}/${f.slice(-1)}`;
  const sg = n => n > 0 ? '+' + n : n < 0 ? '−' + Math.abs(n) : '0';

  /* ---------- Parte A · 20 preguntas [pregunta, A (+1), B (0), C (−1)] ---------- */
  const PREG = [
    ['En una sala donde los demás están a gusto, tú…', 'Sueles tener calor', 'Estás a gusto', 'Sueles tener frío, sobre todo en manos y pies'],
    ['¿Qué época del año llevas peor?', 'El verano y el calor', 'Ninguna en especial', 'El invierno y el frío'],
    ['Si puedes elegir, ¿cómo prefieres las bebidas?', 'Frías o con hielo', 'Me da igual', 'Calientes o templadas'],
    ['Tu apetito suele ser…', 'Fuerte; si no como a tiempo me pongo de mal humor', 'Normal', 'Escaso; puedo pasar muchas horas sin comer'],
    ['Después de una comida normal…', 'La digiero rápido y pronto vuelvo a tener hambre', 'Bien, sin más', 'Noto pesadez durante horas'],
    ['¿Cuánto sudas en el día a día o al moverte?', 'Mucho y con facilidad', 'Lo normal', 'Poco; me cuesta sudar'],
    ['Tu ritmo diario es…', 'Rápido; me cuesta parar', 'Medio', 'Tranquilo; me cuesta arrancar'],
    ['Cuando algo te molesta…', 'Te enciendes rápido', 'Depende del día', 'Tardas mucho en enfadarte'],
    ['Ante una decisión importante…', 'Decides rápido, a veces por impulso', 'Te tomas un tiempo razonable', 'Le das muchas vueltas y te cuesta decidir'],
    ['Las venas de tus brazos y manos…', 'Se ven mucho, incluso en reposo', 'Se ven un poco', 'Casi no se ven'],
    ['Tu piel al tacto suele ser…', 'Suave, hidratada o grasa', 'Normal', 'Seca o áspera; se agrieta con facilidad'],
    ['Con el peso…', 'Gano grasa con facilidad, sobre todo bajo la piel', 'Me mantengo sin mucho esfuerzo', 'Me cuesta ganar peso'],
    ['Tu forma corporal es…', 'Redondeada, con articulaciones poco marcadas', 'Intermedia', 'Huesuda, con articulaciones y tendones marcados'],
    ['Tus manos y dedos son…', 'Anchos y carnosos', 'Intermedios', 'Largos y finos'],
    ['¿Retienes líquidos (anillos o calzado que aprietan, cara hinchada al despertar)?', 'A menudo', 'A veces', 'Casi nunca'],
    ['¿Cuántas horas necesitas dormir para estar bien?', 'Más de 8', 'Entre 7 y 8', 'Con menos de 7 me basta'],
    ['Tu sueño es…', 'Profundo; me cuesta despertar', 'Normal', 'Ligero; me despierto con facilidad'],
    ['¿Te entra sueño o pesadez durante el día, sobre todo después de comer?', 'A menudo', 'A veces', 'Casi nunca'],
    ['¿Tienes mucosidad o congestión nasal?', 'A menudo, incluso sin catarro', 'De vez en cuando', 'Casi nunca; más bien tengo la nariz o los ojos secos'],
    ['¿Cómo es tu tránsito intestinal?', 'Heces blandas o frecuentes', 'Regular', 'Con tendencia al estreñimiento o heces secas']
  ];

  /* ---------- Parte B · los seis factores (no puntúan: dicen por dónde empezar el plan) ---------- */
  const HAB = [
    { f: 'Entorno y aire', c: [
      { k: 'lugar', q: '¿Dónde pasas la mayor parte del día?', o: ['En interior', 'Al aire libre', 'Mitad y mitad'] },
      { k: 'ambiente', q: '¿Cómo es el ambiente donde pasas más horas?', o: ['Frío', 'Caluroso', 'Húmedo', 'Seco', 'Agradable'], multi: true }] },
    { f: 'Comida y bebida', c: [
      { k: 'comidas', q: '¿Cuántas comidas haces al día?', o: ['1 o 2', '3', '4', '5 o más'] },
      { k: 'cafe', q: '¿Cuántos cafés o bebidas con cafeína tomas al día?', o: ['Ninguno', '1', '2', '3 o más'] },
      { k: 'alcohol', q: '¿Cuántas bebidas con alcohol tomas a la semana?', o: ['Ninguna', '1 a 3', '4 a 7', 'Más de 7'] }] },
    { f: 'Movimiento y reposo', c: [
      { k: 'pasos', q: '¿Cuántos pasos das al día, más o menos?', o: ['Menos de 5.000', '5.000 a 8.000', '8.000 a 10.000', 'Más de 10.000', 'No lo sé'] },
      { k: 'entrenos', q: '¿Cuántos días entrenas a la semana ahora mismo?', o: ['Ninguno', '1 o 2', '3 o 4', '5 o más'] }] },
    { f: 'Emociones', c: [
      { k: 'estres', q: 'Del 0 al 10, ¿cuánto estrés has sentido en las dos últimas semanas?', tipo: 'escala' },
      { k: 'causas', q: '¿Qué te lo provoca sobre todo?', o: ['Trabajo', 'Familia', 'Dinero', 'Salud', 'Estudios', 'Otra cosa', 'Nada en especial'], multi: true, opcional: true }] },
    { f: 'Sueño y vigilia', c: [{ k: 'horarios', q: '¿A qué hora te acuestas y te levantas?', tipo: 'horas' }] },
    { f: 'Evacuación', c: [
      { k: 'bano', q: '¿Cada cuánto vas al baño a hacer de vientre?', o: ['Más de una vez al día', 'Una vez al día', 'Cada 2 o 3 días', 'Menos a menudo'] },
      { k: 'gases', q: '¿Con qué frecuencia tienes hinchazón o gases?', o: ['Casi nunca', 'A veces', 'A menudo', 'Casi a diario'] }] }
  ];

  /* ---------- Cronotipo · escala reducida de matutinidad (Adan y Almirall, Psicothema 1990): de 4 a 25 puntos ---------- */
  const RMEQ = [
    { q: 'Si fueras totalmente libre para organizar tu día y solo siguieras tu propio ritmo, ¿a qué hora te levantarías?', o: () => [['Entre las 5:00 y las 6:30', 5], ['Entre las 6:30 y las 7:45', 4], ['Entre las 7:45 y las 9:45', 3], ['Entre las 9:45 y las 11:00', 2], ['Entre las 11:00 y las 12:00', 1]] },
    { q: 'Durante la primera media hora después de despertarte, te encuentras…', o: sx => [[`Muy ${G('cansado', 'cansada', sx)}`, 1], [`Bastante ${G('cansado', 'cansada', sx)}`, 2], [`Bastante ${G('fresco', 'fresca', sx)}`, 3], [`Muy ${G('fresco', 'fresca', sx)}`, 4]] },
    { q: '¿A qué hora de la noche empiezas a notar cansancio y ganas de dormir?', o: () => [['Entre las 20:00 y las 21:00', 5], ['Entre las 21:00 y las 22:15', 4], ['Entre las 22:15 y las 0:45', 3], ['Entre las 0:45 y las 2:00', 2], ['Entre las 2:00 y las 3:00', 1]] },
    { q: '¿A qué hora del día crees que te encuentras mejor?', o: () => [['Entre las 5:00 y las 8:00', 5], ['Entre las 8:00 y las 10:00', 4], ['Entre las 10:00 y las 17:00', 3], ['Entre las 17:00 y las 22:00', 2], ['Entre las 22:00 y las 5:00', 1]] },
    { q: 'Se habla de personas «de mañana» y personas «de noche». ¿Cuál te consideras?', o: () => [['Claramente de mañana', 6], ['Más de mañana que de noche', 4], ['Más de noche que de mañana', 2], ['Claramente de noche', 0]] }
  ];
  const puntosRmeq = r => (r || []).every(x => x != null) ? r.reduce((t, x, i) => t + RMEQ[i].o()[x][1], 0) : null;
  const CRONO = p => p == null ? null : p >= 22 ? { k: 'matutino', l: 'Claramente de mañana' } : p >= 18 ? { k: 'matutino', l: 'Más bien de mañana' } : p >= 12 ? { k: 'intermedio', l: 'Ni de mañana ni de noche' } : p >= 8 ? { k: 'vespertino', l: 'Más bien de noche' } : { k: 'vespertino', l: 'Claramente de noche' };
  const CRONO_TXT = {
    matutino: 'Tu mejor momento llega pronto. Si puedes, entrena por la mañana o a mediodía y protege tu hora de acostarte: trasnochar suele pasarte más factura.',
    intermedio: 'Te adaptas bien a casi cualquier horario. Lo que más te ayuda es que tus horas de dormir, comer y entrenar sean parecidas todos los días.',
    vespertino: 'Tu energía sube conforme avanza el día. Si puedes, entrena por la tarde y evita las sesiones muy temprano. La luz de la mañana y no retrasar la hora de dormir te ayudan a descansar mejor.'
  };

  /* ---------- Señales para derivar: t = cómo lo marca el alumno, d = cómo lo lee el coach, al = qué le decimos ---------- */
  const SENALES = [
    { k: 'apnea', t: () => 'Ronco fuerte, me han visto hacer pausas al respirar mientras duermo o tengo mucho sueño durante el día', d: 'Ronquidos fuertes, pausas al respirar dormido o mucho sueño de día', coach: 'Médico de familia, para descartar apnea del sueño', al: 'Coméntalo con tu médico de familia: conviene descartar la apnea del sueño.' },
    { k: 'tiroides', t: () => 'Noto un cansancio intenso y frío constante que no cuadran con mi rutina', d: 'Cansancio intenso y frío constante que no cuadran con su rutina', coach: 'Médico de familia, por ejemplo para revisar el tiroides', al: 'Coméntalo con tu médico de familia; puede valorar una analítica, por ejemplo del tiroides.' },
    { k: 'insomnio', t: () => 'Llevo más de un mes durmiendo mal casi todas las noches', d: 'Duerme mal casi todas las noches desde hace más de un mes', coach: 'Cuidar las rutinas de sueño; si no mejora en 4 semanas, médico de familia o unidad de sueño', al: 'Vamos a cuidar tus rutinas de sueño. Si en 4 semanas no mejora, conviene consultarlo con tu médico.' },
    { k: 'digestivo', t: () => 'Tengo dolor de barriga que no se va, he visto sangre en las heces, mi tránsito ha cambiado de golpe o pierdo peso sin buscarlo', d: 'Dolor abdominal persistente, sangre en heces, cambio brusco del tránsito o pérdida de peso sin buscarla', coach: 'Médico, sin esperar a la siguiente revisión', al: 'Pide cita con tu médico pronto, sin esperar a la próxima revisión.' },
    { k: 'tension', t: () => 'Me han medido la tensión alta varias veces', d: 'Tensión alta en varias tomas', coach: 'Médico de familia', al: 'Coméntalo con tu médico de familia antes de subir la intensidad.' },
    { k: 'animo', t: () => 'Llevo semanas con el ánimo bajo o con ansiedad, o mi relación con la comida me hace sufrir', d: 'Ánimo bajo o ansiedad que duran semanas, o una relación difícil con la comida', coach: 'Psicólogo o médico; mientras tanto, no apretar la dieta', al: 'Gracias por contármelo. Un psicólogo o tu médico pueden ayudarte mucho; mientras tanto, no apretaremos la alimentación.' },
    { k: 'pecho', t: () => 'Me mareo, me duele el pecho o me falta el aire más de lo normal cuando hago ejercicio', d: 'Mareo, dolor en el pecho o falta de aire desproporcionada al entrenar', coach: 'Parar la sesión y acudir al médico', al: 'Si te pasa entrenando, para la sesión y consulta con tu médico antes de seguir.' },
    { k: 'medicacion', t: sx => sx === 'hombre' ? 'Tomo medicación a diario o tengo una enfermedad diagnosticada' : 'Tomo medicación a diario, tengo una enfermedad diagnosticada o estoy embarazada', d: 'Medicación crónica, embarazo o enfermedad diagnosticada', coach: 'Coordinar el plan con su médico; nunca retirar ni cambiar fármacos', al: 'Adaptaremos el plan a lo que diga tu médico. Nunca cambies ni dejes tu medicación por el plan.' }
  ];
  const senal = k => SENALES.find(x => x.k === k);
  const nm = k => (NOM[k] || '—').toLowerCase();

  /* ---------- Temperamentos y plantillas del informe (doc, «Plantillas de informe para el cliente») ---------- */
  const NOM = { colerico: 'Colérico', sanguineo: 'Sanguíneo', flematico: 'Flemático', melancolico: 'Melancólico' };
  const CUAL = { colerico: 'caliente y seco', sanguineo: 'caliente y húmedo', flematico: 'frío y húmedo', melancolico: 'frío y seco' };
  const PLANT = {
    colerico: {
      fuertes: 'Energía, decisión y capacidad de esfuerzo; sueles ganar fuerza y definir pronto.', fuertesSuave: 'Energía, decisión y capacidad de esfuerzo; sueles ganar fuerza pronto.',
      vigilar: 'Que el exceso de carga, de estrés o de estimulantes no te pase factura en el sueño, la digestión o las lesiones.',
      hip: ['Rindes más con descargas programadas que yendo siempre al máximo.', 'Duermes mejor si dejas la cafeína para la mañana.', 'Tu cintura se mantiene por debajo de la mitad de tu altura aunque suba el estrés.'],
      arr: [['e', 'Fuerza y potencia con esfuerzo controlado.'], ['e', 'Un día a la semana sin competir.'], ['c', 'Comidas a horas fijas con verdura y fruta fresca.'], ['h', 'Una hora sin pantallas antes de dormir.']],
      medir: ['Cintura', 'Horas de sueño', 'Pulso en reposo', 'Esfuerzo percibido']
    },
    melancolico: {
      fuertes: 'Constancia, precisión y capacidad de análisis; la definición se te nota muy pronto.', fuertesSuave: 'Constancia, precisión y capacidad de análisis.',
      vigilar: 'Que el estrés y la autoexigencia no te quiten apetito, sueño ni músculo.',
      hip: ['Ganas fuerza de forma sostenida con volumen moderado y descansos largos.', 'Duermes mejor con una rutina fija de desconexión.', 'Tu cintura baja cuando baja tu estrés.'],
      arr: [['e', 'Fuerza dos o tres días con técnica cuidada.'], ['c', 'Comidas calientes y regulares, sin saltarte ninguna.'], ['h', 'Una hora de bajada antes de dormir.'], ['h', 'Un plan detallado para que siempre sepas qué toca.']],
      medir: ['Fuerza', 'Cintura', 'Lo que comes de verdad', 'Horas de sueño', 'Estrés']
    },
    sanguineo: {
      fuertes: 'Vitalidad, recuperación rápida y facilidad para ganar músculo; contagias energía al grupo.',
      vigilar: 'Los excesos sociales (comidas fuera, alcohol, trasnochar) y la constancia cuando pasa la novedad.',
      hip: ['Con reglas claras para comer fuera avanzas sin renunciar a tu vida social.', 'Con el alcohol dentro de lo pactado mejoran tu cintura y tu sueño.', 'Entrenando en grupo faltas menos.'],
      arr: [['e', 'Fuerza e hipertrofia con variedad.'], ['e', 'Retos con fecha.'], ['c', 'Una estrategia previa para cada evento.'], ['h', 'Hora de acostarte estable también el fin de semana.']],
      medir: ['Cintura', 'Perímetros', 'Alcohol semanal', 'Asistencia', 'Tensión, si tienes tensiómetro']
    },
    flematico: {
      fuertes: 'Paciencia, estabilidad y mucha resistencia una vez en marcha.',
      vigilar: 'El arranque lento, el sedentarismo y la tendencia a acumular grasa bajo la piel y líquidos.', vigilarSuave: 'El arranque lento y el sedentarismo.',
      hip: ['Con muchos pasos diarios y fuerza tres días pierdes cintura de forma constante.', 'Madrugar con luz y movimiento te da más energía que dormir más.', 'Los objetivos pequeños y semanales te mantienen en marcha.'],
      arr: [['e', 'Fuerza tres días con sesiones dinámicas.'], ['h', 'Un objetivo de pasos que sube poco a poco.'], ['c', 'Comidas templadas y especiadas, con mucha proteína y verdura.'], ['h', 'Seguimiento cercano.']],
      medir: ['Cintura', 'Perímetros y % de grasa', 'Pasos', 'Horas de sueño', 'Energía'],
      nota: 'Verás mejoras de salud antes que definición.'
    }
  };
  const MEDIR_GENERAL = ['Cintura', 'Pasos', 'Horas de sueño', 'Energía'];

  /* ---------- Puntuación (doc, «Puntuación y clasificación») ----------
     Dominante: el cuadrante de los signos de las dos sumas. Si una suma da 0 decide la pregunta 1 (calor) o la 12 (humedad);
     si esa también es B, la primera respuesta distinta de B del mismo eje; si todo el eje es B, no hay datos: confianza baja.
     Secundario: se cambia el signo del eje más flojo; si empatan, el de la humedad (en la tradición el calor es la cualidad activa).
     Confianza: alta si los dos ejes llegan a ±3, media si llega uno y baja si ninguno.
     El perfil que se muestra (dominante y subdominante con su porcentaje) lo da perfilDe, más abajo. */
  const val = x => x === 'A' ? 1 : x === 'C' ? -1 : 0;
  const cuadrante = (c, h) => c > 0 ? (h > 0 ? 'sanguineo' : 'colerico') : (h > 0 ? 'flematico' : 'melancolico');
  function eje(a, ini, clave) {
    const idx = [...Array(10)].map((_, k) => ini + k), suma = idx.reduce((t, i) => t + val(a[i]), 0);
    if (suma) return { suma, s: Math.sign(suma), por: null };
    const i = [clave, ...idx.filter(i => i !== clave)].find(i => val(a[i]) !== 0);
    return { suma, s: i == null ? 0 : val(a[i]), por: i == null ? 'ninguna' : i + 1 };
  }
  function puntuar(a) {
    const c = eje(a, 0, 0), h = eje(a, 10, 11), sinDatos = !c.s || !h.s;
    const claros = (Math.abs(c.suma) >= 3) + (Math.abs(h.suma) >= 3);
    const confianza = sinDatos ? 'baja' : ['baja', 'media', 'alta'][claros];
    const flojo = Math.abs(c.suma) < Math.abs(h.suma) ? 'calor' : 'humedad';
    const tendencia = sinDatos ? null : cuadrante(c.s, h.s);
    const secundario = sinDatos ? null : flojo === 'calor' ? cuadrante(-c.s, h.s) : cuadrante(c.s, -h.s);
    const etiqueta = confianza !== 'baja';
    return { calor: c.suma, humedad: h.suma, confianza, tendencia, dominante: etiqueta ? tendencia : null, secundario: etiqueta ? secundario : null, flojo, desempate: { calor: c.por, humedad: h.por }, signos: { calor: c.s, humedad: h.s } };
  }
  const banda = (v, e) => v >= 3 ? (e === 'c' ? 'caliente' : 'húmedo') : v <= -3 ? (e === 'c' ? 'frío' : 'seco') : (e === 'c' ? 'templado' : 'equilibrado');
  /* ---------- Mezcla en porcentajes ----------
     Parte caliente = (calor + 10) / 20 y parte húmeda = (humedad + 10) / 20. Cada temperamento es el producto de sus dos
     cualidades (colérico = caliente × seco…), así que los cuatro suman 100 %. Dominante y subdominante: los dos primeros
     de la mezcla; en los empates manda el cuadrante de los signos (con los desempates de siempre) y, para el subdominante,
     el que conserva el calor del dominante (se cambia la humedad). Da lo mismo que la regla de signos de siempre.
     Igual para hombres y mujeres: el cuestionario ya recoge las diferencias medias entre sexos (sudor, venas, grasa…). */
  const ORDEN = ['colerico', 'sanguineo', 'melancolico', 'flematico'];
  const caliente = k => k === 'colerico' || k === 'sanguineo';
  const permitidos = () => ORDEN;
  function redondear(w) {   // enteros que suman 100 (método del mayor resto)
    const tot = ORDEN.reduce((x, k) => x + (w[k] || 0), 0), ks = ORDEN.filter(k => k in w);
    const ex = ks.map(k => [k, (w[k] || 0) / tot * 100]), r = Object.fromEntries(ex.map(([k, v]) => [k, Math.floor(v)]));
    let resto = 100 - ks.reduce((x, k) => x + r[k], 0);
    ex.slice().sort((a, b) => (Math.abs((b[1] % 1) - (a[1] % 1)) < 1e-9 ? b[1] - a[1] : (b[1] % 1) - (a[1] % 1))).forEach(([k]) => { if (resto > 0) { r[k]++; resto--; } });
    return r;
  }
  function mezcla(calor, humedad, sx) {
    const pc = (calor + 10) / 20, ph = (humedad + 10) / 20;
    const crudo = { colerico: pc * (1 - ph), sanguineo: pc * ph, melancolico: (1 - pc) * (1 - ph), flematico: (1 - pc) * ph };
    const w = Object.fromEntries(permitidos(sx).map(k => [k, crudo[k]]));
    return { w, pct: redondear(w), crudo: redondear(crudo) };
  }
  function perfilDe(t, sx) {
    const a = t?.respuestas?.a || [], P = puntuar(a), hay = a.some(Boolean);
    const sC = hay ? P.signos.calor : Math.sign(t?.calor || 0), sH = hay ? P.signos.humedad : Math.sign(t?.humedad || 0);
    const m = mezcla(t?.calor || 0, t?.humedad || 0, sx), mujer = sx === 'mujer';
    if (!sC || !sH) return { dom: null, sec: null, tend: null, pct: null, crudo: m.crudo, mujer };
    const tend = cuadrante(sC, sH), dif = (x, y) => Math.abs(x - y) < 1e-9 ? 0 : y - x;
    const dom = permitidos(sx).slice().sort((x, y) => dif(m.w[x], m.w[y]) || (y === tend) - (x === tend) || (caliente(y) === sC > 0) - (caliente(x) === sC > 0))[0];
    const sec = permitidos(sx).filter(k => k !== dom).sort((x, y) => dif(m.w[x], m.w[y]) || (caliente(y) === caliente(dom)) - (caliente(x) === caliente(dom)))[0];
    return { dom, sec, tend, pct: m.pct, crudo: m.crudo, mujer };
  }
  const sexoDe = t => (S.c?.perfiles?.find(p => p.id === t?.alumno_id) || (t?.alumno_id && t.alumno_id === S.user?.id ? S.perfil : null) || {}).sexo;
  const pctTxt = (ef, k) => !ef.reetiq && ef.pct && ef.pct[k] != null ? ` (${ef.pct[k]} %)` : '';
  /* Perfil que manda ahora: el de las respuestas o el que puso el coach al reetiquetar */
  function efectivo(t, sx = sexoDe(t)) {
    const pf = perfilDe(t, sx), d = t?.seguimiento?.decision;
    if (d?.tipo === 'reetiquetar' && NOM[d.nuevo]) return { ...pf, resp: { dom: pf.dom, sec: pf.sec }, dom: d.nuevo, sec: null, reetiq: true };
    return { ...pf, resp: { dom: pf.dom, sec: pf.sec }, reetiq: false };
  }

  /* ---------- Sueño: horarios entre semana y en días libres ---------- */
  const mins = v => { const m = /^(\d{1,2}):(\d{2})/.exec(v || ''); return m ? +m[1] * 60 + +m[2] : null; };
  const dur = (a, b) => a == null || b == null ? null : ((b - a) % 1440 + 1440) % 1440;
  const hm = m => m == null ? '—' : `${Math.floor(m / 60)} h${m % 60 ? ' ' + String(m % 60).padStart(2, '0') : ''}`;
  function sueno(h) {
    const la = mins(h?.lab_ac), ll = mins(h?.lab_le); if (la == null || ll == null) return null;
    const fa = mins(h?.fin_ac) ?? la, fl = mins(h?.fin_le) ?? ll, dl = dur(la, ll), df = dur(fa, fl);
    const medio = (a, d) => (a + d / 2) % 1440, x = Math.abs(medio(fa, df) - medio(la, dl));
    return { lab: dl, fin: df, desfase: Math.round(Math.min(x, 1440 - x) / 5) * 5 };
  }
  function notaSueno(s) {
    if (!s) return '';
    const l = [];
    if (s.lab < 420) l.push(`Entre semana duermes unas ${hm(s.lab)}: por debajo de las 7 horas que necesita la mayoría de los adultos.`);
    if (s.desfase >= 120) l.push(`Tu horario se desplaza unas ${hm(s.desfase)} entre semana y los días libres. Es como un pequeño jet lag cada lunes: cuanto más parecidos sean tus horarios, mejor descansas.`);
    else if (s.desfase >= 60) l.push(`Tu horario se desplaza unas ${hm(s.desfase)} los días libres; acercarlos un poco te ayudará a descansar.`);
    return l.join(' ');
  }

  /* ---------- Datos ---------- */
  const ordenar = l => l.slice().sort((x, y) => y.fecha.localeCompare(x.fecha) || (y.id > x.id ? 1 : -1));
  const filasDe = id => ordenar((S.c?.temperamentos || []).filter(t => t.alumno_id === id));
  const misFilas = () => S.d?.temperamentos || [];
  const pendienteDe = (pedido, filas) => !!pedido && (!filas[0] || filas[0].fecha < pedido);
  const pendiente = () => pendienteDe(S.perfil?.temperamento_pedido, misFilas());

  /* ---------- Mapa de los cuatro temperamentos: calor en horizontal, humedad en vertical (seco arriba) ---------- */
  let nMapa = 0;
  function mapa(pts, o = {}) {
    const M = o.mini, id = 'tpm' + (++nMapa), L = M ? 92 : 256, x0 = M ? 4 : 32, y0 = M ? 4 : 40, W = M ? 100 : 320, H = M ? 100 : y0 + L + 42;
    const X = c => x0 + (c + 10) / 20 * L, Y = h => y0 + (h + 10) / 20 * L, mid = L / 2, gap = M ? 1.5 : 2, r = M ? 9 : 16;
    // Un solo cuadrado redondeado partido en cuatro; la franja templada (de −2 a +2 en cada eje) va más clara
    const tiles = [['melancolico', 0, 0], ['colerico', 1, 0], ['flematico', 0, 1], ['sanguineo', 1, 1]].map(([k, i, j]) =>
      `<rect x="${x0 + i * (mid + gap / 2)}" y="${y0 + j * (mid + gap / 2)}" width="${mid - gap / 2}" height="${mid - gap / 2}" fill="${k === o.res ? 'rgba(0,102,255,.17)' : 'var(--surface-2)'}"/>`).join('');
    const franja = `<rect x="${X(-2.5)}" y="${y0}" width="${X(2.5) - X(-2.5)}" height="${L}" fill="#fff" opacity=".5"/><rect x="${x0}" y="${Y(-2.5)}" width="${L}" height="${Y(2.5) - Y(-2.5)}" fill="#fff" opacity=".5"/>`;
    const nombres = M ? '' : [['melancolico', x0, 18, 'start'], ['colerico', x0 + L, 18, 'end'], ['flematico', x0, y0 + L + 22, 'start'], ['sanguineo', x0 + L, y0 + L + 22, 'end']].map(([k, x, y, an]) =>
      `<text class="qn${k === o.res ? ' on' : ''}" x="${x}" y="${y}" text-anchor="${an}">${NOM[k]}</text><text class="qc" x="${x}" y="${y + 14}" text-anchor="${an}">${CUAL[k]}</text>`).join('');
    const ps = pts.filter(p => p && p.c != null && p.h != null);
    let marcas = '';
    if (ps.length > 1 && !M) {
      const a = ps[ps.length - 2], b = ps[ps.length - 1], ax = X(a.c), ay = Y(a.h), bx = X(b.c), by = Y(b.h), d = Math.hypot(bx - ax, by - ay);
      if (d > 26) { const ux = (bx - ax) / d, uy = (by - ay) / d; marcas += `<line x1="${ax + ux * 10}" y1="${ay + uy * 10}" x2="${bx - ux * 15}" y2="${by - uy * 15}" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="3 3" marker-end="url(#${id}f)"/>`; }
    }
    ps.forEach((p, i) => {
      const x = X(p.c), y = Y(p.h), ult = i === ps.length - 1, tit = `<title>${esc(p.l || 'Tú')}: calor ${sg(p.c)}, humedad ${sg(p.h)}</title>`;
      marcas += ult
        ? `<circle cx="${x}" cy="${y}" r="${M ? 7.5 : 13}" fill="none" stroke="var(--gold)" stroke-width="2"/><circle cx="${x}" cy="${y}" r="${M ? 4.5 : 8}" fill="var(--blue)" stroke="#fff" stroke-width="2">${tit}</circle>`
        : `<circle cx="${x}" cy="${y}" r="${M ? 3.5 : 6.5}" fill="#fff" stroke="var(--muted)" stroke-width="2">${tit}</circle>`;
      if (!M && p.l) { const der = x < x0 + L - 56, ly = Math.min(Math.max(y + 4, y0 + 12), y0 + L - 4); marcas += `<text class="pl" x="${der ? x + (ult ? 17 : 11) : x - (ult ? 17 : 11)}" y="${ly}" text-anchor="${der ? 'start' : 'end'}">${esc(p.l)}</text>`; }
    });
    const ult = ps[ps.length - 1], lbl = ult ? `Mapa de temperamento: calor ${sg(ult.c)}, humedad ${sg(ult.h)}${o.res ? ', cuadrante ' + NOM[o.res].toLowerCase() : ''}` : 'Mapa de temperamento';
    return `<svg class="tp-svg${M ? ' mini' : ''}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(lbl)}"><defs><marker id="${id}f" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="var(--muted)"/></marker><clipPath id="${id}c"><rect x="${x0}" y="${y0}" width="${L}" height="${L}" rx="${r}"/></clipPath></defs><g clip-path="url(#${id}c)">${tiles}${franja}</g>${nombres}${marcas}</svg>`;
  }

  /* =====================================================================
     ALUMNO: tarjeta en Hoy, sección en Tests, cuestionario e informe
     ===================================================================== */
  const PASOS = 1 + PREG.length + HAB.length + RMEQ.length + 1;   // intro, 20, 6 pantallas de hábitos, 5 de cronotipo y señales
  const claveB = () => `lof-temperamento-${S.user?.id || ''}`;
  const guardarB = () => { if (S.prueba) return; try { localStorage.setItem(claveB(), JSON.stringify(S.tq)); } catch (e) { } };
  const leerB = () => { try { const b = JSON.parse(localStorage.getItem(claveB()) || 'null'); return b && b.v === VERSION && Date.now() - (b.t || 0) < 30 * 864e5 ? b : null; } catch (e) { return null; } };
  const borrarB = () => { try { localStorage.removeItem(claveB()); } catch (e) { } };
  const nuevo = () => ({ v: VERSION, t: Date.now(), paso: 0, a: Array(20).fill(null), b: {}, r: Array(5).fill(null), s: [], ninguna: false, orden: PREG.map(() => Math.random() < .5) });

  function tarjetaHoy() {
    if (S.d?.tempErr || !pendiente()) return '';
    const b = leerB(), repite = misFilas().length > 0, va = b && b.paso > 0;
    return `<section class="section"><div class="card tp-pend stack"><div class="row"><div class="ico gold">${svg('tests')}</div><div class="grow"><b>${repite ? 'Toca repetir tu perfil de temperamento' : 'Descubre tu perfil de temperamento'}</b><div class="small muted">${repite ? 'Han pasado 8 semanas: vemos si tu perfil se mantiene con lo que hemos aprendido.' : 'Jesús te lo pide para ajustar tu plan a cómo funciona tu cuerpo. Son unos 8 minutos.'}</div></div></div><button class="btn full" data-act="tpEmpezar">${va ? 'Continuar donde lo dejaste' : 'Empezar'}</button></div></section>`;
  }
  function seccionTests() {
    if (S.d?.tempErr) return '';
    const l = misFilas(), t = l[0], coach = S.perfil?.rol === 'coach', ped = pendiente();
    if (!t && !ped && !coach) return '';
    if (!t) return `<section class="section"><div class="card tp-pend stack"><span class="eyebrow">Perfil de temperamento</span><p class="small">${ped ? 'Jesús te ha pedido este cuestionario: unas 30 preguntas rápidas sobre tu cuerpo, tus hábitos y tu ritmo del día. Al terminar verás tu informe aquí y podrás generar tu plan de hábitos.' : 'Prueba el cuestionario como lo verán tus alumnos. Se guarda como tuyo.'}</p><button class="btn full" data-act="tpEmpezar">${leerB()?.paso ? 'Continuar donde lo dejaste' : ped ? 'Empezar' : 'Probar el cuestionario'}</button></div></section>`;
    const ef = efectivo(t);
    return `<section class="section"><div class="section-head"><h2>Tu perfil</h2><span class="small muted">${esc(fCorta(t.fecha))}</span></div>
      <button class="card tp-res" data-act="tpInforme" data-id="${t.id}"><div class="tp-mini">${mapa([{ c: t.calor, h: t.humedad }], { mini: true, res: ef.dom })}<div class="grow stack" style="gap:4px;text-align:left"><span class="eyebrow">Perfil de temperamento</span><h3>${ef.dom ? esc(NOM[ef.dom]) : 'Perfil templado'}</h3><div class="small muted">${ef.dom ? (ef.sec ? `${ef.pct[ef.dom]} % · con rasgos de ${esc(NOM[ef.sec].toLowerCase())}${pctTxt(ef, ef.sec)}` : CUAL[ef.dom][0].toUpperCase() + CUAL[ef.dom].slice(1)) : 'Tus datos marcarán el rumbo'}</div><span class="small" style="color:var(--blue-text);font-weight:700">Ver tu informe ›</span></div></div></button>
      ${ped || (coach && !ped) ? `<button class="btn ${ped ? '' : 'ghost'} full" data-act="tpEmpezar">${ped ? 'Repetir el cuestionario' : 'Volver a hacerlo'}</button>` : ''}</section>`;
  }

  function empezar() { const b = leerB(); S.tq = b || nuevo(); S.tinf = null; render(); window.scrollTo(0, 0); }
  function ir(p) { S.tq.paso = Math.max(0, Math.min(PASOS - 1, p)); S.tq.t = Date.now(); guardarB(); render(); window.scrollTo(0, 0); }

  function vista() {
    if (S.tq) return vFlujo();
    const t = misFilas().find(x => x.id === S.tinf);
    if (!t) { S.tinf = null; return seguro(vTests); }
    const borrarMio = S.perfil?.rol === 'coach' ? `<section class="section"><h2>Tus cuestionarios</h2><div class="card">${misFilas().map(x => { const e = efectivo(x); return `<div class="line"><div class="grow small"><b>${esc(fCorta(x.fecha))}</b> · ${e.dom ? esc(NOM[e.dom]) : 'Perfil templado'}${x.id === t.id ? ' · <span class="muted">el que estás viendo</span>' : ''}</div><button class="btn ghost sm" data-act="tpBorrar" data-id="${x.id}" style="color:var(--bad)">Borrar</button></div>`; }).join('')}</div><p class="small muted">Solo lo ves tú, como coach: sirve para quitar una prueba o un cuestionario que rellenó otra persona desde tu cuenta.</p></section>` : '';
    return `<section class="stack"><button class="btn sm ghost" data-act="tpCerrarInforme" style="align-self:flex-start">← Hábitos</button></section>${vInforme(t, { nombre: S.perfil.nombre, sexo: S.perfil.sexo, cta: true, anterior: misFilas().find(x => x.fecha < t.fecha || (x.fecha === t.fecha && x.id < t.id)) })}${borrarMio}`;
  }

  function vFlujo() {
    const z = S.tq, p = z.paso, sx = S.perfil?.sexo;
    if (p === 0) {
      const va = z.a.some(x => x) || z.r.some(x => x != null);
      return `<section class="card hero stack"><span class="eyebrow">Perfil de temperamento</span><h1>¿Cómo funciona tu cuerpo?</h1><p class="small muted">Son unas 30 preguntas rápidas, unos 8 minutos. Me ayudan a entender tus tendencias (calor o frío, humedad o sequedad, tu ritmo del día) para ajustar tu entreno, tu alimentación y tu descanso.</p></section>
      <section class="section"><div class="card">${['Contesta pensando en cómo eres normalmente en los últimos meses, no en un día concreto.', 'No hay respuestas buenas ni malas. Si dudas, elige la opción del medio.', 'No es un diagnóstico médico: es un punto de partida que comprobaremos con tus datos cada 15 días.'].map((t, i) => `<div class="line"><b class="tp-n">${i + 1}</b><div class="small">${t}</div></div>`).join('')}</div>
      <button class="btn full" data-act="tpIr" data-p="${va ? Math.max(1, z.max || 1) : 1}">${va ? 'Continuar donde lo dejaste' : 'Empezar'}</button>
      ${va ? '<button class="btn ghost full" data-act="tpReiniciar">Empezar de nuevo</button>' : ''}
      <button class="btn ghost full" data-act="tpSalir">Ahora no</button>
      <p class="small muted" style="text-align:center">Puedes dejarlo a medias: se guarda en este móvil.</p></section>`;
    }
    const parte = p <= 20 ? ['Tu cuerpo', p, 20] : p <= 26 ? ['Tus hábitos', p - 20, 6] : p <= 31 ? ['Tu ritmo del día', p - 26, 5] : ['Para cuidarte', 1, 1];
    const cab = `<div class="tp-cab"><div class="row"><button class="btn sm ghost" data-act="tpIr" data-p="${p - 1}">← Atrás</button><span class="grow small muted" style="text-align:center">${parte[0]}${parte[2] > 1 ? ` · <span class="num">${parte[1]} de ${parte[2]}</span>` : ''}</span><button class="btn sm ghost" data-act="tpSalir">Salir</button></div><div class="track"><i style="width:${Math.round(p / (PASOS - 1) * 100)}%"></i></div></div>`;
    if (p <= 20) {
      const i = p - 1, Q = PREG[i], orden = z.orden[i] ? ['C', 'B', 'A'] : ['A', 'B', 'C'];
      return cab + `<section class="section tp-paso"><p class="tp-q">${esc(Q[0])}</p><div class="tp-ops" role="radiogroup">${orden.map(k => `<button class="tp-op" role="radio" aria-checked="${z.a[i] === k}" data-act="tpA" data-v="${k}">${esc(Q[1 + 'ABC'.indexOf(k)])}</button>`).join('')}</div>${i === 0 ? '<p class="small muted">Piensa en cómo eres normalmente. Si dudas, elige la opción del medio.</p>' : ''}</section>`;
    }
    if (p <= 26) {
      const Hb = HAB[p - 21];
      return cab + `<section class="section tp-paso"><span class="eyebrow">${esc(Hb.f)}</span>${Hb.c.map(c => campo(c, z.b)).join('')}<p class="err" id="tp-err"></p><button class="btn full" data-act="tpB">Siguiente</button></section>`;
    }
    if (p <= 31) {
      const i = p - 27, R = RMEQ[i];
      return cab + `<section class="section tp-paso"><p class="tp-q">${esc(R.q)}</p><div class="tp-ops" role="radiogroup">${R.o(sx).map(([t], j) => `<button class="tp-op" role="radio" aria-checked="${z.r[i] === j}" data-act="tpR" data-v="${j}">${esc(t)}</button>`).join('')}</div></section>`;
    }
    return cab + `<section class="section tp-paso"><p class="tp-q">¿Te pasa algo de esto?</p><p class="small muted">Te lo pregunto para cuidarte: hay cosas que conviene consultar con un profesional sanitario antes de apretar el plan. Marca todas las que te pasen.</p>
      <div class="tp-ops">${SENALES.map(x => `<button class="tp-op chk" role="checkbox" aria-checked="${z.s.includes(x.k)}" data-act="tpSenal" data-k="${x.k}">${esc(x.t(sx))}</button>`).join('')}<button class="tp-op chk" role="checkbox" aria-checked="${!!z.ninguna}" data-act="tpNinguna">No, nada de esto</button></div>
      <button class="btn full" data-act="tpTerminar" ${z.s.length || z.ninguna ? '' : 'disabled'}>Ver mi informe</button></section>`;
  }
  function campo(c, b) {
    if (c.tipo === 'escala') return `<div class="stack" style="gap:8px"><b class="small">${esc(c.q)}</b><div class="tp-escala" role="group" data-k="${c.k}">${[...Array(11)].map((_, n) => `<button type="button" data-act="tpEsc" data-v="${n}" aria-pressed="${b[c.k] === n}">${n}</button>`).join('')}</div><div class="row small muted"><span class="grow">0 · Nada</span><span>10 · Muchísimo</span></div></div>`;
    if (c.tipo === 'horas') {
      const h = b.horarios || {}, inp = (k, l) => `<label class="f">${l}<input type="time" id="tp-${k}" value="${esc(h[k] || '')}"></label>`;
      return `<div class="stack" style="gap:8px"><b class="small">${esc(c.q)}</b><div class="tp-horas"><span class="t">Entre semana</span>${inp('lab_ac', 'Me acuesto')}${inp('lab_le', 'Me levanto')}<span class="t">Fin de semana o días libres</span>${inp('fin_ac', 'Me acuesto')}${inp('fin_le', 'Me levanto')}</div><p class="small muted">Si los días libres son iguales, déjalos en blanco.</p></div>`;
    }
    const sel = v => c.multi ? (b[c.k] || []).includes(v) : b[c.k] === v;
    return `<div class="stack" style="gap:8px"><b class="small">${esc(c.q)}${c.multi ? ' <span class="muted" style="font-weight:400">(puedes marcar varias)</span>' : ''}</b><div class="chips" data-k="${c.k}" data-multi="${c.multi ? 1 : ''}">${c.o.map(v => `<button type="button" data-act="tpChip" data-v="${esc(v)}" aria-pressed="${sel(v)}">${esc(v)}</button>`).join('')}</div></div>`;
  }
  function validarB() {
    const z = S.tq, Hb = HAB[z.paso - 21];
    if (Hb.c[0].tipo === 'horas') {
      const h = {}; ['lab_ac', 'lab_le', 'fin_ac', 'fin_le'].forEach(k => { const v = $('#tp-' + k)?.value; if (v) h[k] = v; });
      z.b.horarios = h;
      if (!h.lab_ac || !h.lab_le) return 'Pon al menos a qué hora te acuestas y te levantas entre semana.';
      return '';
    }
    const falta = Hb.c.find(c => !c.opcional && (c.multi ? !(z.b[c.k] || []).length : z.b[c.k] == null));
    return falta ? 'Contesta todas las preguntas de esta pantalla para seguir.' : '';
  }

  async function terminar(btn) {
    const z = S.tq; if (!z || terminar.ocupado) return;
    const P = puntuar(z.a), pts = puntosRmeq(z.r), cr = CRONO(pts), pf = perfilDe({ calor: P.calor, humedad: P.humedad, respuestas: { a: z.a } }, S.perfil?.sexo);
    const row = { alumno_id: S.user.id, fecha: hoyISO(), version: VERSION, respuestas: { a: z.a, b: z.b, r: z.r, orden: z.orden }, calor: P.calor, humedad: P.humedad, dominante: pf.dom, secundario: pf.sec, tendencia: P.tendencia, confianza: P.confianza, cronotipo: cr?.k || null, rmeq: pts, senales: z.s.slice() };
    terminar.ocupado = true; if (btn) btn.disabled = true;
    const { data, error } = await sb.from('temperamentos').insert(row).select().single();
    terminar.ocupado = false;
    if (error) { if (btn) btn.disabled = false; return fallo(error, /temperamentos|schema cache|relation/.test(error.message || '') ? (S.perfil.rol === 'coach' ? AVISO : 'Aún no se puede guardar: avisa a Jesús. Tus respuestas siguen guardadas en este móvil.') : undefined); }
    borrarB(); S.tq = null;
    S.d.temperamentos = [data || row, ...misFilas()]; S.tinf = (data || row).id; S.tab = 'habitos';
    render(); window.scrollTo(0, 0); toast(S.perfil.rol === 'coach' ? 'Informe listo' : 'Informe listo. Jesús ya puede verlo');
  }

  /* ---------- Informe (lo ve el alumno y, desde su ficha, el coach) ---------- */
  /* Con menos de 8 semanas entre dos cuestionarios, la diferencia suele venir de las respuestas, no del cuerpo */
  function notaAnterior(t, ant) {
    const dd = Math.max(0, Math.round((Date.parse(t.fecha) - Date.parse(ant.fecha)) / 864e5));
    const cuando = dd === 0 ? 'hecho el mismo día' : `hecho ${dd} ${dd === 1 ? 'día' : 'días'} antes`;
    return ` El punto hueco es tu cuestionario anterior, ${cuando}.` + (dd < 56 ? ' Con menos de 8 semanas entre uno y otro, la diferencia suele venir de cómo has respondido, no de un cambio en tu cuerpo.' : '');
  }
  /* Barras de la mezcla: dominante, subdominante y el resto */
  function vMezcla(ef, coach) {
    const p = ef.pct; if (!p) return '';
    const d = ef.resp.dom, s = ef.resp.sec, rk = k => k === d ? 0 : k === s ? 1 : 2, l = Object.keys(p).sort((x, y) => rk(x) - rk(y) || p[y] - p[x]);
    const txt = ef.reetiq ? 'Así quedó la mezcla con las respuestas del cuestionario; el perfil que manda ahora es el ajustado con los datos.'
      : coach ? 'El primero es el dominante y el segundo, el subdominante.' : 'Nadie es un temperamento puro. La mezcla sale de tus dos ejes: cuánto tienes de caliente o de frío y cuánto de húmedo o de seco. El primero es tu temperamento dominante y el segundo, el subdominante.';
    return `<section class="section"><h2>${coach ? 'Mezcla' : 'Tu mezcla'}</h2><div class="card stack"><div class="tp-mez">${l.map(k => `<div class="tp-mz${k === d ? ' d' : k === s ? ' s' : ''}"><span>${NOM[k]}</span><span class="b"><i style="width:${p[k]}%"></i></span><b class="num">${p[k]} %</b></div>`).join('')}</div><p class="small muted">${txt}</p></div></section>`;
  }
  /* Desglose por criterios clásicos: hacia dónde apunta cada grupo de preguntas */
  const CRIT = [
    ['c', 'Reacción a la temperatura', [0, 1, 2]], ['c', 'Apetito, digestión, sudor y ritmo', [3, 4, 5, 6]], ['c', 'Carácter', [7, 8]], ['c', 'Venas', [9]],
    ['h', 'Piel', [10]], ['h', 'Peso, grasa y líquidos', [11, 14]], ['h', 'Forma del cuerpo y manos', [12, 13]], ['h', 'Sueño', [15, 16, 17]], ['h', 'Mucosidad y tránsito', [18, 19]]
  ];
  const yLista = l => l.length > 1 ? l.slice(0, -1).join(', ') + ' y ' + l[l.length - 1] : l[0] || '';
  function vDesglose(t) {
    const a = t.respuestas?.a || []; if (!a.some(Boolean)) return '';
    const suma = ix => ix.reduce((x, i) => x + val(a[i]), 0);
    const fila = ([e, l, ix]) => { const v = suma(ix), n = ix.length, hacia = v > 0 ? (e === 'c' ? 'el calor' : 'la humedad') : (e === 'c' ? 'el frío' : 'la sequedad');
      return `<div class="tp-cr"><div class="small"><b>${l}</b><div class="muted">${v ? `${sg(v)} de ${n} · hacia ${hacia}` : 'Neutro'}</div></div><span class="eje" aria-hidden="true">${v ? `<i style="${v > 0 ? 'left' : 'right'}:50%;width:${Math.abs(v) / n * 50}%"></i>` : ''}</span></div>`; };
    const lectura = (e, tot) => { const g = Math.sign(tot); if (!g) return '';
      const cs = CRIT.filter(c => c[0] === e).map(c => ({ l: c[1].toLowerCase(), r: suma(c[2]) / c[2].length }));
      const pro = cs.filter(c => Math.sign(c.r) === g && Math.abs(c.r) >= .5).map(c => c.l), contra = cs.filter(c => Math.sign(c.r) === -g).map(c => c.l);
      const pol = e === 'c' ? (g > 0 ? 'el calor' : 'el frío') : (g > 0 ? 'la humedad' : 'la sequedad');
      return `<p class="small">${pro.length ? `Lo que más inclina hacia ${pol}: ${yLista(pro)}.` : `Ningún criterio inclina con fuerza hacia ${pol}.`}${contra.length ? ` En sentido contrario: ${yLista(contra)}.` : ''}</p>`; };
    const bloque = (e, tit, izq, der, tot) => `<div class="tp-crh"><b>${tit}</b><span class="small muted num">suma ${sg(tot)}</span></div><div class="tp-cre"><span></span><span class="ext"><span>${izq}</span><span>${der}</span></span></div>${CRIT.filter(c => c[0] === e).map(fila).join('')}${lectura(e, tot)}`;
    return `<section class="section"><h2>Desglose por criterios</h2><div class="card stack">${bloque('c', 'Calor o frío', '← Frío', 'Calor →', t.calor)}${bloque('h', 'Humedad o sequedad', '← Seco', 'Húmedo →', t.humedad)}<p class="small muted">Cada fila junta las preguntas de uno de los criterios clásicos de la medicina unani; la barra va hacia el lado al que apuntan las respuestas.</p></div></section>`;
  }
  function vInforme(t, o = {}) {
    const nom = (o.nombre || '').split(' ')[0], ef = efectivo(t, o.sexo ?? sexoDe(t)), pl = PLANT[ef.dom], sx = o.sexo, senales = t.senales || [];
    const delicado = senales.includes('animo'), cr = CRONO(t.rmeq), su = sueno(t.respuestas?.b?.horarios);
    const conf = t.confianza === 'alta' ? 'alta' : t.confianza === 'media' ? 'media' : 'baja';
    const cabecera = ef.dom
      ? `Hola, ${esc(nom)}. Tu perfil de temperamento es <b>${esc(NOM[ef.dom].toLowerCase())}</b>${pctTxt(ef, ef.dom)}${ef.sec ? `, con rasgos de <b>${esc(NOM[ef.sec].toLowerCase())}</b>${pctTxt(ef, ef.sec)}` : ''}${ef.reetiq ? '' : ` y confianza ${conf}`}.${!ef.reetiq && conf === 'baja' ? ' Tu mezcla está muy repartida, así que tus datos de las primeras 4 semanas tendrán la última palabra.' : ''} Es una forma de entender tus tendencias y organizar tu plan, no un diagnóstico médico, y lo comprobaremos con tus datos cada 15 días.`
      : `Hola, ${esc(nom)}. Tus respuestas no apuntan con claridad a un solo temperamento. Empezamos con un plan general y dejamos que tus datos de las primeras 4 semanas nos digan hacia dónde ajustar. No es un diagnóstico médico: es un punto de partida.`;
    const pts = [o.anterior && { c: o.anterior.calor, h: o.anterior.humedad, l: 'Antes' }, { c: t.calor, h: t.humedad, l: o.anterior ? 'Ahora' : 'Tú' }].filter(Boolean);
    const hip = pl ? (delicado ? pl.hip.filter(h => !/cintura|comer|alcohol/i.test(h)) : pl.hip) : [];
    const arr = pl ? pl.arr.filter(([k]) => !(delicado && k === 'c')) : [];
    const medir = (pl ? pl.medir : MEDIR_GENERAL).filter(m => !(delicado && /cintura|perímetro|grasa|comes/i.test(m)));
    const ico = { e: 'entreno', c: 'nutri', h: 'checkin' };
    const sec = (titulo, cuerpo) => `<section class="section"><h2>${titulo}</h2><div class="card stack">${cuerpo}</div></section>`;
    return `<section class="card hero stack tp-hero"><span class="eyebrow">Tu perfil de temperamento · ${esc(fCorta(t.fecha))} ${fecha(t.fecha).getFullYear()}</span><h1>${ef.dom ? esc(NOM[ef.dom]) : 'Perfil templado'}</h1>
      <div class="small muted">${ef.dom ? `${ef.reetiq ? '' : ef.pct[ef.dom] + ' % · '}${ef.reetiq ? CUAL[ef.dom][0].toUpperCase() + CUAL[ef.dom].slice(1) : CUAL[ef.dom]}${ef.sec ? ` · con rasgos de ${NOM[ef.sec].toLowerCase()}${pctTxt(ef, ef.sec)}` : ''}${ef.reetiq ? ' · ajustado con tus datos' : ` · confianza ${conf}`}` : 'Sin un temperamento claro: tus datos marcarán el rumbo'}</div></section>
    <section class="section"><div class="card stack tp-mapa">${mapa(pts, { res: ef.dom })}<p class="small muted">Tu punto en el mapa de los cuatro temperamentos: a la izquierda el frío, a la derecha el calor; arriba lo seco, abajo lo húmedo. La franja clara del centro es la zona templada.${o.anterior ? notaAnterior(t, o.anterior) : ''}${ef.reetiq ? ' El punto es donde te colocaron tus respuestas; el cuadrante marcado es tu perfil ajustado con tus datos.' : ''}</p></div></section>
    <section class="section"><div class="card stack"><p>${cabecera}</p>${ef.reetiq ? `<p class="note">Jesús ha ajustado tu perfil con tus datos de estas semanas: manda lo que dice tu cuerpo.</p>` : ''}</div></section>
    ${vMezcla(ef)}${vDesglose(t)}
    ${pl ? sec('Tus puntos fuertes', `<p>${esc(delicado && pl.fuertesSuave || pl.fuertes)}</p>`) + sec('Lo que vigilaremos', `<p>${esc(delicado && pl.vigilarSuave || pl.vigilar)}</p>`)
      + sec('Tus hipótesis para estas 8 semanas', `<ol class="tp-hip">${hip.map(h => `<li>${esc(h)}</li>`).join('')}</ol>${delicado && hip.length < pl.hip.length ? '<p class="small muted">Lo relacionado con la comida y la cintura lo vemos juntos, con calma.</p>' : ''}<p class="note">Cada 15 días miramos tus datos para ver si se cumplen. Si no, ajustamos.</p>`)
      + sec('Cómo arrancamos', `<div>${arr.map(([k, x]) => `<div class="line"><div class="ico">${svg(ico[k])}</div><div class="grow small">${esc(x)}</div></div>`).join('')}</div>${delicado ? '<p class="small muted">La alimentación la hablamos contigo antes de cambiar nada.</p>' : ''}`) : ''}
    ${sec('Qué mediremos', `<div class="chips tp-chips">${medir.map(m => `<span class="pill blue">${esc(m)}</span>`).join('')}</div>${pl?.nota && !delicado ? `<p class="small">${esc(pl.nota)}</p>` : ''}${delicado ? '<p class="small muted">El resto de medidas las decidimos juntos.</p>' : ''}`)}
    ${cr ? sec('Tu ritmo del día', `<div class="row"><div class="ico gold">${svg('cal')}</div><div class="grow"><b>${esc(cr.l)}</b><div class="small muted">Tu cronotipo: cuándo rinde mejor tu cuerpo</div></div></div><p class="small">${CRONO_TXT[cr.k]}</p>${su && notaSueno(su) ? `<p class="small">${esc(notaSueno(su))}</p>` : ''}`) : ''}
    ${senales.length ? `<section class="section"><h2>Para cuidarte</h2><div class="card stack tp-cuida"><p class="small">Has marcado algo que conviene consultar con un profesional sanitario antes de apretar el plan. Jesús lo verá en tu ficha y lo hablaréis.</p>${senales.map(k => senal(k)).filter(Boolean).map(x => `<div class="line" style="align-items:flex-start"><span class="tp-dot"></span><div class="small grow">${esc(x.al)}</div></div>`).join('')}</div></section>` : ''}
    ${o.cta && typeof Habitos !== 'undefined' ? Habitos.ctaInforme() : ''}
    <section class="section"><div class="card stack"><p class="small">Si algo de esto no encaja contigo, dínoslo: el perfil se adapta a ti, no al revés.</p><p class="note">Es una herramienta de entrenamiento y hábitos basada en la tradición de la medicina unani, no un diagnóstico médico. No sustituye a tu médico ni cambia ningún tratamiento.</p></div></section>`;
  }

  /* =====================================================================
     COACH: ficha, sub-pantalla con el seguimiento del piloto y resumen
     ===================================================================== */
  const CORTES = [2, 4, 6, 8];
  function cortes(t) {
    const hoy = hoyISO(), rv = t.seguimiento?.revisiones || {};
    return CORTES.map(k => { const f = sumaDias(t.fecha, k * 7), hecha = rv[k] || null; return { k, f, hecha, estado: hecha ? 'hecha' : hoy > sumaDias(f, 7) ? 'atrasada' : hoy >= sumaDias(f, -3) ? 'toca' : 'futura' }; });
  }
  const cerrado = t => !!t.seguimiento?.decision || !!t.seguimiento?.revisiones?.[8];
  const proxCorte = t => cerrado(t) ? null : cortes(t).find(c => c.estado !== 'hecha') || null;
  const PILL = { hecha: ['ok', 'Hecha'], toca: ['gold', 'Toca'], atrasada: ['bad', 'Atrasada'], futura: ['', 'Más adelante'] };
  const ict = (cin, est) => cin && est ? cin / est : null;
  const bandaICT = r => r == null ? null : r < .5 ? ['ok', 'sin riesgo añadido'] : r < .6 ? ['warn', 'riesgo aumentado'] : ['bad', 'riesgo alto'];
  /* Medición de partida (la más cercana antes del cuestionario o, si no hay, la primera después) y la última hasta una fecha */
  function medidas(med, base, hasta, k) {
    const l = (med || []).filter(m => m[k] != null).slice().sort((x, y) => x.fecha.localeCompare(y.fecha));
    const ini = l.filter(m => m.fecha <= sumaDias(base, 7)).pop() || l.find(m => m.fecha <= hasta) || null;
    const fin = l.filter(m => m.fecha <= hasta).pop() || null;
    return { ini, fin: fin && ini && fin.fecha > ini.fecha ? fin : null };
  }

  function bloqueFicha(f, a) {
    const head = `<div class="section-head"><h2>Perfil de temperamento</h2>`;
    if (S.c?.tempErr) return `<section class="section">${head}</div><div class="card small muted">${AVISO}</div></section>`;
    const l = filasDe(a.id), t = l[0], ped = pendienteDe(a.temperamento_pedido, l);
    if (!t) return `<section class="section">${head}</div><div class="card stack"><p class="small">${ped ? `Se lo pediste el ${esc(fCorta(a.temperamento_pedido))}: le aparece en su pantalla de Hoy hasta que lo haga.` : 'Aún no ha hecho el cuestionario. Cuando se lo pidas le aparecerá en su pantalla de Hoy: unos 8 minutos, y el informe te llega aquí.'}</p>${ped ? '' : `<button class="btn sm" data-act="tpPedir" data-id="${a.id}" style="align-self:flex-start">Pedírselo</button>`}</div></section>`;
    const ef = efectivo(t), pc = proxCorte(t), cr = CRONO(t.rmeq), m = medidas(f.med, t.fecha, hoyISO(), 'cintura'), r = ict((m.fin || m.ini)?.cintura, a.estatura_cm), bi = bandaICT(r);
    return `<section class="section">${head}</div>
      <button class="card tp-res" data-act="fichaSub" data-s="temperamento"><div class="tp-mini">${mapa([{ c: t.calor, h: t.humedad }], { mini: true, res: ef.dom })}<div class="grow stack" style="gap:5px;text-align:left"><h3>${ef.dom ? esc(NOM[ef.dom]) + (ef.reetiq ? '' : ` <span class="small muted num">${ef.pct[ef.dom]} %</span>`) : 'Sin datos'}${ef.reetiq ? ' <span class="pill gold">reetiquetado</span>' : ''}</h3>
        <div class="small muted">${ef.dom ? `${ef.sec ? `Rasgos de ${NOM[ef.sec].toLowerCase()}${pctTxt(ef, ef.sec)} · ` : ''}confianza ${t.confianza}` : 'Un eje sin datos'} · ${esc(fCorta(t.fecha))}</div>
        <div class="chips" style="gap:6px">${cr ? `<span class="pill">${esc(cr.l)}</span>` : ''}${bi ? `<span class="pill ${bi[0]}">Cintura/talla ${fmtNum(r, 2)}</span>` : ''}${(t.senales || []).length ? `<span class="pill bad">${t.senales.length} ${t.senales.length === 1 ? 'señal' : 'señales'} para derivar</span>` : ''}</div>
        <div class="small" style="color:${pc && pc.estado !== 'futura' ? 'var(--gold-ink)' : 'var(--muted)'};font-weight:700">${pc ? `${pc.estado === 'futura' ? 'Próxima revisión' : pc.estado === 'atrasada' ? 'Revisión atrasada' : 'Toca revisión'}: semana ${pc.k} · ${esc(fCorta(pc.f))}` : ped ? 'Le has pedido que lo repita' : 'Seguimiento de 8 semanas cerrado'}</div></div></div></button></section>`;
  }

  async function cargarSub(f) {
    const l = filasDe(f.id); if (!l.length) return;
    const r = await sb.from('registro_diario').select('*').eq('alumno_id', f.id).gte('fecha', sumaDias(l[l.length - 1].fecha, -7));
    f.tDiario = r.data || [];
  }

  function vSub(f, a) {
    if (S.c?.tempErr) return `<div class="card small muted">${AVISO}</div>`;
    const l = filasDe(a.id); if (!l.length) return `<section class="section"><div class="card empty">Aún no ha hecho el cuestionario.</div></section>`;
    const t = l.find(x => x.id === S.tSel) || l[0], ant = l.find(x => x.fecha < t.fecha || (x.fecha === t.fecha && x.id < t.id));
    const nom = (a.nombre || '').split(' ')[0];
    if (S.tVer) return `<section class="stack"><button class="btn sm ghost" data-act="tpVer" style="align-self:flex-start">← Perfil de ${esc(nom)}</button><span class="eyebrow">Así lo ve ${esc(nom)} en su pestaña Tests</span></section>${vInforme(t, { nombre: a.nombre, sexo: a.sexo, anterior: ant })}`;
    const ef = efectivo(t, a.sexo), pf = perfilDe(t, a.sexo), P = puntuar(t.respuestas?.a || []), ped = pendienteDe(a.temperamento_pedido, l), b = t.respuestas?.b || {}, cr = CRONO(t.rmeq), su = sueno(b.horarios);
    const m = medidas(f.med, t.fecha, hoyISO(), 'cintura'), base = m.ini, r0 = ict(base?.cintura, a.estatura_cm), b0 = bandaICT(r0);
    const des = (e, nq) => { const d = P.desempate[e], ej = e === 'calor' ? 'del calor' : 'de la humedad'; if (d == null) return ''; if (d === 'ninguna') return ` Todas sus respuestas ${ej} son B: ese eje no tiene datos.`; return d === nq ? ` La suma ${ej} da 0: decide la pregunta ${nq}.` : ` La suma ${ej} da 0 y la pregunta ${nq} también es B: decide la ${d}, la primera distinta de B.`; };
    const explica = !pf.dom
      ? 'Un eje no tiene datos (todas sus respuestas son B), así que no se puede calcular la mezcla. Mandan la observación y las medidas: a las 4 semanas, asígnale el perfil que encaje.'
      : `Dominante ${nm(pf.dom)} (${pf.pct[pf.dom]} %) y subdominante ${nm(pf.sec)} (${pf.pct[pf.sec]} %): los dos primeros de la mezcla. Confianza ${t.confianza}: ${t.confianza === 'alta' ? 'los dos ejes llegan a ±3' : t.confianza === 'media' ? 'solo un eje llega a ±3' : 'ningún eje llega a ±3 y la mezcla está muy repartida; confírmalo con sus datos a las 4 semanas'}.`;
    const cs = cortes(t), dec = t.seguimiento?.decision;
    const resumenRev = rv => { if (!rv) return ''; const n = v => (rv.hip || []).filter(x => x === v).length; return [n('si') && `${n('si')} se cumple${n('si') > 1 ? 'n' : ''}`, n('no') && `${n('no')} no`, n('sin') && `${n('sin')} sin datos`, rv.sueno != null && `sueño ${fmtNum(rv.sueno)} h`, rv.estres != null && `estrés ${rv.estres}/10`, rv.energia != null && `energía ${rv.energia}/10`].filter(Boolean).join(' · '); };
    const filaHab = (l1, v) => v ? `<tr><td class="muted">${l1}</td><td>${v}</td></tr>` : '';
    const lista = v => Array.isArray(v) ? v.join(', ') : v;
    return `${l.length > 1 ? `<section class="section"><div class="chips" style="gap:6px">${l.map(x => { const e = efectivo(x, a.sexo); return `<button class="pill ${x.id === t.id ? 'blue' : ''}" data-act="tpSel" data-id="${x.id}">${esc(fCorta(x.fecha))} · ${esc(e.dom ? NOM[e.dom] : 'sin datos')}</button>`; }).join('')}</div></section>` : ''}
    <section class="section"><div class="card stack"><div class="row" style="align-items:flex-start"><div class="grow stack" style="gap:4px"><span class="eyebrow">Resultado · ${esc(fCorta(t.fecha))}</span><h2>${ef.dom ? esc(NOM[ef.dom]) + (ef.reetiq ? '' : ` · ${ef.pct[ef.dom]} %`) : 'Sin datos'}</h2><div class="small muted">${ef.reetiq ? `Reetiquetado por ti el ${esc(fCorta(dec.fecha))} · en el cuestionario salió ${pf.dom ? nm(pf.dom) : 'sin datos'}` : ef.dom ? `Rasgos de ${nm(ef.sec)}${pctTxt(ef, ef.sec)} · confianza ${esc(t.confianza)}` : 'Un eje sin datos'}</div></div></div>
      <div class="tp-mapa">${mapa([ant && { c: ant.calor, h: ant.humedad, l: fCorta(ant.fecha) }, { c: t.calor, h: t.humedad, l: ant ? fCorta(t.fecha) : nom }], { res: ef.dom })}</div>
      <div class="tbl"><table><thead><tr><th>Eje</th><th>Suma</th><th>Franja</th></tr></thead><tbody>
        <tr><td>Calor (1-10)</td><td class="num"><b>${sg(t.calor)}</b></td><td>${banda(t.calor, 'c')}${t.calor === 0 || Math.abs(t.calor) < 3 ? ` <span class="muted">· signo ${P.signos.calor > 0 ? 'caliente' : P.signos.calor < 0 ? 'frío' : '—'}</span>` : ''}</td></tr>
        <tr><td>Humedad (11-20)</td><td class="num"><b>${sg(t.humedad)}</b></td><td>${banda(t.humedad, 'h')}${Math.abs(t.humedad) < 3 ? ` <span class="muted">· signo ${P.signos.humedad > 0 ? 'húmedo' : P.signos.humedad < 0 ? 'seco' : '—'}</span>` : ''}</td></tr></tbody></table></div>
      <p class="small">${explica}${des('calor', 1)}${des('humedad', 12)}</p>
      <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn sm" data-act="tpVer">Ver su informe</button>${ped ? '<span class="pill gold">Repetición pedida</span>' : `<button class="btn sm ghost" data-act="tpPedir" data-id="${a.id}">Pedir que lo repita</button>`}<button class="btn sm ghost" data-act="tpEtiqueta" data-id="${t.id}">${ef.dom ? 'Reetiquetar' : 'Asignar perfil'}</button></div></div></section>
    ${vMezcla(ef, true)}${vDesglose(t)}
    ${(t.senales || []).length ? `<section class="section"><h2>Señales para derivar</h2><div class="card tp-cuida">${t.senales.map(senal).filter(Boolean).map(x => `<div class="line" style="align-items:flex-start"><span class="tp-dot"></span><div class="grow small"><b>${esc(x.d)}</b><div class="muted">${esc(x.coach)}</div></div></div>`).join('')}</div></section>` : ''}
    <section class="section"><div class="section-head"><h2>Seguimiento</h2><span class="small muted">8 semanas desde el ${esc(fCorta(t.fecha))}</span></div><div class="card">
      ${cs.map(c => `<div class="line" data-act="tpRevision" data-id="${t.id}" data-k="${c.k}" style="cursor:pointer"><span class="tl-dot ${c.estado === 'hecha' ? 'ok' : c.estado === 'futura' ? '' : 'now'}"></span><div class="grow"><div class="small"><b>Semana ${c.k}</b> · ${esc(fCorta(c.f))}</div>${c.hecha ? `<div class="small muted">${esc(resumenRev(c.hecha))}</div>` : ''}</div>${PILL[c.estado][1] && c.estado !== 'futura' ? `<span class="pill ${PILL[c.estado][0]}">${PILL[c.estado][1]}</span>` : '<span class="small muted">Más adelante</span>'}</div>`).join('')}
      ${dec ? `<div class="aprox small"><b>${dec.tipo === 'reetiquetar' ? `Reetiquetado a ${esc((NOM[dec.nuevo] || dec.nuevo || '').toLowerCase())}` : 'Perfil mantenido'}</b> · ${esc(fCorta(dec.fecha))}${dec.motivo ? ` · ${esc(dec.motivo)}` : ''}</div>` : ''}
      <p class="note" style="margin-top:12px">Cada revisión marca si se cumple cada hipótesis con sus datos. Si a las 8 semanas los datos contradicen el perfil, manda el dato: se reetiqueta.</p></div></section>
    <section class="section"><h2>Medidas de partida</h2><div class="kpis">
      <div class="kpi"><div class="v num">${base?.cintura != null ? fmtNum(base.cintura) : '—'}</div><div class="l">cintura (cm) · ${base ? esc(fCorta(base.fecha)) : 'sin medir'}</div></div>
      <div class="kpi"><div class="v num" style="color:${b0 ? `var(--${b0[0]})` : 'inherit'}">${r0 ? fmtNum(r0, 2) : '—'}</div><div class="l">cintura/talla · ${b0 ? b0[1] : a.estatura_cm ? 'falta la cintura' : 'falta su estatura'}</div></div>
      <div class="kpi"><div class="v num">${t.rmeq ?? '—'}</div><div class="l">cronotipo · ${cr ? { matutino: 'de mañana', intermedio: 'intermedio', vespertino: 'de noche' }[cr.k] : 'sin datos'}</div></div></div>
      <p class="small muted">Cintura/talla: por debajo de 0,5 sin riesgo añadido; de 0,5 a 0,59 riesgo aumentado; 0,6 o más riesgo alto (NICE). Cronotipo de 4 a 25 puntos: 18 o más, de mañana; 11 o menos, de noche.</p></section>
    <section class="section"><h2>Hábitos de partida</h2><div class="card tbl"><table><tbody>
      ${filaHab('Entorno', [b.lugar, lista(b.ambiente)].filter(Boolean).map(esc).join(' · '))}
      ${filaHab('Comidas al día', esc(b.comidas || ''))}${filaHab('Cafeína al día', esc(b.cafe || ''))}${filaHab('Alcohol a la semana', esc(b.alcohol || ''))}
      ${filaHab('Pasos al día', esc(b.pasos || ''))}${filaHab('Entrena', b.entrenos ? esc(b.entrenos) + (b.entrenos === 'Ninguno' ? '' : ' días por semana') : '')}
      ${filaHab('Estrés (2 semanas)', b.estres != null ? `<b>${esc(b.estres)}/10</b>${(b.causas || []).length ? ' · ' + esc(lista(b.causas)) : ''}` : '')}
      ${filaHab('Sueño', su ? `${esc(b.horarios.lab_ac)}–${esc(b.horarios.lab_le)} entre semana (${hm(su.lab)})${b.horarios.fin_ac || b.horarios.fin_le ? ` · ${esc(b.horarios.fin_ac || b.horarios.lab_ac)}–${esc(b.horarios.fin_le || b.horarios.lab_le)} días libres (${hm(su.fin)})` : ''}${su.desfase >= 60 ? ` · <b style="color:var(--warn)">desfase ${hm(su.desfase)}</b>` : ''}` : '')}
      ${filaHab('Evacuación', [b.bano, b.gases && 'hinchazón o gases: ' + b.gases.toLowerCase()].filter(Boolean).map(esc).join(' · '))}
    </tbody></table></div></section>
    <section class="section"><details class="card prueba"><summary><div class="row"><div class="grow"><h3>Sus 20 respuestas</h3><div class="small muted">Con los puntos de cada una</div></div><span class="mas">＋</span></div></summary>
      <div class="tbl" style="margin-top:10px"><table><thead><tr><th>#</th><th>Pregunta</th><th>Respuesta</th><th class="num">Pts</th></tr></thead><tbody>${PREG.map((Q, i) => { const x = t.respuestas?.a?.[i]; return `<tr${i === 10 ? ' style="border-top:2px solid var(--line)"' : ''}><td class="num muted">${i + 1}</td><td class="small">${esc(Q[0])}</td><td class="small">${x ? esc(Q[1 + 'ABC'.indexOf(x)]) : '—'}</td><td class="num"><b>${x ? sg(val(x)) : ''}</b></td></tr>`; }).join('')}</tbody></table></div></details></section>
    <section class="section"><button class="btn ghost sm" data-act="tpBorrar" data-id="${t.id}" style="align-self:flex-start;color:var(--bad)">Borrar este cuestionario</button></section>`;
  }

  /* Revisión quincenal: datos del periodo + si se cumple cada hipótesis; a las 8 semanas, la decisión */
  function datosPeriodo(t, k) {
    const f = S.ficha, a = S.c.perfiles.find(p => p.id === t.alumno_id) || {}, ini = sumaDias(t.fecha, (k - 2) * 7), fin = sumaDias(t.fecha, k * 7 - 1);
    const ses = new Set((f.todas || []).filter(x => x.fecha >= ini && x.fecha <= fin).map(x => x.fecha + x.dia_id)).size, dpw = f.prog?.dias_semana;
    const reg = (f.tDiario || S.c.diario.filter(r => r.alumno_id === t.alumno_id)).filter(r => r.fecha >= ini && r.fecha <= fin);
    const pasos = reg.filter(r => r.pasos != null).map(r => r.pasos), pm = pasos.length ? Math.round(pasos.reduce((x, y) => x + y, 0) / pasos.length) : null;
    const conIng = reg.filter(r => r.ingestas != null), ing = f.srv?.modulo_nutricion && conIng.length ? Math.round(conIng.reduce((x, r) => x + r.ingestas, 0) / (14 * comidasDia(f.srv)) * 100) : null;
    const mc = medidas(f.med, t.fecha, fin, 'cintura'), mp = medidas(f.med, t.fecha, fin, 'peso');
    const cambio = (m, k2, u) => !m.ini ? 'sin medir' : !m.fin ? `${fmtNum(m.ini[k2])} ${u} (solo la de partida)` : `${fmtNum(m.ini[k2])} → ${fmtNum(m.fin[k2])} ${u} (${m.fin[k2] - m.ini[k2] > 0 ? '+' : ''}${fmtNum(m.fin[k2] - m.ini[k2])})`;
    const r1 = ict((mc.fin || mc.ini)?.cintura, a.estatura_cm);
    return `<span class="eyebrow">Sus datos del ${esc(fCorta(ini))} al ${esc(fCorta(fin))}</span>
      <div class="row small"><span class="grow">Entrenamientos</span><b class="num">${ses}${dpw ? ' de ' + dpw * 2 : ''}</b></div>
      <div class="row small"><span class="grow">Pasos (media)</span><b class="num">${pm == null ? 'sin registros' : fmtNum(pm, 0)}</b></div>
      ${f.srv?.modulo_nutricion ? `<div class="row small"><span class="grow">Ingestas cumplidas</span><b class="num">${ing == null ? 'sin registros' : ing + ' %'}</b></div>` : ''}
      <div class="row small"><span class="grow">Cintura</span><b class="num">${cambio(mc, 'cintura', 'cm')}</b></div>
      ${r1 ? `<div class="row small"><span class="grow">Cintura/talla</span><b class="num" style="color:var(--${bandaICT(r1)[0]})">${fmtNum(r1, 2)}</b></div>` : ''}
      <div class="row small"><span class="grow">Peso</span><b class="num">${cambio(mp, 'peso', 'kg')}</b></div>`;
  }
  function formRevision(id, k) {
    const t = (S.c.temperamentos || []).find(x => x.id === id); if (!t) return;
    const a = S.c.perfiles.find(p => p.id === t.alumno_id) || {}, sg2 = t.seguimiento || {}, rv = sg2.revisiones?.[k] || {}, ef = efectivo(t), pl = PLANT[ef.dom], dec = sg2.decision || {};
    const grupo = (gid, ops, v) => `<div class="choice" role="group" id="${gid}" style="grid-template-columns:repeat(${ops.length},1fr)">${ops.map(([x, l]) => `<button type="button" data-act="tpEstado" data-v="${x}" aria-pressed="${v === x}">${l}</button>`).join('')}</div>`;
    abrirSheet(`<form class="stack" id="tp-rev"><span class="eyebrow">Perfil de temperamento · semana ${k}</span><h2>${esc(a.nombre || '')}</h2>
      <div class="card stack" style="background:var(--surface-2);gap:8px">${datosPeriodo(t, k)}</div>
      ${pl ? `<span class="small"><b>¿Se cumplen sus hipótesis de ${NOM[ef.dom].toLowerCase()}?</b></span>${pl.hip.map((h, j) => `<div class="stack" style="gap:6px"><span class="small">${j + 1}. ${esc(h)}</span>${grupo('tp-h' + j, [['si', 'Se cumple'], ['no', 'No'], ['sin', 'Sin datos']], rv.hip?.[j])}</div>`).join('')}` : '<p class="small muted">Perfil sin etiqueta: observa sus datos y, a las 4 semanas, asígnale el perfil que encaje con «Asignar perfil».</p>'}
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px"><label class="f">Sueño (h/día)<input type="text" inputmode="decimal" id="tp-su" value="${rv.sueno ?? ''}" placeholder="7,5"></label><label class="f">Estrés (0-10)<input type="text" inputmode="numeric" id="tp-es" value="${rv.estres ?? ''}"></label><label class="f">Energía (0-10)<input type="text" inputmode="numeric" id="tp-en" value="${rv.energia ?? ''}"></label></div>
      <p class="small muted" style="margin-top:-4px">Lo que te cuente en la revisión: media de la última semana.</p>
      ${k === 8 ? `<div class="aprox stack"><b class="small">Decisión a las 8 semanas</b>${grupo('tp-dec', [['mantener', ef.dom ? 'Mantener ' + NOM[ef.dom].toLowerCase() : 'Mantener sin etiqueta'], ['reetiquetar', 'Reetiquetar']], dec.tipo)}
        <label class="f">Nuevo perfil (si reetiquetas)<select id="tp-nuevo">${permitidos(a.sexo).map(x => `<option value="${x}" ${(dec.nuevo || ef.dom) === x ? 'selected' : ''}>${NOM[x]}</option>`).join('')}</select></label>
        <label class="f">Por qué (opcional)<input type="text" id="tp-mot" value="${esc(dec.motivo || '')}" placeholder="Ej. pierde grasa rápido y duerme poco"></label>
        <label class="row small"><input type="checkbox" id="tp-rep" ${pendienteDe(a.temperamento_pedido, filasDe(a.id)) ? '' : 'checked'} style="width:20px;height:20px"> Pedirle que repita el cuestionario</label></div>` : ''}
      <label class="f">Nota privada (opcional, se guarda en tus notas)<textarea id="tp-nota" rows="2"></textarea></label>
      <button class="btn full" type="submit">Guardar revisión</button></form>`);
    $('#tp-rev').addEventListener('submit', async e => {
      e.preventDefault();
      const est = gid => document.querySelector(`#${gid} [aria-pressed="true"]`)?.dataset.v || null, n010 = v => { const x = numero(v); return x == null ? null : Math.max(0, Math.min(10, Math.round(x))); };
      const nueva = { fecha: hoyISO(), hip: pl ? pl.hip.map((_, j) => est('tp-h' + j) || 'sin') : [], sueno: numero($('#tp-su').value), estres: n010($('#tp-es').value), energia: n010($('#tp-en').value) };
      const sgN = { ...sg2, revisiones: { ...(sg2.revisiones || {}), [k]: nueva } };
      if (k === 8) { const d = est('tp-dec'); if (d) sgN.decision = { fecha: hoyISO(), tipo: d, ...(d === 'reetiquetar' ? { nuevo: $('#tp-nuevo').value } : {}), motivo: $('#tp-mot').value.trim() || null }; }
      if (!await guardarSeguimiento(t, sgN)) return;
      const nota = $('#tp-nota').value.trim(); if (nota) await sb.from('notas_coach').insert({ alumno_id: t.alumno_id, texto: `Perfil de temperamento · semana ${k}: ${nota}` });
      if (k === 8 && $('#tp-rep')?.checked) await pedir(t.alumno_id, true);
      cerrarSheet(); toast('Revisión guardada'); render();
    });
  }
  function formEtiqueta(id) {
    const t = (S.c.temperamentos || []).find(x => x.id === id); if (!t) return;
    const sx = sexoDe(t), ef = efectivo(t, sx), dec = t.seguimiento?.decision || {};
    abrirSheet(`<form class="stack" id="tp-et"><h2>${ef.dom ? 'Reetiquetar perfil' : 'Asignar perfil'}</h2><p class="small muted">Si sus datos contradicen el perfil, manda el dato. El alumno verá en su informe el perfil nuevo.</p>
      <label class="f">Perfil<select id="tp-et-n">${permitidos(sx).map(x => `<option value="${x}" ${(dec.nuevo || ef.dom) === x ? 'selected' : ''}>${NOM[x]} · ${CUAL[x]}</option>`).join('')}</select></label>
      <label class="f">Por qué (opcional)<input type="text" id="tp-et-m" value="${esc(dec.motivo || '')}" placeholder="Ej. a las 4 semanas responde como un flemático"></label>
      <button class="btn full" type="submit">Guardar</button>${ef.reetiq ? '<button class="btn ghost full" type="button" data-act="tpQuitarEtiqueta" data-id="' + t.id + '">Volver al perfil del cuestionario</button>' : ''}</form>`);
    $('#tp-et').addEventListener('submit', async e => {
      e.preventDefault();
      const nuevoP = $('#tp-et-n').value, sgN = { ...(t.seguimiento || {}), decision: nuevoP === ef.resp.dom ? { fecha: hoyISO(), tipo: 'mantener', motivo: $('#tp-et-m').value.trim() || null } : { fecha: hoyISO(), tipo: 'reetiquetar', nuevo: nuevoP, motivo: $('#tp-et-m').value.trim() || null } };
      if (!await guardarSeguimiento(t, sgN)) return;
      cerrarSheet(); toast('Perfil actualizado'); render();
    });
  }
  async function guardarSeguimiento(t, sgN) {
    const { data, error } = await sb.from('temperamentos').update({ seguimiento: sgN }).eq('id', t.id).select().single();
    if (error) { fallo(error, /seguimiento|temperamentos/.test(error.message || '') ? AVISO : undefined); return false; }
    Object.assign(t, data || { seguimiento: sgN }); return true;
  }
  async function pedir(id, callado) {
    const hoy = hoyISO(), { error } = await sb.from('perfiles').update({ temperamento_pedido: hoy }).eq('id', id);
    if (error) return fallo(error, /temperamento_pedido|column/.test(error.message || '') ? AVISO : undefined);
    const a = S.c?.perfiles.find(p => p.id === id); if (a) a.temperamento_pedido = hoy; if (S.perfil?.id === id) S.perfil.temperamento_pedido = hoy;
    if (!callado) { toast('Listo: le aparecerá en su pantalla de Hoy'); render(); }
  }
  async function borrar(id) {
    const { error } = await sb.from('temperamentos').delete().eq('id', id);
    if (error) return fallo(error);
    if (S.c) S.c.temperamentos = (S.c.temperamentos || []).filter(x => x.id !== id);
    if (S.d?.temperamentos) S.d.temperamentos = S.d.temperamentos.filter(x => x.id !== id);
    if (S.tinf === id) { S.tinf = (S.d?.temperamentos || [])[0]?.id || null; if (!S.tinf) S.tab = 'habitos'; }
    S.tSel = null; toast('Cuestionario borrado'); render(); window.scrollTo(0, 0);
  }

  /* Resumen del piloto en Alumnos: quién lo ha hecho, a quién le toca revisión y quién tiene señales para derivar */
  function resumenCoach() {
    if (!S.c || S.c.tempErr) return '';
    const als = S.c.perfiles.filter(p => p.activo !== false && p.rol !== 'coach'), hoy = hoyISO();
    const filas = als.map(a => { const l = filasDe(a.id); return { a, t: l[0], ped: pendienteDe(a.temperamento_pedido, l) }; }).filter(x => x.t || x.ped);
    if (!filas.length) return `<section class="section"><div class="card row"><div class="ico gold">${svg('tests')}</div><div class="grow small"><b>Perfil de temperamento</b><div class="muted">Pídeselo a los alumnos del piloto desde su ficha: lo hacen en unos 8 minutos y el informe te llega aquí.</div></div></div></section>`;
    const hechos = filas.filter(x => x.t), pend = filas.filter(x => x.ped), conS = hechos.filter(x => (x.t.senales || []).length);
    const cuenta = { si: 0, no: 0, sin: 0 }; let reet = 0;
    hechos.forEach(({ t }) => { const rv = t.seguimiento?.revisiones || {}, ult = CORTES.slice().reverse().find(k => rv[k]); if (ult) (rv[ult].hip || []).forEach(v => cuenta[v] = (cuenta[v] || 0) + 1); if (t.seguimiento?.decision?.tipo === 'reetiquetar') reet++; });
    const lineas = filas.map(({ a, t, ped }) => {
      const pc = t && proxCorte(t), urg = (t?.senales || []).length ? 0 : pc && pc.estado === 'atrasada' ? 1 : pc && pc.estado === 'toca' ? 2 : ped ? 3 : 4;
      const ef = t && efectivo(t);
      const txt = [t ? (ef.dom ? NOM[ef.dom] : 'Sin etiqueta') : null, t && (t.senales || []).length ? `<b style="color:var(--bad)">${t.senales.length} ${t.senales.length === 1 ? 'señal' : 'señales'} para derivar</b>` : null, pc && pc.estado !== 'futura' ? `<b style="color:var(--gold-ink)">revisión semana ${pc.k}${pc.estado === 'atrasada' ? ' atrasada' : ''}</b>` : null, ped ? `pedido el ${esc(fCorta(a.temperamento_pedido))}, sin hacer` : null].filter(Boolean).join(' · ');
      return { urg, html: `<div class="line" data-act="tpFicha" data-id="${a.id}" style="cursor:pointer">${t ? `<span class="tp-thumb">${mapa([{ c: t.calor, h: t.humedad }], { mini: true, res: ef.dom })}</span>` : '<span class="tp-thumb vacio"></span>'}<div class="grow"><h3 style="font-size:16px">${esc(a.nombre)}</h3><div class="small muted">${txt}</div></div><span class="small" style="color:var(--blue-text)">›</span></div>` };
    }).sort((x, y) => x.urg - y.urg);
    const totalHip = cuenta.si + cuenta.no + cuenta.sin;
    return `<section class="section"><h2>Perfiles de temperamento</h2>
      <div class="kpis"><div class="kpi"><div class="v num">${hechos.length}</div><div class="l">hechos</div></div><div class="kpi"><div class="v num" style="color:${pend.length ? 'var(--gold-ink)' : 'inherit'}">${pend.length}</div><div class="l">pedidos sin hacer</div></div><div class="kpi"><div class="v num" style="color:${conS.length ? 'var(--bad)' : 'var(--ok)'}">${conS.length}</div><div class="l">con señales para derivar</div></div></div>
      <div class="card">${lineas.map(x => x.html).join('')}</div>
      ${totalHip ? `<p class="small muted">Hipótesis en su última revisión: <b style="color:var(--ok)">${cuenta.si} se cumplen</b> · ${cuenta.no} no · ${cuenta.sin} sin datos${reet ? ` · ${reet} ${reet === 1 ? 'perfil reetiquetado' : 'perfiles reetiquetados'}` : ''}.</p>` : ''}</section>`;
  }

  /* ---------- Eventos (se registran antes que los de app.js; solo atienden acciones tp…) ---------- */
  function marcarEn(grupo, b, multi) {
    if (multi) { b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'); return; }
    grupo.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
  }
  let avanzando = false;
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const a = b.dataset.act, z = S.tq;
    if (a === 'tab' || a === 'ctab' || a === 'modo') { S.tq = null; S.tinf = null; S.tVer = null; S.tSel = null; return; }
    if (a === 'cerrarSub' || a === 'cerrarFicha' || a === 'ficha' || a === 'fichaSub') { S.tVer = null; S.tSel = null; return; }
    if (!a.startsWith('tp')) return;
    switch (a) {
      case 'tpEmpezar': empezar(); break;
      case 'tpIr': ir(+b.dataset.p); break;
      case 'tpReiniciar': S.tq = nuevo(); ir(1); break;
      case 'tpSalir': S.tq = null; render(); window.scrollTo(0, 0); break;
      case 'tpA': case 'tpR': {
        if (!z || avanzando) break;
        const i = a === 'tpA' ? z.paso - 1 : z.paso - 27;
        if (a === 'tpA') z.a[i] = b.dataset.v; else z.r[i] = +b.dataset.v;
        z.max = Math.max(z.max || 1, z.paso + 1);
        b.closest('.tp-ops').querySelectorAll('.tp-op').forEach(x => x.setAttribute('aria-checked', x === b));
        avanzando = true; setTimeout(() => { avanzando = false; if (S.tq === z) ir(z.paso + 1); }, 170);
        break;
      }
      case 'tpChip': {
        if (!z) break; if ($('#tp-err')) $('#tp-err').textContent = '';
        const g = b.closest('.chips'), k = g.dataset.k, multi = !!g.dataset.multi, v = b.dataset.v;
        marcarEn(g, b, multi);
        if (multi) { const s = new Set(z.b[k] || []); s.has(v) ? s.delete(v) : s.add(v); if (k === 'causas' && v === 'Nada en especial' && s.has(v)) { s.clear(); s.add(v); } else if (k === 'causas' && v !== 'Nada en especial') s.delete('Nada en especial'); z.b[k] = [...s]; g.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', s.has(x.dataset.v))); }
        else z.b[k] = v;
        guardarB(); break;
      }
      case 'tpEsc': { if (!z) break; if ($('#tp-err')) $('#tp-err').textContent = ''; const g = b.closest('.tp-escala'); marcarEn(g, b); z.b[g.dataset.k] = +b.dataset.v; guardarB(); break; }
      case 'tpB': { if (!z) break; const err = validarB(); if (err) { $('#tp-err').textContent = err; break; } z.max = Math.max(z.max || 1, z.paso + 1); ir(z.paso + 1); break; }
      case 'tpSenal': { if (!z) break; const k = b.dataset.k; z.s = z.s.includes(k) ? z.s.filter(x => x !== k) : [...z.s, k]; if (z.s.length) z.ninguna = false; guardarB(); render(); break; }
      case 'tpNinguna': { if (!z) break; z.ninguna = !z.ninguna; if (z.ninguna) z.s = []; guardarB(); render(); break; }
      case 'tpTerminar': await terminar(b); break;
      case 'tpInforme': S.tinf = +b.dataset.id; render(); window.scrollTo(0, 0); break;
      case 'tpCerrarInforme': S.tinf = null; S.tab = 'habitos'; render(); window.scrollTo(0, 0); break;
      case 'tpPedir': await pedir(b.dataset.id); break;
      case 'tpVer': S.tVer = !S.tVer; render(); window.scrollTo(0, 0); break;
      case 'tpSel': S.tSel = +b.dataset.id; S.tVer = null; render(); break;
      case 'tpRevision': formRevision(+b.dataset.id, +b.dataset.k); break;
      case 'tpEstado': { const g = b.closest('.choice'); const ya = b.getAttribute('aria-pressed') === 'true'; g.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', !ya && x === b)); break; }
      case 'tpEtiqueta': formEtiqueta(+b.dataset.id); break;
      case 'tpQuitarEtiqueta': { const t = (S.c.temperamentos || []).find(x => x.id === +b.dataset.id); if (!t) break; const sgN = { ...(t.seguimiento || {}) }; delete sgN.decision; if (await guardarSeguimiento(t, sgN)) { cerrarSheet(); toast('Vuelve al perfil del cuestionario'); render(); } break; }
      case 'tpBorrar': abrirSheet(`<div class="stack"><h2>¿Borrar este cuestionario?</h2><p class="small">Se borran sus respuestas y el seguimiento de las 8 semanas. No se puede deshacer.</p><button class="btn full" style="background:var(--bad)" data-act="tpBorrarSi" data-id="${b.dataset.id}">Sí, borrar</button><button class="btn ghost full" data-act="cerrarSheet">Cancelar</button></div>`); break;
      case 'tpBorrarSi': cerrarSheet(); await borrar(+b.dataset.id); break;
      case 'tpFicha': { const id = b.dataset.id; S.tVer = null; S.tSel = null; await abrirFicha(id); await abrirSub('temperamento'); break; }
    }
  });

  /* Si algo falla al pintar el perfil, se ve un aviso en su sitio y el resto de la pantalla sigue funcionando */
  const aislar = fn => (...args) => { try { return fn(...args); } catch (err) { console.error(err); return `<section class="section"><div class="card small muted">No se ha podido mostrar el perfil de temperamento. Mándale a Jesús este mensaje: ${esc(String(err && err.message || err).slice(0, 160))}</div></section>`; } };
  return { tarjetaHoy: aislar(tarjetaHoy), seccionTests: aislar(seccionTests), vista: aislar(vista), activo: () => !!(S.tq || S.tinf), bloqueFicha: aislar(bloqueFicha), vSub: aislar(vSub), cargarSub, resumenCoach: aislar(resumenCoach), puntuar, puntosRmeq, CRONO, sueno, PREG, RMEQ, perfilDe, mezcla };
})();
