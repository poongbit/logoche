import cv2, numpy as np
from PIL import Image
from jamo_split_proto import *
def xf(mask, sx, sy, tx, ty):
    ys,xs=np.nonzero(mask)
    if not len(ys): return mask
    cx,cy=(xs.min()+xs.max())/2,(ys.min()+ys.max())/2
    M=np.array([[sx,0,cx-sx*cx+tx],[0,sy,cy-sy*cy+ty]],np.float32)
    return cv2.warpAffine(mask.astype(np.uint8)*255,M,mask.shape[::-1],flags=cv2.INTER_LINEAR)>127
def demo(ch, ops):
    g=np.array(Image.open(D+f'{ord(ch):x}.png').convert('L')); m=drawn.decode(g); lab=regions(m,ch)
    out=np.zeros_like(m)
    for k,op in ops.items(): out|=xf(lab==k,*op)
    return m,out
cases=[('붕',{1:(1.3,1.3,0,0),2:(1,1,0,0),3:(1,1,0,0)}),('밝',{1:(1,1,0,0),2:(1,1,25,0),3:(0.8,0.8,0,0)}),('뷔',{1:(0.8,0.8,0,0),2:(1,1,0,0)}),('꿀',{1:(1,1,0,0),2:(1,1,0,0),3:(1.2,1,0,25)}),('닭',{1:(1.2,1.2,0,0),2:(1,1,0,0),3:(1,1,0,0)})]
sheet=Image.new('L',(len(cases)*330,660),255)
for i,(ch,ops) in enumerate(cases):
    ops={k:ops.get(k,(1,1,0,0)) for k in (1,2,3)}
    m,o=demo(ch,ops)
    for j,x in enumerate((m,o)):
        sheet.paste(Image.fromarray(np.where(x,0,255).astype(np.uint8)).resize((330,330)),(i*330,j*330))
sheet.save('demo.png')
