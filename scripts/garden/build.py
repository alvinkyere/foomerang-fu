"""
Turns the measured walls and boulders into the arena's rectangles (uniform wall thickness, boulders as chamfered rectangle pairs), then picks the six spawns and the Book spots by path-distance sampling on a navigation grid. Writes geometry_v1/v2.json and spawn_raw.json into the current directory; the results are transcribed into games/foomerang-fu/src/rules/gardenArena.ts. Run: python3 build.py
The reference image is only ever READ (it is read-only source material).
"""
import json, math, heapq
from cam import *
import geom
from geom import OX,OD,H as WH
W_ARENA,H_ARENA=1440,1456
T=36.0
RH=60.0   # rock height
def L(x,y):   # screen -> logical at z (returns function)
    pass
def lx(X): return X-OX
def ly(D): return OD-D
def snap(v,s=2): return int(round(v/s)*s)
def clampx(v): return max(0,min(W_ARENA,v))
def clampy(v): return max(0,min(H_ARENA,v))
walls=[]
for (n,x,y,w,h,k) in geom.walls:
    if n.startswith('H') or n.startswith('V') and False: pass
for (n,x,y,w,h,k) in geom.walls:
    if n[0]=='H':            # horizontal: keep x extents, thickness T from the north edge
        x0=clampx(x); x1=clampx(x+w); y0=y; y1=y+T
    else:                    # vertical: centre the measured width, force thickness T
        cx=x+w/2; x0=cx-T/2; x1=cx+T/2; y0=y; y1=y+h
    walls.append(dict(name=n,x=snap(x0),y=snap(y0),w=snap(x1)-snap(x0),h=snap(y1)-snap(y0),kind=k))
for w in walls:
    if w['name']=='H14': w['y']-=6   # keeps the strip beneath it wide enough (84) for a body; within measurement error
# rocks: (name, x0,x1,yt,yb) screen
rock_defs=[('R1',450,561,203,325),('R2a',252,358,584,690),('R2b',338,431,579,700),('R2c',310,405,681,800),
           ('R3a',1571,1692,286,400),('R3b',1568,1690,358,530),('R3c',1547,1604,441,545),('R4',1281,1388,920,1052)]
rocks=[]
CH=16.0
for (n,x0,x1,yt,yb) in rock_defs:
    XL,Dn=unproject(x0,yt,RH); XR,_=unproject(x1,yt,RH); _,Ds=unproject((x0+x1)/2,yb,0)
    xl,xr,yn,ys=lx(XL),lx(XR),ly(Dn),ly(Ds)
    rocks.append(dict(name=n,x=snap(xl),y=snap(yn),w=snap(xr)-snap(xl),h=snap(ys)-snap(yn)))
def rock_rects(r):
    x,y,w,h=r['x'],r['y'],r['w'],r['h']
    c=max(0,min(CH,(min(w,h)-36)/2))
    return [dict(x=x,y=y+c,w=w,h=h-2*c),dict(x=x+c,y=y,w=w-2*c,h=h)]
solid=[]
for w in walls: solid.append(dict(x=w['x'],y=w['y'],w=w['w'],h=w['h']))
for r in rocks: solid+= rock_rects(r)
json.dump(dict(walls=walls,rocks=rocks,solid=solid),open('geometry_v1.json','w'),indent=1)
print(len(walls),len(rocks),len(solid))
# ---------- navigation grid for spawns/books
STEP=8
nx,ny=W_ARENA//STEP+1,H_ARENA//STEP+1
def blocked(px,py,rad):
    for s in solid:
        cx=max(s['x'],min(px,s['x']+s['w'])); cy=max(s['y'],min(py,s['y']+s['h']))
        if math.hypot(px-cx,py-cy)<rad: return True
    return px<rad or py<rad or px>W_ARENA-rad or py>H_ARENA-rad
RAD=40
free=[[not blocked(i*STEP,j*STEP,RAD) for j in range(ny)] for i in range(nx)]
# clearance map (distance to nearest solid) coarse
def clearance(px,py):
    best=1e9
    for s in solid:
        cx=max(s['x'],min(px,s['x']+s['w'])); cy=max(s['y'],min(py,s['y']+s['h']))
        best=min(best,math.hypot(px-cx,py-cy))
    best=min(best,px,py,W_ARENA-px,H_ARENA-py)
    return best
def bfs(sources):
    dist={}
    dq=[]
    for s in sources:
        dist[s]=0; dq.append(s)
    h=0
    while h<len(dq):
        i,j=dq[h]; h+=1
        for di,dj in ((1,0),(-1,0),(0,1),(0,-1)):
            a,b=i+di,j+dj
            if 0<=a<nx and 0<=b<ny and free[a][b] and (a,b) not in dist:
                dist[(a,b)]=dist[(i,j)]+1; dq.append((a,b))
    return dist
# connectivity: largest component
start=None
for i in range(nx):
    for j in range(ny):
        if free[i][j]: start=(i,j);break
    if start:break
comp=bfs([start])
tot=sum(1 for i in range(nx) for j in range(ny) if free[i][j])
print('free cells',tot,'reachable from first',len(comp))
# components
seen=set(); comps=[]
for i in range(nx):
    for j in range(ny):
        if free[i][j] and (i,j) not in seen:
            c=bfs([(i,j)]); seen|=set(c); comps.append(len(c))
print('components',sorted(comps,reverse=True)[:6])
seen2=set()
for i in range(nx):
    for j in range(ny):
        if free[i][j] and (i,j) not in seen2:
            c=bfs([(i,j)]); seen2|=set(c)
            if len(c)<500:
                xs=[a*STEP for a,b in c]; ys=[b*STEP for a,b in c]
                print('POCKET',len(c),min(xs),max(xs),min(ys),max(ys))

import random
cands=[(i,j) for i in range(nx) for j in range(ny) if free[i][j] and clearance(i*STEP,j*STEP)>=66]
print('candidates',len(cands))
dcache={}
def D(a):
    if a not in dcache: dcache[a]=bfs([a])
    return dcache[a]
def score(sel):
    ds=[D(a)[b]*STEP for a in sel for b in sel if a<b]
    m=min(ds)
    means=[sum(D(a)[b]*STEP for b in sel if b!=a)/(len(sel)-1) for a in sel]
    spread=max(means)-min(means)
    return m,spread,means
def los(a,b,rad=30):
    ax,ay=a;bx,by=b
    n=int(math.hypot(bx-ax,by-ay)/6)+1
    for k in range(n+1):
        px=ax+(bx-ax)*k/n; py=ay+(by-ay)*k/n
        for s_ in solid:
            if s_['x']-rad<px<s_['x']+s_['w']+rad and s_['y']-rad<py<s_['y']+s_['h']+rad:
                cx=max(s_['x'],min(px,s_['x']+s_['w'])); cy=max(s_['y'],min(py,s_['y']+s_['h']))
                if math.hypot(px-cx,py-cy)<rad: return False
    return True
random.seed(7)
# pre-filter candidates to coarser lattice for speed
lattice=[c for c in cands if c[0]%4==0 and c[1]%4==0]
best=None
for trial in range(400):
    sel=[random.choice(lattice)]
    while len(sel)<6:
        # farthest by bfs distance among lattice
        dm={}
        for c in lattice:
            dm[c]=min(D(s)[c] for s in sel)
        top=sorted(lattice,key=lambda c:-dm[c])[:12]
        sel.append(random.choice(top))
    m,sp,means=score(sel)
    pts=[(a[0]*STEP,a[1]*STEP) for a in sel]
    exposed=sum(1 for p in range(6) for q in range(p+1,6) if math.hypot(pts[p][0]-pts[q][0],pts[p][1]-pts[q][1])<640 and los(pts[p],pts[q]))
    key=(m-1.5*sp-400*exposed)
    if best is None or key>best[0]: best=(key,sel,m,sp,means)
key,sel,m,sp,means=best
print('best min pair path',m,'spread of mean',sp)
print([ (a[0]*STEP,a[1]*STEP, round(clearance(a[0]*STEP,a[1]*STEP))) for a in sel])
print([round(x) for x in means])
json.dump([(a[0]*STEP,a[1]*STEP) for a in sel],open('spawn_raw.json','w'))

# ---- slot order: prefix-optimal (every prefix of 2..6 players is well spread), starting top-left
pts=[(a[0]*STEP,a[1]*STEP) for a in sel]
def pd(a,b): return D((a[0]//STEP,a[1]//STEP))[(b[0]//STEP,b[1]//STEP)]*STEP
order=[min(pts,key=lambda p:p[0]+p[1])]
while len(order)<6:
    rest=[p for p in pts if p not in order]
    order.append(max(rest,key=lambda p:min(pd(p,o) for o in order)))
print('slot order',order)
for k in range(2,7):
    pre=order[:k]; print(k,'min path',min(pd(a,b) for a in pre for b in pre if a!=b))
# ---- Book spots: 8 farthest-point picks away from spawns
book=[]
pool=[(i*STEP,j*STEP) for (i,j) in cands if i%3==0 and j%3==0 and all(math.hypot(i*STEP-s[0],j*STEP-s[1])>260 for s in order) and clearance(i*STEP,j*STEP)>=70]
chosen=[]
base=list(order)
while len(chosen)<8:
    nxt=max(pool,key=lambda p:min(math.hypot(p[0]-q[0],p[1]-q[1]) for q in base+chosen))
    chosen.append(nxt)
print('books',chosen)
geo=json.load(open('geometry_v1.json'))
geo['spawns']=order; geo['books']=chosen
json.dump(geo,open('geometry_v2.json','w'),indent=1)
