#!/usr/bin/env python3
"""Clay-style 3D render of an original compact SUV (signed-distance-field ray marcher, numpy).
Usage: python3 render_car.py OUT.png WIDTH HEIGHT [SS]"""
import sys, numpy as np
from PIL import Image

def length(*c): return np.sqrt(sum(x*x for x in c))
def round_box(px, py, pz, cx, cy, cz, bx, by, bz, r):
    qx=np.abs(px-cx)-bx+r; qy=np.abs(py-cy)-by+r; qz=np.abs(pz-cz)-bz+r
    return length(np.maximum(qx,0),np.maximum(qy,0),np.maximum(qz,0))+np.minimum(np.maximum(np.maximum(qx,qy),qz),0)-r
def smin(a,b,k):
    h=np.clip(.5+.5*(b-a)/k,0,1); return b*(1-h)+a*h-k*h*(1-h)
def smax(a,b,k): return -smin(-a,-b,k)
def cyl_z(px,py,pz,cx,cy,cz,r,hw,rr=0.0):
    dx=length(px-cx,py-cy)-r+rr; dz=np.abs(pz-cz)-hw+rr
    return length(np.maximum(dx,0),np.maximum(dz,0))+np.minimum(np.maximum(dx,dz),0)-rr
def ellipsoid(px,py,pz,cx,cy,cz,a,b,c):
    x=(px-cx)/a; y=(py-cy)/b; z=(pz-cz)/c
    k0=length(x,y,z); k1=length(x/a,y/b,z/c)
    return k0*(k0-1)/np.maximum(k1,1e-6)

WB=1.34; TW=0.80; WR=0.395; WY=0.395
WHEELS=[(sx*WB,WY,sz*TW) for sx in (1,-1) for sz in (1,-1)]

def body_sdf(x,y,z):
    az=np.abs(z)
    # lower body, slightly narrower towards the bumpers
    zs=az*(1+0.05*np.maximum(np.abs(x)-1.7,0)**2)
    lower=round_box(x,y,zs,0.0,0.66,0.0,2.2,0.33,0.9,0.22)
    hood=0.97-0.15*(x-0.9)           # hood slopes down to the front
    lower=smax(lower,y-np.where(x>0.9,hood,0.97+0*x),0.06)
    # cabin with tumblehome and raked pillars
    zc=az*(1+0.22*(y-1.0))
    cabin=round_box(x,y,zc,-0.40,1.19,0.0,1.32,0.31,0.79,0.24)
    cabin=smax(cabin,(x-0.98)*0.55+(y-0.94)*0.835,0.06)       # raked windscreen
    cabin=smax(cabin,(x+1.55)*-0.72+(y-1.40)*0.69,0.06)        # sloped tailgate
    cabin=smax(cabin,y-(1.50+0.04*(x+0.1)),0.10)              # roof falls towards the rear
    d=smin(lower,cabin,0.12)
    # wheel arches + flares
    for (wx,wy,wz) in WHEELS:
        arch=cyl_z(x,y,z,wx,wy,0,0.47,1.4)
        d=smax(d,-arch,0.03)
        flare=cyl_z(x,y,z,wx,wy+0.02,np.sign(wz)*0.86,0.53,0.05,0.04)
        flare=smax(flare,-arch+0.0,0.02); flare=np.maximum(flare,wy-0.05-y)
        d=smin(d,flare,0.05)
    # surface details (shallow grooves)
    side=az-0.80
    belt=np.maximum(np.abs(y-1.02)-0.006,-side)                  # beltline under the windows
    crease=np.maximum(np.abs(y-0.83)-0.005,-(az-0.84))           # shoulder crease
    door1=np.maximum(np.maximum(np.abs(x-0.02)-0.005,-(az-0.80)),np.maximum(y-1.03,0.42-y))
    door2=np.maximum(np.maximum(np.abs(x+1.08)-0.005,-(az-0.80)),np.maximum(y-1.03,0.42-y))
    win=round_box(x,y,np.zeros_like(z),-0.42,1.24,0,1.12,0.19,1,0.08)
    win=np.maximum(np.maximum(np.abs(win)-0.006,-(az-0.70)),(x-0.86)*0.55+(y-0.99)*0.835)
    pillar=np.maximum(np.maximum(np.abs(x+0.42)-0.035,-(az-0.70)),np.maximum(y-1.42,1.04-y))
    for g in (belt,crease,door1,door2,win):
        d=smax(d,-g,0.004)
    d=smin(d,pillar-0.004+0*d,0.001) if False else d
    # front: grille, headlights, intake
    gz=0.40+0.10*np.clip((0.72-y)/0.3,0,1)                     # grille widens towards the bottom
    grille=round_box(x,y,z*(0.46/gz),2.24,0.58,0,0.10,0.17,0.46,0.07)
    d=smax(d,-grille,0.02)
    mesh=0.0045*(np.cos(y*95)*np.cos(z*95))
    inner=np.maximum(np.abs(x-2.14)-0.02+mesh,grille+0.015)
    d=np.minimum(d,inner)
    lamp=round_box(x,y,az,2.10,0.73,0.62,0.16,0.032,0.24,0.02)
    d=smax(d,-lamp,0.01)
    intake=round_box(x,y,z,2.25,0.36,0,0.06,0.05,0.52,0.04)
    d=smax(d,-intake,0.01)
    fogs=round_box(x,y,az,2.2,0.38,0.70,0.06,0.04,0.09,0.03)
    d=smax(d,-fogs,0.01)
    # rear lamps
    rl=round_box(x,y,az,-2.18,0.88,0.66,0.08,0.04,0.2,0.03); d=smax(d,-rl,0.01)
    # mirrors + roof rails
    mirror=ellipsoid(x,y,az,0.55,1.07,0.95,0.13,0.07,0.11)
    stalk=round_box(x,y,az,0.6,1.03,0.86,0.04,0.02,0.07,0.015)
    ys=y-0.04*(x+0.1)
    rail=round_box(x,ys,az,-0.70,1.47,0.58,0.74,0.022,0.03,0.02)
    feet=np.minimum(round_box(x,ys,az,-0.02,1.45,0.58,0.06,0.02,0.03,0.015),round_box(x,ys,az,-1.38,1.45,0.58,0.06,0.02,0.03,0.015))
    rail=np.minimum(rail,feet)
    d=np.minimum.reduce([d,mirror,stalk,rail])
    return d

def wheel_sdf(x,y,z):
    tire=np.full_like(x,1e3); rim=np.full_like(x,1e3)
    for (wx,wy,wz) in WHEELS:
        sz=np.sign(wz)
        t=cyl_z(x,y,z,wx,wy,wz,WR,0.125,0.07)
        t=smax(t,-cyl_z(x,y,z,wx,wy,wz+sz*0.13,0.255,0.06),0.01)    # dish for the rim
        tire=np.minimum(tire,t)
        r=cyl_z(x,y,z,wx,wy,wz,0.25,0.10,0.01)
        u=x-wx; v=y-wy; rad=length(u,v); a=np.arctan2(v,u)
        sec=2*np.pi/5; a2=np.mod(a+sec/2,sec)-sec/2
        qy=np.abs(rad*np.sin(a2))
        spoke=qy-(0.028+0.06*np.clip(rad-0.06,0,1))
        hole=np.maximum(-spoke,np.maximum(0.075-rad,rad-0.215))
        hole=np.maximum(hole,-(sz*(z-wz)-0.04))
        r=smax(r,-hole,0.01)
        hub=cyl_z(x,y,z,wx,wy,wz+sz*0.06,0.06,0.05,0.02)
        r=np.minimum(r,hub)
        rim=np.minimum(rim,r)
    return tire,rim

def scene(x,y,z):
    b=body_sdf(x,y,z); t,r=wheel_sdf(x,y,z)
    d=np.minimum(np.minimum(b,t),r)
    mat=np.where(d==b,0,np.where(d==t,1,2))
    return d,mat

def sdf(p): return scene(p[:,0],p[:,1],p[:,2])[0]

def normal(p):
    e=0.0015; k=np.array([[1,-1,-1],[-1,-1,1],[-1,1,-1],[1,1,1]],float)
    n=sum(k[i][None,:]*sdf(p+e*k[i][None,:])[:,None] for i in range(4))
    return n/np.linalg.norm(n,axis=1,keepdims=True)

def march(ro,rd,tmax=20,steps=200,eps=6e-4):
    t=np.zeros(len(ro)); hit=np.zeros(len(ro),bool); act=np.ones(len(ro),bool)
    for _ in range(steps):
        idx=np.nonzero(act)[0]
        if not len(idx): break
        d=sdf(ro[idx]+rd[idx]*t[idx,None])*0.8
        t[idx]+=d
        h=d<eps*np.maximum(t[idx],1); hit[idx[h]]=True
        act[idx[h|(t[idx]>tmax)]]=False
    return t,hit

def soft_shadow(p,l,k=10,steps=48):
    res=np.ones(len(p)); t=np.full(len(p),0.02)
    for _ in range(steps):
        h=sdf(p+l*t[:,None]); res=np.minimum(res,k*h/t); t+=np.clip(h,0.01,0.25)
    return np.clip(res,0,1)

def ao(p,n):
    occ=np.zeros(len(p)); sca=1.0
    for i in range(1,6):
        h=0.02+0.07*i; d=sdf(p+n*h); occ+=(h-d)*sca; sca*=0.75
    return np.clip(1-2.2*occ,0,1)

def render(W,H,SS=1):
    W2,H2=W*SS,H*SS
    cam=np.array([5.0,2.7,-4.4]); tgt=np.array([0.05,0.66,0.0])
    fw=tgt-cam; fw/=np.linalg.norm(fw); rt=np.cross(fw,[0,1,0]); rt/=np.linalg.norm(rt); up=np.cross(rt,fw)
    fov=0.255
    ys,xs=np.mgrid[0:H2,0:W2]
    u=((xs+0.5)/W2*2-1)*fov*W2/H2; v=(1-(ys+0.5)/H2*2)*fov
    rd=fw[None,:]+u.reshape(-1,1)*rt[None,:]+v.reshape(-1,1)*up[None,:]
    rd/=np.linalg.norm(rd,axis=1,keepdims=True); ro=np.repeat(cam[None,:],len(rd),0)
    out=np.zeros((len(rd),4))
    t,hit=march(ro,rd)
    L1=np.array([0.35,0.85,-0.45]); L1/=np.linalg.norm(L1)
    L2=np.array([-0.6,0.5,0.6]); L2/=np.linalg.norm(L2)
    hi=np.nonzero(hit)[0]
    if len(hi):
        p=ro[hi]+rd[hi]*t[hi,None]
        n=normal(p); _,mat=scene(p[:,0],p[:,1],p[:,2])
        sh=soft_shadow(p+n*0.003,L1); a=ao(p,n)
        dif=np.clip((n*L1).sum(1),0,1)*sh
        fil=np.clip((n*L2).sum(1),0,1)
        sky=np.clip(0.5+0.5*n[:,1],0,1)
        bounce=np.clip(0.5-0.5*n[:,1],0,1)
        glass=(mat==0)&(p[:,1]>1.045)&(p[:,1]<1.43)&(n[:,1]<0.86)&(p[:,0]<1.0)&(p[:,0]>-1.9)&~((np.abs(p[:,0]+0.42)<0.045)&(np.abs(n[:,2])>0.5))
        lampd=round_box(p[:,0],p[:,1],np.abs(p[:,2]),2.10,0.73,0.62,0.20,0.05,0.26,0.02)
        rld=round_box(p[:,0],p[:,1],np.abs(p[:,2]),-2.18,0.88,0.66,0.10,0.06,0.22,0.03)
        glass=glass|((mat==0)&((lampd<0.0)|(rld<0.0)))
        mat=np.where(glass,3,mat)
        alb=np.choose(mat,[0.80,0.17,0.55,0.50])
        h=-rd[hi]+L1; h/=np.linalg.norm(h,axis=1,keepdims=True)
        spec=np.clip((n*h).sum(1),0,1)**np.choose(mat,[24,12,60,90])*np.choose(mat,[0.16,0.04,0.30,0.45])*sh
        fres=(1-np.clip((n*-rd[hi]).sum(1),0,1))**3
        col=alb*(0.72*dif+0.16*fil+0.34*sky*a+0.08*bounce*a)+spec+0.08*fres*a
        col=col*(0.5+0.5*a)
        col=np.clip(col,0,1)**(1/1.12)
        out[hi,0]=col*0.985; out[hi,1]=col*0.99; out[hi,2]=col*1.0; out[hi,3]=1
    # ground shadow / contact occlusion on the floor (y=0) for rays that missed the car
    mi=np.nonzero(~hit & (rd[:,1]<0))[0]
    if len(mi):
        tg=-ro[mi,1]/rd[mi,1]; p=ro[mi]+rd[mi]*tg[:,None]
        sh=soft_shadow(p+np.array([0,0.002,0]),L1,k=4,steps=40)
        up_n=np.repeat(np.array([[0,1.0,0]]),len(p),0); a=ao(p,up_n)
        dist=sdf(p)
        contact=np.exp(-dist*7)*0.35
        alpha=np.clip((1-sh)*0.22+(1-a)*0.55+contact,0,0.78)
        alpha*=np.clip(1-np.abs(p[:,0])/5.5,0,1)*np.clip(1-np.abs(p[:,2])/3.5,0,1)
        out[mi,3]=alpha
    img=(out.reshape(H2,W2,4)*255).clip(0,255).astype(np.uint8)
    im=Image.fromarray(img,"RGBA")
    if SS>1: im=im.resize((W,H),Image.LANCZOS)
    return im

if __name__=="__main__":
    out=sys.argv[1]; W=int(sys.argv[2]); H=int(sys.argv[3]); SS=int(sys.argv[4]) if len(sys.argv)>4 else 1
    im=render(W,H,SS); im.save(out); print("saved",out,im.size)
