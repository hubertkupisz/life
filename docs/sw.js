// Life offline cache, version 88153d08
const CACHE="life-88153d08";
const SHELL=["./","index.html","app.css?v=88153d08","app.js?v=88153d08","manifest.webmanifest","icon.svg","icon-192.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{
  const r=e.request;if(r.method!=="GET")return;
  const u=new URL(r.url);
  const font=u.host==="fonts.googleapis.com"||u.host==="fonts.gstatic.com";
  if(u.origin!==location.origin&&!font)return;
  e.respondWith(caches.open(CACHE).then(async c=>{
    const hit=await c.match(r,{ignoreSearch:r.mode==="navigate"});
    const net=fetch(r).then(res=>{if(res.ok||res.type==="opaque")c.put(r,res.clone());return res}).catch(()=>hit);
    return hit||net;
  }));
});
