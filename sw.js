// Copia de la app para que abra sin señal. Siempre intenta la red primero.
// No toca las llamadas a la hoja (Apps Script): esas pasan directo.
const CACHE = 'finanzas-v2'; // v2: las letras ya van dentro de la app; se borra la copia vieja
const BASE = ['./', 'index.html', 'manifest.json', 'icono.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const propio = url.origin === self.location.origin;
  if (!propio) return;

  // La página se guarda sin parámetros (?api=, ?nocache=) para no repetir copias ni guardar la clave.
  const navega = req.mode === 'navigate' || (propio && /\/(index\.html)?$/.test(url.pathname));
  const clave = navega ? './' : req;

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && (res.ok || res.type === 'opaque')) {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put(clave, copia));
        }
        return res;
      })
      .catch(() => caches.match(clave, { ignoreSearch: true }).then((r) => r || caches.match('./')))
  );
});
