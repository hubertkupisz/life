#!/usr/bin/env python3
"""Turn the SDF car from render_car.py into a compact binary mesh for the in-page WebGL viewer.
Writes: car.bin (mesh), car-shadow.png (ground contact shadow, top view), anchors.json (part positions)."""
import sys, json, struct, numpy as np
from PIL import Image
from skimage.measure import marching_cubes
import render_car as rc

OUT = sys.argv[1] if len(sys.argv) > 1 else "."
STEP = float(sys.argv[2]) if len(sys.argv) > 2 else 0.02
X0, X1, Y0, Y1, Z0, Z1 = -2.5, 2.5, 0.0, 1.66, -1.12, 1.12

xs = np.arange(X0, X1 + STEP, STEP); ys = np.arange(Y0, Y1 + STEP, STEP); zs = np.arange(Z0, Z1 + STEP, STEP)
print("grid", len(xs), len(ys), len(zs))
vol = np.empty((len(xs), len(ys), len(zs)), np.float32)
Y, Z = np.meshgrid(ys, zs, indexing="ij")
for i, x in enumerate(xs):
    vol[i] = rc.scene(np.full_like(Y, x), Y, Z)[0]
vol[:, 0, :] = np.maximum(vol[:, 0, :], 0.001)  # close the mesh at the ground
verts, faces, _, _ = marching_cubes(vol, 0.0, spacing=(STEP, STEP, STEP))
verts += np.array([X0, Y0, Z0])
print("verts", len(verts), "tris", len(faces))

# normals from the field gradient (smoother than mesh normals)
n = rc.normal(verts)
d, mat = rc.scene(verts[:, 0], verts[:, 1], verts[:, 2])
x, y, z = verts[:, 0], verts[:, 1], verts[:, 2]
glass = (mat == 0) & (y > 1.045) & (y < 1.43) & (n[:, 1] < 0.86) & (x < 1.0) & (x > -1.9) & ~((np.abs(x + 0.42) < 0.045) & (np.abs(n[:, 2]) > 0.5))
lampd = rc.round_box(x, y, np.abs(z), 2.10, 0.73, 0.62, 0.20, 0.05, 0.26, 0.02)
rld = rc.round_box(x, y, np.abs(z), -2.18, 0.88, 0.66, 0.10, 0.06, 0.22, 0.03)
lamp = (mat == 0) & ((lampd < 0.0) | (rld < 0.0))
grille = (mat == 0) & (x > 2.1) & (rc.round_box(x, y, z * (0.46 / (0.40 + 0.10 * np.clip((0.72 - y) / 0.3, 0, 1))), 2.24, 0.58, 0, 0.10, 0.17, 0.46, 0.07) < 0.012)
m = mat.copy()                      # 0 body, 1 tire, 2 rim, 3 glass, 4 lamp, 5 grille
m[glass] = 3; m[lamp] = 4; m[grille] = 5

# baked ambient occlusion
a = rc.ao(verts, n)

# panel lines baked as darkening (too fine for the mesh resolution)
az = np.abs(z)
lines = np.minimum.reduce([
    np.where(az > 0.78, np.abs(y - 1.02), 9),                                  # beltline
    np.where(az > 0.82, np.abs(y - 0.83), 9),                                  # shoulder crease
    np.where((az > 0.78) & (y > 0.42) & (y < 1.03), np.abs(x - 0.02), 9),      # front door
    np.where((az > 0.78) & (y > 0.42) & (y < 1.03), np.abs(x + 1.08), 9),      # rear door
])
line = np.clip(1 - lines / 0.016, 0, 1)

albedo = np.choose(m, [0.82, 0.17, 0.56, 0.42, 0.46, 0.30])
# quantise
lo = np.array([X0, Y0, Z0]); hi = np.array([X1, Y1, Z1])
q = np.round((verts - lo) / (hi - lo) * 65535).astype(np.uint16)
nq = np.round(np.clip(n, -1, 1) * 127).astype(np.int8)
attr = np.stack([np.round(albedo * 255), np.round(a * 255), m, np.round(line * 255)], 1).astype(np.uint8)
idx = faces[:, ::-1].astype(np.uint32)  # flip winding to counter-clockwise from outside
with open(f"{OUT}/car.bin", "wb") as f:
    f.write(b"LCAR"); f.write(struct.pack("<II", len(verts), len(idx)))
    f.write(struct.pack("<6f", *lo, *hi))
    f.write(q.tobytes()); f.write(nq.tobytes()); f.write(b"\0" * ((4 - (nq.nbytes % 4)) % 4))
    f.write(attr.tobytes()); f.write(idx.tobytes())
print("car.bin bytes", (q.nbytes + nq.nbytes + attr.nbytes + idx.nbytes))

# ground contact shadow seen from above (rotates with the car)
G = 256; gx = np.linspace(-3.0, 3.0, G); gz = np.linspace(-2.2, 2.2, G)
GX, GZ = np.meshgrid(gx, gz, indexing="xy")
p = np.stack([GX.ravel(), np.zeros(GX.size) + 0.002, GZ.ravel()], 1)
up = np.repeat(np.array([[0, 1.0, 0]]), len(p), 0)
occ = 1 - rc.ao(p, up)
dist = np.maximum(rc.sdf(p), 0)
alpha = np.clip(occ * 0.9 + np.exp(-dist * 6) * 0.45, 0, 0.85)
Image.fromarray((alpha.reshape(G, G) * 255).astype(np.uint8), "L").save(f"{OUT}/car-shadow.png", optimize=True)

# part anchors: pushed onto the surface along their normals
PARTS = {  # key: (label, approximate surface point, outward normal); right side of the car is +z
    "lampa-pp": ("Lampa przednia prawa", (2.15, 0.73, 0.62), (0.85, 0.05, 0.52)),
    "lampa-pl": ("Lampa przednia lewa", (2.15, 0.73, -0.62), (0.85, 0.05, -0.52)),
    "lampa-tp": ("Lampa tylna prawa", (-2.16, 0.88, 0.64), (-0.8, 0.1, 0.6)),
    "lampa-tl": ("Lampa tylna lewa", (-2.16, 0.88, -0.64), (-0.8, 0.1, -0.6)),
    "kolo-pp": ("Koło przednie prawe", (1.34, 0.42, 0.93), (0, 0, 1)),
    "kolo-pl": ("Koło przednie lewe", (1.34, 0.42, -0.93), (0, 0, -1)),
    "kolo-tp": ("Koło tylne prawe", (-1.34, 0.42, 0.93), (0, 0, 1)),
    "kolo-tl": ("Koło tylne lewe", (-1.34, 0.42, -0.93), (0, 0, -1)),
    "silnik": ("Silnik i olej", (1.45, 0.94, 0), (0.15, 0.99, 0)),
    "szyba": ("Szyba przednia", (0.6, 1.25, 0), (0.55, 0.83, 0)),
    "lusterko-p": ("Lusterko prawe", (0.55, 1.07, 1.05), (0, 0.3, 0.95)),
    "lusterko-l": ("Lusterko lewe", (0.55, 1.07, -1.05), (0, 0.3, -0.95)),
    "drzwi-p": ("Drzwi prawe", (-0.5, 0.75, 0.92), (0, 0, 1)),
    "drzwi-l": ("Drzwi lewe", (-0.5, 0.75, -0.92), (0, 0, -1)),
    "zderzak-p": ("Zderzak przedni", (2.3, 0.42, 0), (1, 0, 0)),
    "bagaznik": ("Tył i bagażnik", (-2.25, 0.75, 0), (-1, 0, 0)),
    "dach": ("Dach", (-0.6, 1.5, 0), (0, 1, 0)),
}
anchors = {}
for k, (label, target, nrm) in PARTS.items():
    nrm = np.array(nrm, float); nrm /= np.linalg.norm(nrm)
    pt = (np.array(target, float) + nrm * 0.45)[None, :]
    for _ in range(120):
        dd = rc.sdf(pt)[0]
        if dd < 0.002: break
        pt = pt - nrm * max(dd, 0.003) * 0.9
    pt = pt[0] + nrm * 0.04
    anchors[k] = {"label": label, "p": [round(float(v), 3) for v in pt], "n": [round(float(v), 3) for v in nrm]}
json.dump(anchors, open(f"{OUT}/anchors.json", "w"), ensure_ascii=False, indent=1)
print(json.dumps({k: v["p"] for k, v in anchors.items()}))
