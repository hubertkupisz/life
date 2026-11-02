#!/usr/bin/env python3
"""Minimal variants of the car: simplified body + three shading styles (white form, outline, soft tint)."""
import sys, numpy as np
from PIL import Image
import render_car as rc
from render_car import round_box, smin, smax, cyl_z, ellipsoid, WHEELS, WR

def body_simple(x, y, z):
    az = np.abs(z)
    zs = az * (1 + 0.05 * np.maximum(np.abs(x) - 1.7, 0) ** 2)
    lower = round_box(x, y, zs, 0.0, 0.66, 0.0, 2.2, 0.33, 0.9, 0.24)
    hood = 0.97 - 0.15 * (x - 0.9)
    lower = smax(lower, y - np.where(x > 0.9, hood, 0.97 + 0 * x), 0.08)
    zc = az * (1 + 0.22 * (y - 1.0))
    cabin = round_box(x, y, zc, -0.40, 1.19, 0.0, 1.32, 0.31, 0.79, 0.26)
    cabin = smax(cabin, (x - 0.98) * 0.55 + (y - 0.94) * 0.835, 0.08)
    cabin = smax(cabin, (x + 1.55) * -0.72 + (y - 1.40) * 0.69, 0.08)
    cabin = smax(cabin, y - (1.50 + 0.04 * (x + 0.1)), 0.12)
    d = smin(lower, cabin, 0.16)
    for (wx, wy, wz) in WHEELS:
        d = smax(d, -cyl_z(x, y, z, wx, wy, np.sign(wz) * 0.92, 0.47, 0.34, 0.04), 0.06)
    mirror = ellipsoid(x, y, az, 0.55, 1.07, 0.95, 0.13, 0.07, 0.11)
    return np.minimum(d, mirror)

def wheels_simple(x, y, z):
    t = np.full_like(x, 1e3); r = np.full_like(x, 1e3)
    for (wx, wy, wz) in WHEELS:
        sz = np.sign(wz)
        tt = cyl_z(x, y, z, wx, wy, wz, WR, 0.125, 0.07)
        tt = smax(tt, -cyl_z(x, y, z, wx, wy, wz + sz * 0.13, 0.25, 0.06), 0.01)
        t = np.minimum(t, tt)
        r = np.minimum(r, cyl_z(x, y, z, wx, wy, wz, 0.245, 0.10, 0.03))
    return t, r

def scene(x, y, z):
    b = body_simple(x, y, z); t, r = wheels_simple(x, y, z)
    d = np.minimum(np.minimum(b, t), r)
    return d, np.where(d == b, 0, np.where(d == t, 1, 2))

rc.scene = scene
rc.sdf = lambda p: scene(p[:, 0], p[:, 1], p[:, 2])[0]

def gbuffer(W, H):
    cam = np.array([5.0, 2.7, -4.4]); tgt = np.array([0.05, 0.66, 0.0])
    fw = tgt - cam; fw /= np.linalg.norm(fw); rt = np.cross(fw, [0, 1, 0]); rt /= np.linalg.norm(rt); up = np.cross(rt, fw)
    fov = 0.255; ys, xs = np.mgrid[0:H, 0:W]
    u = ((xs + .5) / W * 2 - 1) * fov * W / H; v = (1 - (ys + .5) / H * 2) * fov
    rd = fw[None] + u.reshape(-1, 1) * rt[None] + v.reshape(-1, 1) * up[None]; rd /= np.linalg.norm(rd, axis=1, keepdims=True)
    ro = np.repeat(cam[None], len(rd), 0)
    t, hit = rc.march(ro, rd)
    N = np.zeros((len(rd), 3)); M = np.full(len(rd), -1); A = np.ones(len(rd)); S = np.ones(len(rd)); D = np.full(len(rd), 99.0)
    L1 = np.array([0.35, 0.85, -0.45]); L1 /= np.linalg.norm(L1)
    hi = np.nonzero(hit)[0]; p = ro[hi] + rd[hi] * t[hi, None]
    N[hi] = rc.normal(p); mm = scene(p[:, 0], p[:, 1], p[:, 2])[1]
    nh = N[hi]; gl = (mm == 0) & (p[:, 1] > 1.06) & (p[:, 1] < 1.42) & (nh[:, 1] < 0.86) & (p[:, 0] < 0.98) & (p[:, 0] > -1.88)
    M[hi] = np.where(gl, 3, mm); A[hi] = rc.ao(p, N[hi]); S[hi] = rc.soft_shadow(p + N[hi] * 0.003, L1); D[hi] = t[hi]
    # floor contact shadow
    G = np.zeros(len(rd)); mi = np.nonzero(~hit & (rd[:, 1] < 0))[0]
    tg = -ro[mi, 1] / rd[mi, 1]; q = ro[mi] + rd[mi] * tg[:, None]
    up_n = np.repeat(np.array([[0, 1.0, 0]]), len(q), 0)
    G[mi] = np.clip((1 - rc.ao(q, up_n)) * 0.6 + np.exp(-np.maximum(rc.sdf(q), 0) * 7) * 0.3, 0, 0.6) * np.clip(1 - np.abs(q[:, 0]) / 5.5, 0, 1)
    return dict(N=N.reshape(H, W, 3), M=M.reshape(H, W), A=A.reshape(H, W), S=S.reshape(H, W), D=D.reshape(H, W), G=G.reshape(H, W), hit=hit.reshape(H, W), rd=rd.reshape(H, W, 3), L1=L1)

def shade(g, style):
    N, M, A, S, hit = g["N"], g["M"], g["A"], g["S"], g["hit"]; L1 = g["L1"]
    dif = np.clip((N * L1).sum(-1), 0, 1) * S; sky = .5 + .5 * N[..., 1]
    H, W = hit.shape; out = np.zeros((H, W, 4))
    if style == "white":
        alb = np.where(M == 1, 0.30, np.where(M == 3, 0.80, 0.97))
        c = alb * (0.45 * dif + 0.55 * sky * (0.6 + 0.4 * A)) + 0.12
        c = np.clip(c, 0, 1) ** 0.85; rgb = np.stack([c * 0.985, c * 0.99, c], -1)
    elif style == "tint":
        base = np.array([0.42, 0.56, 0.78]); dark = np.array([0.18, 0.22, 0.30])
        k = np.clip(0.35 * dif + 0.45 * sky * (0.5 + 0.5 * A) + 0.15, 0, 1)
        k = np.round(k * 4) / 4                                   # soft toon bands
        rgb = dark[None, None] + (base[None, None] - dark[None, None]) * k[..., None] * 1.25
        rgb = np.where((M == 1)[..., None], np.array([0.16, 0.18, 0.22]), rgb)
        rgb = np.where((M == 3)[..., None], rgb * 0.62 + 0.05, rgb)
        rgb = np.clip(rgb, 0, 1)
    else:  # outline
        rgb = np.ones((H, W, 3)) * 0.995
    out[..., :3] = rgb; out[..., 3] = hit.astype(float)
    if style == "outline":
        D = g["D"]; n = N
        e = np.zeros((H, W))
        for dy, dx in ((0, 1), (1, 0), (1, 1), (1, -1)):
            dd = np.abs(D - np.roll(np.roll(D, dy, 0), dx, 1)) / np.maximum(D, 1e-3)
            h2 = np.roll(np.roll(hit, dy, 0), dx, 1); both = hit & h2
            nn = np.where(both, 1 - (n * np.roll(np.roll(n, dy, 0), dx, 1)).sum(-1), 0)
            dd = np.where(both, dd, 0)
            mm = (hit != h2) | (both & (M != np.roll(np.roll(M, dy, 0), dx, 1)))
            e = np.maximum(e, np.clip((dd - 0.02) * 30, 0, 1)); e = np.maximum(e, np.clip((nn - 0.12) * 6, 0, 1)); e = np.maximum(e, mm * 1.0)
        line = np.clip(e, 0, 1)
        ink = np.array([0.11, 0.11, 0.12])
        out[..., :3] = out[..., :3] * (1 - line[..., None]) + ink * line[..., None]
        out[..., 3] = np.maximum(out[..., 3], line)
        g2 = g["G"] * 0.5
    else:
        g2 = g["G"]
    floor = (~hit) & (g2 > 0)
    out[floor, :3] = 0; out[floor, 3] = g2[floor]
    return Image.fromarray((out * 255).clip(0, 255).astype(np.uint8), "RGBA")

if __name__ == "__main__":
    outdir = sys.argv[1]; W = int(sys.argv[2]); H = int(sys.argv[3]); SS = int(sys.argv[4]) if len(sys.argv) > 4 else 1
    g = gbuffer(W * SS, H * SS)
    for st in ("white", "outline", "tint"):
        im = shade(g, st)
        if SS > 1: im = im.resize((W, H), Image.LANCZOS)
        im.save(f"{outdir}/variant-{st}.png"); print("saved", st)
