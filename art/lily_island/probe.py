import json, math, sys
import numpy as np, cv2
CAM = json.load(open('art/sky_islands/camera.json')); SC = json.load(open('art/lily_island/scale.json'))
Z = SC['hqZoom'] / SC['scale']
th = math.radians(CAM['pitchDeg'])
R = np.array([[1,0,0],[0,-math.sin(th),-math.cos(th)],[0,math.cos(th),-math.sin(th)]])
F, C = CAM['focalPx'], np.array(CAM['centre'])
def ref(X,Y,z=0.0):
    v = R @ (np.array([X,Y,z])/100 - C); cx, cy = F*v[0]/v[2]+960, F*v[1]/v[2]+540
    return 960+(cx-960)*Z, 540+(cy-540)*Z
g=[(X,Y) for X in np.linspace(-60,60,7) for Y in np.linspace(30,130,7)]
H=cv2.findHomography(np.float32([ref(X,Y) for X,Y in g]),np.float32(g))[0]
plan=lambda pts: cv2.perspectiveTransform(np.float32(pts).reshape(-1,1,2),H).reshape(-1,2)
f=cv2.imread('art/lily_island/output/reference.png'); h=cv2.cvtColor(f,cv2.COLOR_BGR2HSV).astype(int)
grass=(h[...,0]>25)&(h[...,0]<50)&(h[...,1]>60)&(h[...,2]>190)
k=lambda n:np.ones((n,n),np.uint8)
m=cv2.morphologyEx(cv2.morphologyEx(grass.astype(np.uint8)*255,cv2.MORPH_CLOSE,k(15)),cv2.MORPH_OPEN,k(9))
cs,_=cv2.findContours(m,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE)
c=max(cs,key=cv2.contourArea); P=plan(cv2.approxPolyDP(c,4,True).reshape(-1,2))
print('area px',cv2.contourArea(c),'plan bounds',P.min(0).round(1),P.max(0).round(1))
# edge directions in plan, mod 90
ang=[]
for a,b in zip(P,np.roll(P,-1,0)):
    d=b-a; L=np.hypot(*d)
    if L>1.2: ang.append((round(math.degrees(math.atan2(d[1],d[0]))%90,1),round(L,1)))
print(ang)
