import sys, glob, os
from PIL import Image
d=sys.argv[1]; rows=[r.split(':') for r in sys.argv[2:]]  # state:heading
sz=128
n=max(len(glob.glob(f'{d}/{st}_{h}_??.png')) for st,h in rows)
W=Image.new('RGBA',(sz*n,sz*len(rows)),(190,225,140,255))
for r,(st,h) in enumerate(rows):
    for i,f in enumerate(sorted(glob.glob(f'{d}/{st}_{h}_??.png'))):
        im=Image.open(f).convert('RGBA'); pf=f[:-4]+'_prop.png'
        if os.path.exists(pf):
            pr=Image.open(pf).convert('RGBA'); px=pr.load()
            for yy in range(pr.height):
                for xx in range(pr.width):
                    a=px[xx,yy]
                    if a[3]: px[xx,yy]=(a[0]*255//255, a[1]*205//255, a[2]*70//255, a[3])   # Phaser tint preview (player colour)
            im.alpha_composite(pr)
        W.alpha_composite(im.resize((sz,sz),Image.LANCZOS),(sz*i,sz*r))
W.convert('RGB').save(f'{d}/../_review.png')
