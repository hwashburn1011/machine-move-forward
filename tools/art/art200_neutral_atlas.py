"""Prepare a reusable neutral paint atlas while retaining original decals."""
from pathlib import Path
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[2];out=ROOT/'assets/art200/legacy-touchup';out.mkdir(parents=True,exist_ok=True)
a=np.array(Image.open(ROOT/'assets/art100/legacy/Art100_Desert_BaseColor.png').convert('RGB')).astype(float)
for tile in [1,3,7,8,14]:
    y=tile//4*512;x=tile%4*512;part=a[y:y+512,x:x+512];lum=part.mean(axis=2);ratio=lum/max(lum.mean(),.01)
    grey=np.clip(192*ratio,128,208);neutral=np.repeat(grey[:,:,None],3,2)
    # Deep coating losses retain their brown substrate; the broad enamel fields
    # become neutral so per-model pigments need no duplicate 2K texture images.
    chip=np.clip((.75-ratio)*2.2,0,.55)
    a[y:y+512,x:x+512]=neutral*(1-chip[:,:,None])+np.array([93,72,56])*chip[:,:,None]
Image.fromarray(np.uint8(np.clip(a,0,255))).save(out/'NeutralPaint_BaseColor.png')
print(out/'NeutralPaint_BaseColor.png')
