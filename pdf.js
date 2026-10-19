/* PDF: genera archivos PDF reales (también en iPhone/iPad con la app instalada, donde imprimir no funciona).
   Lo usan las facturas, el informe de valoración inicial y el perfil de temperamento. */
const PDF = (() => {
  let carga = null;
  const FUENTES = ['https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js', 'https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js'];
  const script = src => new Promise((ok, ko) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => { s.remove(); ko(); }; document.head.appendChild(s); });
  const cargar = () => carga ||= (async () => {
    if (window.html2pdf) return;
    for (const src of FUENTES) { try { await script(src); if (window.html2pdf) return; } catch (e) { /* prueba la siguiente */ } }
    carga = null; throw new Error('No se ha podido cargar el generador de PDF. Revisa la conexión.');
  })();
  const tactil = () => /iP(hone|ad|od)|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform || ''));
  const limpio = t => String(t || 'documento').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') + '.pdf';

  /* Entrega el archivo: en el móvil, hoja con "Compartir o guardar" y "Abrir"; en el ordenador, descarga directa */
  function entregar(blob, nombre) {
    const url = URL.createObjectURL(blob), file = new File([blob], nombre, { type: 'application/pdf' });
    if (!tactil()) { const a = document.createElement('a'); a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); toast('PDF descargado'); return; }
    const compartir = navigator.canShare && navigator.canShare({ files: [file] });
    abrirSheet(`<div class="stack"><span class="eyebrow">PDF listo</span><h2>${esc(nombre)}</h2><p class="small muted">Guárdalo en Archivos o envíalo por WhatsApp o email.</p>
      ${compartir ? '<button class="btn full" id="pdf-sh">Compartir o guardar</button>' : ''}<a class="btn ${compartir ? 'ghost ' : ''}full" href="${url}" target="_blank" rel="noopener" download="${esc(nombre)}">Abrir el PDF</a>
      <button class="btn ghost full" data-act="cerrarSheet">Cerrar</button></div>`);
    $('#pdf-sh')?.addEventListener('click', async () => { try { await navigator.share({ files: [file], title: nombre }); } catch (e) { if (e?.name !== 'AbortError') toast('No se ha podido compartir. Usa "Abrir el PDF".'); } });
  }

  /* Convierte un elemento (o HTML) en PDF A4. pie: añade "LOF · Construyendo tu prime" y "Página X de N" */
  async function generar(contenido, nombre, { pie = true, btn } = {}) {
    const txt = btn?.textContent; if (btn) { btn.disabled = true; btn.textContent = 'Generando PDF…'; }
    let caja = null;
    try {
      await cargar();
      let el = contenido;
      if (typeof contenido === 'string') {
        caja = document.createElement('div'); caja.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;z-index:-1';
        caja.innerHTML = contenido; document.body.appendChild(caja); el = caja.firstElementChild;
        await Promise.all([...caja.querySelectorAll('img')].map(i => i.complete ? null : new Promise(r => { i.onload = i.onerror = r; })));
        if (document.fonts?.ready) await document.fonts.ready;
      }
      const opt = { margin: pie ? [6, 0, 12, 0] : [8, 8, 8, 8], filename: nombre, image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', windowWidth: 794 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'], avoid: ['.pd-keep', '.pd-card', 'tr'] } };
      let w = window.html2pdf().set(opt).from(el).toPdf();
      if (pie) w = w.get('pdf').then(pdf => {
        const n = pdf.internal.getNumberOfPages();
        for (let i = 1; i <= n; i++) { pdf.setPage(i); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.setTextColor(11, 32, 64); pdf.text('LOF · Construyendo tu prime', 10, 291); pdf.text(`PÁGINA ${i} DE ${n}`, 200, 291, { align: 'right' }); }
      });
      const blob = await w.outputPdf('blob');
      entregar(blob, nombre);
    } catch (err) { fallo(err, err?.message?.startsWith('No se ha podido') ? err.message : 'No se ha podido generar el PDF.'); }
    finally { caja?.remove(); if (btn) { btn.disabled = false; btn.textContent = txt; } }
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
      if (!ds.length && !p.valoracion && !p.foco) return;
      let cuerpo = '';
      if (p.tipo === 'descompensacion' && ds.length) {
        const pcs = ds.map(x => difPct(x.d, x.i)), mxp = Math.max(-1, ...pcs.map(v => v ?? -1));
        cuerpo = `<div class="pd-card"><table class="pd-tab pd-di"><tr><th>Prueba</th><th>Dcha.</th><th>Izda.</th><th>Diferencia / lado más débil</th></tr>${ds.map((x, k) => { const pc = pcs[k], a = numDe(x.d), b = numDe(x.i); return `<tr><td>${esc(x.nombre)}</td><td class="pd-d">${n1(x.d)}</td><td class="pd-i">${n1(x.i)}</td><td><b>${pc != null ? pc + ' %' : '—'}</b> ${pc ? (a < b ? 'Derecho' : 'Izquierdo') : ''}</td></tr>`; }).join('')}</table></div>`
          + `<p class="pd-mini">${mxp >= 0 ? `<b>Mayor diferencia: ${mxp} %</b><br>` : ''}Diferencia por encima del 15 %: desequilibrio a trabajar. Entre 8 y 15 %: a vigilar.</p>`;
      } else if (ds.length) {
        const nums = ds.map(x => numDe(x.valor)), top = Math.max(1, ...nums.filter(v => v != null)), barras = p.tipo === '1rm';
        cuerpo = `<div class="pd-card">${ds.map((x, k) => `<div class="pd-fila"><span>${esc(x.nombre)}</span>${barras && nums[k] != null ? `<i><u style="width:${nums[k] / top * 100}%"></u></i>` : '<em></em>'}<b>${n1(x.valor)}</b></div>`).join('')}</div>`;
      }
      h += seccion(++n, p.tipo === 'descompensacion' ? 'Test de lateralidad (descompensaciones)' : p.titulo) + cuerpo + textoCoach(p);
    });
    return `<div class="pd-doc">${h}</div>`;
  }
  function valoracion(id, btn) {
    const c = ctxValoracion(), val = c.vals.find(v => v.id === id); if (!val) return toast('No se encuentra el informe');
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

  /* ---------- Factura: se exporta el documento tal cual se ve ---------- */
  function factura(f, btn) {
    const el = document.querySelector('.factura-doc'); if (!el) return toast('Abre la factura para descargarla');
    return generar(el, limpio(`Factura ${f?.numero || ''} ${f?.cliente_nombre || ''}`), { pie: false, btn });
  }

  return { generar, valoracion, temperamento, factura, htmlValoracion, ctxValoracion };
})();
