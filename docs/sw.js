// Life offline cache, version 9f817d11
const CACHE="life-9f817d11";
const SHELL=["./","index.html","app.css?v=9f817d11","app.js?v=9f817d11","manifest.webmanifest","icon.svg","icon-192.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{
  const r=e.request;if(r.method!=="GET")return;
  const u=new URL(r.url);
  const ext=u.host==="fonts.googleapis.com"||u.host==="fonts.gstatic.com"||(u.host==="cdn.jsdelivr.net"&&u.pathname.startsWith("/npm/@supabase/supabase-js@"));
  if(u.origin!==location.origin&&!ext)return;
  e.respondWith(caches.open(CACHE).then(async c=>{
    const hit=await c.match(r,{ignoreSearch:r.mode==="navigate"});
    const net=fetch(r).then(res=>{if(res.ok||res.type==="opaque")c.put(r,res.clone());return res}).catch(()=>hit);
    return hit||net;
  }));
});
