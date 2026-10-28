// Guarda la "carcasa" de la app para que abra rápido y sin conexión.
// Los datos siempre se piden a la base de datos (nunca se guardan aquí).
const VERSION = 'lof-v141';
const CARCASA = ['./', 'index.html', 'app.js', 'temperamento.js', 'habitos.js', 'nutricion.js', 'pdf.js', 'casos.js', 'acomp.js', 'negocio.js', 'tandas.js', 'config.js', 'manifest.webmanifest', 'icons/logo-96.jpg', 'icons/coach.jpg', 'icons/icon-192.png'];

self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(CARCASA)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;  // Supabase y CDN: siempre red
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then(r => { const copia = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copia)); return r; })
      .catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});
// Avisos push del servidor (p. ej. «Tu semana está lista») y toque en cualquier aviso
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) { d = { titulo: 'La Obra Fitness', cuerpo: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.titulo || 'La Obra Fitness', { body: d.cuerpo || '', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: d.tag || 'lof-aviso', renotify: true, data: { url: d.url || './' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(l => l.length ? l[0].focus() : self.clients.openWindow(url)));
});

/* Aviso de fin de descanso programado desde la app (respaldo si la página se congela en segundo plano) */
let _descanso = null;
self.addEventListener('message', e => {
  const m = e.data || {};
  if (m.t === 'descanso-cancelar') { clearTimeout(_descanso); _descanso = null; return; }
  if (m.t !== 'descanso') return;
  clearTimeout(_descanso);
  const ev = e.waitUntil ? e : null;
  _descanso = setTimeout(() => self.registration.showNotification('Fin del descanso', { body: m.body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'descanso', renotify: true, vibrate: [300, 150, 300, 150, 300] }), m.ms);
});
