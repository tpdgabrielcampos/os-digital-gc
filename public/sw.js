// Service worker do app GC: guarda o básico para abrir rápido e mostra um aviso se ficar sem internet.
const CACHE = "gc-v1";
const OFFLINE = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sem internet</title><body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#000;color:#fff;font-family:system-ui,sans-serif;text-align:center;padding:24px"><div><img src="/icon-192.png" width="96" height="96" alt="" style="border-radius:20px"><h1 style="font-size:20px">Sem conexão</h1><p style="color:#aaa">Confira a internet e tente de novo.</p><button onclick="location.reload()" style="margin-top:12px;padding:10px 18px;border-radius:12px;border:0;background:#e0649c;color:#fff;font-weight:700">Tentar de novo</button></div></body></html>`;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/icon-192.png", "/logo-gabriel-campos.png"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // Páginas: sempre da internet (dados sempre atualizados); sem internet, aviso.
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => new Response(OFFLINE, { headers: { "Content-Type": "text/html; charset=utf-8" } })));
    return;
  }
  // Arquivos estáticos (_next/static, imagens, fontes): cache primeiro.
  if (url.pathname.startsWith("/_next/static/") || /\.(png|jpg|jpeg|svg|woff2?|ico)$/.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
            return res;
          })
      )
    );
  }
});
