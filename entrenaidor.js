/* EntenIAdor: asistente de IA con los conocimientos de Jesús (chat del alumno + panel del coach) */
const IA = (() => {
  const NOMBRE = 'EntenIAdor';
  const st = { msgs: null, enviando: false, error: '' };
  const activo = () => !!S.perfil?.ia_activa && !S.prueba;
  const html = t => esc(t || '').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
  const waCon = q => waJesus(`Hola Jesús, le he preguntado al ${NOMBRE} y prefiero comentarlo contigo:${q ? '\n«' + q.slice(0, 300) + '»' : ''}`);
  const preguntaDe = (l, i) => { for (let k = i - 1; k >= 0; k--) if (l[k].rol === 'alumno') return l[k].texto; return ''; };

  /* ---------- Alumno ---------- */
  function vEntrada() {
    if (!activo()) return '';
    return `<section class="section"><button class="card row ia-entrada" data-act="ia" data-op="abrir" style="gap:12px;align-items:center;width:100%;text-align:left;cursor:pointer;border:1px solid var(--gold,#c9a227)">
      <span style="font-size:28px">🤖</span><div class="grow"><b>${NOMBRE}</b><div class="small muted">Dudas pequeñas del día a día, al momento. Es una IA con los conocimientos de Jesús.</div></div><span class="pill gold">Preguntar</span></button></section>`;
  }
  async function cargar() {
    const { data, error } = await sb.from('ia_mensajes').select('id,rol,texto,derivar,valoracion,creado_at').eq('alumno_id', S.user.id).order('id', { ascending: false }).limit(60);
    st.msgs = (data || []).reverse(); st.error = error ? 'Falta ejecutar el Bloque 72 en Supabase.' : '';
  }
  function vChat() {
    const wa = S.whatsapp ? waCon('') : null;
    const cab = `<section class="stack"><button class="btn sm ghost" data-act="ia" data-op="cerrar" style="align-self:flex-start">← Volver</button>
      <div class="row" style="gap:10px;align-items:center"><span style="font-size:34px">🤖</span><div class="grow"><span class="eyebrow">Asistente de IA de Jesús</span><h1 style="margin:0">${NOMBRE}</h1></div></div></section>`;
    if (!S.perfil.ia_acepta_at) return cab + `<section class="section"><div class="card stack">
      <p>Hola, soy el <b>${NOMBRE}</b>: una <b>inteligencia artificial</b> entrenada con los conocimientos, la metodología y la forma de trabajar de Jesús. <b>No soy Jesús.</b></p>
      <p class="small">Estoy para las dudas pequeñas del día a día (entreno, alimentación, hábitos, uso de la app) y te respondo al momento. Para leer tu programa y tus registros y darte respuestas a tu medida, uso tus datos de la app y los envío a un servicio de IA externo (Anthropic) solo para generar la respuesta. Jesús puede leer las conversaciones para mejorar el asistente.</p>
      <p class="small">No sustituyo a Jesús: en temas de salud, dolor o cambios de plan te mandaré con él, y siempre puedes escribirle por WhatsApp. Usarme es voluntario.</p>
      <button class="btn full" data-act="ia" data-op="aceptar">Entendido, quiero usarlo</button><button class="btn ghost full" data-act="ia" data-op="cerrar">Ahora no</button></div></section>`;
    if (!st.msgs) { cargar().then(() => { render(); bajar(); }); return cab + '<div class="empty">Cargando…</div>'; }
    const l = st.msgs;
    const burbuja = (m, i) => m.rol === 'alumno'
      ? `<div class="ia-msg yo">${html(m.texto)}</div>`
      : `<div class="ia-msg ia">${html(m.texto)}
          <div class="row ia-pie" style="gap:6px;flex-wrap:wrap;margin-top:8px">${m.id ? `<button class="pill ${m.valoracion === 1 ? 'gold' : ''}" data-act="ia" data-op="valorar" data-id="${m.id}" data-v="1" aria-label="Me ha servido">👍</button><button class="pill ${m.valoracion === -1 ? 'gold' : ''}" data-act="ia" data-op="valorar" data-id="${m.id}" data-v="-1" aria-label="No me ha servido">👎</button>` : ''}
          ${(m.derivar || m.valoracion === -1) && wa ? `<a class="pill gold" href="${esc(waCon(preguntaDe(l, i)))}" target="_blank" rel="noopener">💬 Hablar con Jesús</a>` : ''}</div></div>`;
    return cab + `<section class="section"><div class="ia-chat" id="ia-chat">
        ${!l.length ? `<div class="ia-msg ia">¡Hola${S.perfil.nombre ? ' ' + esc(S.perfil.nombre.split(' ')[0]) : ''}! Soy el ${NOMBRE}, la IA de Jesús. Pregúntame lo que quieras del día a día: un ejercicio, cómo cuadrar una comida, qué hacer si hoy no puedes entrenar…</div>` : ''}
        ${l.map(burbuja).join('')}
        ${st.enviando ? '<div class="ia-msg ia muted">Pensando…</div>' : ''}
      </div>${st.error ? `<p class="err">${esc(st.error)}</p>` : ''}
      <form id="ia-form" class="row ia-form" style="gap:8px;margin-top:10px"><textarea id="ia-txt" rows="2" class="grow" placeholder="Escribe tu duda…" maxlength="2000" ${st.enviando ? 'disabled' : ''}></textarea><button class="btn" type="submit" ${st.enviando ? 'disabled' : ''}>Enviar</button></form>
      ${wa ? `<a class="btn ghost full" style="margin-top:10px" href="${esc(wa)}" target="_blank" rel="noopener">💬 Prefiero hablar con Jesús por WhatsApp</a>` : ''}
      <p class="note">Respuestas generadas por IA con los criterios de Jesús. Pueden equivocarse: ante cualquier duda de salud, habla con él.</p></section>`;
  }
  const bajar = () => { const c = $('#ia-chat'); if (c) c.lastElementChild?.scrollIntoView({ block: 'end' }); };
  async function enviar(texto) {
    texto = texto.trim(); if (!texto || st.enviando) return;
    st.msgs.push({ rol: 'alumno', texto }); st.enviando = true; st.error = ''; render(); bajar();
    try {
      const { data, error } = await sb.functions.invoke('asistente', { body: { mensaje: texto } });
      let msg = data?.error;
      if (error) { try { msg = (await error.context?.json())?.error; } catch (_) {} msg = msg || 'No he podido responder ahora. Inténtalo en un momento.'; }
      if (msg) { st.msgs.pop(); st.error = msg; }
      else { st.msgs.pop(); st.msgs.push(...(data.mensajes || [])); }
    } catch (err) { st.msgs.pop(); st.error = 'Sin conexión. Inténtalo de nuevo.'; }
    st.enviando = false; render(); bajar();
    if (st.error && $('#ia-txt')) $('#ia-txt').value = texto;
  }
  document.addEventListener('submit', e => { if (e.target.id === 'ia-form') { e.preventDefault(); enviar($('#ia-txt').value); } });
  document.addEventListener('keydown', e => { if (e.target.id === 'ia-txt' && e.key === 'Enter' && !e.shiftKey && matchMedia('(pointer:fine)').matches) { e.preventDefault(); enviar(e.target.value); } });

  /* ---------- Coach ---------- */
  function vFicha(f, a) {
    const n = f.ia;   // { total, sinVer, derivadas, malas }
    return `<section class="section"><div class="section-head"><h2>🤖 ${NOMBRE}</h2><label class="row small" style="gap:8px"><input type="checkbox" data-act="ia" data-op="activar" data-id="${a.id}" ${a.ia_activa ? 'checked' : ''} style="width:20px;height:20px"> Activado</label></div>
      <div class="card stack">${a.ia_activa ? `<div class="small muted">${a.ia_acepta_at ? 'Ha aceptado usarlo' : 'Aún no lo ha abierto ni aceptado'}${n ? ` · ${n.total} mensajes${n.derivadas ? ` · <b style="color:var(--warn)">${n.derivadas} derivadas a ti</b>` : ''}${n.malas ? ` · <b style="color:var(--bad)">${n.malas} 👎</b>` : ''}` : ''}</div>` : '<div class="small muted">Desactivado: el alumno no ve el asistente.</div>'}
        <div class="row" style="gap:8px;flex-wrap:wrap">${n?.total ? `<button class="btn sm" data-act="ia" data-op="verChat" data-id="${a.id}">Ver conversación${n.sinVer ? ` (${n.sinVer} nuevas)` : ''}</button>` : ''}<button class="btn sm ghost" data-act="ia" data-op="criterios">✎ Tus criterios y tono</button></div>
        <p class="note">En la conversación puedes escribir «cómo lo habría dicho yo» en cualquier respuesta: el ${NOMBRE} lo usa como ejemplo para parecerse cada vez más a ti.</p></div></section>`;
  }
  async function cargarFicha(f) {
    const { data, error } = await sb.from('ia_mensajes').select('id,rol,derivar,valoracion,visto').eq('alumno_id', f.id);
    if (error) { f.ia = null; return; }
    const l = data || [];
    f.ia = { total: l.length, sinVer: l.filter(m => m.rol === 'ia' && !m.visto).length, derivadas: l.filter(m => m.derivar && !m.visto).length, malas: l.filter(m => m.valoracion === -1 && !m.visto).length };
  }
  async function verChat(aid) {
    const { data, error } = await sb.from('ia_mensajes').select('*').eq('alumno_id', aid).order('id', { ascending: false }).limit(120);
    if (error) return fallo(error, 'Falta ejecutar el Bloque 72 en Supabase.');
    const l = (data || []).reverse();
    abrirSheet(`<div class="stack"><h2>🤖 Conversación con el ${NOMBRE}</h2><div class="ia-chat">${l.map(m => m.rol === 'alumno' ? `<div class="ia-msg yo">${html(m.texto)}<div class="small muted">${esc(new Date(m.creado_at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }))}</div></div>`
      : `<div class="ia-msg ia ${!m.visto ? 'nuevo' : ''}">${html(m.texto)}
          <div class="row small" style="gap:6px;flex-wrap:wrap;margin-top:6px">${m.derivar ? '<span class="pill" style="color:var(--warn)">Derivada a ti</span>' : ''}${m.valoracion === 1 ? '<span class="pill">👍</span>' : m.valoracion === -1 ? '<span class="pill" style="color:var(--bad)">👎</span>' : ''}</div>
          ${m.correccion ? `<div class="aprox small" style="margin-top:6px"><b>Cómo lo dirías tú:</b> ${html(m.correccion)}</div>` : ''}
          <button class="btn sm ghost" data-act="ia" data-op="corregir" data-id="${m.id}" data-al="${aid}" style="margin-top:6px">✎ ${m.correccion ? 'Cambiar' : 'Cómo lo habría dicho yo'}</button></div>`).join('') || '<div class="empty">Sin mensajes.</div>'}</div>
      <button class="btn ghost full" data-act="cerrarSheet">Cerrar</button></div>`);
    const ids = l.filter(m => !m.visto).map(m => m.id);
    if (ids.length) { await sb.from('ia_mensajes').update({ visto: true }).in('id', ids); if (S.ficha?.id === aid) { await cargarFicha(S.ficha); } }
  }
  async function corregir(id, aid) {
    const { data } = await sb.from('ia_mensajes').select('texto,correccion').eq('id', id).single();
    abrirSheet(`<form class="stack" id="f-iac"><h2>Cómo lo habría dicho yo</h2><div class="ia-msg ia small">${html(data?.texto)}</div>
      <label class="f">Tu respuesta (el ${NOMBRE} aprenderá tu criterio y tu tono)<textarea id="iac-t" rows="6">${esc(data?.correccion || '')}</textarea></label>
      <button class="btn full">Guardar</button><button type="button" class="btn ghost full" data-act="ia" data-op="verChat" data-id="${aid}">Volver a la conversación</button></form>`);
    $('#f-iac').addEventListener('submit', async e => {
      e.preventDefault();
      const { error } = await sb.from('ia_mensajes').update({ correccion: $('#iac-t').value.trim() || null, visto: true }).eq('id', id);
      if (error) return fallo(error); toast('Guardado: lo usará como ejemplo'); verChat(aid);
    });
  }
  async function criterios() {
    const { data } = await sb.from('ajustes_privados').select('valor').eq('clave', 'ia_instrucciones').maybeSingle();
    abrirSheet(`<form class="stack" id="f-iai"><h2>Criterios y tono del ${NOMBRE}</h2>
      <p class="small muted">Escribe como se lo explicarías a un entrenador nuevo de tu equipo: tu metodología, cómo respondes, expresiones tuyas, qué recomiendas siempre y qué nunca. Sirve para todos los alumnos.</p>
      <textarea id="iai-t" rows="18" style="font-size:14px">${esc(data?.valor || '')}</textarea>
      <label class="row small" style="gap:8px"><input type="checkbox" id="iai-yo" ${S.perfil.ia_activa ? 'checked' : ''} style="width:20px;height:20px"> Activarlo también para mí (vista «Yo»), para probarlo</label>
      <button class="btn full">Guardar</button><button type="button" class="btn ghost full" data-act="cerrarSheet">Cancelar</button></form>`);
    $('#f-iai').addEventListener('submit', async e => {
      e.preventDefault();
      const { error } = await sb.from('ajustes_privados').upsert({ clave: 'ia_instrucciones', valor: $('#iai-t').value.trim() }, { onConflict: 'clave' });
      if (error) return fallo(error);
      const yo = $('#iai-yo').checked; if (yo !== !!S.perfil.ia_activa) { const r = await sb.from('perfiles').update({ ia_activa: yo }).eq('id', S.user.id); if (r.error) return fallo(r.error, 'Falta ejecutar el Bloque 72 en Supabase.'); S.perfil.ia_activa = yo; }
      cerrarSheet(); toast('Criterios guardados');
    });
  }

  async function accion(b) {
    const op = b.dataset.op;
    if (op === 'abrir') { S.ia = true; st.msgs = null; render(); window.scrollTo(0, 0); }
    else if (op === 'cerrar') { S.ia = false; render(); window.scrollTo(0, 0); }
    else if (op === 'aceptar') { const { error } = await sb.rpc('ia_aceptar'); if (error) return fallo(error, 'Falta ejecutar el Bloque 72 en Supabase.'); S.perfil.ia_acepta_at = new Date().toISOString(); render(); }
    else if (op === 'valorar') {
      const id = +b.dataset.id, m = st.msgs?.find(x => x.id === id), v = +b.dataset.v === m?.valoracion ? null : +b.dataset.v;
      const { error } = await sb.rpc('ia_valorar', { p_id: id, p_v: v }); if (error) return fallo(error);
      if (m) m.valoracion = v; render(); if (v === -1) toast(S.whatsapp ? 'Gracias. Si quieres, háblalo con Jesús con el botón' : 'Gracias, Jesús lo revisará');
    }
    else if (op === 'activar') {
      const a = S.c.perfiles.find(x => x.id === b.dataset.id), on = b.checked;
      const { error } = await sb.from('perfiles').update({ ia_activa: on }).eq('id', b.dataset.id);
      if (error) { b.checked = !on; return fallo(error, 'Falta ejecutar el Bloque 72 en Supabase.'); }
      if (a) a.ia_activa = on; if (b.dataset.id === S.user.id) S.perfil.ia_activa = on;
      toast(on ? `${NOMBRE} activado` : `${NOMBRE} desactivado`); render();
    }
    else if (op === 'verChat') verChat(b.dataset.id);
    else if (op === 'corregir') corregir(+b.dataset.id, b.dataset.al);
    else if (op === 'criterios') criterios();
  }
  return { NOMBRE, activo, vEntrada, vChat, vFicha, cargarFicha, accion };
})();
