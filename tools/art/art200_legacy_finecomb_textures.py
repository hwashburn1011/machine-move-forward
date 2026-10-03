"""Remove inherited baked dent stamps; give the shelter its own route board."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import numpy as np
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'assets/art200/legacy-touchup';OLD=ROOT/'assets/art100/legacy'
base=np.array(Image.open(OUT/'NeutralPaint_BaseColor.png').convert('RGB'))
orm=np.array(Image.open(OLD/'Art100_Desert_ORM.png').convert('RGB'))
normal=np.array(Image.open(OLD/'Art100_Desert_Normal.png').convert('RGB'))
for tile in [3,7,8,14]:
    rng=np.random.default_rng(7730+tile)
    def field(n):return np.array(Image.fromarray(rng.integers(0,255,(n,n),dtype=np.uint8)).resize((512,512),Image.Resampling.BICUBIC)).astype(float)/255
    broad=field(7);fine=field(80);loss=field(97)
    pigment=192+(broad-.5)*8+(fine-.5)*3+rng.normal(0,.7,(512,512))
    chips=np.clip((loss-.86)*7,0,.58)
    rgb=np.repeat(pigment[:,:,None],3,2)*(1-chips[:,:,None])+np.array([103,88,72])*chips[:,:,None]
    y=tile//4*512;x=tile%4*512
    base[y:y+512,x:x+512]=np.uint8(np.clip(rgb,0,255))
    orm[y:y+512,x:x+512,0]=255
    orm[y:y+512,x:x+512,1]=np.uint8(np.clip(177+(fine-.5)*12+chips*35,0,255))
    orm[y:y+512,x:x+512,2]=np.uint8(90*(1-chips))
# UV audit found tile10 unused by all25 assembled models. Keep the2Katlas and
# one material per model instead of creating a second material for this board.
board=Image.new('RGB',(512,512),'#405C62');d=ImageDraw.Draw(board)
font=lambda n:ImageFont.truetype('C:/Windows/Fonts/bahnschrift.ttf',n)
ink='#B7B09F';d.rectangle((21,21,490,490),outline=ink,width=3)
d.text((256,54),'AMBERLINE',font=font(53),anchor='mt',fill=ink)
d.text((256,120),'DUSTMILE STOP',font=font(36),anchor='mt',fill=ink)
d.line((73,201,438,201),fill=ink,width=5)
for x in [73,194,316,438]:d.ellipse((x-8,193,x+8,209),fill=ink)
d.ellipse((182,189,206,213),fill='#405C62',outline=ink,width=4)
d.text((256,246),'ROUTE 07',font=font(58),anchor='mt',fill=ink)
d.text((256,324),'BOARD HERE',font=font(30),anchor='mt',fill=ink)
d.text((256,418),'THE NEXT TOWN IS AHEAD',font=font(22),anchor='mt',fill=ink)
rng=np.random.default_rng(507);a=np.array(board).astype(float)
a+=rng.normal(0,.8,a.shape[:2])[:,:,None]
base[1024:1536,1024:1536]=np.uint8(np.clip(a,0,255))
normal[1024:1536,1024:1536]=[128,128,255];orm[1024:1536,1024:1536]=[255,211,0]
for name,a in [('NeutralPaint_BaseColor.png',base),('Finecomb_ORM.png',orm),('Finecomb_Normal.png',normal)]:Image.fromarray(a).save(OUT/name)
print('ART200_LEGACY_FINECOMB_TEXTURES')
