"""
Every wall of the reference as MEASURED in the image (screen pixels in a 1999-wide frame), unprojected through cam.py onto the ground plane. Run: python3 geom.py
The reference image is only ever READ (it is read-only source material).
"""
from cam import *
H=36.0
OX,OD=-800.4,6033.1   # world origin: dashed rect top-left (X=-800.4 ,D=6033.1)
def lx(X): return X-OX
def ly(D): return OD-D
def snap(v,s=2): return round(v/s)*s
walls=[]   # (name, x, y, w, h) logical
def hwall(name,x0,x1,yt,yb,kind='stone'):
    XL1,Dn=unproject(x0,yt,H); XL0,Ds=unproject(x0,yb,0)
    XR1,_=unproject(x1,yt,H); XR0,_=unproject(x1,yb,0)
    xl=(XL1+XL0)/2; xr=(XR1+XR0)/2
    walls.append((name,lx(xl),ly(Dn),lx(xr)-lx(xl),ly(Ds)-ly(Dn),kind))
def vwall(name,xl,xr,yref,yt,yb,kind='stone'):
    XL,_=unproject(xl,yref,H); XR,_=unproject(xr,yref,H)
    _,Dn=unproject(xl,yt,H); _,Ds=unproject(xl,yb,0)
    walls.append((name,lx(XL),ly(Dn),lx(XR)-lx(XL),ly(Ds)-ly(Dn),kind))
# horizontal: x0,x1 (screen, at top face), y top of top face, y bottom of face (ground edge)
hwall('H1',338,790,104,150)
hwall('H2',917,1093,104,150)
hwall('H3',1421,1551,104,153)
hwall('HO1',1245,1420,116,153,'olive')
hwall('H4',1525,1654,225,272)
hwall('H5',562,632,233,280)
hwall('H6',628,939,347,395)
hwall('H7',1260,1553,347,395)
hwall('HO2',933,1098,491,526,'olive')
hwall('H8',184,615,479,527)
hwall('H9',580,775,612,661)
hwall('H10',1100,1429,612,661)
hwall('H11',419,590,782,830)
hwall('H12',930,1271,778,826)
hwall('H13',1440,1612,777,826)
hwall('H14',237,1104,927,977)
hwall('H15',1390,1448,929,975)
hwall('H16',1420,1545,479,526)
# vertical: xl,xr at yref, y_top (top-face top), y_bot (ground south end)
vwall('V1',319,352,250,104,392)
vwall('V2',914,942,200,104,268)
vwall('V3',1523,1553,200,104,272)
vwall('V4',1245,1273,240,116,272)
vwall('V5',461,495,400,290,480)
vwall('V6',582,614,560,478,661)
vwall('V7',746,776,560,497,661)
vwall('V8',757,785,300,243,347)
vwall('V9',1096,1122,400,246,523)
vwall('V10',1402,1433,300,244,394)
vwall('V11',908,938,540,497,581)
vwall('V12',912,937,450,345,481)
vwall('V13',1260,1290,560,505,613)
vwall('V14',1568,1604,700,527,950)
vwall('V15',253,289,800,680,977)
vwall('V16',396,426,790,755,830)
vwall('V17',1251,1287,980,920,1052)
vwall('VO18',905,935,850,770,930,'olive')
if __name__=='__main__':
    for w in walls: print("%-4s x=%7.1f y=%7.1f w=%6.1f h=%6.1f %s"%w)
    print('arena',lx(640.1),ly(4577))
