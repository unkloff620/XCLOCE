#!/usr/bin/env python3
"""«Колесо удачи»: the wheel picture — a flat street «wheel of fortune» (red rim with bulbs, cream disc, gold hub) with
SECTORS curved flat spokes drawn here. The source (source/wheel-flat.png) is an image edit with an empty disc; the disc is
filled with flat cream (the edit left it see-through). The client places the prizes with the same curve and radii
(src/content/fortune.ts WHEEL_CURVE, WHEEL_R).

    python3 tools/fortune/build-wheel.py   →  public/assets/fortune/wheel-v2.webp
"""
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public/assets/fortune/wheel-v2.webp"
import math
from PIL import Image, ImageDraw, ImageFilter, ImageChops
SECTORS=13; CURVE=34; SS=2; R_HUB=140; R_RIM=398; c=512
w=Image.open(ROOT / 'tools/fortune/source/wheel-flat.png').convert('RGBA')
base=Image.new('RGBA',(1024,1024),(0,0,0,0)); ImageDraw.Draw(base).ellipse([c-404,c-404,c+404,c+404],fill=(244,231,197,255))
w=Image.alpha_composite(base,w); orig=w.copy()
S=1024*SS; line=Image.new('RGBA',(S,S),(0,0,0,0)); ld=ImageDraw.Draw(line)
for i in range(SECTORS):
    a0=-90+i*360/SECTORS; pts=[]
    for k in range(41):
        t=k/40; r=R_HUB-6+(R_RIM+10-(R_HUB-6))*t; th=math.radians(a0+CURVE*t**1.35)
        pts.append(((c+r*math.cos(th))*SS,(c+r*math.sin(th))*SS))
    ld.line(pts,fill=(30,22,14,255),width=20*SS,joint='curve')
    ld.line(pts,fill=(242,192,52,255),width=13*SS,joint='curve')
inside=Image.new('L',(1024,1024),0); d=ImageDraw.Draw(inside)
d.ellipse([c-R_RIM-2,c-R_RIM-2,c+R_RIM+2,c+R_RIM+2],fill=255); d.ellipse([c-R_HUB+2,c-R_HUB+2,c+R_HUB-2,c+R_HUB-2],fill=0)
line=line.resize((1024,1024),Image.LANCZOS); line.putalpha(ImageChops.multiply(line.getchannel('A'),inside.filter(ImageFilter.GaussianBlur(0.8))))
w=Image.alpha_composite(w,line)
hub=Image.new('L',(1024,1024),0); ImageDraw.Draw(hub).ellipse([c-R_HUB+3,c-R_HUB+3,c+R_HUB-3,c+R_HUB-3],fill=255)
w.paste(orig,(0,0),hub.filter(ImageFilter.GaussianBlur(1)))
OUT.parent.mkdir(parents=True, exist_ok=True)
w.resize((900,900),Image.LANCZOS).save(OUT,'WEBP',quality=88,method=6)
print('wrote', OUT)
