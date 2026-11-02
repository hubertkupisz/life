#!/usr/bin/env python3
"""Builds Life: dist/ (standalone website, installable PWA) and life.html (Claude artifact preview)."""
import json, pathlib, shutil, hashlib
from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).parent
SRC, DIST = ROOT / "src", ROOT / "docs"
css = (SRC / "app.css").read_text()
js = (SRC / "app.js").read_text()
body = (SRC / "body.html").read_text()
FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com">\n'
         '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
         '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700'
         '&family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=JetBrains+Mono:wght@400;600&display=swap">')

# --- standalone website ---
if DIST.exists():
    shutil.rmtree(DIST)
DIST.mkdir()
BASE = (":root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}\n"
        "body{margin:0}img{max-width:100%}\n")
(DIST / "app.css").write_text(BASE + css)
(DIST / "app.js").write_text(js)
ver = hashlib.sha1((css + js + body).encode()).hexdigest()[:8]

index = f"""<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Life</title>
<meta name="description" content="Life – kalendarz, zadania, finanse, nawyki i notatki w jednym miejscu.">
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="theme-color" content="#E9EDF2" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0E1219" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Life">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<script>try{{var t=localStorage.getItem("life.theme");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}}catch(e){{}}</script>
{FONTS}
<link rel="stylesheet" href="app.css?v={ver}">
</head>
<body>
{body}
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/dist/umd/supabase.js"></script>
<script src="app.js?v={ver}"></script>
<script>
if("serviceWorker" in navigator&&location.protocol==="https:")navigator.serviceWorker.register("sw.js").catch(()=>{{}});
</script>
</body>
</html>
"""
(DIST / "index.html").write_text(index)

(DIST / "manifest.webmanifest").write_text(json.dumps({
    "name": "Life", "short_name": "Life", "lang": "pl",
    "description": "Kalendarz, zadania, finanse, nawyki i notatki w jednym miejscu.",
    "start_url": "./#start", "scope": "./", "display": "standalone",
    "background_color": "#E9EDF2", "theme_color": "#E9EDF2",
    "icons": [
        {"src": "icon-192.png", "sizes": "192x192", "type": "image/png"},
        {"src": "icon-512.png", "sizes": "512x512", "type": "image/png"},
        {"src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
        {"src": "icon.svg", "sizes": "any", "type": "image/svg+xml"}],
    "shortcuts": [
        {"name": "Zadania", "url": "./#zadania"}, {"name": "Finanse", "url": "./#finanse"},
        {"name": "Płatności cykliczne", "url": "./#finanse-cykliczne"}]
}, ensure_ascii=False, indent=1))

(DIST / "sw.js").write_text(f"""// Life offline cache, version {ver}
const CACHE="life-{ver}";
const SHELL=["./","app.css?v={ver}","app.js?v={ver}","manifest.webmanifest","icon.svg","icon-192.png"];
self.addEventListener("install",e=>{{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL.map(u=>new Request(u,{{cache:"reload"}})))).then(()=>self.skipWaiting()))}});
self.addEventListener("activate",e=>{{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))}});
self.addEventListener("fetch",e=>{{
  const r=e.request;if(r.method!=="GET")return;
  const u=new URL(r.url);
  // pages: always fresh from the network, saved copy only when offline
  if(r.mode==="navigate"){{
    e.respondWith(fetch(r,{{cache:"no-cache"}}).then(res=>{{if(res.ok){{const c=res.clone();caches.open(CACHE).then(k=>k.put("./",c))}}return res}})
      .catch(()=>caches.open(CACHE).then(k=>k.match("./"))));
    return;
  }}
  const ext=u.host==="fonts.googleapis.com"||u.host==="fonts.gstatic.com"||(u.host==="cdn.jsdelivr.net"&&u.pathname.startsWith("/npm/@supabase/supabase-js@"));
  if(u.origin!==location.origin&&!ext)return;
  if(u.origin===location.origin&&u.pathname.endsWith("/sw.js"))return;
  // versioned files: saved copy first, refreshed in the background
  e.respondWith(caches.open(CACHE).then(async c=>{{
    const hit=await c.match(r);
    const net=fetch(r).then(res=>{{if(res.ok||res.type==="opaque")c.put(r,res.clone());return res}}).catch(()=>hit);
    return hit||net;
  }}));
}});
""")

# icons: ink tile, highlighter bar, white "L"
def icon(size, pad=0.0):
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    s = size
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * (0.0 if pad else 0.22)), fill=(23, 32, 49, 255))
    u = s * (1 - 2 * pad) / 100
    o = s * pad
    R = lambda x0, y0, x1, y1, c: d.rectangle([o + x0 * u, o + y0 * u, o + x1 * u, o + y1 * u], fill=c)
    R(24, 62, 78, 76, (245, 217, 78, 255))      # highlighter stroke
    R(30, 20, 44, 72, (251, 252, 253, 255))     # L stem
    R(30, 58, 70, 72, (251, 252, 253, 255))     # L foot
    return im
icon(512, 0.1).save(DIST / "icon-512.png")
icon(192).save(DIST / "icon-192.png")
icon(180, 0.06).convert("RGB").save(DIST / "apple-touch-icon.png")
(DIST / "icon.svg").write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#172031"/>'
                               '<rect x="24" y="62" width="54" height="14" fill="#F5D94E"/><rect x="30" y="20" width="14" height="52" fill="#FBFCFD"/>'
                               '<rect x="30" y="58" width="40" height="14" fill="#FBFCFD"/></svg>')
(DIST / "404.html").write_text(index)
(DIST / ".nojekyll").write_text("")

# --- Claude artifact preview (single file, no document skeleton) ---
(ROOT.parent / "life.html").write_text(
    f'<title>Life</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n{FONTS}\n<style>\n{css}</style>\n\n{body}\n<script>\n{js}</script>\n')
print("built", ver, sorted(p.name for p in DIST.iterdir()))
