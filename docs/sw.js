// Life offline cache, version 2e75994f
const CACHE="life-2e75994f";
const SHELL=["./","app.css?v=2e75994f","app.js?v=2e75994f","manifest.webmanifest","icon.svg","icon-192.png","car.bin.gz","car-clay.webp"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL.map(u=>new Request(u,{cache:"reload"})))).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{
  const r=e.request;if(r.method!=="GET")return;
  const u=new URL(r.url);
  // pages: always fresh from the network, saved copy only when offline
  if(r.mode==="navigate"){
    e.respondWith(fetch(r,{cache:"no-cache"}).then(res=>{if(res.ok){const c=res.clone();caches.open(CACHE).then(k=>k.put("./",c))}return res})
      .catch(()=>caches.open(CACHE).then(k=>k.match("./"))));
    return;
  }
  const ext=u.host==="fonts.googleapis.com"||u.host==="fonts.gstatic.com"||(u.host==="cdn.jsdelivr.net"&&u.pathname.startsWith("/npm/@supabase/supabase-js@"));
  if(u.origin!==location.origin&&!ext)return;
  if(u.origin===location.origin&&u.pathname.endsWith("/sw.js"))return;
  // versioned files: saved copy first, refreshed in the background
  e.respondWith(caches.open(CACHE).then(async c=>{
    const hit=await c.match(r);
    const net=fetch(r).then(res=>{if(res.ok||res.type==="opaque")c.put(r,res.clone());return res}).catch(()=>hit);
    return hit||net;
  }));
});
