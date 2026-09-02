const APP_CACHE = "bible-year-v10";
const ICON_REVISION = "c367693cf4cf";
const CACHE = `${APP_CACHE}-icon-${ICON_REVISION}`;
const ASSETS = ["./","./index.html","./manifest.json","./icon.2ee3dc319b05.svg","./icon-180.3b925da1f707.png","./icon-192.117d2de07ff7.png","./icon-512.45ba4676a317.png","./cloud-config.js","./vendor/react.production.min.js","./vendor/react-dom.production.min.js","./vendor/babel.min.js","./vendor/supabase.js","./data/reading-plan-v3.json"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k.startsWith("bible-year-") && k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== self.location.origin) return;
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).then(res => {
      const copy = res.clone(); caches.open(CACHE).then(c => c.put("./index.html", copy)); return res;
    }).catch(() => caches.match("./index.html")));
    return;
  }
  if (new URL(e.request.url).pathname.endsWith("/manifest.json")) {
    e.respondWith((async()=>{
      try {
        const res=await fetch(e.request, {cache:"no-store"});
        if(!res.ok)throw new Error(`Manifest request failed with ${res.status}`);
        const cache=await caches.open(CACHE);
        await cache.put(e.request,res.clone());
        return res;
      } catch {
        return (await caches.match(e.request)) || caches.match("./manifest.json");
      }
    })());
    return;
  }
  if (["/cloud-config.js", "/data/reading-plan-v3.json"].some(path => new URL(e.request.url).pathname.endsWith(path))) {
    e.respondWith((async()=>{
      try {
        const res=await fetch(e.request,{cache:"no-store"});
        if(!res.ok)throw new Error(`Fresh content request failed with ${res.status}`);
        const cache=await caches.open(CACHE);await cache.put(e.request,res.clone());return res;
      } catch { return caches.match(e.request); }
    })());
    return;
  }
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
    const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res;
  })));
});
