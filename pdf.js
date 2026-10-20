/* PDF: genera archivos PDF reales (también en iPhone/iPad con la app instalada, donde imprimir no funciona).
   Lo usan las facturas, el informe de valoración inicial y el perfil de temperamento. */
const PDF = (() => {
  let carga = null;
  /* html2canvas (cada bloque a imagen) + jsPDF (páginas). Se cargan solo al pedir un PDF; si un CDN falla, se prueba el otro */
  const LIBS = [
    ['html2canvas', () => window.html2canvas, ['https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js']],
    ['jspdf', () => window.jspdf?.jsPDF, ['https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js']]
  ];
  const script = src => new Promise((ok, ko) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => { s.remove(); ko(); }; document.head.appendChild(s); });
  const cargar = () => carga ||= (async () => {
    for (const [, hay, fuentes] of LIBS) {
      if (hay()) continue;
      for (const src of fuentes) { try { await script(src); if (hay()) break; } catch (e) { /* prueba la siguiente */ } }
      if (!hay()) { carga = null; throw new Error('No se ha podido cargar el generador de PDF. Revisa la conexión.'); }
    }
  })();
  const tactil = () => /iP(hone|ad|od)|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform || ''));
  const limpio = t => String(t || 'documento').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') + '.pdf';

  /* Entrega el archivo: en el móvil, hoja con "Compartir o guardar" y "Abrir"; en el ordenador, descarga directa */
  function entregar(blob, nombre) {
    const url = URL.createObjectURL(blob), file = new File([blob], nombre, { type: 'application/pdf' });
    if (!tactil()) { const a = document.createElement('a'); a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); toast('PDF descargado'); return; }
    const compartir = navigator.canShare && navigator.canShare({ files: [file] });
    abrirSheet(`<div class="stack"><h2>Tu PDF está listo</h2><p class="small muted" style="word-break:break-all">${esc(nombre)}</p><p class="small">Guárdalo en Archivos o envíalo por WhatsApp o email.</p>
      ${compartir ? '<button class="btn full" id="pdf-sh">Compartir o guardar</button>' : ''}<a class="btn ${compartir ? 'ghost ' : ''}full" href="${url}" target="_blank" rel="noopener" download="${esc(nombre)}">Abrir el PDF</a>
      <button class="btn ghost full" data-act="cerrarSheet">Cerrar</button></div>`);
    $('#pdf-sh')?.addEventListener('click', async () => { try { await navigator.share({ files: [file], title: nombre }); } catch (e) { if (e?.name !== 'AbortError') toast('No se ha podido compartir. Usa "Abrir el PDF".'); } });
  }

  /* Bloques que se pintan por separado (así ninguna imagen es gigante: en iPhone/iPad el navegador no admite lienzos enormes) */
  function bloquesDe(root) {
    const out = [];
    [...root.children].forEach(el => { if (el.classList.contains('pd-cuerpo')) [...el.children].forEach(x => out.push(x)); else out.push(el); });
    return out.filter(el => el.getBoundingClientRect().height > 0);
  }
  const respira = () => new Promise(r => setTimeout(r, 0));
  /* Los SVG de la app (mapa de temperamento, iconos) toman colores de la hoja de estilos; html2canvas los pierde.
     Se convierten en imágenes autónomas con los estilos ya resueltos y su tamaño real */
  const PROPS = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linejoin', 'stroke-linecap', 'opacity', 'fill-opacity', 'font-family', 'font-size', 'font-weight', 'letter-spacing', 'paint-order'];
  async function svgAImagen(root) {
    const svgs = [...root.querySelectorAll('svg')].filter(v => v.getBoundingClientRect().width > 0);
    await Promise.all(svgs.map(v => new Promise(ok => {
      const r = v.getBoundingClientRect(), cl = v.cloneNode(true), orig = [v, ...v.querySelectorAll('*')], cop = [cl, ...cl.querySelectorAll('*')];
      orig.forEach((el, i) => { const cs = getComputedStyle(el), d = cop[i]; PROPS.forEach(p => { const val = cs.getPropertyValue(p); if (val) d.style.setProperty(p, val); });
        if (el.tagName.toLowerCase() === 'text' && cs.textTransform === 'uppercase') d.textContent = el.textContent.toUpperCase(); });
      cl.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); cl.setAttribute('width', r.width); cl.setAttribute('height', r.height); cl.removeAttribute('class');
      const img = new Image(); img.width = r.width; img.height = r.height; img.style.cssText = `display:block;width:${r.width}px;height:${r.height}px;margin:${getComputedStyle(v).margin}`;
      img.onload = img.onerror = ok; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(cl));
      v.replaceWith(img);
    })));
  }

  /* Convierte un elemento (o HTML) en PDF A4. pie: "LOF · Construyendo tu prime" y "Página X de N" */
  async function generar(contenido, nombre, { pie = true, btn } = {}) {
    const txt = btn?.textContent; if (btn) { btn.disabled = true; btn.textContent = 'Generando PDF…'; }
    let capa = null, cancelado = false;
    try {
      await cargar();
      let root = contenido, doc = false;
      if (typeof contenido === 'string') {   // documento de la app: se monta en una capa temporal a 794 px (A4)
        capa = document.createElement('div');
        capa.style.cssText = 'position:fixed;inset:0;z-index:9999;overflow:hidden;background:rgba(6,36,65,.92)';
        capa.innerHTML = `<div style="position:absolute;left:0;top:0;width:794px">${contenido}</div><div style="position:absolute;left:0;right:0;bottom:40%;text-align:center;color:#fff;font:600 16px system-ui">Generando PDF…<br><small id="pdf-prog" style="font-weight:400;opacity:.8"></small></div><button id="pdf-x" style="position:absolute;left:50%;bottom:30%;transform:translateX(-50%);padding:12px 26px;border-radius:12px;border:0;font:600 15px system-ui;background:#fff;color:#0B0B0C">Cancelar</button>`;
        capa.querySelector('#pdf-x').onclick = () => { cancelado = true; capa?.remove(); capa = null; };
        document.body.appendChild(capa); root = capa.firstElementChild.firstElementChild; doc = true;
        const espera = ms => new Promise(r => setTimeout(r, ms));   // nunca esperar para siempre a una imagen o una fuente
        capa.querySelectorAll('img').forEach(i => { i.loading = 'eager'; });
        await Promise.race([Promise.all([...capa.querySelectorAll('img')].map(i => i.complete ? null : new Promise(r => { i.onload = i.onerror = r; }))), espera(3000)]);
        if (document.fonts?.ready) await Promise.race([document.fonts.ready, espera(2000)]);
        await Promise.race([svgAImagen(root), espera(3000)]);
      }
      const { jsPDF } = window.jspdf, pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
      const W = 210, H = 297, fondo = doc ? '#EEF2F7' : '#FFFFFF', rr = root.getBoundingClientRect();
      const mx = doc ? 0 : 8, k = (W - 2 * mx) / rr.width, abajo = H - (pie ? 14 : 8), arribaSig = doc ? 8 : 10;
      const pintaFondo = () => { if (doc) { pdf.setFillColor(238, 242, 247); pdf.rect(0, 0, W, H, 'F'); } };
      pintaFondo();
      const bloques = bloquesDe(root);
      let y = doc && bloques[0]?.classList.contains('pd-head') ? 0 : 8, prevBottom = null, pag = 1;
      for (const [i, el] of bloques.entries()) {
        const r = el.getBoundingClientRect(), x = mx + (r.left - rr.left) * k, w = r.width * k, h = r.height * k;
        let gap = prevBottom == null ? 0 : Math.max(0, r.top - prevBottom) * k;
        // Un título de sección nunca se queda solo al final de la página: va con lo que le sigue
        const sig = el.classList.contains('pd-sec') && bloques[i + 1], sr = sig && sig.getBoundingClientRect(), extra = sig ? Math.min((sr.bottom - r.bottom) * k, 60) : 0;
        if (y + gap + h + extra > abajo && y > arribaSig + 1 && h + extra <= abajo - arribaSig) { pdf.addPage(); pag++; pintaFondo(); y = arribaSig; gap = 0; }
        y += gap;
        if (cancelado) return;
        const pg = capa?.querySelector('#pdf-prog'); if (pg) pg.textContent = `${i + 1} / ${bloques.length}`;
        const esc2 = Math.min(tactil() ? 1.5 : 2, Math.sqrt((tactil() ? 3e6 : 6e6) / Math.max(1, r.width * r.height)));   // lienzo acotado (iPad/iPhone tienen poca memoria)
        const pinta = sc => Promise.race([window.html2canvas(el, { scale: sc, backgroundColor: fondo, useCORS: true, logging: false, windowWidth: doc ? 794 : undefined }), new Promise((_, ko) => setTimeout(() => ko(new Error('tiempo')), 20000))]);
        let cv; try { cv = await pinta(esc2); } catch (e1) { if (cancelado) return; console.warn('Reintento a menor resolución', e1); cv = await pinta(1); }
        // Si el bloque no cabe en una página, se corta en trozos de página
        let hecho = 0; const pxPorMm = cv.height / h;
        while (hecho < h - 0.01) {
          const cabe = Math.min(h - hecho, abajo - y);
          if (cabe < 5 && hecho < h) { pdf.addPage(); pag++; pintaFondo(); y = arribaSig; continue; }
          const t = document.createElement('canvas'); t.width = cv.width; t.height = Math.max(1, Math.round(cabe * pxPorMm));
          t.getContext('2d').drawImage(cv, 0, Math.round(hecho * pxPorMm), cv.width, t.height, 0, 0, cv.width, t.height);
          pdf.addImage(t.toDataURL('image/jpeg', 0.92), 'JPEG', x, y, w, cabe); t.width = t.height = 0;   // libera memoria (Safari)
          hecho += cabe; y += cabe;
          if (hecho < h - 0.01) { pdf.addPage(); pag++; pintaFondo(); y = arribaSig; }
        }
        prevBottom = r.bottom; cv.width = cv.height = 0;
        await respira();   // deja respirar a la pantalla entre bloques (no se bloquea)
      }
      if (pie) {
        const n = pdf.internal.getNumberOfPages();
        for (let i = 1; i <= n; i++) { pdf.setPage(i); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.setTextColor(11, 32, 64); pdf.text('LOF · Construyendo tu prime', 10, 291); pdf.text(`PÁGINA ${i} DE ${n}`, 200, 291, { align: 'right' }); }
      }
      const blob = pdf.output('blob');
      capa?.remove(); capa = null;
      entregar(blob, nombre);
    } catch (err) { console.error(err); fallo(err, err?.message?.startsWith('No se ha podido') ? err.message : 'No se ha podido generar el PDF.'); }
    finally { capa?.remove(); if (btn) { btn.disabled = false; btn.textContent = txt; } }
  }

  /* Cabecera con la marca (como el informe de Jorge López) */
  const cabecera = (titulo, nombre, sub) => `<header class="pd-head"><img src="icons/logo-96.jpg" alt=""><div><div class="pd-t">${esc(titulo)}</div><div class="pd-n">${esc(nombre)}</div>${sub ? `<div class="pd-s">${esc(sub)}</div>` : ''}</div></header>`;
  const seccion = (n, t) => `<div class="pd-sec pd-keep"><b>${String(n).padStart(2, '0')}</b> ${esc(t)}</div>`;
  const textoCoach = p => `${p?.valoracion ? `<div class="pd-keep pd-val"><h4>Valoración del coach</h4><p>${esc(p.valoracion)}</p></div>` : ''}${p?.foco ? `<div class="pd-keep pd-foco"><h4>Foco de trabajo</h4><p>${esc(p.foco)}</p></div>` : ''}`;
  const n1 = (v, u = '') => v == null || v === '' ? '—' : (typeof v === 'number' ? fmtNum(v) : esc(String(v))) + u;

  /* ---------- Informe de valoración inicial ---------- */
  function ctxValoracion() {
    if (S.modo === 'coach' && S.ficha) { const f = S.ficha; return { vals: f.val || [], med: f.med || [], obj: f.medObj, perfil: S.c.perfiles.find(p => p.id === f.id) || {}, srv: f.srv }; }
    return { vals: S.d?.valoraciones || [], med: S.d?.mediciones || [], obj: S.d?.medObj, perfil: S.perfil || {}, srv: S.d?.servicio };
  }
  function htmlValoracion(val, c) {
    const med = conKgGrasa((c.med || []).slice().sort((a, b) => a.fecha.localeCompare(b.fecha)));
    const m = med.filter(x => x.fecha <= val.fecha).pop() || med[0] || null, o = c.obj, perfil = c.perfil || {};
    const sub = ['Control y evolución', c.srv?.producto, `${fLarga(val.fecha)} ${fecha(val.fecha).getFullYear()}`].filter(Boolean).join('  |  ');
    let n = 0, h = cabecera(val.nombre || 'Informe de valoración inicial', perfil.nombre || '', sub);
    if (val.resumen) h += `<div class="pd-keep pd-val pd-res"><h4>Informe · valoración de todo el contexto</h4><p>${esc(val.resumen)}</p></div>`;
    /* 01 Composición corporal */
    if (m) {
      const kpi = (l, v, u) => `<div class="pd-card pd-kpi"><span>${l}</span><b>${n1(v, u)}</b></div>`;
      const filas = [['Cuello', 'cuello'], ['Pectoral', 'pectoral'], ['Hombros', 'hombros'], ['Cintura', 'cintura'], ['Cadera', 'cadera'], ['Abdomen bajo', 'abd_bajo'], ['Brazo · derecho / izquierdo', 'brazo_d', 'brazo_i'], ['Muslo · derecho / izquierdo', 'muslo_d', 'muslo_i'], ['Gemelo · derecho / izquierdo', 'gemelo_d', 'gemelo_i']]
        .filter(([, a, b]) => m[a] != null || (b && m[b] != null)).map(([l, a, b]) => `<tr><td>${l}</td><td>${b ? `${n1(m[a])} / ${n1(m[b])}` : n1(m[a])}</td></tr>`).join('');
      const objF = o ? [['Peso', 'peso', ' kg'], ['% grasa', 'grasa_pct', ' %'], ['Kilos de grasa', 'grasa_kg', ' kg'], ['Cintura', 'cintura', ' cm'], ['Cadera', 'cadera', ' cm'], ['Abdomen bajo', 'abd_bajo', ' cm']]
        .filter(([, k]) => o[k] != null).map(([l, k, u]) => { const d = m[k] != null ? Math.abs(Number(m[k]) - Number(o[k])) : null; return `<div class="pd-obj"><span>${l}</span><b>${n1(Number(o[k]), u)}</b>${d != null ? `<small>${d < 0.05 ? 'mantener' : `a ${fmtNum(d)}${u} del objetivo`}</small>` : ''}</div>`; }).join('') : '';
      const cl = clasifGrasa(m.grasa_pct, perfil.sexo, edadDe(perfil.fecha_nacimiento, m.fecha));
      h += seccion(++n, 'Composición corporal y perímetros')
        + `<div class="pd-grid3">${kpi('Peso', m.peso, ' kg')}${kpi('Grasa', m.grasa_pct, ' %')}${kpi('Kilos de grasa', m.grasa_kg, ' kg')}</div>`
        + `<div class="pd-grid2">${filas ? `<div class="pd-card"><h4>Medidas actuales · cm</h4><table class="pd-tab">${filas}</table></div>` : ''}${objF ? `<div class="pd-card"><h4>Objetivo de composición</h4>${objF}</div>` : ''}</div>`
        + (o?.nota || cl ? `<div class="pd-keep pd-foco">${o?.nota ? `<h4>Objetivo de composición corporal</h4><p>${esc(o.nota)}</p>` : ''}${cl ? `<p class="pd-mini">${cl.l} · Rango saludable para ${perfil.sexo === 'mujer' ? 'mujeres' : 'hombres'} de ${cl.tramo.replace('-', '–')} años: ${esc(RANGOS_GRASA[perfil.sexo].find(r => (edadDe(perfil.fecha_nacimiento, m.fecha) ?? 30) <= r[0]).slice(1, 3).join('–'))} %</p>` : ''}</div>` : '');
    }
    /* 02 Zonas de frecuencia cardiaca */
    const fut = !!c.srv?.modulo_futbol, mx = fcMaxDe(c.vals, perfil), Z = zonasDe(fut), pfc = (val.pruebas || []).find(p => p.tipo === 'fc');
    if (mx) {
      h += seccion(++n, 'Zonas de frecuencia cardíaca') + `<p class="pd-fc">FC máxima: ${mx} ppm${fut ? ' · 5 zonas para futbolista' : ''}</p>`
        + `<div class="pd-zonas" style="grid-template-columns:repeat(${Z.length},1fr)">${Z.map(z => `<div class="pd-card pd-zona"><span style="color:${z.col === '#BFD4EA' ? '#3D6FA8' : z.col}">Zona ${z.n}</span><b>${Math.round(mx * z.desde)}–${Math.round(mx * z.hasta)} ppm</b><small>${esc(z.corto)} · ${Math.round(z.desde * 100)}–${Math.round(z.hasta * 100)} %</small></div>`).join('')}</div>`
        + textoCoach(pfc);
    }
    /* Resto de pruebas */
    (val.pruebas || []).filter(p => p.tipo !== 'fc').forEach(p => {
      const ds = (p.datos || []).filter(x => x.nombre && (x.valor || x.d || x.i));
      const im = c.imgs?.[p.imagen_url];
      if (!ds.length && !p.valoracion && !p.foco && !im) return;
      let cuerpo = '';
      if (p.tipo === 'descompensacion' && ds.length) {
        const pcs = ds.map(x => difPct(x.d, x.i)), mxp = Math.max(-1, ...pcs.map(v => v ?? -1));
        cuerpo = `<div class="pd-card"><table class="pd-tab pd-di"><tr><th>Prueba</th><th>Dcha.</th><th>Izda.</th><th>Diferencia / lado más débil</th></tr>${ds.map((x, k) => { const pc = pcs[k], a = numDe(x.d), b = numDe(x.i); return `<tr><td>${esc(x.nombre)}</td><td class="pd-d">${n1(x.d)}</td><td class="pd-i">${n1(x.i)}</td><td><b>${pc != null ? pc + ' %' : '—'}</b> ${pc ? (a < b ? 'Derecho' : 'Izquierdo') : ''}</td></tr>`; }).join('')}</table></div>`
          + `<p class="pd-mini">${mxp >= 0 ? `<b>Mayor diferencia: ${mxp} %</b><br>` : ''}Diferencia por encima del 15 %: desequilibrio a trabajar. Entre 8 y 15 %: a vigilar.</p>`;
      } else if (ds.length) {
        const nums = ds.map(x => numDe(x.valor)), top = Math.max(1, ...nums.filter(v => v != null)), barras = p.tipo === '1rm';
        cuerpo = `<div class="pd-card">${ds.map((x, k) => `<div class="pd-fila"><span>${esc(x.nombre)}</span>${barras && nums[k] != null ? `<i><u style="width:${nums[k] / top * 100}%"></u></i>` : '<em></em>'}<b>${n1(x.valor)}</b></div>`).join('')}</div>`;
      }
      h += seccion(++n, p.tipo === 'descompensacion' ? 'Test de lateralidad (descompensaciones)' : p.titulo) + (im ? `<div class="pd-card pd-keep" style="padding:8px;text-align:center"><img src="${im}" alt="" style="display:block;max-width:100%;max-height:430px;margin:0 auto;object-fit:contain;border-radius:8px"></div>` : '') + cuerpo + textoCoach(p);
    });
    return `<div class="pd-doc">${h}</div>`;
  }
  /* Imágenes resumen de las pruebas: se firman, se descargan y se incrustan para que el PDF no dependa de la red */
  async function imagenesPruebas(val) {
    const out = {}, rutas = [...new Set((val.pruebas || []).map(p => p.imagen_url).filter(Boolean))];
    await Promise.all(rutas.map(async r => {
      try {
        const f = await sb.storage.from('planificacion').createSignedUrls([r], 600), u = f.data?.[0]?.signedUrl; if (!u) return;
        const b = await (await fetch(u)).blob();
        out[r] = await new Promise((ok, ko) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = ko; fr.readAsDataURL(b); });
      } catch (err) { console.warn('Imagen de prueba no incluida', err); }
    }));
    return out;
  }
  async function valoracion(id, btn) {
    const c = ctxValoracion(), val = c.vals.find(v => v.id === id); if (!val) return toast('No se encuentra el informe');
    c.imgs = await imagenesPruebas(val);
    return generar(htmlValoracion(val, c), limpio(`${c.perfil.nombre || 'Alumno'} - informe ${val.nombre || 'valoracion'}`), { btn });
  }

  /* ---------- Perfil de temperamento: se exporta el informe que está en pantalla ---------- */
  function temperamento(nombre, btn) {
    const src = document.getElementById('tp-informe'); if (!src) return toast('Abre el informe para descargarlo');
    const cl = src.cloneNode(true);
    cl.querySelectorAll('button, .btn, details > summary .mas').forEach(x => x.remove());
    cl.querySelectorAll('details').forEach(d => d.setAttribute('open', ''));
    const html = `<div class="pd-doc pd-app">${cabecera('Perfil de temperamento', nombre || '', 'Hábitos y entrenamiento a tu medida')}<div class="pd-cuerpo">${cl.innerHTML}</div></div>`;
    return generar(html, limpio(`${nombre || 'Alumno'} - perfil de temperamento`), { btn });
  }

  /* ---------- Tabla de contextos de alimentación (para imprimir) ---------- */
  function contextos(nombre, l, ing, btn) {
    const g = v => v != null && v !== '' ? fmtNum(+v, 0) + ' g' : '—', pc = v => ing > 1 && v ? `<br><span style="color:#5D6574;font-size:11px">≈ ${fmtNum(v / ing, 0)} g por comida</span>` : '';
    const filas = l.map(c => `<tr><td><b>${esc(c.n)}</b>${c.d ? `<br><span style="color:#5D6574">${esc(c.d)}</span>` : ''}</td><td><b style="font-size:15px">${c.kcal ? fmtNum(+c.kcal, 0) : '—'}</b></td><td>${g(c.p)}${pc(+c.p)}</td><td>${g(c.c)}${pc(+c.c)}</td><td>${g(c.g)}${pc(+c.g)}</td></tr>`).join('');
    const html = `<div class="pd-doc">${cabecera('Tus contextos', nombre || '', 'Cuánto comer según el tipo de día')}${seccion(1, 'Tu tabla de contextos')}<div class="pd-card"><table class="pd-tab"><tr><th>Tipo de día</th><th>kcal</th><th>Proteína</th><th>Hidratos</th><th>Grasas</th></tr>${filas}</table></div>`
      + `<div class="pd-card"><p style="margin:0">${ing > 1 ? `Reparte cada cantidad entre tus ${ing} comidas del día. ` : ''}Mismos alimentos, cantidades distintas: elige cada mañana tu tipo de día y usa tus equivalencias visuales para servir sin báscula.</p></div></div>`;
    return generar(html, limpio(`${nombre || 'Alumno'} - contextos`), { btn });
  }

  /* ---------- Factura: se exporta el documento tal cual se ve ---------- */
  function factura(f, btn) {
    const el = document.querySelector('.factura-doc'); if (!el) return toast('Abre la factura para descargarla');
    return generar(el, limpio(`Factura ${f?.numero || ''} ${f?.cliente_nombre || ''}`), { pie: false, btn });
  }

  return { generar, valoracion, temperamento, factura, contextos, htmlValoracion, ctxValoracion };
})();
