import cv2, numpy as np, json
import os; os.chdir(os.path.dirname(os.path.abspath(__file__)))
im=cv2.imread('reference.png'); h,w=im.shape[:2]
hsv=cv2.cvtColor(im,cv2.COLOR_BGR2HSV); H,S,V=[hsv[:,:,i].astype(int) for i in range(3)]
b,g,r=[im[:,:,i].astype(int) for i in range(3)]
K=lambda n: np.ones((n,n),np.uint8)
def fillholes(m):
    c,_=cv2.findContours(m,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE); o=np.zeros_like(m); cv2.drawContours(o,c,-1,255,-1); return o
def biggest(m):
    n,lab,st,_=cv2.connectedComponentsWithStats(m); i=1+np.argmax(st[1:,4]); return ((lab==i)*255).astype(np.uint8)
skin=(((H>=5)&(H<=25)&(S>90)&(V>150))*255).astype(np.uint8)
shade=(((H>=5)&(H<=25)&(S>90)&(V>150)&(V<235))*255).astype(np.uint8)
white=(((S<40)&(V>170))*255).astype(np.uint8)
neutral=(abs(r-g)<14)&(abs(g-b)<14)
sh=((neutral&(V>=12)&(V<110))*255).astype(np.uint8)
sh=cv2.morphologyEx(sh,cv2.MORPH_OPEN,K(3))
n,lab,st,_=cv2.connectedComponentsWithStats(sh); shorts=np.zeros_like(sh)
for i in range(1,n):
    x,y,ww,hh,a=st[i]
    if a>1500 and x>300 and x+ww<730 and y>690 and y+hh<1000: shorts[lab==i]=255
shorts=fillholes(cv2.morphologyEx(shorts,cv2.MORPH_CLOSE,K(21)))
tank=fillholes(cv2.morphologyEx(biggest(cv2.morphologyEx(white,cv2.MORPH_OPEN,K(3))),cv2.MORPH_CLOSE,K(11)))
hips=np.zeros_like(skin)
cv2.fillPoly(hips,[np.array([(358,736),(666,736),(676,800),(678,860),(668,930),(662,990),(553,1000),(512,960),(469,1000),(362,990),(354,930),(346,860),(348,800)],np.int32)],255)
union=cv2.bitwise_or(cv2.bitwise_or(cv2.morphologyEx(skin,cv2.MORPH_OPEN,K(3)),tank),hips)
sil=fillholes(biggest(cv2.morphologyEx(union,cv2.MORPH_CLOSE,K(17))))
# regions grow a little under their own outline so fills meet the line art without gaps
grow=lambda m,n=7: cv2.bitwise_and(cv2.dilate(m,K(n)),cv2.dilate(sil,K(9)))
silg=cv2.dilate(sil,K(7))
tankg=grow(tank); shortsg=grow(shorts)
inS=cv2.erode(shorts,K(9))>0
lines=((((V<62)&~inS)|((V<26)&inS))&(cv2.dilate(sil,K(19))>0))
lines=(lines*255).astype(np.uint8)
lines=cv2.morphologyEx(lines,cv2.MORPH_OPEN,np.ones((2,2),np.uint8))
# classify line pixels by the nearest coloured region
dt=lambda m: cv2.distanceTransform(255-m,cv2.DIST_L2,3)
dS=dt(cv2.morphologyEx(skin,cv2.MORPH_OPEN,K(3))); dT=dt(tank); dH=dt(shorts)
L=lines>0
own=np.argmin(np.stack([dS,dT,dH]),axis=0)
# lines that border both skin and clothing: the clothing owns them (it is on top)
near=lambda d: d<14
line_tank=L&(near(dT))&~( (dS<dT-6) )
line_sh=L&near(dH)&~line_tank&~(dS<dH-6)
line_skin=L&~line_tank&~line_sh
tank_shade=(((S<40)&(V>150)&(V<235))*255).astype(np.uint8); tank_shade=cv2.bitwise_and(tank_shade,tank)
sh_dark=cv2.bitwise_and(((neutral&(V<44)&(V>=26))*255).astype(np.uint8),shorts)
eyesw=cv2.bitwise_and(white,cv2.bitwise_not(tank)); eyesw[300:]=0
# parts for clothes
yy,xx=np.mgrid[0:h,0:w]
arms=cv2.bitwise_and(silg,((((xx<392)|(xx>632))&(yy>300)&(yy<880))*255).astype(np.uint8))
legs=cv2.bitwise_and(silg,(((yy>900)&(yy<1392)&(xx>330)&(xx<700))*255).astype(np.uint8))
def hull(m):
    pts=cv2.findNonZero(m); o=np.zeros_like(m)
    if pts is not None: cv2.fillPoly(o,[cv2.convexHull(pts)],255)
    return o
legL=legs.copy(); legL[:, 512:]=0; legR=legs.copy(); legR[:, :512]=0
jeans=cv2.bitwise_or(cv2.bitwise_or(hull(legL),hull(legR)),cv2.dilate(hips,K(5)))
feet=cv2.bitwise_and(silg,((yy>1384)*255).astype(np.uint8))
head=cv2.bitwise_and(silg,(((yy<300)&(xx>380)&(xx<640))*255).astype(np.uint8))
def path(m,eps=1.2,minarea=6):
    m=(m>0).astype(np.uint8)*255
    cs,_=cv2.findContours(m,cv2.RETR_CCOMP,cv2.CHAIN_APPROX_NONE)
    out=[]
    for c in cs:
        if abs(cv2.contourArea(c))<minarea: continue
        a=cv2.approxPolyDP(c,eps,True).reshape(-1,2)
        if len(a)<3: continue
        out.append('M'+' '.join(f'{x} {y}' for x,y in a)+'Z')
    return ''.join(out)
def tr(m): return (m>0).astype(np.uint8)*255
data={
 'SIL':path(silg,1.5,200),
 'SHADE':path(cv2.bitwise_and(cv2.morphologyEx(shade,cv2.MORPH_OPEN,K(3)),cv2.bitwise_not(cv2.bitwise_or(tank,shorts))),1.5,30),
 'LINES_SKIN':path(tr(line_skin),0.9,4),
 'EYES_WHITE':path(cv2.dilate(eyesw,K(3)),1,10),
 'SHORTS':path(shortsg,1.5,200),
 'SHORTS_DARK':path(sh_dark,1.2,10),
 'LINES_SHORTS':path(tr(line_sh),0.9,4),
 'TANK':path(tankg,1.5,200),
 'TANK_SHADE':path(cv2.morphologyEx(tank_shade,cv2.MORPH_OPEN,K(3)),1.5,30),
 'LINES_TANK':path(tr(line_tank),0.9,4),
 'ARMS':path(arms,1.5,200),
 'JEANS':path(jeans,1.5,200),
 'FEET':path(feet,1.5,100),
 'HEAD':path(head,1.5,200),
}
for k,v in data.items(): print(k,len(v))
print('total',sum(len(v) for v in data.values()))
json.dump(data,open('paths.json','w'))
dbg=np.full((h,w,3),40,np.uint8)
dbg[silg>0]=(119,180,252); dbg[shade>0]=(91,139,210); dbg[tankg>0]=(250,250,250); dbg[shortsg>0]=(70,60,60)
dbg[line_skin]=(0,0,0); dbg[line_tank]=(255,0,0); dbg[line_sh]=(0,0,255)
cv2.imwrite('cls.png',cv2.resize(dbg,(512,768)))
