// Guarda la "carcasa" de la app para que abra rápido y sin conexión.
// Los datos siempre se piden a la base de datos (nunca se guardan aquí).
const VERSION = 'lof-v103';
const CARCASA = ['./', 'index.html', 'app.js', 'temperamento.js', 'habitos.js', 'nutricion.js', 'pdf.js', 'casos.js', 'acomp.js', 'negocio.js', 'config.js', 'manifest.webmanifest', 'icons/logo-96.jpg', 'icons/coach.jpg', 'icons/icon-192.png'];

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
// Al tocar el aviso de "Descanso terminado" se vuelve a la app
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(l => l.length ? l[0].focus() : self.clients.openWindow('./')));
});
