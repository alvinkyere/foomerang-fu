"""
The camera model fitted to "Garden Map - Fu": horizon, vanishing column, pitch and scale (see docs/GARDEN.md). The same maths is apps/console/src/render/garden/camera.ts.
The reference image is only ever READ (it is read-only source material).
"""
import math
YC=569.0
YH=-5394.0
CX=1021.0
PHI=math.radians(40.0)
F=(YC-YH)/math.tan(PHI)
SX_CENTER=1.04
HC=(YC-YH)*math.cos(PHI)/SX_CENTER
def unproject(x,y,z=0.0):
    w=y-YH
    fwd=F*(HC-z)/(w*math.cos(PHI))
    X=(x-CX)*fwd/F
    D=(fwd-(HC-z)*math.sin(PHI))/math.cos(PHI)
    return X,D
def project(X,D,z=0.0):
    fwd=D*math.cos(PHI)+(HC-z)*math.sin(PHI)
    down=(HC-z)*math.cos(PHI)-D*math.sin(PHI)
    return CX+F*X/fwd, YC+F*down/fwd
if __name__=='__main__':
    # check round trip
    for (x,y) in [(257,79),(1632,79),(122.5,1043.5),(1745,1043.5),(1000,569)]:
        X,D=unproject(x,y); print((x,y),'->',round(X,1),round(D,1),project(X,D))
