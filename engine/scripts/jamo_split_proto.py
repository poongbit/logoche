import sys, numpy as np
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0,'/Users/younghwikim/Desktop/contest/engine')
from logoche_engine import drawn
D='/Users/younghwikim/Desktop/contest/web/.data/glyphs/2be467cb-82ff-4847-a0e4-2c642111ce37/rest/'
VERT={0,1,2,3,4,5,6,7,20}; HORIZ={8,12,13,17,18}

def valley(prof, lo, hi):
    k=np.ones(9)/9; p=np.convolve(prof,k,'same')
    lo,hi=int(lo),int(max(hi,lo+2)); return lo+int(np.argmin(p[lo:hi]))


def longest_run(m):
    """열마다 가장 긴 세로 연속 잉크 길이"""
    best=np.zeros(m.shape[1],int); cur=np.zeros(m.shape[1],int)
    for row in m:
        cur=np.where(row,cur+1,0); best=np.maximum(best,cur)
    return best

def stem_left(top, jung, W, x0, H):
    run=longest_run(top)
    cols=np.nonzero(run>=0.55*H)[0]
    if len(cols)==0: return None
    groups=[]; st=cols[0]; pv=cols[0]
    for c in cols[1:]:
        if c-pv>6: groups.append((st,pv)); st=c
        pv=c
    groups.append((st,pv))
    g=groups[-1]; left=g[0]
    if jung in {1,3,5,7,10,15} and len(groups)>1 and left-groups[-2][1] < 0.26*W:
        left=groups[-2][0]
    if jung in {4,5,6,7,14,15}:  # 모음 가로짧은획이 줄기 왼쪽에 붙음
        cols_=top.sum(0).astype(float)
        left=valley(cols_,max(x0,left-0.16*W),left+1)
    return left

def regions(mask, ch):
    code=ord(ch)-0xAC00; jong=code%28; jung=(code//28)%21
    ys,xs=np.nonzero(mask); x0,x1,y0,y1=xs.min(),xs.max()+1,ys.min(),ys.max()+1
    W,H=x1-x0,y1-y0
    lab=np.zeros(mask.shape,np.uint8)  # 1 초 2 중 3 종
    Y,X=np.mgrid[:mask.shape[0],:mask.shape[1]]
    body=mask.copy()
    yJ=y1
    if jong:
        rows=mask.sum(1).astype(float)
        yJ=valley(rows,y0+H*0.55,y0+H*0.78)
    top=mask&(Y<yJ)
    cols=top.sum(0).astype(float)
    lab[mask]=2
    if jung in VERT:
        xV=stem_left(top,jung,W,x0,(yJ-y0))
        if xV is None: xV=valley(cols,x0+W*0.35,x0+W*0.62)
        lab[top&(X<xV)]=1
    elif jung in HORIZ:
        r=top.sum(1).astype(float); yH=valley(r,y0+(yJ-y0)*0.42,y0+(yJ-y0)*0.68); lab[top&(Y<yH)]=1
    else:
        xV=stem_left(top,jung,W,x0,(yJ-y0))
        if xV is None: xV=valley(cols,x0+W*0.45,x0+W*0.72)
        r=(top&(X<xV)).sum(1).astype(float); yH=valley(r,y0+(yJ-y0)*0.42,y0+(yJ-y0)*0.68)
        lab[top&(X<xV)&(Y<yH)]=1
    if jong: lab[mask&(Y>=yJ)]=3
    return lab
COL={1:(230,60,60),2:(60,110,230),3:(40,170,90)}
def overlay(lab):
    im=np.full(lab.shape+(3,),255,np.uint8)
    for k,c in COL.items(): im[lab==k]=c
    return Image.fromarray(im).resize((300,300),Image.LANCZOS)
if __name__=='__main__':
    import os
    chars=[c for c in sys.argv[1] if os.path.exists(D+f'{ord(c):x}.png')]
    print(len(chars),''.join(chars))
    cols=5; rows=(len(chars)+cols-1)//cols
    sheet=Image.new('RGB',(cols*300,rows*300),'white')
    for i,ch in enumerate(chars):
        g=np.array(Image.open(D+f'{ord(ch):x}.png').convert('L'))
        m=drawn.decode(g) if g.max()<=1 or True else g
        lab=regions(m,ch)
        sheet.paste(overlay(lab),((i%cols)*300,(i//cols)*300))
    sheet.save(sys.argv[2] if len(sys.argv)>2 else 'split.png')
