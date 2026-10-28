import numpy as np, cv2
from PIL import Image
S, DX, DY = 0.4915, 942, 302
OUT='/home/claude/xcloce/tools/boss/source/vodovoz/'
def A(f): return np.array(Image.open(f).convert('RGBA'))
def place(arr, name):
    im=Image.fromarray(arr); w=round(1000*S)
    im=im.resize((w,w),Image.LANCZOS)
    c=Image.new('RGBA',(2000,2800),(0,0,0,0)); c.alpha_composite(im,(DX,DY)); c.save(OUT+name+'.png')
def split_x(a):
    al=a[...,3]>30; cols=np.nonzero(al.any(0))[0]
    gaps=np.nonzero(np.diff(cols)>5)[0]; cut=(cols[gaps[0]]+cols[gaps[0]+1])//2
    L=a.copy(); L[:,cut:]=0; R=a.copy(); R[:,:cut]=0; return L,R,cut
place(A('h_head.png'),'head')
for src,n in [('h_whites.png','eyes'),('h_lids.png','eyes-closed'),('h_throat.png','throat'),('h_tup.png','teeth-up'),('h_tlow.png','teeth-low'),('h_mclosed.png','mouth-closed')]:
    place(A(src),n)
b=A('h_brows.png'); L,R,cut=split_x(b); place(L,'browL'); place(R,'browR')
print('brow cut',cut)
# pupils: the irises from the earlier sheet, one per eye, ~0.46 of the eye's width, centred in the white
w=A('h_whites.png'); WL,WR,_=split_x(w)
ir=A('/mnt/user-data/attachments/2dcfea5f-4c81-51dd-b258-13f3a0889573/b33deb60-image.png'); IL,IR,_=split_x(ir)
pup=Image.new('RGBA',(1000,1000),(0,0,0,0))
for W_,I_ in [(WL,IL),(WR,IR)]:
    ys,xs=np.nonzero(W_[...,3]>128); cx,cy=(xs.min()+xs.max())/2,(ys.min()+ys.max())/2; ew=xs.max()-xs.min()
    ys2,xs2=np.nonzero(I_[...,3]>30); icrop=Image.fromarray(I_[ys2.min():ys2.max()+1,xs2.min():xs2.max()+1])
    d=round(ew*0.46); icrop=icrop.resize((d,round(d*icrop.height/icrop.width)),Image.LANCZOS)
    pup.alpha_composite(icrop,(round(cx-d/2),round(cy-icrop.height/2)))
    print('eye',cx,cy,ew,ys.max()-ys.min(),'iris',d)
place(np.array(pup),'pupils')
# the open mouth: split the lips at the hole's middle into the upper lip (stays) and the lower lip + chin (the jaw)
r=A('h_ring.png'); al=(r[...,3]>128).astype(np.uint8)
inv=(1-al).copy(); h,wd=inv.shape; m=np.zeros((h+2,wd+2),np.uint8); cv2.floodFill(inv,m,(0,0),2)
hole=inv==1
ys,xs=np.nonzero(hole); print('hole',xs.min(),xs.max(),ys.min(),ys.max())
mid=np.full(wd, np.nan)
for x in range(xs.min(),xs.max()+1):
    yy=np.nonzero(hole[:,x])[0]
    if len(yy): mid[x]=(yy.min()+yy.max())/2
idx=np.arange(wd); ok=~np.isnan(mid)
mid=np.interp(idx,idx[ok],mid[ok])
Y=np.arange(h)[:,None]
up=r.copy(); up[Y>mid[None,:]]=0
lo=r.copy(); lo[Y<=mid[None,:]]=0
place(up,'head-open'); place(lo,'jaw')
print('mid at center', mid[(xs.min()+xs.max())//2])
