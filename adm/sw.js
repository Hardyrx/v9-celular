// V9 ADMIN no celular (só o dono): guarda a casca do app e mostra os avisos de PC novo. Escopo: só adm/.
const CASCA = "v9adm-2";
const ARQUIVOS = ["./", "index.html", "adm.js", "cofre.js", "manifest.webmanifest", "icone-192.png", "icone-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CASCA).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== CASCA).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// a casca vem da rede quando tem (versão nova na hora) e do cache sem rede; a nuvem nunca passa por aqui
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== self.location.origin) return;
  e.respondWith(fetch(e.request)
    .then((r) => { const c = r.clone(); caches.open(CASCA).then((k) => k.put(e.request, c)); return r; })
    .catch(() => caches.match(e.request).then((r) => r || caches.match("index.html"))));
});

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { texto: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.titulo || "V9 Admin", {
    body: d.texto || "", tag: d.tag || "v9", icon: "icone-192.png", badge: "icone-192.png", renotify: true,
    data: { url: "./" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
    for (const c of cs) if ("navigate" in c) return c.navigate(url).then((w) => (w || c).focus());
    return self.clients.openWindow(url);
  }));
});
